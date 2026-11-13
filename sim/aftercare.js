const { funnelFor } = require('./persona');
const { isNetError } = require('./resume');
const { delay } = require('../lib/runtime');

const DAY = 864e5;
const RETRY_MS = 120000;
const PARTS = { reviewRefund: ['review', 'refund'], refundOnly: ['refund'], reviewOnly: ['review'], nothing: [] };

const hasTodo = (b) => Boolean(b.todo?.length);
const addTodo = (b, todo) => { (b.todo ||= []).push(todo); };

// Mean catalog quality of the order's products; 0.5 when unknown.
function avgQuality(rt, productIds) {
  const qs = productIds.map((id) => rt.catalog.products.find((p) => p.id === id)?.quality ?? 0.5);
  return qs.length ? qs.reduce((s, x) => s + x, 0) / qs.length : 0.5;
}

// Decides what the buyer does after delivery and stores it as todos on the buyer.
// SIM_REFUND / SIM_NO_REFUND / SIM_REVIEW force branches for tests.
function planAfter(rt, orderId, now = Date.now()) {
  const { cfg, rng, state } = rt;
  const o = state.orders[orderId];
  const b = state.buyers[o.buyerId];
  const ad = cfg.afterDelivery;
  const returner = b.persona === 'returner';
  const q = avgQuality(rt, o.products);
  const tier = q >= 0.7 ? 'good' : q < 0.25 ? 'bad' : 'mid';
  const pU = Math.min(ad.unhappy[tier] * (returner ? ad.returnerUnhappyMult : 1), 0.95);
  let outcome = null;
  let cause = 'unhappy';
  if (process.env.SIM_REFUND === '1') outcome = 'refundOnly';
  else if (rng.chance(pU)) outcome = rng.weighted(Object.entries(ad.unhappyOutcome));
  else if (returner && rng.chance(ad.returnerChangeMind)) { outcome = 'refundOnly'; cause = 'mind'; }
  if (outcome) {
    const after = now + delay(rt, ad.unhappyMin);
    const parts = PARTS[outcome].filter((t) => t !== 'refund' || process.env.SIM_NO_REFUND !== '1');
    for (const type of parts) {
      addTodo(b, type === 'review' ? { type, orderId, mood: 'bad', after }
        : { type, orderId, after, until: now + ad.refundDays * DAY, cause });
    }
    if (parts.length) rt.log(`  📝 đơn ${o.code}: khách không ưng (${outcome})`);
    return;
  }
  if (process.env.SIM_REVIEW === '1' || rng.chance(funnelFor(cfg, b.persona).review)) {
    addTodo(b, { type: 'review', orderId, mood: 'good', after: now + delay(rt, ad.happyReviewMin) });
    rt.log(`  📝 đơn ${o.code}: khách ưng, sẽ đánh giá`);
  }
}

// Lazy requires: the action modules require this file back.
const RUN = {
  review: (rt, t) => require('../actions/after').review(rt, t),
  reviewEdit: (rt, t) => require('../actions/after').editReview(rt, t),
  refund: (rt, t) => require('../actions/refund').request(rt, t),
  dispute: (rt, t) => require('../actions/refund').dispute(rt, t),
  confirm: (rt, t) => require('../actions/seller').confirm(rt, t),
};

// A refund that came too late: the buyer gives up and is annoyed, unless a review is already on its way.
function expireRefund(rt, b, t, now) {
  rt.log(`  ⌛ đơn ${rt.state.orders[t.orderId]?.code ?? t.orderId}: quá hạn trả hàng`);
  const reviewed = (b.reviewed || []).some((r) => r.orderId === t.orderId);
  const pending = (b.todo || []).some((x) => x.type === 'review' && x.orderId === t.orderId);
  if (!reviewed && !pending) addTodo(b, { type: 'review', orderId: t.orderId, mood: 'bad', after: now });
}

// Runs the buyer's todos that are due, in order; returns how many ran.
async function runTodos(rt, buyerId, now = Date.now()) {
  const b = rt.state.buyers[buyerId];
  const expire = rt.cfg.afterDelivery.todoExpireDays * DAY;
  let ran = 0;
  for (const t of (b.todo || []).filter((x) => x.after <= now)) {
    b.todo.splice(b.todo.indexOf(t), 1);
    if (now - t.after > expire) { rt.log(`  ⌛ việc ${t.type} hết hạn, bỏ`); continue; }
    if (t.type === 'refund' && t.until < now) { expireRefund(rt, b, t, now); continue; }
    try {
      await RUN[t.type](rt, t);
      ran += 1;
    } catch (e) {
      if (/^safety:/.test(e.message)) throw e;
      if (isNetError(e)) {
        addTodo(b, { ...t, after: now + RETRY_MS });
        rt.log(`  ! mạng lỗi, ${t.type} thử lại sau 2 phút`);
        break;
      }
      rt.log(`  ! ${t.type} lỗi: ${e.message}`);
    }
  }
  return ran;
}

module.exports = { planAfter, runTodos, hasTodo, addTodo };
