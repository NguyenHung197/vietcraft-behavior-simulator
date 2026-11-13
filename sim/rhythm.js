const crypto = require('crypto');

// Circular distance on the 24h clock, so 23:59 and 00:00 are neighbours (no step at midnight).
const g = (h, mu, s) => {
  const d = Math.min(Math.abs(h - mu), 24 - Math.abs(h - mu));
  return Math.exp(-(d * d) / (2 * s * s));
};

// Smooth 24h curve: quiet nights, lunch peak, evening peak.
function hourFactor(cfg, date = new Date()) {
  if (cfg.fast) return 1;
  const h = date.getHours() + date.getMinutes() / 60;
  const sale = require('./calendar').calendarFor(cfg, new Date(date.getTime() + 12 * 36e5)).midnight ? 1.5 * g(h, 0.5, 1) : 0; // midnight sale peak of the next day
  return 0.08 + g(h, 12.5, 1.5) + 1.6 * g(h, 21, 1.8) + 0.35 * g(h, 16, 3) + sale;
}

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Moves a time outside [from, to) local hours to the next opening, plus jitterMs.
function intoHours(at, [from, to], jitterMs) {
  const d = new Date(at);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= from && h < to) return at;
  const open = new Date(d); open.setHours(from, 0, 0, 0);
  if (h >= to) open.setDate(open.getDate() + 1);
  return open.getTime() + jitterMs;
}

// Same calendar day always gives the same noise, so a restart keeps the day's level.
function dailyNoise(cfg, date, seed = cfg.seed) {
  const u = crypto.createHash('sha256').update(`${seed}:${dayKey(date)}`).digest().readUInt32BE(0) / 2 ** 32;
  return 1 + cfg.rhythm.dailyNoise * (2 * u - 1);
}

// Weekday shape x daily noise x slow growth since the sim started.
function dayFactor(cfg, state, date = new Date()) {
  if (cfg.fast) return 1;
  const r = cfg.rhythm;
  const weeks = (date - new Date(state.startedAt)) / (7 * 864e5);
  const growth = Math.min(1 + r.growthPerWeek * weeks, r.growthCap);
  const sale = require('./calendar').calendarFor(cfg, date).traffic;
  return r.weekday[date.getDay()] * dailyNoise(cfg, date, state.seed ?? cfg.seed) * growth * sale;
}

module.exports = { hourFactor, dayFactor, dayKey, intoHours };
