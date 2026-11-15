const { calendarFor } = require('./calendar');

const ELASTIC = { bargain_hunter: 1.2, browser: 0.6, loyal: 0.4, impulsive: 0.2, returner: 0.6 };

// Lower buy chance right after an order (per-persona cooldown) and higher on sale days.
function buyMult(rt, b, now = new Date()) {
  const days = b.lastOrderAt ? (now - new Date(b.lastOrderAt)) / 864e5 : Infinity;
  const cool = days < (rt.cfg.cooldownDays[b.persona] ?? 14) ? rt.cfg.cooldownMult : 1;
  return cool * calendarFor(rt.cfg, now).buy;
}

// Pricier than the catalog median lowers add-to-cart chance (most for bargain hunters); quality nudges it.
function cartMult(rt, b, product) {
  const m = rt.catalog.medianPrice;
  const price = m && product.price ? Math.min(Math.max((m / product.price) ** (ELASTIC[b.persona] ?? 0.6), 0.3), 2) : 1;
  const shop = rt.cfg?.shopBuyBoost?.[product.shopId] ?? 1;
  return price * (0.7 + 0.6 * (product.quality ?? 0.5)) * tempBoost(rt.cfg) * shop;
}

// Optional config.buyBoost { mult, until }: a temporary add-to-cart boost that expires by itself.
function tempBoost(cfg, now = Date.now()) {
  const b = cfg?.buyBoost;
  return b && now < Date.parse(b.until) ? b.mult : 1;
}

module.exports = { buyMult, cartMult };
