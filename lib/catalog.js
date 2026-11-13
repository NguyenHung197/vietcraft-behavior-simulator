const { productBoost } = require('../sim/trend');

const MIN_STOCK = 3;

// Read-only: ready-to-ship products of active shops, POD excluded.
async function loadCatalog(db, cfg) {
  const products = await db.collection('products').find({
    status: 'PUBLISHED', listing_status: 'ACTIVE', moderation_status: 'APPROVED',
    is_hidden: { $ne: true }, product_type: 'READY_TO_SHIP',
    $or: [{ design_placements: { $exists: false } }, { design_placements: { $size: 0 } }],
  }, { projection: { shop_id: 1, title: 1, retail_price: 1, categories: 1, created_at: 1 } }).toArray();
  const shopDocs = await db.collection('shops').find(
    { _id: { $in: products.map((p) => p.shop_id) }, status: 'ACTIVE' },
    { projection: { owner_id: 1, reputation_score: 1, reputation_tier: 1 } },
  ).toArray();
  const shops = Object.fromEntries(shopDocs.map((s) => [String(s._id), s]));
  const productIds = products.filter((p) => shops[String(p.shop_id)]).map((p) => String(p._id));
  const variants = await db.collection('product_variants').find({
    product_id: { $in: products.map((p) => p._id) },
    is_active: { $ne: false }, stock_quantity: { $gte: MIN_STOCK },
  }, { projection: { product_id: 1, stock_quantity: 1 } }).toArray();
  const byProduct = {};
  for (const v of variants) (byProduct[String(v.product_id)] ||= []).push(String(v._id));
  const list = products
    .filter((p) => shops[String(p.shop_id)] && byProduct[String(p._id)])
    .map((p) => ({
      id: String(p._id), shopId: String(p.shop_id), title: p.title,
      variants: byProduct[String(p._id)],
      // Stable popularity weight 1..10 from the id, times the optional per-shop boost.
      weight: (1 + (parseInt(String(p._id).slice(-3), 16) % 10)) * (cfg?.shopBoost?.[String(p.shop_id)] ?? 1),
      price: Number(String(p.retail_price ?? 0)) || 0,
      // Stable quality 0..0.99 from the id, independent of popularity.
      quality: (parseInt(String(p._id).slice(-6, -3), 16) % 100) / 100,
      group: cfg?.categoryGroups?.[p.categories?.[0]] ?? null,
      createdAt: p.created_at ? new Date(p.created_at).getTime() : 0,
    }));
  const prices = list.map((p) => p.price).filter((x) => x > 0).sort((a, b) => a - b);
  const medianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  return { products: list, shops, productIds, medianPrice };
}

// shopId limits the pool to one shop (anomaly spikes); null when that shop has no listed product.
// Shops the buyer had a bad experience with are picked far less and never via "followed".
function pickProduct(rt, buyer, shopId) {
  const all = rt.catalog.products.filter((p) => !shopId || p.shopId === shopId);
  if (!all.length) return null;
  const avoid = buyer.avoid || [];
  const followed = all.filter((p) => (buyer.follows || []).includes(p.shopId) && !avoid.includes(p.shopId));
  const pool = followed.length && rt.rng.chance(0.6) ? followed : all;
  const mult = (p) => (avoid.includes(p.shopId) ? rt.cfg.behaviour.avoidMult : 1);
  return rt.rng.weighted(pool.map((p) => [p, p.weight * productBoost(rt, p) * mult(p)]));
}

// API product list (array or { items }) → catalog products with their list position; unknown ids dropped.
const catalogHits = (rt, list) => (Array.isArray(list) ? list : list?.items || [])
  .map((p, position) => ({ product: rt.catalog.products.find((c) => c.id === String(p?.id || p?._id)), position }))
  .filter((h) => h.product);

module.exports = { loadCatalog, pickProduct, catalogHits, MIN_STOCK };
