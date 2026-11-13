const { buyerCall } = require('../actions/account');

// A bad experience: the buyer avoids the shop from now on and stops following it.
async function sour(rt, buyerId, shopId) {
  const b = rt.state.buyers[buyerId];
  if (!b || !shopId) return;
  const avoid = (b.avoid ||= []);
  const followed = (b.follows || []).includes(shopId);
  if (avoid.includes(shopId) && !followed) return;
  if (!avoid.includes(shopId)) avoid.push(shopId);
  rt.log(`  ☹ ${b.name} né shop ${shopId}`);
  if (!followed) return;
  try {
    await buyerCall(rt, buyerId, 'DELETE', `/shops/${shopId}/follow`);
    b.follows = b.follows.filter((x) => x !== shopId);
  } catch (e) {
    if (/^safety:/.test(e.message)) throw e;
    rt.log(`  ! bỏ theo dõi lỗi: ${e.message}`);
  }
}

module.exports = { sour };
