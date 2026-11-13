const DAY = 864e5;
const { dayKey: localDay } = require('./rhythm');
const isOn = (a, now) => now >= Date.parse(a.from) && now < Date.parse(a.to);

// The anomaly running now for this shop, or null.
function active(rt, shopId, now = Date.now()) {
  return rt.state.anomalies.find((a) => a.shopId === shopId && isOn(a, now)) || null;
}

// At most one per calendar day, never two at once, never before the F30 baseline is full.
function maybeStart(rt, now = Date.now()) {
  const { cfg, rng, state, catalog } = rt;
  state.shopViewsSince ||= new Date(now).toISOString();
  if (now - Date.parse(state.startedAt) < cfg.anomaly.warmupDays * DAY) return null;
  const days = Math.max((now - Date.parse(state.shopViewsSince)) / DAY, 1);
  if (days < 7) return null;
  if (state.counters.anomalyDay === localDay(new Date(now))) return null;
  state.counters.anomalyDay = localDay(new Date(now));
  if (state.anomalies.some((a) => isOn(a, now))) return null;
  if (!rng.chance(cfg.anomaly.dailyChance)) return null;
  const shopIds = Object.keys(catalog.shops)
    .filter((id) => catalog.products.some((p) => p.shopId === id))
    .filter((id) => (state.shopViews?.[id] || 0) / days >= cfg.anomaly.minDailyViews);
  if (!shopIds.length) return null;
  const kind = rng.chance(0.6) ? 'spike' : 'drop';
  const mult = kind === 'spike' ? rng.int(3, 5) : 0.15;
  const a = {
    id: state.anomalies.length + 1, shopId: rng.pick(shopIds), kind, mult,
    from: new Date(now).toISOString(), to: new Date(now + rng.int(1, 3) * DAY).toISOString(),
  };
  state.anomalies.push(a);
  rt.log(`⚡ bất thường: ${kind} shop ${a.shopId} x${mult} đến ${a.to}`);
  return a;
}

module.exports = { active, maybeStart, isOn };
