---
name: Uncovered Branches
description: Flag every new or changed branch in production code that no test in the PR drives down each of its paths.
type: custom
---
# Uncovered Branches

For every production function the diff adds or changes, list its branches and
check that the tests in the diff exercise **each path**, not just the happy one.

A branch is any of:
- `if` / `else if` / `else`, a ternary, `switch` cases including `default`;
- `&&` / `||` / `??` short-circuits that choose between two behaviours;
- an early `return` or `continue` guard;
- `throw`, a `catch` block, a rejected promise, an error status code
  (`reply.code(4xx|5xx)`);
- a loop body that may run zero times.

**Flag as WARNING when:**
- a new or changed branch has no test that takes it (typically the `else`, the
  guard, the `catch`, or the error response);
- a new exported function or route has no test at all;
- tests exist only for the success path of a function that can fail.

**Flag as CRITICAL only when** the untested path guards money, auth,
permissions or data deletion, and a bug in it would ship silently.

**How to report:** cite the production line of the untested branch, name the
input that would take it, and say what a test for it should assert.

**Do not flag:** branches the diff does not touch, unreachable defensive code,
logging-only branches, or paths already covered by an existing test you can see
in the diff.
