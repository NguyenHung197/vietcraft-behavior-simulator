const crypto = require('crypto');

const PHONE_PREFIX = ['032', '033', '034', '035', '036', '037', '038', '039', '070', '076',
  '077', '078', '079', '081', '082', '083', '084', '085', '086', '088', '089', '090', '091',
  '093', '094', '096', '097', '098'];

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');

function makeEmail(rng, last, middle, first, domain) {
  const [l, m, f] = [last, middle, first].map(slug);
  const yy = String(rng.int(85, 107) % 100).padStart(2, '0');
  const style = rng.int(0, 4);
  const local = [
    `${f}${l}${yy}`, `${l}${f}${rng.int(10, 999)}`, `${f}.${l}${yy}`,
    `${m}${f}${rng.int(1, 99)}`, `${f}${m}${l}`,
  ][style];
  return `${local}@${domain}`;
}

function makeAddress(rng, data, fullName, phone) {
  const a = rng.pick(data.addresses);
  const house = rng.chance(0.3) ? `${rng.int(1, 300)}/${rng.int(1, 40)}` : String(rng.int(1, 450));
  return {
    recipient_name: fullName, phone,
    address_detail: `${house} ${rng.pick(a.streets)}, ${a.ward}, ${a.district}, ${a.province}`,
    province_id: a.province_id, district_id: a.district_id, ward_code: a.ward_code,
  };
}

const makePhone = (rng) => rng.pick(PHONE_PREFIX) + String(rng.int(0, 9999999)).padStart(7, '0');

function makeProfile(rng, data, cfg) {
  const n = data.names;
  const male = rng.chance(0.45);
  const last = rng.weighted(n.last);
  const middle = rng.pick(male ? n.middleMale : n.middleFemale);
  const first = rng.pick(male ? n.firstMale : n.firstFemale);
  const full_name = `${last} ${middle} ${first}`;
  const phone = makePhone(rng);
  const persona = rng.weighted(Object.entries(cfg.persona).map(([k, v]) => [k, v.weight]));
  return {
    full_name, phone, persona,
    email: makeEmail(rng, last, middle, first, cfg.emailDomain),
    address: makeAddress(rng, data, full_name, phone),
    dormant: rng.chance(cfg.persona[persona].dormantProb),
  };
}

// Derived, so no plaintext password is stored in state.json.
const passwordFor = (secret, email) => `Vc${crypto.createHash('sha256')
  .update(`${secret}:${email}`).digest('hex').slice(0, 10)}!9`;

module.exports = { makeProfile, makeAddress, makePhone, passwordFor };
