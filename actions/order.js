const { api } = require('../lib/http');
const { oid } = require('../lib/db');
const ledgerLib = require('../lib/ledger');
const { assertCancellable } = require('../lib/safety');
const { asBuyer } = require('./account');
const { track, delay, sellerDelay, enqueue } = require('../lib/runtime');
const { funnelFor } = require('../sim/persona');
const { dayKey } = require('../sim/rhythm');
const { getCart } = require('./cart');
const { pickCoupon } = require('./coupon');

// Shop reputation changes with orders/refunds; keep the first value for clean.
function snapshotShop(rt, shopId) {
  const s = rt.catalog.shops[shopId];
  const snap = {};
  for (const f of ['reputation_score', 'reputation_tier']) if (s[f] !== undefined) snap[f] = s[f];
  if (Object.keys(snap).length) ledgerLib.snapshot(rt.ledger, `shops:${shopId}`, snap);
}

// BE auto-cancels unpaid online orders 30 minutes after creation, so a retry must land before that.
function payFailed(rt, orderId, retry) {
  const o = rt.state.orders[orderId];
  o.status = 'STUCK';
  const next = rt.rng.weighted(Object.entries(rt.cfg.payFail));
  if (next === 'retry') {
    enqueue(rt, 'pay', delay(rt, [6, 20]), { orderId });
    return rt.log(`  ⏳ đơn ${o.code} kẹt thanh toán, sẽ thử lại`);
  }
  if (next === 'cod') enqueue(rt, 'reorderCod', delay(rt, [2, 10]), { orderId, ...retry });
  return rt.log(`  ⏳ đơn ${o.code} kẹt thanh toán`);
}

function schedule(rt, buyerId, orderId, method, retry) {
  const f = funnelFor(rt.cfg, rt.state.buyers[buyerId].persona);
  if (method === 'PAYOS') {
    if (rt.rng.chance(f.paySuccess)) return enqueue(rt, 'pay', delay(rt, [1, 5]), { orderId });
    return payFailed(rt, orderId, retry);
  }
  const cancelP = method === 'COD' ? Math.min(f.cancelBeforeShip * 2, 0.95) : f.cancelBeforeShip;
  if (rt.rng.chance(cancelP)) return enqueue(rt, 'cancel', delay(rt, [2, 10]), { orderId });
  return enqueue(rt, 'sellerProcess', sellerDelay(rt), { orderId });
}

// SIM_METHOD forces COD or PAYOS for tests; any other value is refused.
function pickMethod(rt) {
  const forced = process.env.SIM_METHOD;
  if (!forced) return rt.rng.weighted([['COD', 60], ['PAYOS', 40]]);
  if (!['COD', 'PAYOS'].includes(forced)) throw new Error(`safety: SIM_METHOD ${forced} not allowed`);
  return forced;
}

// Resets on a new calendar day; false once today's cap is reached.
function underDailyCap(rt) {
  const c = rt.state.counters;
  const day = dayKey();
  if (c.orderDay !== day) { c.orderDay = day; c.ordersToday = 0; }
  return c.ordersToday < rt.cfg.limits.maxOrdersPerDay;
}

const quoteShipping = (rt, shopId, address) => api(rt, 'POST', '/orders/calculate-shipping', { body: { shopId, address } })
  .then((r) => Number(r.shippingFee) || 0);

// Reserves a daily slot before any await; released if no order was placed.
async function withSlot(rt, fn) {
  if (!underDailyCap(rt)) return null;
  const c = rt.state.counters;
  const slot = { placed: false };
  c.ordersToday += 1;
  try {
    return await fn(slot);
  } finally {
    if (!slot.placed) c.ordersToday -= 1;
  }
}

const checkout = (rt, buyerId) => withSlot(rt, (slot) => placeOrder(rt, buyerId, slot));

