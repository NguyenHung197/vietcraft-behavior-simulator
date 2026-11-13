const DONE = ['DELIVERED', 'CANCELLED', 'REJECTED', 'RETURNED', 'REFUNDED'];
const { hasTodo } = require('./aftercare');
// Step names for one visit: a status check is notifications → orders (+0-2 products); else null (weighted steps).
function checkPlan(rng) { return ['notifications', 'orders', ...Array(rng.int(0, 2)).fill('product')]; }
// 1-2 steps for a bounce visit, else 3-12.
function stepCount(rng, cfg) { return rng.chance(cfg.behaviour.bounce) ? rng.int(1, 2) : rng.int(3, 12); }
// Pause before the next step: usually 3-20s skewed short, sometimes the tab is left open for minutes.
function dwellMs(rng, cfg) {
  if (rng.chance(cfg.behaviour.idle)) return { ms: rng.int(...cfg.delays.idleMin) * 60000, idle: true };
  return { ms: Math.round(3000 + 17000 * rng.next() ** 2), idle: false };
}
// Buyers waiting for an order or with an after-delivery todo come back more often.
// An order counts only while the queue still holds its next step (else it is an orphan).
const waitingBuyers = (state) => {
  const queued = new Set((state.queue || []).map((q) => q.orderId));
  const fromOrders = Object.entries(state.orders || {})
    .filter(([id, o]) => !DONE.includes(o.status) && queued.has(id)).map(([, o]) => o.buyerId);
  const fromTodos = Object.entries(state.buyers || {}).filter(([, b]) => hasTodo(b)).map(([id]) => id);
  return new Set([...fromOrders, ...fromTodos]);
};
module.exports = { DONE, checkPlan, stepCount, dwellMs, waitingBuyers };
