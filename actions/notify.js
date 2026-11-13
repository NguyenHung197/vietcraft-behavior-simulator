const { buyerCall } = require('./account');

const unread = (rt, buyerId) => buyerCall(rt, buyerId, 'GET', '/notifications/unread-count');

// Opens the list; sometimes marks everything read, else a couple of items.
async function check(rt, buyerId) {
  const r = await buyerCall(rt, buyerId, 'GET', '/notifications?page=1&limit=10');
  const items = (r.data && r.data.items) || [];
  if (rt.rng.chance(rt.cfg.behaviour.notifyReadAll)) return buyerCall(rt, buyerId, 'PATCH', '/notifications/read-all');
  for (const n of items.filter((x) => !x.is_read).slice(0, 2)) {
    if (rt.rng.chance(0.5)) await buyerCall(rt, buyerId, 'PATCH', `/notifications/${n._id || n.id}/read`);
  }
  return null;
}

module.exports = { unread, check };
