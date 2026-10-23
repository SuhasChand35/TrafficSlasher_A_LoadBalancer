'use strict';
// A fake application server. It answers every request after an artificial delay,
// so we can see how different balancing strategies cope with fast and slow servers.
const http = require('http');

function startBackend({ port, latencyMs = 50, id = `backend-${port}` }) {
  let handled = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', id }));
    }
    // Jitter makes the latency uneven, like a real server under varying load.
    const delay = latencyMs + Math.random() * latencyMs * 0.5;
    setTimeout(() => {
      handled++;
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Backend-Id': id });
      res.end(JSON.stringify({ servedBy: id, handled, path: req.url }));
    }, delay);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { startBackend };

// Run directly: node src/backend.js <port> <latencyMs>
if (require.main === module) {
  const port = Number(process.argv[2] || 4001);
  const latencyMs = Number(process.argv[3] || 50);
  startBackend({ port, latencyMs }).then(() =>
    console.log(`[backend-${port}] listening on :${port} (base latency ${latencyMs}ms, pid ${process.pid})`)
  );
}
