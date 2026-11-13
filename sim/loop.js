const fs = require('fs');
const path = require('path');
const { sleep } = require('../lib/http');
const { loadCatalog } = require('../lib/catalog');
const { save } = require('../lib/runtime');
const { cancel, reorderCod } = require('../actions/order');
const { markPaid } = require('../actions/pay');
const seller = require('../actions/seller');
const refund = require('../actions/refund');
const { review, editReview, replyReview } = require('../actions/after');
const chat = require('../actions/chat');
const { scan, restock } = require('../actions/restock');
const { runSession } = require('./session');
const pool = require('./pool');
const { hourFactor, dayFactor } = require('./rhythm');
const { maybeStart } = require('./anomaly');
const { churnDay } = require('./population');
const { spreadOverdue, gate, checkGap, isNetError } = require('./resume');
const { checkOrder } = require('./followup');
const { waitingBuyers } = require('./pace');
const { syncOrder, syncOrphans } = require('./sync');
const { sessionP, spikeVisits, heartbeat } = require('./visits');
const { spawnGuests } = require('./guest');

const HANDLERS = {
  pay: markPaid, cancel, sellerProcess: seller.prepare, sellerShip: seller.ship,
  deliver: seller.deliver, review, refund: refund.request, refundDecision: refund.decide,
  settle: refund.settle, dispute: refund.dispute, adminResolve: refund.adminResolve, restock,
  chatReply: chat.reply, reviewEdit: editReview, checkOrder,
  autoDeliver: seller.autoDeliver, reorderCod, reviewReply: replyReview,
};
const MAX_TRIES = 3;
const NET_RETRY_MS = 120000;
const stopFile = () => path.join(__dirname, '..', 'stop.flag');

// Runs queue items that are due; a failed item is retried later, then dropped.
async function drainQueue(rt, { force = false, max = 5 } = {}) {
  const now = Date.now();
  const due = rt.state.queue.filter((q) => force || q.at <= now)
    .sort((a, b) => a.at - b.at).slice(0, max);
  for (const item of due) {
    rt.state.queue.splice(rt.state.queue.indexOf(item), 1);
    try {
      await HANDLERS[item.type](rt, item);
    } catch (e) {
      if (isNetError(e)) {
        rt.state.queue.push({ ...item, at: Date.now() + NET_RETRY_MS });
        rt.log(`  ! mạng lỗi, ${item.type} thử lại sau 2 phút`);
        save(rt);
        break;
      }
      rt.log(`  ! ${item.type} lỗi: ${e.message}`);
      const fatal = /^safety:/.test(e.message) || ++item.tries >= MAX_TRIES;
      if (!fatal) rt.state.queue.push({ ...item, at: Date.now() + 60000 * item.tries });
      else if (item.orderId) await syncOrder(rt, item.orderId);
    }
    save(rt);
  }
  return due.length;
}

async function tick(rt) {
  const { cfg, rng, state } = rt;
  if (!(await gate(rt))) return;
  checkGap(rt);
  rt.ticks = (rt.ticks || 0) + 1;
  if (rt.ticks % (cfg.fast ? 5 : 30) === 0) {
    await scan(rt).catch((e) => rt.log(`! quét tồn kho lỗi: ${e.message}`));
  }
  if (rt.ticks % (cfg.fast ? 30 : 3600 / cfg.tickSeconds) === 0) await syncOrphans(rt);
  churnDay(rt);
  maybeStart(rt);
  const factor = hourFactor(cfg) * dayFactor(cfg, state);
  await drainQueue(rt);
  await spikeVisits(rt, factor);
  spawnGuests(rt, factor);
  const waiting = waitingBuyers(state);
  for (const [id, b] of rng.shuffle(Object.entries(state.buyers))) {
    const boost = waiting.has(id) ? cfg.behaviour.activeOrderBoost : 1;
    if (b.dormant || pool.busy(id) || !rng.chance(sessionP(cfg, b, factor, boost))) continue;
    if (!pool.launch(rt, id, () => runSession(rt, id))) break;
  }
  save(rt);
  if (rt.ticks % 15 === 0) heartbeat(rt, factor);
  rt.lastTick = Date.now();
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// One runner per state.json: a second start would overwrite state and clear the first's stop flag.
function takeLock(rt) {
  const file = path.join(__dirname, '..', 'run.lock');
  const pid = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
  if (pid && pid !== process.pid && alive(pid)) throw new Error(`tool đang chạy ở tiến trình ${pid}, dừng nó trước`);
  fs.writeFileSync(file, String(process.pid));
  return () => fs.rmSync(file, { force: true });
}

async function start(rt) {
  const unlock = takeLock(rt);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => { rt.stopping = true; });
  fs.rmSync(stopFile(rt), { force: true });
  rt.log(`bắt đầu: ${rt.catalog.products.length} sản phẩm, ${Object.keys(rt.state.buyers).length} buyer, tick ${rt.cfg.tickSeconds}s`);
  spreadOverdue(rt);
  await syncOrphans(rt);
  for (let n = 1; !rt.stopping && !fs.existsSync(stopFile(rt)); n++) {
    if (n % 15 === 0) rt.catalog = await loadCatalog(rt.db, rt.cfg);
    await tick(rt).catch((e) => rt.log(`! tick lỗi: ${e.message}`));
    await sleep(rt.cfg.fast ? 1000 : rt.cfg.tickSeconds * 1000);
  }
  rt.stopping = true;
  if (pool.size()) rt.log(`chờ ${pool.size()} phiên đang chạy...`);
  await pool.drain();
  save(rt);
  fs.rmSync(stopFile(rt), { force: true });
  unlock();
  rt.log('đã dừng, state và ledger đã lưu');
}

module.exports = { start, tick, drainQueue, stopFile, HANDLERS };
