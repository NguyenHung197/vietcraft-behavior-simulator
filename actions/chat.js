const { api } = require('../lib/http');
const { buyerCall } = require('./account');
const { track, delay, enqueue } = require('../lib/runtime');
const { sellerToken } = require('./seller');
const { buyerMsg, sellerReply } = require('../lib/text');

// Same id as BE buildConversationId: sorted participant ids joined by "_".
const convId = (a, b) => [a, b].sort().join('_');

// kind is 'product' (pre-purchase) or 'order' (after shipping). Seller answers later, sometimes.
async function ask(rt, buyerId, shopId, kind) {
  const owner = rt.catalog.shops[String(shopId)]?.owner_id;
  if (!owner) return;
  const partner = String(owner);
  await buyerCall(rt, buyerId, 'POST', '/chat/conversations', { shopId: String(shopId) });
  const id = convId(buyerId, partner);
  track(rt, 'conversations', id);
  const text = buyerMsg(rt.rng, rt.data.texts, rt.data.parts, kind);
  await buyerCall(rt, buyerId, 'POST', `/chat/conversations/${id}/messages`, { receiver_id: partner, message_text: text });
  rt.log(`  💬 ${rt.state.buyers[buyerId].name} hỏi shop (${kind})`);
  if (rt.rng.chance(rt.cfg.behaviour.chatReply)) {
    enqueue(rt, 'chatReply', delay(rt, [5, 240]), { conversationId: id, buyerId, shopId: String(shopId) });
  }
}

async function reply(rt, { conversationId, buyerId, shopId }) {
  const token = await sellerToken(rt, shopId);
  const body = { receiver_id: buyerId, message_text: sellerReply(rt.rng, rt.data.texts, rt.data.parts) };
  await api(rt, 'POST', `/chat/conversations/${conversationId}/messages`, { token, body });
  rt.log(`  💬 shop trả lời ${rt.state.buyers[buyerId].name}`);
}

module.exports = { ask, reply };
