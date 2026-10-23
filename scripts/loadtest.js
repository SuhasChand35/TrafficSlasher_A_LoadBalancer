'use strict';
// Fires requests at the balancer and reports who served them.
// Usage: node scripts/loadtest.js [--requests 200] [--concurrency 10] [--url http://127.0.0.1:8080/]
const http = require('http');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const total = Number(arg('requests', 200));
const concurrency = Number(arg('concurrency', 10));
const url = new URL(arg('url', 'http://127.0.0.1:8080/'));

const byStatus = {};
const byBackend = {};
const latencies = [];
let sent = 0;

function one() {
  return new Promise((resolve) => {
    const start = Date.now();
    http.get(url, (res) => {
      res.resume();
      res.on('end', () => {
        latencies.push(Date.now() - start);
        byStatus[res.statusCode] = (byStatus[res.statusCode] || 0) + 1;
        const id = res.headers['x-backend-id'];
        if (id) byBackend[id] = (byBackend[id] || 0) + 1;
        resolve();
      });
    }).on('error', () => { byStatus.error = (byStatus.error || 0) + 1; resolve(); });
  });
}

async function worker() {
  while (sent < total) { sent++; await one(); }
}

(async () => {
  const t0 = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const secs = (Date.now() - t0) / 1000;
  latencies.sort((a, b) => a - b);
  const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
  console.log(`\n${total} requests, concurrency ${concurrency}, ${secs.toFixed(2)}s (${(total / secs).toFixed(0)} req/s)`);
  console.log('Status codes :', byStatus);
  console.log('Served by    :', byBackend);
  console.log(`Latency ms   : p50=${pct(0.5)} p95=${pct(0.95)} max=${latencies[latencies.length - 1] ?? 0}`);
})();
