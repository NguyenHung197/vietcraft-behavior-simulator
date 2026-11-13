const REFUND_METHODS = ['COD', 'PAYOS'];

const isPod = (o) => Boolean(o.is_pod || o.order_type === 'POD'
  || (o.items || []).some((it) => it.design_file_url));

function assertSimOrder(rt, o) {
  if (!o) throw new Error('safety: order not found');
  if (!rt.state.buyers[String(o.buyer_id)]) throw new Error('safety: order is not from a sim buyer');
}

// BE sends a real refund call for VNPAY orders, so they are never refunded here.
function assertRefundable(rt, o) {
  assertSimOrder(rt, o);
  if (!REFUND_METHODS.includes(o.payment_method)) {
    throw new Error(`safety: refund refused for payment_method ${o.payment_method}`);
  }
  if (isPod(o)) throw new Error('safety: refund refused for POD order');
  if (Array.isArray(o.payos_order_codes) && o.payos_order_codes.length) {
    throw new Error('safety: order has a real PayOS link');
  }
}

function assertCancellable(rt, o) {
  assertSimOrder(rt, o);
  if (o.payment_method !== 'COD') throw new Error('safety: only COD orders are cancelled by the tool');
  if (o.payment_status !== 'PENDING') throw new Error('safety: never cancel a paid order');
}

function assertPayable(rt, o) {
  assertSimOrder(rt, o);
  if (o.payment_method !== 'PAYOS') throw new Error('safety: DB pay only for PAYOS orders');
  if (isPod(o)) throw new Error('safety: POD order');
}

module.exports = { assertSimOrder, assertRefundable, assertCancellable, assertPayable };
