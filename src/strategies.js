'use strict';
// A strategy answers one question: "which healthy backend gets this request?"
// Each strategy is a function factory returning pick(healthyBackends, req).

function roundRobin() {
  let counter = 0;
  return (backends) => {
    if (backends.length === 0) return null;
    const chosen = backends[counter % backends.length];
    counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
    return chosen;
  };
}

function leastConnections() {
  return (backends) => {
    let best = null;
    for (const b of backends) {
      if (best === null || b.active < best.active) best = b;
    }
    return best;
  };
}

// Same client IP -> same backend (as long as the pool doesn't change).
// Useful when a server keeps session state in memory.
function ipHash() {
  return (backends, req) => {
    if (backends.length === 0) return null;
    const ip = req.socket.remoteAddress || '';
    let hash = 0;
    for (let i = 0; i < ip.length; i++) hash = (hash * 31 + ip.charCodeAt(i)) >>> 0;
    return backends[hash % backends.length];
  };
}

const registry = {
  'round-robin': roundRobin,
  'least-connections': leastConnections,
  'ip-hash': ipHash,
};

function createStrategy(name) {
  const factory = registry[name];
  if (!factory) throw new Error(`Unknown strategy "${name}". Options: ${Object.keys(registry).join(', ')}`);
  return factory();
}

module.exports = { createStrategy, strategyNames: Object.keys(registry) };
