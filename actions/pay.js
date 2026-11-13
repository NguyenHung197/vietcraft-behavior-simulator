const { oid, dec, ObjectId } = require('../lib/db');
const { assertPayable } = require('../lib/safety');
const { track, sellerDelay, enqueue } = require('../lib/runtime');
const { applyDoc } = require('../sim/sync');

const num = (d) => Number(String(d ?? 0));

// Mirrors payos.service.ts settlePaid by DB write; no gateway is called.
async function markPaid(rt, { orderId }) {
  const o = rt.state.orders[orderId];
  const orders = rt.db.collection('orders');
  const doc = await orders.findOne({ _id: oid(orderId) });
  assertPayable(rt, doc);
  if (doc.order_status === 'CANCELLED') { applyDoc(rt, orderId, doc); return; }
  if (doc.payment_status !== 'PENDING') return;
  const fb = doc.financial_breakdown;
  const amount = num(fb.subtotal) + num(fb.shipping_fee) - num(fb.coupon_discount);
  const ref = `FT${Date.now().toString().slice(-11)}${rt.rng.int(100, 999)}`;
  const now = new Date();
  const res = await orders.updateOne({ _id: doc._id, payment_status: 'PENDING' }, {
    $set: { payment_status: 'PAID', paid_at: now, order_status: 'ORDERED',
      seller_approval_status: 'PENDING_APPROVAL', fulfillment_status: 'UNFULFILLED', updated_at: now },
    $push: { status_history: { status: 'ORDERED', changed_at: now,
      note: `payOS: Thanh toán thành công (Mã GD: ${ref}). Đơn hàng đang chờ người bán duyệt đơn chuẩn bị hàng.` } },
  });
  if (!res.modifiedCount) return;
  const txId = new ObjectId();
  track(rt, 'transactions', txId);
  // callback_payload has no counterAccount* fields, so BE can never auto-refund to a bank.
  await rt.db.collection('transactions').insertOne({
    _id: txId, order_id: doc._id, order_code: doc.order_code, user_id: doc.buyer_id,
    gateway: 'PAYOS', gateway_transaction_id: ref, gateway_response_code: '00',
    amount: dec(amount),
    type: 'PAYMENT', status: 'SUCCESS', payment_date: now,
    callback_payload: { simulated: true, reference: ref }, sim: true,
    note: `Thanh toán thành công qua payOS #${ref}`, created_at: now, updated_at: now,
  });
  const meta = { orderId: orderId, orderCode: doc.order_code };
  const owner = rt.catalog.shops[String(doc.shop_id)]?.owner_id;
  const notes = [{ user_id: doc.buyer_id, title: 'Thanh toán thành công', link: `/orders/${orderId}`,
    content: `Đơn hàng #${doc.order_code} đã thanh toán thành công qua payOS và đang chờ người bán xác nhận.`,
    metadata: { ...meta, status: 'ORDERED' } }];
  if (owner) notes.push({ user_id: owner, title: 'Đơn hàng mới cần duyệt', link: '/seller/orders',
    content: `Đơn hàng #${doc.order_code} (${amount.toLocaleString('vi-VN')}₫) đã được thanh toán qua payOS và đang chờ bạn duyệt.`,
    metadata: { ...meta, status: 'PENDING_APPROVAL' } });
  for (const n of notes) {
    const _id = new ObjectId();
    track(rt, 'notifications', _id);
    await rt.db.collection('notifications').insertOne(
      { _id, ...n, type: 'ORDER_UPDATE', is_read: false, created_at: now, sim: true });
  }
  o.status = 'PAID';
  rt.log(`  💳 đơn ${o.code} đã thanh toán (${amount.toLocaleString('vi-VN')}đ, ghi DB)`);
  enqueue(rt, 'sellerProcess', sellerDelay(rt), { orderId });
}

module.exports = { markPaid };
