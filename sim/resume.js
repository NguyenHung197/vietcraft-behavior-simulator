const { intoHours } = require('./rhythm');

const MIN = 60000;

// Overdue queue items are spread over the next spreadMin minutes, so a wake-up never fires them all at once.
// Work-hour types still wait for their shop hours, like enqueue does.
function spreadOverdue(rt) {
  const now = Date.now();
  let n = 0;
  for (const item of rt.state.queue) {
    if (item.at >= now - 5 * MIN) continue;
    item.at = now + rt.rng.int(1, rt.cfg.resume.spreadMin) * MIN;
    const win = rt.cfg.workHours?.[item.type];
    if (win && !rt.cfg.fast) item.at = intoHours(item.at, win, rt.rng.int(0, 90) * MIN);
    n += 1;
  }
  if (n) rt.log(`↺ ${n} việc quá hạn, rải lại trong ${rt.cfg.resume.spreadMin} phút`);
  return n;
}

async function backendUp(rt) {
  try {
    const res = await fetch(`${rt.cfg.baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

// False while the backend is down; logs once per outage and spreads the backlog on return.
async function gate(rt) {
  if (!(await backendUp(rt))) {
    if (!rt.downSince) { rt.downSince = Date.now(); rt.log('⛔ backend không phản hồi, tạm dừng'); }
    return false;
  }
  if (rt.downSince) {
    rt.log(`✅ backend lên lại sau ${Math.round((Date.now() - rt.downSince) / MIN)} phút`);
    rt.downSince = null;
    spreadOverdue(rt);
  }
  return true;
}

// A long gap between ticks means the machine slept.
function checkGap(rt) {
  if (rt.lastTick && Date.now() - rt.lastTick > 5 * MIN) spreadOverdue(rt);
}

// Network failures are not the item's fault, so they do not use up its tries.
const isNetError = (e) => Boolean(e.cause) || e.name === 'TimeoutError'
  || /fetch failed|ECONNREFUSED/.test(e.message);

module.exports = { spreadOverdue, gate, checkGap, isNetError };
