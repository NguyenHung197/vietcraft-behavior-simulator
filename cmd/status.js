const { guard } = require('../lib/guard');
const { connect } = require('../lib/db');
const ledgerLib = require('../lib/ledger');
const stateLib = require('../lib/state');

async function run(ctx) {
  const { uri } = guard();
  const conn = await connect(uri, ctx.config.dbName);
  try {
    const users = await conn.db.collection('users').countDocuments({});
    const simUsers = await conn.db.collection('users').countDocuments({ sim: true });
    console.log(`db: ${conn.db.databaseName}`);
    console.log(`users: ${users} (sim: ${simUsers})`);
  } finally {
    await conn.close();
  }
  const ledger = ledgerLib.load(ctx.ledgerFile);
  console.log('ledger:', JSON.stringify(ledgerLib.counts(ledger)));
  const state = stateLib.load(ctx.stateFile, ctx.config.seed);
  console.log(`state: buyers=${Object.keys(state.buyers).length} queue=${state.queue.length}`);
  for (const a of state.anomalies.slice(-5)) {
    console.log(`anomaly: ${a.kind} shop=${a.shopId} x${a.mult} ${a.from} -> ${a.to}`);
  }
}

module.exports = { run };
