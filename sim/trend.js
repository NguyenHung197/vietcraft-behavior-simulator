const crypto = require('crypto');
const { calendarFor } = require('./calendar');
const { dayKey } = require('./rhythm');

const DAY = 864e5;
const WEEK = 7 * DAY;
const NEW_DAYS = 14;

// Stable weekly level per product in [0.5, 2]; linear between weeks, so it never jumps.
const weekLevel = (seed, productId, week) => {
  const u = crypto.createHash('sha256').update(`${seed}:${productId}:${week}`).digest().readUInt32BE(0) / 2 ** 32;
  return 2 ** (2 * u - 1);
};

function trendFactor(seed, productId, date) {
  const ms = +date;
  const week = Math.floor(ms / WEEK);
  const t = (ms - week * WEEK) / WEEK;
  return weekLevel(seed, productId, week) * (1 - t) + weekLevel(seed, productId, week + 1) * t;
}

// Products listed in the last two weeks get a boost that fades to 1.
function newBoost(createdAt, now) {
  const age = Math.max((now - createdAt) / DAY, 0);
  return age < NEW_DAYS ? 1 + 1.5 * (1 - age / NEW_DAYS) : 1;
}

// Sale-event share of a product's group: a fashion product is worth more on a fashion sale day.
function groupFactor(rt, group, now) {
  if (!group) return 1;
  const day = dayKey(now);
  const c = (rt.groupCache ||= { day: null, map: {} });
  if (c.day !== day) { c.day = day; c.map = {}; }
  if (!(group in c.map)) {
    c.map[group] = calendarFor(rt.cfg, now, group).traffic / calendarFor(rt.cfg, now).traffic;
  }
  return c.map[group];
}

const productBoost = (rt, p, now = new Date()) => trendFactor(rt.cfg.seed, p.id, now)
  * newBoost(p.createdAt, +now) * groupFactor(rt, p.group, now);

module.exports = { trendFactor, newBoost, productBoost };
