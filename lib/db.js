const dns = require('dns');
const { MongoClient, ObjectId, Decimal128 } = require('mongodb');
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
