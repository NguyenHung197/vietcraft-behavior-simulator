const { api, signToken } = require('../lib/http');
const { oid } = require('../lib/db');
const { assertSimOrder, assertCancellable } = require('../lib/safety');
const { asBuyer } = require('./account');
const { delay, enqueue } = require('../lib/runtime');
const { funnelFor } = require('../sim/persona');
const { planAfter, addTodo } = require('../sim/aftercare');

// The buyer may open the site soon after a status notification.
const maybeCheck = (rt, orderId) => {
  if (rt.rng.chance(rt.cfg.behaviour.statusCheck)) enqueue(rt, 'checkOrder', delay(rt, rt.cfg.delays.checkMin), { buyerId: rt.state.orders[orderId].buyerId });
};

async function userToken(rt, filter) {
  const user = await rt.db.collection('users').findOne(filter, { projection: { email: 1, role: 1 } });
  if (!user) throw new Error('token: user not found');
  return signToken(rt, user);
}

const sellerToken = (rt, shopId) => {
  const owner = rt.catalog.shops[shopId]?.owner_id;
  if (!owner) throw new Error(`seller: shop ${shopId} not in catalog`);
  return userToken(rt, { _id: owner });
};
const adminToken = (rt) => userToken(rt, { role: 'ADMIN', is_locked: { $ne: true } });

async function setStatus(rt, orderId, body) {
  const o = rt.state.orders[orderId];
  assertSimOrder(rt, await rt.db.collection('orders').findOne({ _id: oid(orderId) }));
  const token = await sellerToken(rt, o.shopId);
  await api(rt, 'PATCH', `/seller/orders/${orderId}/status`, { token, body });
  o.status = body.status;
}

// Only unpaid COD orders are ever rejected; paid orders never are.
async function reject(rt, orderId, doc) {
  assertCancellable(rt, doc);
  const o = rt.state.orders[orderId];
  const token = await sellerToken(rt, o.shopId);
  const body = { reason: rt.rng.pick(rt.data.texts.orderReject) };
  await api(rt, 'POST', `/seller/orders/${doc.order_code || orderId}/reject`, { token, body });
  o.status = 'REJECTED';
  rt.log(`  ✖ đơn ${o.code}: người bán từ chối (${body.reason})`);
  maybeCheck(rt, orderId);
}

async function prepare(rt, { orderId }) {
  const doc = await rt.db.collection('orders').findOne({ _id: oid(orderId) });
  if (!doc || doc.order_status !== 'ORDERED') return; // cancelled or handled by a real seller
  if (doc.payment_method === 'COD' && rt.rng.chance(rt.cfg.behaviour.sellerReject)) return reject(rt, orderId, doc);
  await setStatus(rt, orderId, { status: 'PROCESSING', note: 'Shop đang đóng gói' });
  rt.log(`  📦 đơn ${rt.state.orders[orderId].code}: người bán chuẩn bị hàng`);
  maybeCheck(rt, orderId);
  enqueue(rt, 'sellerShip', delay(rt, rt.cfg.delays.sellerShippingMin), { orderId });
}

async function ship(rt, { orderId }) {
  const trackingNumber = `GHN${rt.rng.int(10000000, 99999999)}VN`;
  await setStatus(rt, orderId, { status: 'SHIPPING', trackingNumber, carrier: 'GHN' });
  rt.log(`  🚚 đơn ${rt.state.orders[orderId].code}: đang giao (${trackingNumber})`);
  maybeCheck(rt, orderId);
  enqueue(rt, 'deliver', delay(rt, rt.cfg.delays.deliveryMin), { orderId });
}

const dbStatus = async (rt, orderId) => (await rt.db.collection('orders')
  .findOne({ _id: oid(orderId) }, { projection: { order_status: 1 } }))?.order_status;

// The parcel arrives: the buyer confirms on the next visit, else the seller marks it delivered later.
async function deliver(rt, { orderId }) {
  const o = rt.state.orders[orderId];
  const b = rt.state.buyers[o.buyerId];
  if (rt.rng.chance(funnelFor(rt.cfg, b.persona).confirmDelivery)) {
    addTodo(b, { type: 'confirm', orderId, after: Date.now() });
    enqueue(rt, 'autoDeliver', delay(rt, rt.cfg.delays.autoDeliverMin), { orderId });
    rt.log(`  📬 đơn ${o.code}: hàng tới, chờ khách xác nhận`);
    return maybeCheck(rt, orderId);
  }
  await setStatus(rt, orderId, { status: 'DELIVERED' });
  rt.log(`  🏠 đơn ${o.code}: đã giao`);
  maybeCheck(rt, orderId);
  planAfter(rt, orderId);
}

// Buyer todo: confirm receipt, unless the seller already marked the order delivered.
async function confirm(rt, { orderId }) {
  const o = rt.state.orders[orderId];
  if (await dbStatus(rt, orderId) !== 'SHIPPING') return;
  await asBuyer(rt, o.buyerId, (token) => api(rt, 'POST', `/orders/${orderId}/confirm-delivery`, { token }));
  o.status = 'DELIVERED';
  rt.log(`  🏠 đơn ${o.code}: khách xác nhận đã nhận hàng`);
  planAfter(rt, orderId);
}

// The buyer never confirmed: the seller marks the order delivered.
async function autoDeliver(rt, { orderId }) {
  const o = rt.state.orders[orderId];
  if (await dbStatus(rt, orderId) !== 'SHIPPING') return;
  await setStatus(rt, orderId, { status: 'DELIVERED' });
  const b = rt.state.buyers[o.buyerId];
  b.todo = (b.todo || []).filter((t) => t.type !== 'confirm' || t.orderId !== orderId);
  rt.log(`  🏠 đơn ${o.code}: người bán xác nhận đã giao`);
  planAfter(rt, orderId);
}

module.exports = { prepare, ship, deliver, confirm, autoDeliver, sellerToken, adminToken };
