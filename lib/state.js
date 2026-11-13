const fs = require('fs');
const crypto = require('crypto');
const { save } = require('./ledger');

const EMPTY = (seed) => ({
  buyers: {}, queue: [], seed, rngState: seed >>> 0, counters: {}, startedAt: null,
  anomalies: [], restockPending: [], shopViews: {}, shopViewsSince: null,
});

// A brand-new state gets a random seed, so a fresh deploy never replays an old run.
function load(file, seed) {
  if (!fs.existsSync(file)) return EMPTY(crypto.randomInt(2 ** 32));
  return { ...EMPTY(seed), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

const write = (file, state) => save(file, state);

module.exports = { load, write, EMPTY };
