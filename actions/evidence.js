const fs = require('fs');
const path = require('path');
const { oid } = require('../lib/db');
const ledgerLib = require('../lib/ledger');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024;

// The first product's photo from Cloudinary, or null (caller then uses the 1x1 PNG).
async function productPhoto(rt, orderId) {
  try {
    const pid = rt.state.orders[orderId].products[0];
    const doc = await rt.db.collection('products').findOne({ _id: oid(pid) }, { projection: { images: 1 } });
    const url = doc?.images?.[0];
    if (!url || !url.startsWith('https://res.cloudinary.com/')) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const ext = EXT[(res.headers.get('content-type') || '').split(';')[0]];
    if (!res.ok || !ext) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length && buf.length < MAX_BYTES ? { ext, buf } : null;
  } catch {
    return null;
  }
}

async function writeEvidence(rt, orderId) {
  const { ext, buf } = (await productPhoto(rt, orderId)) || { ext: 'png', buf: PNG };
  const name = `sim_${orderId}.${ext}`;
  const rel = path.join('BE', 'uploads', 'refunds', name);
  ledgerLib.recordFile(rt.ledger, rel);
  ledgerLib.save(rt.ctx.ledgerFile, rt.ledger);
  fs.mkdirSync(path.dirname(path.join(rt.ctx.root, rel)), { recursive: true });
  fs.writeFileSync(path.join(rt.ctx.root, rel), buf);
  return `/uploads/refunds/${name}`;
}

module.exports = { writeEvidence };
