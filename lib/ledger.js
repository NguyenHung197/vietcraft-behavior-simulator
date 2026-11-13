const fs = require('fs');

const EMPTY = () => ({ created: {}, emails: [], files: [], snapshots: {}, stock_added: {} });

function load(file) {
  if (!fs.existsSync(file)) return EMPTY();
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...EMPTY(), ...l };
}

// Atomic write: tmp file then rename.
function save(file, ledger) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
  fs.renameSync(tmp, file);
}

function record(ledger, coll, ids) {
  const set = new Set(ledger.created[coll] || []);
  for (const id of ids) set.add(String(id));
  ledger.created[coll] = [...set];
}

function recordEmail(ledger, email) {
  if (!ledger.emails.includes(email)) ledger.emails.push(email);
}

function recordFile(ledger, relPath) {
  if (!ledger.files.includes(relPath)) ledger.files.push(relPath);
}

// Keeps the first snapshot only; returns true when newly taken.
function snapshot(ledger, key, doc) {
  if (ledger.snapshots[key]) return false;
  ledger.snapshots[key] = doc;
  return true;
}

function counts(ledger) {
  const created = Object.fromEntries(
    Object.entries(ledger.created).map(([c, ids]) => [c, ids.length])
  );
  const stock = Object.values(ledger.stock_added || {});
  return { created, emails: ledger.emails.length, files: ledger.files.length,
    snapshots: Object.keys(ledger.snapshots).length,
    stock: { variants: stock.length, units: stock.reduce((s, n) => s + n, 0) } };
}

module.exports = { EMPTY, load, save, record, recordEmail, recordFile, snapshot, counts };
