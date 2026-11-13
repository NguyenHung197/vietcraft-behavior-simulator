const { oid } = require('./db');

// Only ids that are in the ledger and flagged sim:true are in scope.
async function buildScope(db, ledger) {
  const ledgerUsers = (ledger.created.users || []).map(oid);
  const users = await db.collection('users')
    .find({ _id: { $in: ledgerUsers }, sim: true }, { projection: { _id: 1 } }).toArray();
  const userIds = users.map((u) => u._id);
  const orders = await db.collection('orders')
    .find({ buyer_id: { $in: userIds } }).toArray();
  const refunds = await db.collection('refund_requests')
    .find({ buyer_id: { $in: userIds } }, { projection: { _id: 1 } }).toArray();
  return { userIds, orders, orderIds: orders.map((o) => o._id),
    refundIds: refunds.map((r) => r._id) };
}

// Each op: deleteMany(filter), or updateMany(filter, update) when update is set.
function buildOps(s, ledger) {
  const u = s.userIds;
  const o = [...s.orderIds, ...s.orderIds.map(String)];
  const r = [...s.refundIds, ...s.refundIds.map(String)];
  const pattern = u.length ? u.map(String).join('|') : '(?!)';
  const ops = [
    { coll: 'orders', filter: { _id: { $in: s.orderIds } } },
    { coll: 'transactions', filter: { order_id: { $in: o } } },
    { coll: 'refund_requests', filter: { buyer_id: { $in: u } } },
    { coll: 'reviews', filter: { buyer_id: { $in: u } } },
    { coll: 'carts', filter: { user_id: { $in: u } } },
    { coll: 'wishlists', filter: { user_id: { $in: u } } },
    { coll: 'recent_searches', filter: { user_id: { $in: u } } },
    { coll: 'search_logs', filter: { user_id: { $in: u } } },
    { coll: 'user_sessions', filter: { user_id: { $in: u } } },
    { coll: 'product_events', filter: { $or: [
      { user_id: { $in: u } }, { session_id: { $regex: `^sim_(${pattern})_` } },
      { session_id: { $regex: '^sim_guest_' } }] } },
    { coll: 'notifications', filter: { $or: [
      { user_id: { $in: u } }, { 'metadata.orderId': { $in: o } },
      { 'metadata.refundRequestId': { $in: r } }] } },
    { coll: 'reputation_logs', filter: { reference_id: { $in: [...o, ...r] } } },
    { coll: 'chat_messages', filter: { $or: [{ sender_id: { $in: u } }, { receiver_id: { $in: u } }] } },
    { coll: 'chat_conversations', filter: { participants: { $in: u } } },
    { coll: 'otp_verifications', filter: { email: { $in: ledger.emails } } },
    { coll: 'shop_followers', filter: { buyer_ids: { $in: u } },
      update: { $pull: { buyer_ids: { $in: u } } } },
    { coll: 'users', filter: { _id: { $in: u } } },
  ];
  return ops;
}

module.exports = { buildScope, buildOps };
