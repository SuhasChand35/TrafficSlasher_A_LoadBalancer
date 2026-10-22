'use strict';
// Token bucket rate limiter, one bucket per client IP.
// A bucket holds up to `capacity` tokens and refills at `refillPerSec`.
// Each request costs one token. Empty bucket -> request rejected (HTTP 429).
// This allows short bursts but caps the sustained rate: a basic DoS defence.

class RateLimiter {
  constructor({ capacity = 20, refillPerSec = 10, idleEvictMs = 60_000 } = {}) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.idleEvictMs = idleEvictMs;
    this.buckets = new Map();
    // Without cleanup, an attacker spoofing many IPs could exhaust our memory.
    this.sweeper = setInterval(() => this.sweep(), idleEvictMs);
    this.sweeper.unref();
  }

  allow(key, now = Date.now()) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, last: now };
      this.buckets.set(key, b);
    }
    const elapsedSec = (now - b.last) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsedSec * this.refillPerSec);
    b.last = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, retryAfterSec: 0 };
    }
    const retryAfterSec = Math.ceil((1 - b.tokens) / this.refillPerSec);
    return { allowed: false, retryAfterSec };
  }

  sweep(now = Date.now()) {
    for (const [key, b] of this.buckets) {
      if (now - b.last > this.idleEvictMs) this.buckets.delete(key);
    }
  }

  stop() { clearInterval(this.sweeper); }
}

module.exports = { RateLimiter };
