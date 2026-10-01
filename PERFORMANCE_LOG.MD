# SweetNest Performance Investigation Log

Local machine, MongoDB local (not Atlas), Node dev mode.
Seed data: 5,000 cakes, 500 users, 50,000 orders, 20,000 reviews
(generated via scripts/seed.js — see script for methodology).
Load tool: autocannon. Standard test: 50 connections, 20s duration.

---

## Finding 1: Missing `.lean()` on read-only endpoints

**Hypothesis:** Mongoose document hydration (virtuals, change tracking,
instance methods) adds unnecessary overhead on endpoints that only read
and return JSON, never call `.save()`.

**Endpoints fixed:** getCakes, getFeaturedCakes, getCakesByCategory
(controller/cakeController.js)

**Status: CONFIRMED FIX**

| Endpoint | Before (median) | After (median) | Before (req/sec) | After (req/sec) |
|---|---|---|---|---|
| GET /api/cakes | 191 ms | 107 ms (-44%) | 248 | 441 (+78%) |
| GET /api/cakes/featured | 180 ms | 86 ms (-52%) | 277.5 | 560 (+102%) |
| GET /api/cakes/category/:slug | — (no clean baseline) | 103 ms | — | 453 |

**Why:** .lean() skips building full Mongoose Document instances
(getters/setters, virtuals like basePrice, change tracking, hooks)
for data that's only ever serialized to JSON, never mutated/saved.

**Commit:** perf(cakes): add .lean() to read-only cake queries

---

## Finding 2: Query-level performance is already near-optimal

**Method:** MongoDB .explain("executionStats") on the getCakes query,
plus autocannon at -c 1 (no concurrency) to isolate true single-request
latency from queueing.

**Status: CONFIRMED — no further query optimization available**

- MongoDB executionTimeMillis: 3ms
- totalDocsExamined === nReturned (10 == 10) — zero wasted scanning
- MongoDB's own query planner already selects the optimal index
  (createdAt_-1) over the alternative (isActive_1) on its own
- Single-connection (-c 1) latency: median 4ms — matches DB execution
  time almost exactly

**Conclusion:** The gap between this (4ms) and the 50-connection test
(107ms) is Node.js single-thread event-loop queueing under concurrent
load, not query inefficiency. Not fixable via indexing or query changes;
would require horizontal scaling (Node cluster module / multiple
instances) to address, which is out of scope for a single local process.

---

## Finding 3: `.populate('category', 'name slug')` cost — ruled out

**Hypothesis:** populate() runs a second DB round-trip per request,
suspected to add meaningful latency.

**Method:** Isolated by temporarily removing populate() from getCakes,
re-ran identical autocannon test, compared.

**Status: RULED OUT — not a bottleneck**

| | With populate | Without populate |
|---|---|---|
| Median latency | 107 ms | 110 ms |
| Avg req/sec | 441 | 429 |

