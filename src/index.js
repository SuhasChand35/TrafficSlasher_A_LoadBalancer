'use strict';
// Usage: node src/index.js [--strategy round-robin|least-connections|ip-hash] [--port 8080]
//                          [--no-rate-limit]
const { createBalancer } = require('./balancer');
const { strategyNames } = require('./strategies');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const strategy = arg('strategy', 'least-connections');
const port = Number(arg('port', 8080));
const rateLimit = process.argv.includes('--no-rate-limit') ? null : { capacity: 20, refillPerSec: 10 };

if (!strategyNames.includes(strategy)) {
  console.error(`Unknown strategy. Choose one of: ${strategyNames.join(', ')}`);
  process.exit(1);
}

const { server } = createBalancer({ backendPorts: [4001, 4002, 4003], strategy, rateLimit });
server.listen(port, '127.0.0.1', () => {
  console.log(`TrafficSlasher listening on http://127.0.0.1:${port}`);
  console.log(`strategy=${strategy} rateLimit=${rateLimit ? JSON.stringify(rateLimit) : 'off'}`);
  console.log(`Live stats: http://127.0.0.1:${port}/__stats`);
});
