const { pickProduct } = require('../lib/catalog');
const browse = require('../actions/browse');
const explore = require('../actions/explore');
const notify = require('../actions/notify');
const profile = require('../actions/profile');
const chat = require('../actions/chat');
const cart = require('../actions/cart');
const { buyerCall } = require('../actions/account');
const { funnelFor } = require('./persona');
const { visitProduct } = require('./product');
const { DONE } = require('./pace');

async function visitShop(rt, buyerId, ctx) {
  const b = rt.state.buyers[buyerId];
  const product = pickProduct(rt, b, ctx.shopId);
  if (!product) return;
  await buyerCall(rt, buyerId, 'GET', `/shops/${product.shopId}`);
  if (rt.rng.chance(funnelFor(rt.cfg, b.persona).follow)) await browse.follow(rt, buyerId, product);
}

// Items left in the cart for a long time may be dropped; returns the items kept.
async function dropStale(rt, buyerId, items) {
  const b = rt.state.buyers[buyerId];
  b.cartAt ||= {};
  const now = Date.now();
  const kept = [];
  for (const item of items) {
    const at = b.cartAt[item.productId];
    if (!at) { b.cartAt[item.productId] = new Date(now).toISOString(); kept.push(item); continue; }
    const days = (now - Date.parse(at)) / 864e5;
    if (days >= rt.rng.int(...rt.cfg.cart.staleDays) && rt.rng.chance(rt.cfg.cart.staleDrop)) {
      const title = rt.catalog.products.find((p) => p.id === item.productId)?.title ?? '';
      rt.log(`  🧹 bỏ "${title}" khỏi giỏ (để lâu)`);
      await cart.removeItem(rt, buyerId, item);
    } else {
      kept.push(item);
    }
  }
  return kept;
}

// Looks at the cart, may edit it, and may re-buy a product the buyer liked.
async function cartVisit(rt, buyerId, ctx) {
  const b = rt.state.buyers[buyerId];
  const bh = rt.cfg.behaviour;
  const listed = (await cart.getCart(rt, buyerId)).filter((i) => rt.catalog.productIds.includes(i.productId));
  const items = await dropStale(rt, buyerId, listed);
  if (items.length && rt.rng.chance(bh.cartQty)) await cart.changeQty(rt, buyerId, rt.rng.pick(items));
  if (items.length && rt.rng.chance(bh.cartRemove)) await cart.removeItem(rt, buyerId, rt.rng.pick(items));
  if (rt.rng.chance(bh.rebuy * (b.persona === 'loyal' ? 1 : 0.3)) && await cart.rebuy(rt, buyerId)) ctx.carted += 1;
  if (items.length && rt.rng.chance(rt.cfg.cart.returnToBuy)) ctx.carted += 1;
}

// Checks the order list; sometimes opens an active order and asks the shop after shipping.
async function ordersVisit(rt, buyerId, ctx) {
  const list = await buyerCall(rt, buyerId, 'GET', '/orders');
  const active = (Array.isArray(list) ? list : []).filter((o) => !DONE.includes(o.order_status));
  if (!active.length || !(ctx?.check || rt.rng.chance(rt.cfg.behaviour.ordersCheck))) return;
  const o = rt.rng.pick(active);
  await buyerCall(rt, buyerId, 'GET', `/orders/${o._id || o.id}`);
  if (o.order_status === 'SHIPPING' && rt.rng.chance(rt.cfg.behaviour.chatAsk)) {
    await chat.ask(rt, buyerId, String(o.shop_id), 'order');
  }
}

const INTENTS = {
  home: explore.home,
  search: explore.search,
  listing: explore.listing,
  product: visitProduct,
  shop: visitShop,
  cart: cartVisit,
  notifications: notify.check,
  orders: ordersVisit,
  profile: profile.view,
};

const runIntent = (name, rt, buyerId, ctx) => INTENTS[name](rt, buyerId, ctx);

module.exports = { runIntent, INTENTS };
