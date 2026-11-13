const { oid } = require('../lib/db');
const { DONE } = require('./pace');

// Copies a terminal DB status onto the state order; non-terminal DB statuses are ignored.
function applyDoc(rt, orderId, doc) {
  const o = rt.state.orders[orderId];
  const next = doc?.order_status;
  if (!o || !DONE.includes(next) || next === o.status) return false;
  rt.log(`  ↻ đơn ${o.code}: state ${o.status} → ${next} (theo DB)`);
  o.status = next;
  return true;
}

async function syncOrder(rt, orderId) {
  try {
    const doc = await rt.db.collection('orders').findOne({ _id: oid(orderId) }, { projection: { order_status: 1 } });
    applyDoc(rt, orderId, doc);
  } catch (e) {
    rt.log(`  ! đồng bộ đơn lỗi: ${e.message}`);
  }
}

// Open state orders with no queue item are not re-checked by the loop, so they are read from DB here.
async function syncOrphans(rt) {
  try {
    const queued = new Set((rt.state.queue || []).map((q) => q.orderId));
    const ids = Object.keys(rt.state.orders || {})
      .filter((id) => !DONE.includes(rt.state.orders[id].status) && !queued.has(id));
    if (!ids.length) return 0;
    const docs = await rt.db.collection('orders')
      .find({ _id: { $in: ids.map((id) => oid(id)) } }, { projection: { order_status: 1 } }).toArray();
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const n = ids.filter((id) => applyDoc(rt, id, byId.get(id))).length;
    if (n) rt.log(`  ↻ đồng bộ ${n} đơn lệch với DB`);
    return n;
  } catch (e) {
    rt.log(`  ! đồng bộ đơn lỗi: ${e.message}`);
    return 0;
  }
}

module.exports = { applyDoc, syncOrder, syncOrphans };
