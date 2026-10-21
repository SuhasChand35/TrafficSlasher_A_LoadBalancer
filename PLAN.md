# TrafficSlasher: Project Plan

## 1. Goal
Build a small, dependency-free reverse-proxy load balancer to understand how traffic distribution,
fault tolerance and basic DoS defence work, and to produce a portfolio project with measurable results.

## 2. Scope
**In scope:** HTTP reverse proxy, multiple balancing strategies, health checks, failover, per-IP rate
limiting, load testing, automated tests, documentation.

**Out of scope (for v1):** HTTPS termination, WebSockets, dynamic backend registration, persistent
configuration, production-grade performance.

## 3. Requirements
| ID | Requirement | Status |
|---|---|---|
| R1 | Distribute requests across multiple backends | Done |
| R2 | Support at least three strategies (round robin, least connections, IP hash) | Done |
| R3 | Detect failed backends and stop routing to them | Done |
| R4 | Recover backends automatically when they return | Done |
| R5 | Retry failed idempotent (GET) requests on another backend | Done |
| R6 | Reject floods with 429 and `Retry-After` | Done |
| R7 | Return 503 when no backend is healthy | Done |
| R8 | Expose live statistics | Done |
| R9 | Provide a load-testing tool | Done |
| R10 | Automated end-to-end tests | Done |

## 4. Architecture
```
client -> rate limiter -> strategy -> backend pool (4001, 4002, 4003)
                              ^
                    health checker (UP/DOWN)
```
| Module | Responsibility |
|---|---|
| `src/balancer.js` | Request pipeline, forwarding, retry, stats |
| `src/strategies.js` | Backend selection algorithms |
| `src/healthCheck.js` | Active probes with failure/recovery thresholds |
| `src/rateLimiter.js` | Token bucket per IP with idle eviction |
| `src/backend.js` | Simulated app server with configurable latency |
| `scripts/loadtest.js` | Traffic generator and report |
| `scripts/selftest.js` | End-to-end tests |

## 5. Milestones
| Phase | Deliverable | Status |
|---|---|---|
| 1. Foundations | Backend simulator, basic proxy forwarding | Done |
| 2. Strategies | Round robin, least connections, IP hash | Done |
| 3. Resilience | Health checks, failover, retry, 503 handling | Done |
| 4. Protection | Token-bucket rate limiter, idle eviction | Done |
| 5. Validation | Load tester, benchmarks, automated tests | Done |
| 6. Documentation | README, learning guide, this plan | Done |
| 7. Personalisation | Complete two or more extensions from section 7 | To do |
| 8. Publish | Push to GitHub, add description and topics | To do |

## 6. Test strategy
- **Unit-style:** token bucket with a fake clock (deterministic).
- **End-to-end:** real sockets for even distribution, failover when a backend dies, 503 when all are down, 429 under flood.
- **Benchmark:** compare strategies with backends of different speeds (30 / 80 / 200 ms), 150 requests at concurrency 15.

Baseline results: round robin about 100 req/s and 99 ms p50; least connections about 163 req/s and 43 ms p50.

## 7. Roadmap / extensions
Ordered roughly from easiest to hardest.
1. **X-Forwarded-For header** so backends see the real client IP.
2. **Weighted round robin** (fast servers get more turns).
3. **Stricter rate limits on sensitive paths** such as `/login`.
4. **Circuit breaker** with closed, open and half-open states.
5. **Consistent hashing** so IP hash survives pool changes.
6. **Global connection cap** and per-request timeouts per route.
7. **Metrics export** in Prometheus format.
8. **Config file** (JSON) for backends, strategy and limits.
9. **Security review:** test against slowloris-style connections, header abuse and oversized bodies.

## 8. Risks and trade-offs
| Risk | Mitigation |
|---|---|
| Retrying non-idempotent requests could duplicate actions | Only GET is retried |
| Health-check flapping | Require multiple consecutive results to change state |
| Memory exhaustion from many spoofed IPs | Idle bucket eviction (extend with a hard cap on bucket count) |
| Trusting client IP behind another proxy | Document; add trusted-proxy handling before using `X-Forwarded-For` |
| Single balancer is itself a single point of failure | Note for future: run several behind DNS or a virtual IP |

## 9. Definition of done
- `npm test` passes.
- README results match a fresh `npm run loadtest` run.
- At least two extensions implemented by the author and explained in the README.
- Repository has a description, topics and a license.
