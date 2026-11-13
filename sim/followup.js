const pool = require('./pool');
const { runSession } = require('./session');

// Short "check my order" visit; skipped when the buyer is already online or the pool is full.
async function checkOrder(rt, { buyerId }) {
  const b = rt.state.buyers[buyerId];
  if (!b || pool.busy(buyerId)) return;
  pool.launch(rt, buyerId, () => runSession(rt, buyerId, { check: true }));
}

module.exports = { checkOrder };
