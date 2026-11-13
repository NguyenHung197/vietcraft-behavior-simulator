const { dayKey } = require('./rhythm');
const { hasTodo } = require('./aftercare');

// Returns the persona a buyer switches to today, or null. Regulars drift to loyal; others rarely change.
function nextPersona(rng, cfg, b) {
  if (b.orders >= 3 && ['browser', 'bargain_hunter'].includes(b.persona)) return rng.chance(0.05) ? 'loyal' : null;
  if (!rng.chance(0.003)) return null;
  return rng.weighted(Object.entries(cfg.persona).map(([k, v]) => [k, v.weight]));
}

// Once per calendar day: some active buyers go dormant, some dormant ones come back, some change habits.
function churnDay(rt) {
  const { cfg, rng, state } = rt;
  const day = dayKey();
  if (state.counters.churnDay === day) return;
  state.counters.churnDay = day;
  let left = 0;
  let back = 0;
  let changed = 0;
  for (const b of Object.values(state.buyers)) {
    if (b.abandoned) continue;
    if (hasTodo(b)) { if (b.dormant) { b.dormant = false; back += 1; } }
    else if (!b.dormant && rng.chance(cfg.churn.leave)) { b.dormant = true; left += 1; }
    else if (b.dormant && rng.chance(cfg.churn.back)) { b.dormant = false; back += 1; }
    const next = nextPersona(rng, cfg, b);
    if (next && next !== b.persona) { b.persona = next; changed += 1; }
  }
  rt.log(`↻ churn trong ngày: rời ${left}, quay lại ${back}`);
  if (changed) rt.log(`↻ đổi thói quen: ${changed} buyer`);
}

// Buyers still awake; the signup cap counts only these, so dormant buyers do not block new users.
const activeCount = (state) => Object.values(state.buyers).filter((b) => !b.dormant).length;

module.exports = { churnDay, nextPersona, activeCount };
