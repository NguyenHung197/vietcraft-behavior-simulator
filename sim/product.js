const { sleep } = require('../lib/http');
const { pickProduct, catalogHits } = require('../lib/catalog');
const browse = require('../actions/browse');
const { addCart } = require('../actions/cart');
const { buyerCall } = require('../actions/account');
const chat = require('../actions/chat');
const { funnelFor } = require('./persona');
const { cartMult } = require('./buying');
const { active } = require('./anomaly');

// Product page: detail, view event, related, reviews, then wishlist / follow / cart / chat.
// picked: a product clicked elsewhere (search, listing, home); nested: opened from "related", no further hop.
async function visitProduct(rt, buyerId, ctx = { carted: 0 }, picked = null, nested = false) {
  const b = rt.state.buyers[buyerId];
  const f = funnelFor(rt.cfg, b.persona);
  const bh = rt.cfg.behaviour;
  const product = picked || pickProduct(rt, b, ctx.shopId);
  if (!product) return;
  const drop = active(rt, product.shopId);
  if (drop?.kind === 'drop' && rt.rng.chance(1 - drop.mult)) return;
  await buyerCall(rt, buyerId, 'GET', `/products/${product.id}`);
  await browse.view(rt, buyerId, product);
  const related = await buyerCall(rt, buyerId, 'GET', `/products/${product.id}/related?limit=4`);
  if (rt.rng.chance(bh.reviewsView)) await buyerCall(rt, buyerId, 'GET', `/products/${product.id}/reviews`);
  const hits = catalogHits(rt, related);
  if (!nested && hits.length && rt.rng.chance(bh.relatedOpen)) {
    await visitProduct(rt, buyerId, ctx, rt.rng.pick(hits).product, true);
  }
  const sour = (b.avoid || []).includes(product.shopId) ? bh.avoidMult : 1;
  if (rt.rng.chance(f.wishlist)) await browse.wishlist(rt, buyerId, product);
  if (rt.rng.chance(f.follow * sour)) await browse.follow(rt, buyerId, product);
  if (rt.rng.chance(Math.min(f.addCart * cartMult(rt, b, product) * sour, 0.95))) {
    await addCart(rt, buyerId, product);
    ctx.carted += 1;
  }
  if (rt.rng.chance(bh.shopVisit * (b.persona === 'loyal' ? 3 : 1))) {
    await buyerCall(rt, buyerId, 'GET', `/shops/${product.shopId}`);
  }
  if (rt.rng.chance(bh.chatAsk)) await chat.ask(rt, buyerId, product.shopId, 'product');
  if (!rt.cfg.fast) await sleep(rt.rng.int(5000, 20000));
}

module.exports = { visitProduct };
