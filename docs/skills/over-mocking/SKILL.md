---
name: Over-Mocking
description: Flag tests that mock so much that they verify the mocks instead of the code under test.
type: convention
---
# Over-Mocking

A test must exercise real behaviour of the unit it is named after. Mocks are
for slow, non-deterministic or external boundaries: network, LLM providers,
GitHub, the clock, randomness, the filesystem when it is not the subject.

**Flag as WARNING when:**
- the unit under test itself is mocked (`vi.mock` of the module the test
  imports to test, or `vi.spyOn(obj, 'method').mockReturnValue` on the method
  being tested);
- the only assertions are on mock calls (`toHaveBeenCalledWith`) and nothing
  checks the returned value, the persisted row, or the rendered output;
- pure functions, Zod schemas, or in-repo helpers with no I/O are mocked;
- a server integration test (`*.it.test.ts`) mocks the database or the
  repository instead of using the real Postgres container.

**Flag as SUGGESTION when:**
- a snapshot is the only assertion of a component or a payload whose meaning
  matters (a snapshot accepts any change on update);
- a mock returns a hand-written shape that does not satisfy the shared Zod
  contract, so the test passes against data production never sends.

**How to report:** cite the `vi.mock` / spy line, name what is being faked, and
say which real dependency or assertion should replace it.

**Do not flag:** mocks of the LLM provider, GitHub, git, the clock or random
sources; in-memory fakes that implement a port interface.
