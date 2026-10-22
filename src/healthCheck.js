'use strict';
// Periodically calls GET /health on every backend.
// A backend is marked DOWN after `failThreshold` consecutive failures and
// UP again after `recoverThreshold` consecutive successes. Requiring several
// results stops one blip from making a server flap between UP and DOWN.
const http = require('http');

function probe(backend, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: backend.host, port: backend.port, path: '/health', timeout: timeoutMs },
      (res) => { res.resume(); resolve(res.statusCode === 200); }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function startHealthChecks(backends, { intervalMs = 2000, timeoutMs = 1000, failThreshold = 2, recoverThreshold = 2, log = console.log } = {}) {
  async function round() {
    await Promise.all(backends.map(async (b) => {
      const ok = await probe(b, timeoutMs);
      if (ok) {
        b.okStreak++; b.failStreak = 0;
        if (!b.healthy && b.okStreak >= recoverThreshold) { b.healthy = true; log(`[health] ${b.id} is UP`); }
      } else {
        b.failStreak++; b.okStreak = 0;
        if (b.healthy && b.failStreak >= failThreshold) { b.healthy = false; log(`[health] ${b.id} is DOWN`); }
      }
    }));
  }
  round();
  const timer = setInterval(round, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = { startHealthChecks };
