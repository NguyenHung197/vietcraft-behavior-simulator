const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const BE_DIR = path.join(__dirname, '..', '..', 'BE');
const LOCAL = path.join(__dirname, '..', 'guard.local.json');

// Cluster names stay out of the repo; without the local file nothing runs.
function clusters() {
  if (!fs.existsSync(LOCAL)) throw new Error('guard: guard.local.json missing (copy guard.example.json)');
  const { allowed, forbidden } = JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
  if (!allowed || !forbidden) throw new Error('guard: guard.local.json needs "allowed" and "forbidden"');
  return { allowed, forbidden };
}

// Reads BE/.env by exact key; never logs values.
function checkUri(uri) {
  const { allowed, forbidden } = clusters();
  if (!uri) throw new Error('guard: MONGO_URI missing');
  if (uri.includes(forbidden)) throw new Error('guard: refuse shared/forbidden cluster');
  if (!uri.includes(allowed)) throw new Error('guard: MONGO_URI is not the personal DB');
  return uri;
}

function guard(overrideUri) {
  const requireBE = createRequire(path.join(BE_DIR, 'package.json'));
  const dotenv = requireBE('dotenv');
  const env = dotenv.parse(fs.readFileSync(path.join(BE_DIR, '.env')));
  const uri = checkUri(overrideUri !== undefined ? overrideUri : env.MONGO_URI);
  return { uri, jwtSecret: env.JWT_SECRET || '' };
}

module.exports = { guard };
