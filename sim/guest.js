const { api } = require('../lib/http');
const { pickProduct } = require('../lib/catalog');
const { fakeIp } = require('../lib/ip');
const { countEvent } = require('../lib/runtime');
const account = require('../actions/account');
const profile = require('../actions/profile');
const { countShopView } = require('../actions/browse');
const pool = require('./pool');
const session = require('./session');
const { dwellMs } = require('./pace');
const { dayKey } = require('./rhythm');
const { activeCount } = require('./population');
const { active, isOn } = require('./anomaly');

const guestRate = (rt, factor) => rt.cfg.guests.perHour * (rt.cfg.tickSeconds / 3600) * factor;

// Visitors per tick: poisson around guests.perHour, scaled like buyer sessions.
function guestsDue(rt, factor) {
  return rt.rng.poisson(guestRate(rt, factor));
}

// Anonymous visit: browses a few products without login; may sign up at the end.
// shopId (spike anomaly) limits the visit to one shop.
async function runGuest(rt, gid, { shopId } = {}) {
  const { cfg, rng, state } = rt;
  const seq = gid.slice(1);
  const ip = fakeIp(rng);
  const sid = `sim_guest_${seq}_0`;
  const steps = rng.int(...cfg.guests.steps);
  let wantProduct = null;
  rt.log(`guest ${seq} (chưa đăng nhập) vào xem ${steps} sản phẩm`);
  for (let i = 0; i < steps && !rt.stopping; i++) {
    const product = pickProduct(rt, { follows: [] }, shopId);
    if (!product) return;
    const anomaly = active(rt, product.shopId);
    if (anomaly?.kind === 'drop' && rng.chance(1 - anomaly.mult)) continue;
    await api(rt, 'GET', `/products/${product.id}`, { ip });
    if (countEvent(rt)) {
      await api(rt, 'POST', '/analytics/events/view', { ip, body: { product_id: product.id, session_id: sid } });
      countShopView(rt, product.shopId);
    }
    if (rng.chance(0.3)) await api(rt, 'GET', `/products/${product.id}/reviews`, { ip });
    if (rng.chance(cfg.guests.cartIntent)) wantProduct = product;
    if (i < steps - 1) {
      const d = dwellMs(rng, cfg);
      if (!d.idle) await session.nap(rt, d.ms);
    }
  }
  if (rt.stopping || activeCount(state) >= cfg.maxBuyers) return;
  const p = wantProduct ? cfg.guests.signupAfterCartIntent : cfg.guests.signup;
  if (!rng.chance(p)) return;
  const id = await account.signup(rt);
  const b = state.buyers[id];
  b.ip = ip;
  rt.log(`guest ${seq} đăng ký → buyer ${b.name}`);
  if (b.abandoned) {
    if (!wantProduct || !rng.chance(cfg.guests.finishSignup)) return;
    await profile.completeAddress(rt, id);
    b.abandoned = false;
    b.dormant = false;
    rt.log(`guest ${seq}: ${b.name} điền nốt địa chỉ để mua`);
  }
  pool.launch(rt, id, () => session.runSession(rt, id, { want: wantProduct?.id }));
}

// Starts one guest with a new id, while the pool has room.
function launchGuest(rt, opts) {
  const gid = `g${(rt.state.guestSeq = (rt.state.guestSeq || 0) + 1)}`;
  const c = rt.state.counters;
  if (c.guestsDay !== dayKey()) { c.guestsDay = dayKey(); c.guestsToday = 0; }
  c.guestsToday += 1;
  pool.launch(rt, gid, () => runGuest(rt, gid, opts));
}

// Share of the catalog's popularity weight that belongs to one shop.
function shareOf(rt, shopId) {
  const all = rt.catalog.products.reduce((s, p) => s + p.weight, 0);
  const mine = rt.catalog.products.filter((p) => p.shopId === shopId).reduce((s, p) => s + p.weight, 0);
  return all ? mine / all : 0;
}

// This tick's visitors, plus extra guests on each spike shop while it runs.
function spawnGuests(rt, factor) {
  const n = guestsDue(rt, factor);
  for (let i = 0; i < n && pool.hasRoom(rt); i++) launchGuest(rt);
  const now = Date.now();
  for (const a of rt.state.anomalies.filter((x) => x.kind === 'spike' && isOn(x, now))) {
    const extra = rt.rng.poisson(guestRate(rt, factor) * shareOf(rt, a.shopId) * (a.mult - 1));
    for (let i = 0; i < extra && pool.hasRoom(rt); i++) launchGuest(rt, { shopId: a.shopId });
  }
}

module.exports = { guestsDue, spawnGuests, runGuest };
