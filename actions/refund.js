const { api } = require('../lib/http');
const { oid } = require('../lib/db');
const { assertRefundable } = require('../lib/safety');
const { asBuyer } = require('./account');
const { sellerToken, adminToken } = require('./seller');
const { writeEvidence } = require('./evidence');
const { track, delay, enqueue } = require('../lib/runtime');
const { funnelFor } = require('../sim/persona');
const { addTodo } = require('../sim/aftercare');
const { sour } = require('../sim/memory');

const APPROVED = ['SELLER_APPROVED', 'ADMIN_APPROVED'];

// Every step re-reads the order and refuses anything but a sim COD/PAYOS order.
async function guarded(rt, orderId) {
  const doc = await rt.db.collection('orders').findOne({ _id: oid(orderId) });
  assertRefundable(rt, doc);
  return doc;
}
const refundDoc = (rt, refundId) => rt.db.collection('refund_requests').findOne({ _id: oid(refundId) });

// SIM_DECISION forces APPROVE or REJECT for tests; otherwise a weighted random pick.
function decisionFor(rt, approveChance) {
  const forced = process.env.SIM_DECISION;
  if (!forced) return rt.rng.chance(approveChance) ? 'APPROVE' : 'REJECT';
  if (!['APPROVE', 'REJECT'].includes(forced)) throw new Error(`safety: SIM_DECISION ${forced} not allowed`);
  return forced;
}

// BE has no change-of-mind category, so that cause goes as OTHER with its own wording.
const reasonFor = (rt, cause) => (cause === 'mind'
  ? { category: 'OTHER', texts: rt.data.texts.refundMind } : rt.rng.pick(rt.data.texts.refund));

// cause: 'mind' (returner changed their mind) or 'unhappy' (default, also for old todos).
async function request(rt, { orderId, cause }) {
  const o = rt.state.orders[orderId];
  const doc = await guarded(rt, orderId);
  if (doc.order_status !== 'DELIVERED' || doc.refund_status !== 'NONE') return;
  const reason = reasonFor(rt, cause);
  const evidence = [await writeEvidence(rt, orderId)];
  await asBuyer(rt, o.buyerId, (token) => api(rt, 'POST', `/orders/${orderId}/refund-requests`, { token, body: {
    reason_category: reason.category, description: rt.rng.pick(reason.texts),
    evidence, refund_type: 'FULL',
  } }));
  const req = await rt.db.collection('refund_requests').findOne({ order_id: doc._id });
  if (!req) throw new Error('refund: request not found after create');
  const refundId = String(req._id);
  track(rt, 'refund_requests', refundId);
  rt.log(`  ↩ đơn ${o.code}: yêu cầu hoàn tiền (${reason.category})`);
  if (cause !== 'mind') await sour(rt, o.buyerId, o.shopId);
  const f = funnelFor(rt.cfg, rt.state.buyers[o.buyerId].persona);
  // 10%: seller stays silent, BE escalates after 48h and the buyer may dispute.
  if (!rt.rng.chance(0.1)) return enqueue(rt, 'refundDecision', delay(rt, [30, 240]), { orderId, refundId });
  if (rt.rng.chance(f.dispute)) {
    const after = Date.now() + delay(rt, rt.cfg.delays.disputeMin + 60);
    addTodo(rt.state.buyers[o.buyerId], { type: 'dispute', orderId, refundId, after });
  }
  return null;
}