// Shared by cart checkout and the COD re-order: quote, coupon, POST /orders, state, next step.
async function submitOrder(rt, buyerId, slot, { shopId, items, method, address }) {
  const c = rt.state.counters;
  const b = rt.state.buyers[buyerId];
  snapshotShop(rt, shopId);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shippingFee = await quoteShipping(rt, shopId, address);
  const couponCode = await pickCoupon(rt, buyerId, { shopId, items, subtotal, shippingFee });
  const lines = items.map(({ productId, variantId, quantity, price }) => ({ productId, variantId, quantity, price }));
  const r = await asBuyer(rt, buyerId, (token) => api(rt, 'POST', '/orders', { token, body: {
    items: lines.map(({ price, ...line }) => line),
    shippingAddress: address, paymentGateway: method, shippingProvider: 'ghn', shippingFee, couponCode,
  } }));
  const orderId = String(r._id);
  track(rt, 'orders', orderId);
  slot.placed = true;
  rt.state.orders[orderId] = { buyerId, shopId, method, status: 'ORDERED',
    code: r.orderCode || r.order_code || r.id, products: [...new Set(items.map((i) => i.productId))] };
  c.orders = (c.orders || 0) + 1;
  b.orders += 1;
  b.lastOrderAt = new Date().toISOString();
  rt.log(`  ✔ ${b.name} đặt đơn ${rt.state.orders[orderId].code} (${method}, ${items.length} món)`);
  schedule(rt, buyerId, orderId, method, { items: lines, address });
  return orderId;
}

async function placeOrder(rt, buyerId, slot) {
  const b = rt.state.buyers[buyerId];
  if (b.abandoned) return null; // no address in DB yet
  const byId = Object.fromEntries(rt.catalog.products.map((p) => [p.id, p]));
  const cart = (await getCart(rt, buyerId)).filter((i) => byId[i.productId]);
  if (!cart.length) return null;
  const shopId = byId[rt.rng.pick(cart).productId].shopId;
  const items = cart.filter((i) => byId[i.productId].shopId === shopId);
  const method = pickMethod(rt);
  const address = b.altAddress && rt.rng.chance(rt.cfg.behaviour.altAddressCheckout) ? b.altAddress : b.address;
  const orderId = await submitOrder(rt, buyerId, slot, { shopId, items, method, address });
  for (const i of items) delete b.cartAt?.[i.productId];
  for (const i of items) {
    await asBuyer(rt, buyerId, (token) => api(rt, 'DELETE', `/cart/items/${i.itemId}`, { token }))
      .catch((e) => rt.log(`  ! không gỡ được món khỏi giỏ: ${e.message}`));
  }
  return orderId;
}

// The online payment failed: same buyer, items and address again, paid on delivery. BE cancels the old order.
async function reorderCod(rt, { orderId, items, address }) {
  const old = rt.state.orders[orderId];
  const b = rt.state.buyers[old?.buyerId];
  const listed = (items || []).filter((i) => rt.catalog.products.some((p) => p.id === i.productId));
  if (!b || b.abandoned || !listed.length) return;
  const id = await withSlot(rt, (slot) => submitOrder(rt, old.buyerId, slot,
    { shopId: old.shopId, items: listed, method: 'COD', address: address || b.address }));
  if (id) rt.log(`  ↪ ${b.name} đặt lại bằng COD`);
}

async function cancel(rt, { orderId }) {
  const o = rt.state.orders[orderId];
  const doc = await rt.db.collection('orders').findOne({ _id: oid(orderId) });
  assertCancellable(rt, doc);
  if (doc.order_status !== 'ORDERED') return;
  const reason = rt.rng.pick(rt.data.texts.cancel);
  await asBuyer(rt, o.buyerId, (token) => api(rt, 'POST', `/orders/${orderId}/cancel`, { token, body: { reason } }));
  o.status = 'CANCELLED';
  rt.log(`  ✖ đơn ${o.code} bị người mua huỷ: ${reason}`);
}

module.exports = { checkout, cancel, pickMethod, reorderCod };
