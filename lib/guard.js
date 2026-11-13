const fs = require('fs');
const path = require('path');
const { parseEnv } = require('util');

const HERE = path.join(__dirname, '..');
const LOCAL = path.join(HERE, 'guard.local.json');
const ENV_FILES = [path.join(HERE, '.env'), path.join(HERE, '..', 'BE', '.env')];

// Cluster names stay out of the repo; without the local file nothing runs.
function clusters() {
  if (!fs.existsSync(LOCAL)) throw new Error('guard: guard.local.json missing (copy guard.example.json)');
  const { allowed, forbidden } = JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
  if (!allowed) throw new Error('guard: guard.local.json needs "allowed"');
  return { allowed, forbidden };
}

function checkUri(uri) {
  const { allowed, forbidden } = clusters();
  if (!uri) throw new Error('guard: MONGO_URI missing');
  if (forbidden && uri.includes(forbidden)) throw new Error('guard: refuse forbidden cluster');
  if (!uri.includes(allowed)) throw new Error('guard: MONGO_URI is not the allowed cluster');
  return uri;
}

// Own .env first, else the backend's; never logs values.
function readEnv() {
  const file = ENV_FILES.find((f) => fs.existsSync(f));
  if (!file) throw new Error('guard: no .env here or in ../BE (copy .env.example)');
  return parseEnv(fs.readFileSync(file, 'utf8'));
}

function guard(overrideUri) {
  const env = readEnv();
  const uri = checkUri(overrideUri !== undefined ? overrideUri : env.MONGO_URI);
  return { uri, jwtSecret: env.JWT_SECRET || '' };
}

module.exports = { guard };
