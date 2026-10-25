'use strict';
// End-to-end checks using only Node's built-in assert. Run with: npm test
const assert = require('assert');
const http = require('http');
const { startBackend } = require('../src/backend');
const { createBalancer } = require('../src/balancer');
const { RateLimiter } = require('../src/rateLimiter');

const get = (port, path = '/') => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path }, (res) => {
    let body = ''; res.on('data', (d) => (body += d));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (server, port) => new Promise((r) => server.listen(port, '127.0.0.1', r));
const quiet = () => {};

(async () => {
  // 1. Token bucket logic (deterministic, fake clock)
  const rl = new RateLimiter({ capacity: 3, refillPerSec: 1 });
  assert.ok(rl.allow('a', 0).allowed && rl.allow('a', 0).allowed && rl.allow('a', 0).allowed);
  assert.strictEqual(rl.allow('a', 0).allowed, false, 'bucket should be empty after 3 requests');
  assert.ok(rl.allow('a', 1100).allowed, 'bucket should refill after ~1s');
  assert.ok(rl.allow('b', 0).allowed, 'other clients unaffected');
  rl.stop();
  console.log('ok  token bucket');

  // 2. Round robin spreads evenly
  const b1 = await startBackend({ port: 5101, latencyMs: 5 });
  const b2 = await startBackend({ port: 5102, latencyMs: 5 });
  const lb = createBalancer({ backendPorts: [5101, 5102], strategy: 'round-robin', rateLimit: null, health: { intervalMs: 200 }, log: quiet });
  await listen(lb.server, 5100);
  const seen = {};
  for (let i = 0; i < 10; i++) { const r = await get(5100); seen[r.headers['x-backend-id']] = (seen[r.headers['x-backend-id']] || 0) + 1; }
  assert.deepStrictEqual(Object.values(seen), [5, 5]);
  console.log('ok  round robin even split');

  // 3. Failover: kill one backend, traffic must keep succeeding
  b2.close(); b2.closeAllConnections?.();
  await sleep(700); // let health checks notice
  for (let i = 0; i < 6; i++) {
    const r = await get(5100);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers['x-backend-id'], 'backend-5101');
  }
  console.log('ok  failover to healthy backend');

  // 4. All backends down -> 503
  b1.close(); b1.closeAllConnections?.();
  await sleep(700);
  assert.strictEqual((await get(5100)).status, 503);
  console.log('ok  503 when no backend is healthy');
  lb.server.close();

  // 5. Rate limiting end to end
  const b3 = await startBackend({ port: 5103, latencyMs: 1 });
  const lb2 = createBalancer({ backendPorts: [5103], rateLimit: { capacity: 5, refillPerSec: 0.01 }, health: { intervalMs: 5000 }, log: quiet });
  await listen(lb2.server, 5104);
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await get(5104)).status);
  assert.deepStrictEqual(codes, [200, 200, 200, 200, 200, 429, 429, 429]);
  console.log('ok  rate limiting returns 429');
  lb2.server.close(); b3.close(); b3.closeAllConnections?.();

  console.log('\nAll checks passed.');
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
