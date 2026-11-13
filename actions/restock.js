const { oid } = require('../lib/db');
const ledgerLib = require('../lib/ledger');
const { delay, enqueue } = require('../lib/runtime');

const MIN_STOCK = 5;
const variants = (rt) => rt.db.collection('product_variants');

// Queues one restock for each low-stock variant of a listed product.
async function scan(rt) {
  const { state } = rt;
  const rows = await variants(rt).find({
    product_id: { $in: rt.catalog.productIds.map(oid) },
    is_active: { $ne: false }, stock_quantity: { $lt: MIN_STOCK },
  }, { projection: { _id: 1 } }).toArray();
  // Forget pending entries whose queue item was dropped after its tries ran out.
  state.restockPending = state.restockPending.filter((id) => state.queue
    .some((q) => q.type === 'restock' && q.variantId === id));
  let added = 0;
  for (const { _id } of rows) {
    const variantId = String(_id);
    if (state.restockPending.includes(variantId)) continue;
    state.restockPending.push(variantId);
    enqueue(rt, 'restock', delay(rt, [120, 1440]), { variantId });
    added += 1;
  }
  return added;
}

// Ledger goes first; the returned function rolls it back if the stock write did not happen.
function addLedger(rt, variantId, n) {
  const stock = rt.ledger.stock_added;
  stock[variantId] = (stock[variantId] || 0) + n;
  ledgerLib.save(rt.ctx.ledgerFile, rt.ledger);
  return () => {
    stock[variantId] -= n;
    if (!stock[variantId]) delete stock[variantId];
    ledgerLib.save(rt.ctx.ledgerFile, rt.ledger);
  };
}

async function restock(rt, { variantId }) {
  const { state } = rt;
  const done = () => { state.restockPending = state.restockPending.filter((id) => id !== variantId); };
  const v = await variants(rt).findOne({ _id: oid(variantId) },
    { projection: { product_id: 1, stock_quantity: 1 } });
  if (!v || v.stock_quantity >= MIN_STOCK || !rt.catalog.productIds.includes(String(v.product_id))) {
    return done();
  }
  const product = await rt.db.collection('products').findOne({ _id: v.product_id }, { projection: { title: 1 } });
  const n = rt.rng.int(10, 30);
  const undo = addLedger(rt, variantId, n);
  let res;
  try {
    res = await variants(rt).updateOne({ _id: v._id, stock_quantity: { $lt: MIN_STOCK } },
      { $inc: { stock_quantity: n } });
  } catch (e) {
    undo();
    throw e;
  }
  if (!res.modifiedCount) undo();
  done();
  if (res.modifiedCount) rt.log(`  📦 shop nhập thêm ${n} "${product?.title}"`);
}

module.exports = { scan, restock };
