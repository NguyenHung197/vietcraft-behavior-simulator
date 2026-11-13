const { save } = require('../lib/runtime');

// Background sessions, capped at cfg.maxConcurrentSessions; one session per buyer at a time.
const active = new Map(); // buyerId -> Promise
const busy = (id) => active.has(id);
const hasRoom = (rt) => active.size < (rt.cfg.maxConcurrentSessions || 1);

// fn: () => Promise. Returns false when the buyer is busy or the pool is full.
function launch(rt, id, fn) {
  if (busy(id) || !hasRoom(rt)) return false;
  const p = Promise.resolve().then(fn)
    .catch((e) => rt.log(`! phiên của ${rt.state.buyers[id]?.name ?? `guest ${String(id).slice(1)}`} lỗi: ${e.message}`))
    .finally(() => { active.delete(id); save(rt); });
  active.set(id, p);
  return true;
}

const drain = () => Promise.all([...active.values()]);
const size = () => active.size;
module.exports = { launch, busy, hasRoom, drain, size };
