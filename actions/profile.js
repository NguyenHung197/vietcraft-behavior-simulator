const { buyerCall } = require('./account');
const { makeAddress, makePhone } = require('../lib/profile');

const view = (rt, buyerId) => buyerCall(rt, buyerId, 'GET', '/users/profile');

async function edit(rt, buyerId) {
  const phone = makePhone(rt.rng);
  await buyerCall(rt, buyerId, 'PUT', '/users/profile', { phone });
  rt.log(`  ✎ ${rt.state.buyers[buyerId].name} đổi số điện thoại`);
}

// Each buyer keeps at most one extra address; checkout may use it later.
async function addAddress(rt, buyerId) {
  const b = rt.state.buyers[buyerId];
  if (b.altAddress) return;
  const addr = makeAddress(rt.rng, rt.data, b.name, b.address.phone);
  await buyerCall(rt, buyerId, 'POST', '/users/profile/addresses', { ...addr, is_default: false });
  b.altAddress = addr;
  rt.log(`  ⌂ ${b.name} thêm địa chỉ thứ hai`);
}

// An abandoned signup has no address in DB; it adds its own before shopping.
const completeAddress = (rt, buyerId) => buyerCall(rt, buyerId, 'POST', '/users/profile/addresses',
  { ...rt.state.buyers[buyerId].address, is_default: true });

module.exports = { view, edit, addAddress, completeAddress };
