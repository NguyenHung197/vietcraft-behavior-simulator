const fs = require('fs');
const path = require('path');
const { guard } = require('../lib/guard');
const { connect, oid } = require('../lib/db');
const ledgerLib = require('../lib/ledger');
const stateLib = require('../lib/state');
const { buildScope, buildOps } = require('../lib/clean-plan');

const SNAP_COLL = { shops: 'shops', products: 'products', coupons: 'coupons' };
const isEmpty = (l) => !Object.values(l.created).some((a) => a.length)
  && !l.emails.length && !l.files.length && !Object.keys(l.snapshots).length
  && !Object.keys(l.stock_added).length;

// Clears the entries before undoing them, so a rerun never undoes the same stock twice.
async function undoStock(ctx, db, ledger) {
  const entries = Object.entries(ledger.stock_added);
  // Drop each entry right after its undo, so a crash loses at most one variant's progress.
  for (const [id, n] of entries) {
    await db.collection('product_variants').updateOne({ _id: oid(id) },
      [{ $set: { stock_quantity: { $max: [0, { $subtract: ['$stock_quantity', n] }] } } }]);
    delete ledger.stock_added[id];
    ledgerLib.save(ctx.ledgerFile, ledger);
  }
  return entries.length;
}

async function restock(db, scope) {
  let n = 0;
  for (const order of scope.orders) {
    if (order.order_status === 'CANCELLED') continue; // BE already restocked
    // Flag first, so a rerun after a crash never restocks the same order twice.
    const flag = await db.collection('orders').updateOne(
      { _id: order._id, sim_restocked: { $ne: true } }, { $set: { sim_restocked: true } });
    if (!flag.modifiedCount) continue;
    for (const it of order.items || []) {
      await db.collection('product_variants')
        .updateOne({ _id: it.variant_id }, { $inc: { stock_quantity: it.quantity } });
      n++;
    }
  }
  return n;
}

async function restoreSnapshots(db, ledger, errors) {
  for (const [key, snap] of Object.entries(ledger.snapshots)) {
    const [kind, id] = key.split(':');
    if (!SNAP_COLL[kind]) { errors.push(`snapshot kind unknown: ${key}`); continue; }
    await db.collection(SNAP_COLL[kind]).updateOne({ _id: oid(id) }, { $set: snap });
  }
}

async function checkSnapshots(db, ledger, errors) {
  for (const [key, snap] of Object.entries(ledger.snapshots)) {
    const [kind, id] = key.split(':');
    const doc = SNAP_COLL[kind]
      ? await db.collection(SNAP_COLL[kind]).findOne({ _id: oid(id) }) : null;
    if (!doc) { errors.push(`snapshot target missing: ${key}`); continue; }
    for (const f of Object.keys(snap)) {
      if (JSON.stringify(doc[f]) !== JSON.stringify(snap[f])) {
        errors.push(`snapshot mismatch ${key}.${f}`);
      }
    }
  }
}

function removeFiles(ctx, ledger, errors) {
  const base = path.resolve(__dirname, '..', ctx.config.uploadsDir) + path.sep;
  for (const rel of ledger.files) {
    const abs = path.resolve(ctx.root, rel);
    if (!abs.startsWith(base)) { errors.push(`file outside uploads: ${rel}`); continue; }
    fs.rmSync(abs, { force: true });
    if (fs.existsSync(abs)) errors.push(`file still exists: ${rel}`);
  }
}

async function run(ctx) {
  const ledger = ledgerLib.load(ctx.ledgerFile);
  if (isEmpty(ledger)) { console.log('ledger rong, khong co gi de don'); console.log('errors: 0'); return; }
  const errors = [];
  const { uri } = guard();
  const conn = await connect(uri, ctx.config.dbName);
  try {
    const db = conn.db;
    const scope = await buildScope(db, ledger);
    console.log(`scope: users=${scope.userIds.length} orders=${scope.orderIds.length}`);
    console.log(`stock restored: ${await restock(db, scope)} items`);
    console.log(`stock_added undone: ${await undoStock(ctx, db, ledger)} variants`);
    const ops = buildOps(scope, ledger);
    for (const op of ops) {
      const res = op.update
        ? await db.collection(op.coll).updateMany(op.filter, op.update)
        : await db.collection(op.coll).deleteMany(op.filter);
      console.log(`${op.coll}: ${op.update ? res.modifiedCount : res.deletedCount}`);
    }
    await restoreSnapshots(db, ledger, errors);
    removeFiles(ctx, ledger, errors);
    for (const op of ops) {
      const left = await db.collection(op.coll).countDocuments(op.filter);
      if (left) errors.push(`${op.coll}: ${left} left`);
    }
    await checkSnapshots(db, ledger, errors);
    console.log('warn: product_daily_metrics may keep sim numbers until next rollup');
  } finally {
    await conn.close();
  }
  console.log(`errors: ${errors.length}`);
  errors.forEach((e) => console.log(`  - ${e}`));
  if (errors.length) { console.log('ledger kept'); return; }
  ledgerLib.save(ctx.ledgerFile, ledgerLib.EMPTY());
  const state = stateLib.load(ctx.stateFile, ctx.config.seed);
  state.buyers = {}; state.queue = [];
  stateLib.write(ctx.stateFile, state);
  console.log('ledger and state cleared');
}

module.exports = { run };
