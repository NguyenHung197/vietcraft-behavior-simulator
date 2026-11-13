const { buyerCall } = require('./account');
const { countEvent } = require('../lib/runtime');

const sessionId = (buyerId, b) => `sim_${buyerId}_${b.sessions}`;

// Counts a shop view for the anomaly baseline (buyers and guests alike).
function countShopView(rt, shopId) {
  const v = (rt.state.shopViews ||= {});
  v[shopId] = (v[shopId] || 0) + 1;
}

async function event(rt, buyerId, kind, productId, shopId) {
  if (!countEvent(rt)) return;
  const b = rt.state.buyers[buyerId];
  await buyerCall(rt, buyerId, 'POST', `/analytics/events/${kind}`, {
    product_id: productId, session_id: sessionId(buyerId, b),
  });
  if (kind === 'view' && shopId) countShopView(rt, shopId);
}

const view = (rt, buyerId, product) => event(rt, buyerId, 'view', product.id, product.shopId);

async function wishlist(rt, buyerId, product) {
  const b = rt.state.buyers[buyerId];
  if (b.wish.includes(product.id)) return;
  await buyerCall(rt, buyerId, 'POST', '/favorites/toggle', { productId: product.id });
  b.wish.push(product.id);
  rt.log(`  ♥ ${b.name} thích "${product.title}"`);
}

async function follow(rt, buyerId, product) {
  const b = rt.state.buyers[buyerId];
  if (b.follows.includes(product.shopId)) return;
  await buyerCall(rt, buyerId, 'POST', `/shops/${product.shopId}/follow`);
  b.follows.push(product.shopId);
  rt.log(`  + ${b.name} theo dõi shop ${product.shopId}`);
}

// Un-wishlists and unfollows now and then, so the lists are not only growing.
async function undo(rt, buyerId) {
  const b = rt.state.buyers[buyerId];
  const bh = rt.cfg.behaviour;
  if (b.wish.length && rt.rng.chance(bh.unwish)) {
    const id = rt.rng.pick(b.wish);
    await buyerCall(rt, buyerId, 'DELETE', `/favorites/${id}`);
    b.wish = b.wish.filter((x) => x !== id);
  }
  if (b.follows.length && rt.rng.chance(bh.unfollow)) {
    const id = rt.rng.pick(b.follows);
    await buyerCall(rt, buyerId, 'DELETE', `/shops/${id}/follow`);
    b.follows = b.follows.filter((x) => x !== id);
  }
}

module.exports = { event, view, wishlist, follow, undo, countShopView };
