const { buyerCall } = require('./account');
const { snapshotNow } = require('../lib/runtime');
const { funnelFor } = require('../sim/persona');
const { calendarFor } = require('../sim/calendar');

// Tries up to 3 available coupons, keeps the one with the biggest discount. Never creates coupons.
async function pickCoupon(rt, buyerId, { shopId, items, subtotal, shippingFee }) {
  const b = rt.state.buyers[buyerId];
  const boost = rt.cfg.sale.couponBoost ? calendarFor(rt.cfg, new Date()).buy : 1;
  const p = Math.min(0.95, funnelFor(rt.cfg, b.persona).coupon * boost);
  if (!rt.cfg.funnel.couponEnabled || !rt.rng.chance(p)) return undefined;
  const lines = items.map((i) => ({ productId: i.productId, price: i.price, quantity: i.quantity }));
  const q = new URLSearchParams({ shopId, subtotal: String(subtotal), items: JSON.stringify(lines) });
  const list = await buyerCall(rt, buyerId, 'GET', `/promotions/available?${q}`);
  let best = null;
  for (const c of (Array.isArray(list) ? list : []).slice(0, 3)) {
    const body = { code: c.code, subtotal, shippingFee, shopId, productId: items[0].productId, items: lines };
    const r = await buyerCall(rt, buyerId, 'POST', '/promotions/apply', body, [400]);
    if (r.valid && (!best || r.discount > best.discount)) best = { ...r, coupon: c };
  }
  if (!best) return undefined;
  const id = String(best.coupon.id || best.coupon._id);
  snapshotNow(rt, `coupons:${id}`, { code: best.coupon.code, used_count: best.coupon.used_count ?? null });
  rt.log(`  🎟 ${b.name} dùng mã ${best.coupon.code} (-${best.discount})`);
  return best.coupon.code;
}

module.exports = { pickCoupon };
