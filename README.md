# TrafficSlasher

A small reverse-proxy **load balancer** written in plain Node.js (no dependencies), built to learn how
traffic distribution, fault tolerance and basic DoS defence work.

## Features
- **Three balancing strategies:** round robin, least connections, IP hash
- **Active health checks** (periodic `/health` probes) plus **passive detection** from failed live requests
- **Automatic failover** and a single **retry** of failed GET requests on another backend
- **Token-bucket rate limiter** per client IP (returns `429` + `Retry-After`)
- **`503`** when no backend is healthy, **`502`** when a backend fails mid-request
- **Live stats** endpoint at `/__stats`
- **Load tester** and **automated end-to-end tests**

## Quick start (Node 18+)
```bash
npm run backends                       # terminal 1: starts 3 fake servers (30ms, 80ms, 200ms latency)
npm start -- --strategy round-robin    # terminal 2: starts the balancer on :8080
npm run loadtest                       # terminal 3: sends 200 requests, prints distribution
npm test                               # self-contained tests (starts its own servers)
```
Options: `--strategy round-robin|least-connections|ip-hash`, `--port 8080`, `--no-rate-limit`.

## Architecture
```
client --> [ rate limiter ] --> [ strategy picks backend ] --> backend-4001
                |                       ^                  --> backend-4002
             429 if too fast            |                  --> backend-4003
                                  [ health checks mark backends UP / DOWN ]
```

| File | Responsibility |
|---|---|
| `src/balancer.js` | The proxy: rate limit, pick, forward, retry, stats |
| `src/strategies.js` | Round robin, least connections, IP hash |
| `src/healthCheck.js` | Active probes with failure/recovery thresholds |
| `src/rateLimiter.js` | Token bucket per IP with idle eviction |
| `src/backend.js` | Fake app server with configurable latency |
| `scripts/loadtest.js` | Traffic generator and report |
| `scripts/selftest.js` | End-to-end tests (`npm test`) |

## Sample results (150 requests, concurrency 15, backends of 30/80/200 ms)
| Strategy | Throughput | p50 latency | Distribution (fast/medium/slow) |
|---|---|---|---|
| Round robin | ~100 req/s | 99 ms | 50 / 50 / 50 |
| Least connections | ~163 req/s | 43 ms | 97 / 37 / 16 |

Least connections wins when servers differ in speed because slow servers hold connections longer and
therefore receive fewer new ones. With the rate limiter on and a flood of 150 rapid requests, 129 were
rejected with `429` and the backends were protected.
