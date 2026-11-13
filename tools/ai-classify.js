const META = new Set(['timeRange', 'generatedAt', 'updatedAt', 'createdAt', 'timestamp', 'page', 'limit', 'total_pages']);
const NOT_READY = /insufficient|not enough|chưa đủ|no data|cold/i;
const REASON_KEYS = ['message', 'reason', 'note', 'error', 'hint'];

// True when the body holds a positive number or a non-empty array, skipping meta keys.
function hasData(v, key) {
  if (META.has(key)) return false;
  if (typeof v === 'number') return v > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => hasData(x, k));
  return false;
}

// Only message-like fields, so a product title with "cold" does not count.
function texts(v) {
  if (!v || typeof v !== 'object') return [];
  const own = [...REASON_KEYS, 'status'].map((k) => v[k]).filter((s) => typeof s === 'string');
  return [...own, ...Object.values(v).flatMap(texts)];
}

function reason(v) {
  if (!v || typeof v !== 'object') return '';
  const direct = REASON_KEYS.map((k) => v[k]).find((s) => typeof s === 'string');
  return direct || Object.values(v).map(reason).find(Boolean) || '';
}

// Status 0 means no HTTP response (timeout or network error).
function classify(status, body) {
  const hint = reason(body).slice(0, 80);
  if (!status || status >= 400) return { kind: 'LỖI', hint };
  if (texts(body).some((s) => NOT_READY.test(s))) return { kind: 'RỖNG', hint };
  return { kind: hasData(body) ? 'CÓ DỮ LIỆU' : 'RỖNG', hint };
}

module.exports = { classify };
