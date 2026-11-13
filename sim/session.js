const { sleep } = require('../lib/http');
const cart = require('../actions/cart');
const order = require('../actions/order');
const { funnelFor, intentsFor } = require('./persona');
const { buyMult } = require('./buying');
const { runIntent } = require('./intents');
const { upkeep } = require('./upkeep');
const { checkPlan, stepCount, dwellMs } = require('./pace');
const { saleWish } = require('./sale');
const { runTodos } = require('./aftercare');

const SPIKE_INTENTS = [['product', 3], ['shop', 1]];

// Sleeps in 1s slices so a stop request is noticed at once.
async function nap(rt, ms) {
  for (let left = ms; left > 0 && !rt.stopping; left -= 1000) await sleep(Math.min(1000, left));
}

// One visit: weighted steps, upkeep, then maybe a checkout. A spike visit only sees its shop.
// A status check (check: true) is a short look at notifications and orders, no checkout.
// want: a product id the buyer carried over from a guest visit; it goes to the cart first.
async function runSession(rt, buyerId, { shopId, check, want } = {}) {
  const b = rt.state.buyers[buyerId];
  if (!rt.catalog.products.length) throw new Error('session: catalog is empty');
  const f = funnelFor(rt.cfg, b.persona);
  const weights = shopId ? SPIKE_INTENTS : intentsFor(rt.cfg, b.persona);
  b.sessions += 1;
  b.lastActive = new Date().toISOString();
  const plan = check ? checkPlan(rt.rng) : null;
  const steps = plan ? plan.length : stepCount(rt.rng, rt.cfg);
  const ctx = { shopId, carted: 0, check: !!check };
  rt.log(`${b.name} (${b.persona}) vào ${check ? 'xem đơn' : `${steps} bước`}`);
  // Prefixes later lines with the buyer name, so parallel sessions stay readable.
  const srt = Object.create(rt);
  srt.log = (m) => rt.log(`[${b.name}] ${m.trimStart()}`);
  if (!shopId) {
    await runTodos(srt, buyerId).catch((e) => {
      if (/^safety:/.test(e.message)) throw e;
      srt.log(`  ! việc sau giao lỗi: ${e.message}`);
    });
  }
  if (!check && !shopId) {
    await saleWish(srt, buyerId, ctx).catch((e) => {
      if (/^safety:/.test(e.message)) throw e;
      srt.log(`  ! săn sale lỗi: ${e.message}`);
    });
  }
  const wanted = want && rt.catalog.products.find((p) => p.id === want);
  if (wanted) {
    await cart.addCart(srt, buyerId, wanted).then(() => { ctx.carted += 1; }).catch((e) => {
      if (/^safety:/.test(e.message)) throw e;
      srt.log(`  ! thêm giỏ lỗi: ${e.message}`);
    });
  }
  for (let i = 0; i < steps; i++) {
    if (rt.stopping) break;
    const name = plan ? plan[i] : rt.rng.weighted(weights);
    await runIntent(name, srt, buyerId, ctx).catch((e) => {
      if (/^safety:/.test(e.message)) throw e;
      srt.log(`  ! ${name} lỗi: ${e.message}`);
    });
    if (!rt.cfg.fast && i < steps - 1) {
      const d = dwellMs(rt.rng, rt.cfg);
      if (d.idle) srt.log(`  💤 treo máy ${Math.round(d.ms / 60000)} phút`);
      await nap(rt, d.ms);
    }
  }
  if (rt.stopping) return;
  if (check) return upkeep(srt, buyerId);
  await upkeep(srt, buyerId);
  if (ctx.carted && rt.rng.chance(f.checkout * buyMult(rt, b))) await order.checkout(srt, buyerId);
}

module.exports = { runSession, nap };
