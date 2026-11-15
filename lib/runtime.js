const fs = require('fs');
const path = require('path');
const { guard } = require('./guard');
const { connect } = require('./db');
const ledgerLib = require('./ledger');
const stateLib = require('./state');
const { createRng } = require('./rng');
const { loadCatalog } = require('./catalog');
const { dayKey, intoHours } = require('../sim/rhythm');

const DATA = path.join(__dirname, '..', 'data');
const LOGS = path.join(__dirname, '..', 'logs');
fs.mkdirSync(LOGS, { recursive: true });

async function open(ctx) {
  const secrets = guard();
  const conn = await connect(secrets.uri, ctx.config.dbName);
  const state = stateLib.load(ctx.stateFile, ctx.config.seed);
  state.orders ||= {};
  state.startedAt ||= new Date().toISOString();
  const rt = {
    ctx, cfg: ctx.config, db: conn.db, close: conn.close, secrets,
    ledger: ledgerLib.load(ctx.ledgerFile), state, rng: createRng(state.rngState),
    data: {
      names: require(path.join(DATA, 'names.json')),
      addresses: require(path.join(DATA, 'addresses.json')),
      texts: require(path.join(DATA, 'texts.json')),
      parts: require(path.join(DATA, 'text-parts.json')),
    },
    tokens: {},
    log: (msg) => {
      const now = new Date();
      const line = `${now.toTimeString().slice(0, 8)} ${msg}`;
      console.log(line);
      // One file per day, so the log can be read without the terminal.
      try { fs.appendFileSync(path.join(LOGS, `${dayKey(now)}.log`), line + '\n'); } catch { /* logging must not stop the run */ }
    },
  };
  rt.catalog = await loadCatalog(rt.db, rt.cfg);
  return rt;
}

function save(rt) {
  rt.state.rngState = rt.rng.state;
  ledgerLib.save(rt.ctx.ledgerFile, rt.ledger);
  stateLib.write(rt.ctx.stateFile, rt.state);
}

// Ledger is saved before the write it describes, so a crash never leaves untracked data.
function track(rt, coll, id) {
  ledgerLib.record(rt.ledger, coll, [id]);
  ledgerLib.save(rt.ctx.ledgerFile, rt.ledger);
}

// Config delays are minutes; fast mode plays one minute as one second.
function delay(rt, range) {
  const m = Array.isArray(range) ? rt.rng.int(range[0], range[1]) : range;
  return m * (rt.cfg.fast ? 1000 : 60000);
}

// Work-hour types (config.workHours) run only inside their shop hours, with a random delay after opening.
function enqueue(rt, type, ms, payload) {
  const win = rt.cfg.workHours?.[type];
  let at = Date.now() + ms;
  if (win && !rt.cfg.fast) at = intoHours(at, win, rt.rng.int(0, 90) * 60000);
  rt.state.queue.push({ at, type, tries: 0, ...payload });
}

// Some sellers are slow: their processing takes three times as long.
function sellerDelay(rt) {
  const ms = delay(rt, rt.cfg.delays.sellerProcessingMin);
  return rt.rng.chance(rt.cfg.behaviour.slowSeller) ? ms * 3 : ms;
}

// Keeps the first value of a snapshot and saves the ledger at once.
function snapshotNow(rt, key, doc) {
  if (ledgerLib.snapshot(rt.ledger, key, doc)) ledgerLib.save(rt.ctx.ledgerFile, rt.ledger);
}

function countEvent(rt) {
  const day = dayKey();
  const c = rt.state.counters;
  if (c.eventDay !== day) { c.eventDay = day; c.events = 0; }
  c.events += 1;
  return c.events <= rt.cfg.limits.maxEventsPerDay;
}

module.exports = { open, save, track, delay, enqueue, sellerDelay, snapshotNow, countEvent };
