# How TrafficSlasher works: a learning guide

Read the files in this order. Each step has an exercise.

## 1. `src/backend.js`: the thing being protected
A plain HTTP server that waits a bit, then replies. The delay simulates real work. Notice the `/health`
route: balancers need a cheap way to ask "are you alive?".
**Exercise:** change a backend's latency in `startBackends.js` and re-run the load test.

## 2. `src/strategies.js`: the decision
Every strategy is a function `pick(healthyBackends, req) -> backend`.
- **Round robin:** rotate through the list. Fair by count, blind to load.
- **Least connections:** choose the backend with the fewest in-flight requests. Adapts to slow servers.
- **IP hash:** hash the client IP to an index. Same client, same server (sticky sessions), but if the pool
  size changes, almost everyone is remapped. That is the problem *consistent hashing* solves.
**Exercise:** implement weighted round robin (give the fast server 3 turns per rotation).

## 3. `src/healthCheck.js`: noticing failure
Probes `/health` every 2 s. A backend goes DOWN after 2 failures in a row and UP after 2 successes.
Why thresholds? One dropped packet shouldn't remove a server (flapping).
**Exercise:** kill one backend process, watch the log, restart it, watch it return.

## 4. `src/rateLimiter.js`: the token bucket
Each IP has a bucket of tokens (capacity 20) refilled at 10/s. A request costs 1 token. Bursts up to 20
are fine, but the sustained rate can't exceed 10/s. The limiter also deletes idle buckets, because an
attacker with many spoofed IPs could otherwise fill your memory: a defence that is itself an attack surface.
**Exercise:** make the limiter stricter for a path like `/login`.

## 5. `src/balancer.js`: putting it together
Request flow: `/__stats` shortcut -> rate limit (429) -> filter healthy backends -> strategy picks
(none? 503) -> forward and stream the reply -> on error, mark failure and retry GETs once elsewhere.
Two details to study:
- `backend.active++` before forwarding and `--` on finish/failure. This counter feeds least connections.
- Retries only for **GET**. Retrying a POST could duplicate an action (e.g. charge a card twice).
  This is the idea of *idempotency*.
**Exercise:** add an `X-Forwarded-For` header so backends know the real client IP.

## 6. `scripts/selftest.js`: proving it
Fake clocks make the token bucket deterministic, then real sockets test round robin, failover, the 503
case, and the 429 case. Read this to see how to test networked code without flakiness.

## Security angle
This project touches core defensive ideas: availability (redundancy and failover), DoS mitigation
(rate limiting, resource caps), fail-safe responses (503 rather than hanging), and the trade-offs between
them. Good interview talking points.
