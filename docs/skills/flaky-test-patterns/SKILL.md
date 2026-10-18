---
name: Flaky Test Patterns
description: Flag tests whose result depends on timing, order, shared state or the environment instead of the code under test.
type: custom
---
# Flaky Test Patterns

A test is flaky when it can pass and fail on the same code. Look for these
patterns in test files added or changed by the diff.

**Flag as WARNING when a test:**
- waits with a fixed delay (`setTimeout`, `sleep`, `await new Promise(r =>
  setTimeout(r, 500))`) instead of awaiting a condition (`waitFor`,
  `vi.waitUntil`, polling a helper with a deadline);
- reads the real clock (`Date.now()`, `new Date()`) or uses `Math.random()` /
  random UUIDs in an assertion without `vi.useFakeTimers()` / a seeded source;
- depends on another test's side effects: shared module-level state, a DB row
  created in a previous `it`, no cleanup in `afterEach`;
- assumes an order the code does not guarantee: rows without `ORDER BY`,
  `Promise.all` results compared as a sequence of events, object key order;
- relies on rows inserted in one statement having different `created_at`
  values (they share one transaction timestamp);
- calls a real network service, or a port that may be taken on CI;
- starts a promise without awaiting it, so assertions run before it settles.

**Flag as SUGGESTION when** a test uses `it.retry`, `retry: N` or `.skip` to
hide intermittent failures without a linked issue.

**How to report:** cite the line with the timing / ordering / state
dependency, describe the interleaving that makes it fail, and give the
deterministic replacement.