async function decide(rt, { orderId, refundId }) {
  const o = rt.state.orders[orderId];
  await guarded(rt, orderId);
  if ((await refundDoc(rt, refundId))?.status !== 'PENDING_SELLER') return;
  const decision = decisionFor(rt, 0.7);
  const note = rt.rng.pick(rt.data.texts[decision === 'APPROVE' ? 'sellerApprove' : 'sellerReject']);
  // APPROVE answers 422: BE has no automatic refund for COD / PayOS without a bank account.
  await api(rt, 'POST', `/seller/refund-requests/${refundId}/decision`, {
    token: await sellerToken(rt, o.shopId), body: { decision, note }, ok: decision === 'APPROVE' ? [422] : [],
  });
  rt.log(`  ↩ đơn ${o.code}: người bán ${decision === 'APPROVE' ? 'đồng ý' : 'từ chối'} hoàn tiền`);
  if (decision === 'APPROVE') return enqueue(rt, 'settle', delay(rt, [5, 60]), { orderId, refundId, as: 'seller' });
  await sour(rt, o.buyerId, o.shopId);
  const f = funnelFor(rt.cfg, rt.state.buyers[o.buyerId].persona);
  if (rt.rng.chance(f.dispute)) {
    const after = Date.now() + delay(rt, [30, 600]);
    addTodo(rt.state.buyers[o.buyerId], { type: 'dispute', orderId, refundId, after });
  }
  return null;
}

// Manual settlement: BE only records that the seller refunded outside the system.
async function settle(rt, { orderId, refundId, as }) {
  const o = rt.state.orders[orderId];
  await guarded(rt, orderId);
  if (!APPROVED.includes((await refundDoc(rt, refundId))?.status)) return;
  const token = as === 'admin' ? await adminToken(rt) : await sellerToken(rt, o.shopId);
  const reference = `FT${Date.now().toString().slice(-11)}${rt.rng.int(100, 999)}`;
  await api(rt, 'POST', `/seller/refund-requests/${refundId}/manual-settle`, {
    token, body: { reference, note: 'Đã chuyển khoản hoàn tiền cho khách' },
  });
  o.status = 'REFUNDED';
  rt.log(`  ↩ đơn ${o.code}: đã hoàn tiền thủ công (${reference})`);
}

async function dispute(rt, { orderId, refundId }) {
  const o = rt.state.orders[orderId];
  await guarded(rt, orderId);
  if (!['SELLER_REJECTED', 'TIMEOUT_ESCALATED'].includes((await refundDoc(rt, refundId))?.status)) return;
  const reason = rt.rng.pick(rt.data.texts.dispute);
  await asBuyer(rt, o.buyerId, (token) => api(rt, 'POST', `/refund-requests/${refundId}/dispute`, { token, body: { reason } }));
  rt.log(`  ⚖ đơn ${o.code}: người mua khiếu nại`);
  enqueue(rt, 'adminResolve', delay(rt, [60, 720]), { orderId, refundId });
}

async function adminResolve(rt, { orderId, refundId }) {
  const o = rt.state.orders[orderId];
  await guarded(rt, orderId);
  if ((await refundDoc(rt, refundId))?.status !== 'DISPUTED') return;
  const decision = decisionFor(rt, 0.6);
  await api(rt, 'POST', `/admin/refund-requests/${refundId}/resolve`, {
    token: await adminToken(rt), ok: decision === 'APPROVE' ? [422] : [],
    body: { decision, cost_bearer: 'SELLER', note: rt.rng.pick(rt.data.texts[decision === 'APPROVE' ? 'adminApprove' : 'adminReject']) },
  });
  rt.log(`  ⚖ đơn ${o.code}: admin ${decision === 'APPROVE' ? 'chấp thuận' : 'bác'} khiếu nại`);
  if (decision === 'APPROVE') return enqueue(rt, 'settle', delay(rt, [5, 60]), { orderId, refundId, as: 'admin' });
  await sour(rt, o.buyerId, o.shopId);
  const b = rt.state.buyers[o.buyerId];
  if (rt.rng.chance(rt.cfg.behaviour.quitAfterLostDispute)) {
    b.dormant = true;
    rt.log(`  ☹ ${b.name} thua khiếu nại, bỏ không vào sàn nữa`);
  }
  return null;
}

module.exports = { request, decide, settle, dispute, adminResolve };
