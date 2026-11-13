
// Multipliers applied to config.funnel probabilities per persona.
const MULT = {
  browser: { addCart: 0.5, checkout: 0.4 },
  bargain_hunter: { wishlist: 2, checkout: 0.8, coupon: 2 },
  loyal: { follow: 4, checkout: 1.3, review: 1.4 },
  impulsive: { addCart: 1.8, checkout: 1.5, wishlist: 0.5 },
  returner: { cancelBeforeShip: 3 },
};
const SESSIONS_PER_DAY = { browser: 2, bargain_hunter: 1.5, loyal: 1.2, impulsive: 1, returner: 0.8 };

// Multipliers on config.behaviour.intents (session step weights) per persona.
const INTENT_MULT = {
  browser: { search: 1.3, listing: 1.2 },
  bargain_hunter: { listing: 1.5, search: 1.3, cart: 1.2 },
  loyal: { orders: 2, profile: 1.5, notifications: 1.5 },
  impulsive: { product: 1.3, cart: 1.5 },
  returner: { orders: 2.5 },
};

function funnelFor(cfg, persona) {
  const out = { ...cfg.funnel };
  for (const [k, m] of Object.entries(MULT[persona] || {})) out[k] = Math.min(0.95, out[k] * m);
  return out;
}

// Returns [name, weight] pairs for rng.weighted.
function intentsFor(cfg, persona) {
  const out = { ...cfg.behaviour.intents };
  for (const [k, m] of Object.entries(INTENT_MULT[persona] || {})) out[k] *= m;
  return Object.entries(out);
}

module.exports = { funnelFor, intentsFor, SESSIONS_PER_DAY };
