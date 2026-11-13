// Read-only: prints the DB state of one sim order. Run: node tools/inspect.js <orderId>
const { guard } = require('../lib/guard');
const { connect, oid } = require('../lib/db');
const cfg = require('../config.json');

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const ORDER_KEYS = ['order_code', 'order_status', 'payment_status', 'payment_method',
  'refund_status', 'seller_approval_status', 'fulfillment_status', 'paid_at'];

async function main() {
  const orderId = process.argv[2];
  if (!orderId) throw new Error('usage: node tools/inspect.js <orderId>');
  const conn = await connect(guard().uri, cfg.dbName);
  try {
    const db = conn.db;
    const order = await db.collection('orders').findOne({ _id: oid(orderId) });
    if (!order) throw new Error('order not found');
    const ids = [order._id, String(order._id)];
    const out = {
      order: pick(order, ORDER_KEYS),
      status_history: (order.status_history || []).map((h) => h.status),
      transactions: (await db.collection('transactions').find({ order_id: { $in: ids } })
        .project({ type: 1, gateway: 1, status: 1, amount: 1 }).toArray()).map((t) => pick(t, ['type', 'gateway', 'status', 'amount'])),
      refund_requests: (await db.collection('refund_requests').find({ order_id: order._id })
        .project({ status: 1, execution_status: 1 }).toArray()).map((r) => pick(r, ['_id', 'status', 'execution_status'])),
      notifications: await db.collection('notifications').countDocuments({ 'metadata.orderId': String(order._id) }),
      reviews: await db.collection('reviews').countDocuments({ order_id: { $in: ids } }),
    };
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await conn.close();
  }
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exitCode = 1; });
