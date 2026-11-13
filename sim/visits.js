const pool = require('./pool');
const { runSession } = require('./session');
const { SESSIONS_PER_DAY } = require('./persona');
const { isOn } = require('./anomaly');
const { dayKey } = require('./rhythm');

// Per-buyer chance of a session this tick; new buyers are keener for their first weeks.
function sessionP(cfg, b, factor, boost = 1, now = Date.now()) {
  const ageDays = b.createdAt ? Math.max((now - Date.parse(b.createdAt)) / 864e5, 0) : Infinity;
  const honeymoon = 1 + 1.5 * Math.exp(-ageDays / 7);
  return Math.min((SESSIONS_PER_DAY[b.persona] / 24) * (cfg.tickSeconds / 3600) * factor * boost * honeymoon
    * (cfg.fast ? 200 : 1), 0.9);
}

// Extra visits to a spiking shop, run before the normal sessions so they are not cut off.
async function spikeVisits(rt, factor) {
  const now = Date.now();
  for (const a of rt.state.anomalies.filter((x) => x.kind === 'spike' && isOn(x, now))) {
    for (const [id, b] of rt.rng.shuffle(Object.entries(rt.state.buyers))) {
      if (b.dormant || pool.busy(id)) continue;
      const p = sessionP(rt.cfg, b, factor) * (a.mult - 1) * rt.cfg.anomaly.spikeShare;
      if (!rt.rng.chance(p)) continue;
      if (!pool.launch(rt, id, () => runSession(rt, id, { shopId: a.shopId }))) return;
    }
  }
}

// Every 15 ticks (~5 min), proof the loop is alive during quiet hours.
function heartbeat(rt, factor) {
  const buyers = Object.values(rt.state.buyers);
  const next = rt.state.queue.reduce((m, q) => Math.min(m, q.at), Infinity);
  const wait = next === Infinity ? '-' : `${Math.max(0, Math.round((next - Date.now()) / 60000))}p`;
  const c = rt.state.counters;
  const guests = c.guestsDay === dayKey() ? c.guestsToday : 0;
  rt.log(`· vẫn chạy: ${buyers.filter((b) => !b.dormant).length}/${buyers.length} buyer hoạt động, `
    + `${pool.size()} đang online, guest hôm nay ${guests}, `
    + `${rt.state.queue.length} việc chờ (việc kế tiếp ${wait}), độ đông x${factor.toFixed(2)}`);
}

module.exports = { sessionP, spikeVisits, heartbeat };
