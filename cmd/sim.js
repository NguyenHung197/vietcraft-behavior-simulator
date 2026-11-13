const fs = require('fs');
const { open, save, enqueue } = require('../lib/runtime');
const { oid } = require('../lib/db');
const { signup } = require('../actions/account');
const { checkout } = require('../actions/order');
const { runSession } = require('../sim/session');
const loop = require('../sim/loop');
const pool = require('../sim/pool');

const firstBuyer = (rt) => Object.keys(rt.state.buyers).find((k) => !rt.state.buyers[k].dormant);

// Test helper: queues one handler for a tracked order, looking up its refund if needed.
async function enqueueFor(rt, type, orderId, refundId) {
  if (!loop.HANDLERS[type]) throw new Error(`unknown handler ${type}`);
  if (!rt.state.orders[orderId]) throw new Error(`order ${orderId} is not tracked`);
  const refund = refundId || (await rt.db.collection('refund_requests').findOne({ order_id: oid(orderId) }))?._id;
  enqueue(rt, type, 0, { orderId, refundId: refund && String(refund) });
}

const ONCE = {
  signup: (rt) => signup(rt),
  session: (rt, id) => {
    const ids = Object.keys(rt.state.buyers).filter((k) => !rt.state.buyers[k].dormant);
    if (!ids.length) throw new Error('chưa có buyer nào, chạy "once signup" trước');
    return runSession(rt, id || rt.rng.pick(ids));
  },
  checkout: (rt, id) => checkout(rt, id || firstBuyer(rt)),
  enqueue: (rt, type, orderId, refundId) => enqueueFor(rt, type, orderId, refundId),
  tick: async (rt) => { await loop.tick(rt); await pool.drain(); },
  // Runs the next queued step now, ignoring its scheduled time.
  queue: (rt) => loop.drainQueue(rt, { force: true, max: 1 }),
};

async function withRuntime(ctx, fn) {
  const rt = await open(ctx);
  try { await fn(rt); } finally { save(rt); await rt.close(); }
}

const start = (ctx) => withRuntime(ctx, (rt) => loop.start(rt));

async function once(ctx, name, ...rest) {
  if (!ONCE[name]) throw new Error(`once <${Object.keys(ONCE).join('|')}>`);
  await withRuntime(ctx, async (rt) => {
    await ONCE[name](rt, ...rest);
    console.log(`queue: ${rt.state.queue.map((q) => q.type).join(', ') || '(trống)'}`);
  });
}

function stop(ctx) {
  fs.writeFileSync(loop.stopFile({ ctx }), new Date().toISOString());
  console.log('đã gửi lệnh dừng, vòng lặp sẽ thoát sau tick hiện tại');
}

module.exports = { start, once, stop };
