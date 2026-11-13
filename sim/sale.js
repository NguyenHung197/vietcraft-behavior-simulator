const { calendarFor } = require('./calendar');
const { addCart } = require('../actions/cart');

// On a sale day, a buyer sometimes adds a wishlisted product to the cart; returns true when it did.
async function saleWish(rt, buyerId, ctx) {
  const b = rt.state.buyers[buyerId];
  const buy = calendarFor(rt.cfg, new Date()).buy;
  if (buy <= 1.2 || !b.wish?.length) return false;
  if (!rt.rng.chance(Math.min(0.6, rt.cfg.sale.wishBuy * (buy - 1)))) return false;
  const product = rt.catalog.products.find((p) => p.id === rt.rng.pick(b.wish));
  if (!product) return false;
  rt.log(`  🛒 săn sale: thêm "${product.title}" từ yêu thích`);
  await addCart(rt, buyerId, product);
  ctx.carted += 1;
  return true;
}

module.exports = { saleWish };
