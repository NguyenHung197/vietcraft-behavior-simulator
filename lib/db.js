const dns = require('dns');
const path = require('path');
const { createRequire } = require('module');

const requireBE = createRequire(path.join(__dirname, '..', '..', 'BE', 'package.json'));
const { MongoClient, ObjectId, Decimal128 } = requireBE('mongodb');
const dec = (n) => Decimal128.fromString(String(n));

// Same SRV DNS workaround as BE (src/app/config/index.ts:150).
function fixDns() {
  try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch { /* unsupported */ }
}

async function connect(uri, dbName) {
  fixDns();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  return { client, db: client.db(dbName), close: () => client.close() };
}

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));

module.exports = { connect, oid, dec, ObjectId };
