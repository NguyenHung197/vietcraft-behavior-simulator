// Shopping events mirror AI-Analysic/app/core/calendar_vn.py SHOPPING_EVENTS (date + prep_days).
const DAY = 864e5;
const utcDay = (y, m, d) => Date.UTC(y, m - 1, d);

function eventDay(e, year) {
  const s = e.dates ? e.dates[year] : e.date && `${year}-${e.date}`;
  return s ? utcDay(...s.split('-').map(Number)) : null;
}

// Multiplies peak (event day), a ramp over prep days, a quiet spell (Tết) or a lull after a sale.
function apply(out, e, diff) {
  const prep = e.prep ?? 0;
  if (e.quiet && diff <= 0 && -diff < e.quiet.days) {
    out.traffic *= e.quiet.traffic; out.buy *= e.quiet.buy;
  } else if (diff === 0) {
    out.traffic *= e.traffic; out.buy *= e.buy; out.midnight ||= !!e.midnight;
  } else if (diff > 0 && diff <= prep) {
    const k = (e.ramp ?? 0.4) * (1 - diff / (prep + 1));
    out.traffic *= 1 + (e.traffic - 1) * k; out.buy *= 1 + (e.buy - 1) * k;
  }
  if (e.after && diff < 0 && -diff <= e.after.days) {
    out.traffic *= e.after.traffic; out.buy *= e.after.buy;
  }
}

// With a group (e.g. "fashion"), events limited to other groups are skipped.
function calendarFor(cfg, date = new Date(), group) {
  const out = { traffic: 1, buy: 1, midnight: false };
  const cal = cfg.calendar || {};
  const y = date.getFullYear();
  const today = utcDay(y, date.getMonth() + 1, date.getDate());
  for (const e of cal.events || []) {
    if (group && e.groups && !e.groups.includes(group)) continue;
    for (const year of [y - 1, y, y + 1]) {
      const at = eventDay(e, year);
      if (at !== null) apply(out, e, Math.round((at - today) / DAY));
    }
  }
  const pay = cal.payday;
  if (pay?.days.includes(date.getDate())) { out.traffic *= pay.traffic; out.buy *= pay.buy; }
  return out;
}

module.exports = { calendarFor };
