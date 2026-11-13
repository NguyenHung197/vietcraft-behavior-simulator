const { buyerCall } = require('./account');
const { event } = require('./browse');

const idOf = (v) => String(v && typeof v === 'object' ? (v._id || v.id || '') : v || '');
const num = (v) => Number(v && typeof v === 'object' ? v.$numberDecimal : v) || 0;

// Price comes from the populated variant, else the product (same as the FE mapping).
function cartItems(r) {
  const cart = r.data || r.cart || r;
  return (cart.items || []).map((i) => ({
    itemId: idOf(i._id || i.id),
    productId: idOf(i.product_id || i.productId || i.product),
    variantId: idOf(i.variant_id || i.variantId || i.variant),
    quantity: Number(i.quantity) || 1,
    price: num(i.variant_id?.retail_price ?? i.product_id?.retail_price),
  }));
}

const getCart = async (rt, buyerId) => cartItems(await buyerCall(rt, buyerId, 'GET', '/cart'));

async function addCart(rt, buyerId, product) {
  const b = rt.state.buyers[buyerId];
  const quantity = rt.rng.weighted([[1, 80], [2, 17], [3, 3]]);
  await buyerCall(rt, buyerId, 'POST', '/cart/items', {
    productId: product.id, variantId: rt.rng.pick(product.variants), quantity,
  });
  (b.cartAt ||= {})[product.id] = new Date().toISOString();
  await event(rt, buyerId, 'add-to-cart', product.id);
  rt.log(`  🛒 ${b.name} thêm giỏ "${product.title}" x${quantity}`);
}

async function changeQty(rt, buyerId, item) {
  const quantity = rt.rng.weighted([[1, 70], [2, 25], [3, 5]]);
  await buyerCall(rt, buyerId, 'PUT', `/cart/items/${item.itemId}`, { quantity });
  rt.log(`  ✎ ${rt.state.buyers[buyerId].name} đổi số lượng giỏ thành ${quantity}`);
}

async function removeItem(rt, buyerId, item) {
  await buyerCall(rt, buyerId, 'DELETE', `/cart/items/${item.itemId}`);
  delete rt.state.buyers[buyerId].cartAt?.[item.productId];
  rt.log(`  ✖ ${rt.state.buyers[buyerId].name} bỏ một món khỏi giỏ`);
}

// A buyer buys again a product they rated 4 or 5 stars.
async function rebuy(rt, buyerId) {
  const byId = Object.fromEntries(rt.catalog.products.map((p) => [p.id, p]));
  const pool = (rt.state.buyers[buyerId].reviewed || [])
    .filter((r) => r.rating >= 4 && byId[r.productId]).map((r) => byId[r.productId]);
  if (!pool.length) return false;
  await addCart(rt, buyerId, rt.rng.pick(pool));
  return true;
}

module.exports = { cartItems, getCart, addCart, changeQty, removeItem, rebuy };