Difference is within normal run-to-run noise (populate is technically
*not* the slower one — confirms it isn't adding meaningful cost).

**Why:** Categories collection is tiny (8 docs), looked up by indexed
_id — this kind of lookup is near-instant regardless of populate.

**Decision:** Do not denormalize category data onto Cake documents.
No performance case for the added complexity given current data shape.
Revisit only if categories collection grows substantially or populate
chains multiple levels deep.

---

## Open / not yet tested

- [ ] Order creation / checkout flow performance
- [ ] Promo code / discountService concurrency (race condition risk —
      flagged in project README as non-atomic multi-document writes)
- [ ] Coupon double-consumption under concurrent requests
- [ ] Review submission endpoint
- [x] Cart operations — addItem (addToCart) race condition: see Finding 5.
      syncCart still untested for concurrency (lower risk: one request per
      login, not triggered by repeat clicks the way addItem is)
- [ ] Deployed (Render + Atlas) baseline vs local baseline


## Finding 4: Checkout race condition — coupon discount leak + duplicate orders

**Status: CONFIRMED BUG, FIXED, VERIFIED**

**Method:** Wrote scripts/race-test-coupon.js — creates a real test user,
cart, and coupon, then fires N simultaneous POST /api/orders requests
using Promise.all, then inspects the database directly afterward.

**Bug found (10 concurrent requests, 1 coupon, 20% off capped at Rs 200):**

| | Before fix |
|---|---|
| Orders created | 8 |
| Orders carrying the discount | 8 |
| Total discount given out | Rs 880 (from a coupon meant for 1 use) |
| Coupon isUsed | true, exactly 1 usedInOrder |

The coupon's own atomic consume step (findOneAndUpdate isUsed:false->true)
worked correctly in isolation — but ran too late. Cart was read, priced
(with discount), and the order created, all before any request tried to
claim the coupon. A secondary issue surfaced in the same test: 2/10
requests failed with "cart empty" — the cart-clear race meant checkout
had no protection at all against being triggered multiple times
concurrently, independent of coupons.

**Root cause:** No exclusivity around "checking out a cart." Multiple
requests could read, price, and act on the same cart simultaneously.

**Fix:** Atomic checkout lock claimed via a single findOneAndUpdate
before any pricing/coupon logic runs (services/orderService.js,
claimCartForCheckout). Only one concurrent request can win the claim;
all others get a clean rejection immediately. Lock is released on
failure (try/catch) and has a 2-minute stale-lock fallback in case a
request crashes mid-checkout without releasing it.

**Verified (same 10-concurrent-request test, after fix):**

| | After fix |
|---|---|
| Orders created | 1 |
| Orders carrying the discount | 1 |
| Total discount given out | Rs 110 (correct) |
| Coupon isUsed | true, exactly 1 usedInOrder |
| Rejected requests | 9, all clean 400s, no phantom empty-cart errors |

**Files changed:** model/Cart.js (checkoutLock, checkoutLockAt fields),
services/orderService.js (claimCartForCheckout, releaseCheckoutLock,
reworked createOrderFromCart)


## Finding 5: addItem race condition — duplicate cart lines + lost updates

**Status: CONFIRMED BUG, FIXED, VERIFIED**

**Method:** scripts/race-test-cart-quantity.js — fires N simultaneous
"add 1" requests from the same user for the same cake+weight, then
inspects the cart directly.

**Bug found (5 concurrent requests, same cake+weight, starting from an
empty cart):**

Old addItem read the cart, decided in application code whether a
matching line existed, and wrote the result back - a read-modify-write
gap. Every concurrent request read the cart before any of them had
written, so each one independently concluded "no line yet" and pushed
its own: 5 separate lines of quantity 1, instead of 1 line with
quantity 5. The same gap also meant an increment onto an *existing*
line could be lost outright - two requests reading quantity 3,
both computing 3+1=4 and writing 4, instead of landing on 5.

**Root cause:** No exclusivity around "does a line for this cake+weight
exist, and what should its quantity become" - identical in shape to
Finding 4's checkout race, in a different operation.

**Fix:** services/cartService.js. addItem tries an atomic capped
increment first (findOneAndUpdate with the cap enforced IN THE QUERY
FILTER - `quantity: { $lte: MAX_QUANTITY - quantityToAdd }` - not
checked afterward in application code), falls back to an atomic
conditional push if no line existed yet, and retries up to 3 times for
the rare case both attempts lose a tight race against a third request.

**Caught during review, before this shipped:** the first draft of this
fix enforced the cap with `$min` instead of a filter condition, so a
request that would have exceeded the cap silently succeeded at the
capped value instead of being rejected - a real behaviour change a
customer would notice (their "add 6 more" looks like it worked but
quietly only adds what fits). The existing test suite caught this
immediately (`tests/cart.test.js` - "refuses to push a line past the
maximum quantity" went from 400 to 201). Reworked so the cap check
lives in the query filter and a request that cannot fit is rejected
with the same message and status a sequential request would have
gotten - concurrency changes how the answer is computed, not what the
answer is.

**Also found while writing concurrency tests for this fix:**
getOrCreateCart had the identical read-then-create gap for a user's
*first* cart - two concurrent "add to cart" clicks from a brand new
user could both see "no cart yet" and both try to create one, with the
loser crashing on the unique index instead of getting a cart. Fixed by
making it an upsert, with a catch for the documented MongoDB caveat
that two concurrent upserts against the same unique key can still both
attempt an insert (the loser re-fetches the document the winner
created instead of erroring).

**Verified:**

| | Before fix | After fix |
|---|---|---|
| Lines after 5 concurrent "add 1" | 5 (duplicates) | 1 |
| Quantity after 5 concurrent "add 1" | 1 each (lost updates) | 5 |
| 5 concurrent "add 3" (cap 10) | not tested | capped at 10, excess rejected with 400, none silently dropped |
| New user, 2 concurrent first-adds | crash (E11000) | both succeed, 1 cart |

Confirmed three ways: scripts/race-test-cart-quantity.js against a live
server (clean across multiple runs at concurrency 5 and 10), six new
Jest tests in tests/cartService.test.js using Promise.all directly
against the service (stable across repeated runs, no server needed),
and the full existing suite still passing (222/222) - including the
sequential max-quantity tests the first draft had broken.

**Files changed:** services/cartService.js (getOrCreateCart,
incrementExistingLine, findMatchingLine, pushNewLineIfAbsent, addItem)