const { open } = require('../lib/runtime');
const { api } = require('../lib/http');
const { sellerToken } = require('../actions/seller');
const { classify } = require('../tools/ai-classify');
const { SHOP, LISTING } = require('../tools/ai-routes');

const SYMBOL = { 'CÓ DỮ LIỆU': '✔', 'RỖNG': '○', 'LỖI': '✖' };

// Read-only GET; a failed call keeps its HTTP status (0 when there is no response).
async function probe(rt, token, path) {
  const t0 = Date.now();
  let status = 200;
  let body;
  try {
    body = await api(rt, 'GET', path, { token });
  } catch (e) {
    status = e.status || 0;
    body = { message: e.message };
  }
  return { path, ms: Date.now() - t0, ...classify(status, body) };
}

async function checkShop(rt, shopId, products) {
  const token = await sellerToken(rt, shopId);
  // Shop views are tracked per shop, not per product, so the first listed product is used.
  const listing = products[0].id;
  const paths = [...SHOP, ...LISTING.map((p) => p.replace(':id', listing))];
  console.log(`shop ${shopId} (${products.length} sp)`);
  const kinds = [];
  for (const path of paths) {
    const r = await probe(rt, token, path);
    console.log(`  ${SYMBOL[r.kind]} ${r.path} ${r.ms}ms${r.hint ? ` ${r.hint}` : ''}`);
    kinds.push(r.kind);
  }
  return kinds;
}

async function run(ctx, args = []) {
  const i = args.indexOf('--shop');
  const only = i >= 0 ? args[i + 1] : null;
  const rt = await open(ctx);
  try {
    const byShop = {};
    for (const p of rt.catalog.products) {
      if (!only || p.shopId === only) (byShop[p.shopId] ||= []).push(p);
    }
    if (!Object.keys(byShop).length) {
      throw new Error(only ? `shop ${only} không có sản phẩm trong catalog` : 'catalog trống');
    }
    const tally = { 'CÓ DỮ LIỆU': 0, 'RỖNG': 0, 'LỖI': 0 };
    for (const [shopId, products] of Object.entries(byShop)) {
      for (const kind of await checkShop(rt, shopId, products)) tally[kind] += 1;
    }
    console.log(`tổng: có dữ liệu ${tally['CÓ DỮ LIỆU']} / rỗng ${tally['RỖNG']} / lỗi ${tally['LỖI']}`);
  } finally {
    await rt.close();
  }
}

module.exports = { run };
