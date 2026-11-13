const path = require('path');

const ROOT = path.join(__dirname, '..');
const ctx = {
  root: ROOT,
  config: require('./config.json'),
  ledgerFile: path.join(__dirname, 'ledger.json'),
  stateFile: path.join(__dirname, 'state.json'),
};

const ACTIONS = ['start', 'status', 'stop', 'clean', 'once', 'ai-check'];
const [action, ...args] = process.argv.slice(2);
if (args.includes('--fast')) ctx.config.fast = true;

async function main() {
  if (!ACTIONS.includes(action)) {
    console.log(`usage: node run.js <${ACTIONS.join('|')}>`);
    process.exitCode = 1;
    return;
  }
  if (action === 'status') return require('./cmd/status').run(ctx);
  if (action === 'clean') return require('./cmd/clean').run(ctx);
  if (action === 'ai-check') return require('./cmd/ai-check').run(ctx, args);
  const sim = require('./cmd/sim');
  if (action === 'stop') return sim.stop(ctx);
  if (action === 'start') return sim.start(ctx);
  return sim.once(ctx, ...args.filter((a) => a !== '--fast'));
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exitCode = 1;
});
