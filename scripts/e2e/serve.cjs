require('./register.cjs');
const { startMockServer } = require('../../e2e/mock/server.ts');
const { PRESETS } = require('../../e2e/scenarios/factory.ts');
const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const scenario = value('--scenario', 'daily');
const seed = Number(value('--seed', '42'));
if (!(scenario in PRESETS) || !Number.isSafeInteger(seed)) throw new Error('Invalid scenario or seed');
startMockServer({ scenario, seed }).then(server => {
  console.log(`Synthetic WaniKani API: ${server.origin} (${scenario}, seed ${seed})`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
}).catch(error => { console.error(error.message); process.exitCode = 1; });
