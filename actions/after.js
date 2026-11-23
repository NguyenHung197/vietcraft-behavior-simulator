const { api } = require('../lib/http');
const { oid } = require('../lib/db');
const { delay, enqueue } = require('../lib/runtime');
const { addTodo } = require('../sim/aftercare');
const { sour } = require('../sim/memory');
const { asBuyer } = require('./account');
const { sellerToken } = require('./seller');
const { reviewText } = require('../lib/text');

const STARS = {
  good: [[5, 70], [4, 20], [3, 6], [2, 2], [1, 2]],
  mid: [[5, 55], [4, 25], [3, 10], [2, 5], [1, 5]],
  bad: [[5, 25], [4, 25], [3, 20], [2, 15], [1, 15]],
};
const MOOD = { good: [[5, 65], [4, 28], [3, 7]], bad: [[1, 55], [2, 35], [3, 10]] };
const LOST = ['SELLER_REJECTED', 'DISPUTED', 'ADMIN_REJECTED'];
const tier = (q) => (q >= 0.7 ? 'good' : q < 0.25 ? 'bad' : 'mid');
const starsFor = (rt, productId, mood) => (mood ? MOOD[mood]
  : STARS[tier(rt.catalog.products.find((p) => p.id === productId)?.quality ?? 0.5)]);

async function review(rt, { orderId, mood }) {
  const o = rt.state.orders[orderId];
  const b = rt.state.buyers[o.buyerId];
  const doc = await rt.db.collection('orders').findOne({ _id: oid(orderId) }, { projection: { order_status: 1, refund_status: 1 } });
  if (!doc || doc.order_status !== 'DELIVERED') return;
  for (const productId of o.products) {
    const rating = rt.rng.weighted(starsFor(rt, productId, mood));
    const comment = rt.rng.chance(0.2) ? '' : reviewText(rt.rng, rt.data.texts, rt.data.parts, rating);
    await asBuyer(rt, o.buyerId, (token) => api(rt, 'POST', '/reviews', {
      token, body: { orderId, productId, rating, comment },
    }));
    (b.reviewed ||= []).push({ productId, rating, orderId });
    rt.log(`  ★ ${b.name} đánh giá ${rating} sao${comment ? `: "${comment}"` : ''}`);
    if (rating > 2) continue;
    await sour(rt, o.buyerId, o.shopId);
    if (rt.rng.chance(rt.cfg.behaviour.reviewReply)) {
      enqueue(rt, 'reviewReply', delay(rt, rt.cfg.delays.reviewReplyMin), { orderId, productId, rating });
    }
  }
}

// The shop answers a low review (read-only lookup of the review id); only then may the buyer raise the stars.
async function replyReview(rt, { orderId, productId, rating }) {
  const o = rt.state.orders[orderId];
  const filter = { order_id: oid(orderId), product_id: oid(productId), buyer_id: oid(o.buyerId) };
  const doc = await rt.db.collection('reviews').findOne(filter, { projection: { _id: 1 } });
  if (!doc) return;
  const comment = rt.rng.pick(rt.data.texts.reviewReply);
  await api(rt, 'POST', `/reviews/${doc._id}/reply`, { token: await sellerToken(rt, o.shopId), body: { comment } });
  rt.log(`  💬 đơn ${o.code}: shop trả lời đánh giá ${rating} sao`);
  if (!rt.rng.chance(rt.cfg.behaviour.reviewEdit)) return;
  const wait = delay(rt, rt.cfg.afterDelivery.reviewEditMin);
  addTodo(rt.state.buyers[o.buyerId], { type: 'reviewEdit', orderId, productId, rating, after: Date.now() + wait });
}

// A buyer who gave a low star sometimes raises it after the shop replied, unless the refund was refused.
async function editReview(rt, { orderId, productId, rating }) {
  const o = rt.state.orders[orderId];
  const req = await rt.db.collection('refund_requests').findOne({ order_id: oid(orderId) }, { projection: { status: 1 } });
  if (LOST.includes(req?.status)) return;
  const next = Math.min(5, rating + rt.rng.int(1, 3));
  const comment = reviewText(rt.rng, rt.data.texts, rt.data.parts, next);
  await asBuyer(rt, o.buyerId, (token) => api(rt, 'PUT', `/reviews/order/${orderId}/product/${productId}`, {
    token, body: { rating: next, comment },
  }));
  rt.log(`  ✎ ${rt.state.buyers[o.buyerId].name} sửa đánh giá thành ${next} sao`);
}

module.exports = { review, replyReview, editReview };
