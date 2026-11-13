const path = require('path');
const { createRequire } = require('module');

const requireBE = createRequire(path.join(__dirname, '..', '..', 'BE', 'package.json'));
const jwt = requireBE('jsonwebtoken');

// Paths that could reach a real gateway or the per-item return flow.
// Also: mail senders, Cloudinary uploads and AI mockups that clean cannot undo.
const BLOCKED = [/\/payment\b/i, /payos/i, /vnpay/i, /retry-execution/i, /\/returns\b/i, /\/callback\b/i,
  /\/auth\/(forgot-password|google|resend-otp)\b/i, /\/designs\b/i, /\/preview-mockup\b/i, /\/upload\b/i];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calls = [];

function assertPath(p) {
  if (BLOCKED.some((re) => re.test(p))) throw new Error(`safety: blocked path ${p}`);
}

// Re-checks after each sleep: parallel sessions share one window.
async function throttle(max) {
  for (;;) {
    const now = Date.now();
    while (calls.length && now - calls[0] > 60000) calls.shift();
    if (calls.length < max) { calls.push(now); return; }
    await sleep(60000 - (now - calls[0]) + 5);
  }
}

// ok: extra HTTP statuses that must not throw (body is still returned). ip: fake client IP (X-Forwarded-For).
async function api(rt, method, p, { token, body, ok = [], ip } = {}) {
  assertPath(p);
  await throttle(rt.cfg.limits.maxActionsPerMinute);
  const headers = { 'User-Agent': UA, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['X-Forwarded-For'] = ip;
  const res = await fetch(`${rt.cfg.baseUrl}/api${p}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  if (!res.ok && !ok.includes(res.status)) {
    const e = new Error(`${method} ${p} -> ${res.status}: ${json.error || json.message || ''}`);
    e.status = res.status;
    throw e;
  }
  return json;
}

// Seller/admin act through a short-lived token signed like auth.service.ts:68.
function signToken(rt, user) {
  return jwt.sign(
    { id: String(user._id), email: user.email, role: String(user.role).toLowerCase() },
    rt.secrets.jwtSecret, { expiresIn: '1h' },
  );
}

module.exports = { api, signToken, assertPath, sleep };
