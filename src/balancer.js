'use strict';
// The reverse proxy itself. For every incoming request:
//   1. rate limit check  -> 429 if the client is too fast
//   2. strategy picks a healthy backend -> 503 if none are available
//   3. forward the request, stream the response back
//   4. if the backend fails and the request is a GET, retry once on a different backend
const http = require('http');
const { createStrategy } = require('./strategies');
const { RateLimiter } = require('./rateLimiter');
const { startHealthChecks } = require('./healthCheck');

function createBalancer({
  backendPorts,
  strategy = 'least-connections',
  rateLimit = { capacity: 20, refillPerSec: 10 },
  health = {},
  log = console.log,
}) {
  const backends = backendPorts.map((port) => ({
    id: `backend-${port}`, host: '127.0.0.1', port,
    healthy: true, active: 0, served: 0, errors: 0, okStreak: 0, failStreak: 0,
  }));
  const pick = createStrategy(strategy);
  const limiter = rateLimit ? new RateLimiter(rateLimit) : null;
  const stats = { total: 0, rejectedRateLimit: 0, rejectedNoBackend: 0, retries: 0 };
  const stopHealth = startHealthChecks(backends, { ...health, log });

  function sendJson(res, status, body, extraHeaders = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
    res.end(JSON.stringify(body));
  }

  function forward(req, res, backend, triedIds) {
    backend.active++;
    const proxyReq = http.request(
      { host: backend.host, port: backend.port, path: req.url, method: req.method, headers: req.headers, timeout: 5000 },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
        proxyRes.on('end', () => { backend.active--; backend.served++; });
      }
    );
    const fail = () => {
      backend.active--;
      backend.errors++;
      backend.failStreak++;
      // Passive health detection: don't wait for the next probe if real traffic is failing.
      if (backend.failStreak >= 2 && backend.healthy) { backend.healthy = false; log(`[proxy] ${backend.id} marked DOWN after failed requests`); }
      const canRetry = req.method === 'GET' && triedIds.size < 2 && !res.headersSent;
      if (canRetry) {
        const next = pick(backends.filter((b) => b.healthy && !triedIds.has(b.id)), req);
        if (next) { stats.retries++; triedIds.add(next.id); return forward(req, res, next, triedIds); }
      }
      if (!res.headersSent) sendJson(res, 502, { error: 'Bad gateway' });
      else res.destroy();
    };
    proxyReq.on('timeout', () => proxyReq.destroy(new Error('timeout')));
    proxyReq.on('error', fail);
    req.pipe(proxyReq); // forwards request bodies (POST etc.)
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/__stats') {
      return sendJson(res, 200, { strategy, stats, backends: backends.map(({ id, healthy, active, served, errors }) => ({ id, healthy, active, served, errors })) });
    }
    stats.total++;

    if (limiter) {
      const verdict = limiter.allow(req.socket.remoteAddress);
      if (!verdict.allowed) {
        stats.rejectedRateLimit++;
        return sendJson(res, 429, { error: 'Too many requests' }, { 'Retry-After': String(verdict.retryAfterSec) });
      }
    }

    const healthy = backends.filter((b) => b.healthy);
    const chosen = pick(healthy, req);
    if (!chosen) {
      stats.rejectedNoBackend++;
      return sendJson(res, 503, { error: 'No healthy backend available' }, { 'Retry-After': '2' });
    }
    forward(req, res, chosen, new Set([chosen.id]));
  });

  server.on('close', () => { stopHealth(); if (limiter) limiter.stop(); });
  return { server, backends, stats };
}

module.exports = { createBalancer };
