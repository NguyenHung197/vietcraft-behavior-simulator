const { buyerCall } = require('../actions/account');
const browse = require('../actions/browse');
const notify = require('../actions/notify');
const profile = require('../actions/profile');

// Small account chores that run after most visits.
async function upkeep(rt, buyerId) {
  const bh = rt.cfg.behaviour;
  await notify.unread(rt, buyerId);
  if (rt.rng.chance(bh.clearSearches)) await buyerCall(rt, buyerId, 'DELETE', '/products/meta/recent-searches');
  await browse.undo(rt, buyerId);
  if (rt.rng.chance(bh.profileEdit)) await profile.edit(rt, buyerId);
  if (rt.rng.chance(bh.addAddress)) await profile.addAddress(rt, buyerId);
}

module.exports = { upkeep };
