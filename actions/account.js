const path = require('path');
const { createRequire } = require('module');
const { ObjectId } = require('../lib/db');
const { api } = require('../lib/http');
const { makeProfile, passwordFor } = require('../lib/profile');
const { fakeIp } = require('../lib/ip');
const ledgerLib = require('../lib/ledger');
const { track } = require('../lib/runtime');

const bcrypt = createRequire(path.join(__dirname, '..', '..', 'BE', 'package.json'))('bcryptjs');

// Each buyer keeps one fake IP; older buyers get one on first use.
const ipOf = (rt, buyerId) => {
  const b = rt.state.buyers[buyerId];
  return (b.ip ||= fakeIp(rt.rng));
};

// signupMode "db": the user document is inserted directly, no OTP mail is sent.
async function signup(rt) {
  const users = rt.db.collection('users');
  let p = makeProfile(rt.rng, rt.data, rt.cfg);
  for (let i = 0; i < 5 && await users.findOne({ email: p.email }); i++) {
    p = makeProfile(rt.rng, rt.data, rt.cfg);
  }
  if (await users.findOne({ email: p.email })) throw new Error('signup: email collision');
  const abandoned = rt.rng.chance(rt.cfg.abandonSignupProb);
  const now = new Date();
  const _id = new ObjectId();
  ledgerLib.recordEmail(rt.ledger, p.email);
  track(rt, 'users', _id);
  await users.insertOne({
    _id, email: p.email,
    password_hash: bcrypt.hashSync(passwordFor(rt.secrets.jwtSecret, p.email), 12),
    role: 'BUYER', is_locked: false, full_name: p.full_name, avatar: '', phone: p.phone,
    is_phone_verified: false, is_email_verified: true, seller_status: 'NONE',
    addresses: abandoned ? [] : [{ _id: new ObjectId(), ...p.address, is_default: true }],
    wishlist: [], notification_settings: { in_app: true, push: false, email: false },
    created_at: now, updated_at: now, sim: true,
  });
  rt.state.buyers[String(_id)] = {
    email: p.email, name: p.full_name, persona: p.persona, address: p.address,
    dormant: abandoned || p.dormant, abandoned, wish: [], follows: [], sessions: 0, orders: 0,
    createdAt: now.toISOString(), ip: fakeIp(rt.rng),
  };
  rt.log(`signup ${p.full_name} <${p.email}> persona=${p.persona}${abandoned ? ' (bỏ dở)' : ''}`);
  return String(_id);
}

async function login(rt, buyerId) {
  const b = rt.state.buyers[buyerId];
  const r = await api(rt, 'POST', '/auth/login', {
    body: { email: b.email, password: passwordFor(rt.secrets.jwtSecret, b.email) }, ip: ipOf(rt, buyerId),
  });
  if (!r.token) throw new Error('login: no token in response');
  rt.tokens[buyerId] = r.token;
  return r.token;
}

// Runs fn(token); logs in again once when the token is rejected.
async function asBuyer(rt, buyerId, fn) {
  const token = rt.tokens[buyerId] || await login(rt, buyerId);
  try {
    return await fn(token);
  } catch (e) {
    if (e.status !== 401) throw e;
    return fn(await login(rt, buyerId));
  }
}

// One API call made as the buyer, like the FE does.
const buyerCall = (rt, buyerId, method, p, body, ok) => asBuyer(rt, buyerId,
  (token) => api(rt, method, p, { token, body, ok, ip: ipOf(rt, buyerId) }));

module.exports = { signup, login, asBuyer, buyerCall };
