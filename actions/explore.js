const { buyerCall } = require('./account');
const { catalogHits } = require('../lib/catalog');
const page = require('../sim/product');

const SORTS = ['newest', 'best_seller', 'price_asc', 'price_desc', 'rating_desc'];
const keywordsOf = (list) => (Array.isArray(list) ? list : [])
  .map((k) => (typeof k === 'string' ? k : k.keyword || k.text || k.term || '')).filter(Boolean);

// Opens one listed product that is in the catalog, with chance p.
async function maybeOpen(rt, buyerId, ctx, list, p) {
  const hits = catalogHits(rt, list);
  if (hits.length && rt.rng.chance(p)) await page.visitProduct(rt, buyerId, ctx, rt.rng.pick(hits).product);
}

async function home(rt, buyerId, ctx) {
  const forYou = await buyerCall(rt, buyerId, 'GET', '/products/meta/for-you');
  await buyerCall(rt, buyerId, 'GET', '/products/featured-shops');
  await buyerCall(rt, buyerId, 'GET', '/products/meta/trending-keywords');
  await maybeOpen(rt, buyerId, ctx, forYou, rt.cfg.behaviour.homeClick);
}

// Trending keyword, two words of a catalog title, or a Vietnamese sample search.
function pickKeyword(rt, trending) {
  const r = rt.rng.int(0, 2);
  if (r === 0 && trending.length) return rt.rng.pick(trending);
  if (r === 1) {
    const words = (rt.rng.pick(rt.catalog.products).title || '').split(/\s+/).filter((w) => w.length > 2);
    if (words.length) return words.slice(0, 2).join(' ');
  }
  return rt.rng.pick(rt.data.texts.searches);
}

async function search(rt, buyerId, ctx) {
  const trending = keywordsOf(await buyerCall(rt, buyerId, 'GET', '/products/meta/trending-keywords'));
  const kw = pickKeyword(rt, trending);
  const typing = rt.rng.int(1, 3);
  for (let i = 1; i <= typing; i++) {
    const q = kw.slice(0, Math.max(1, Math.floor((kw.length * i) / (typing + 1))));
    await buyerCall(rt, buyerId, 'GET', `/products/suggest?q=${encodeURIComponent(q)}`);
  }
  const res = await buyerCall(rt, buyerId, 'GET', `/products/search?q=${encodeURIComponent(kw)}`);
  await buyerCall(rt, buyerId, 'POST', '/products/meta/recent-searches', { keyword: kw });
  const hits = catalogHits(rt, res.items);
  rt.log(`  🔍 tìm "${kw}" (${res.total ?? 0} kết quả)`);
  if (!res.searchLogId || !hits.length || !rt.rng.chance(rt.cfg.behaviour.searchClick)) return;
  const hit = rt.rng.pick(hits);
  await buyerCall(rt, buyerId, 'POST', '/products/search/click', {
    logId: res.searchLogId, productId: hit.product.id, position: hit.position,
  });
  await page.visitProduct(rt, buyerId, ctx, hit.product);
}

async function listing(rt, buyerId, ctx) {
  const cats = await buyerCall(rt, buyerId, 'GET', '/products/meta/categories');
  const cat = rt.rng.pick(Array.isArray(cats) && cats.length ? cats : [{ name: '' }]);
  const qs = new URLSearchParams({ sort: rt.rng.pick(SORTS), page: '1', pageSize: '12' });
  if (cat.name) qs.set('category', cat.name);
  const list = await buyerCall(rt, buyerId, 'GET', `/products?${qs}`);
  rt.log(`  ▦ xem danh mục ${cat.name || 'tất cả'} (${(list.items || []).length} sản phẩm)`);
  await maybeOpen(rt, buyerId, ctx, list, rt.cfg.behaviour.listingClick);
}

module.exports = { home, search, listing };
