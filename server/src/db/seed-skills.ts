/**
 * Skills seeded for the Test Quality Reviewer, in link order.
 *
 * These mirror the human-readable originals in `docs/skills/<slug>/SKILL.md` (the
 * frontmatter becomes name/description/type, the rest is the body). Keep the two in
 * sync when you edit a skill. The 4th skill, Flaky Test Patterns, is deliberately NOT
 * seeded: it is imported through the UI from `docs/skills/flaky-test-patterns.zip`.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const TEST_QUALITY_SKILLS: SeedSkill[] = [
  {
    name: 'Uncovered Branches',
    description:
      'Flag every new or changed branch in production code that no test in the PR drives down each of its paths.',
    type: 'custom',
    body: `# Uncovered Branches

For every production function the diff adds or changes, list its branches and
check that the tests in the diff exercise **each path**, not just the happy one.

A branch is any of:
- \`if\` / \`else if\` / \`else\`, a ternary, \`switch\` cases including \`default\`;
- \`&&\` / \`||\` / \`??\` short-circuits that choose between two behaviours;
- an early \`return\` or \`continue\` guard;
- \`throw\`, a \`catch\` block, a rejected promise, an error status code
  (\`reply.code(4xx|5xx)\`);
- a loop body that may run zero times.

**Flag as WARNING when:**
- a new or changed branch has no test that takes it (typically the \`else\`, the
  guard, the \`catch\`, or the error response);
- a new exported function or route has no test at all;
- tests exist only for the success path of a function that can fail.

**Flag as CRITICAL only when** the untested path guards money, auth,
permissions or data deletion, and a bug in it would ship silently.

**How to report:** cite the production line of the untested branch, name the
input that would take it, and say what a test for it should assert.

**Do not flag:** branches the diff does not touch, unreachable defensive code,
logging-only branches, or paths already covered by an existing test you can see
in the diff.
`,
  },
  {
    name: 'Edge Case Checklist',
    description:
      'Check that tests of changed code cover its boundary inputs; flag each relevant corner case that no test exercises.',
    type: 'rubric',
    body: `# Edge Case Checklist

For each changed function, walk this checklist and keep only the rows that
apply to its inputs. A row applies when the function accepts that kind of value
and the diff gives no reason to believe it cannot occur.

| Input kind | Corner cases to test |
|---|---|
| Collections | empty, exactly one element, duplicates, very large |
| Numbers | \`0\`, negative, \`NaN\`, max/min, the value exactly at a limit and ±1 |
| Strings | empty, whitespace only, unicode / emoji, very long, case differences |
| Optional values | \`null\`, \`undefined\`, a missing key vs a key set to \`undefined\` |
| Ranges / pagination | \`from > to\`, \`from == to\`, last page, \`limit = 0\` |
| Dates & time | timezone other than UTC, DST change, month/year end, leap day |
| Concurrency | the same operation twice in parallel, a retry after partial failure |
| External I/O | timeout, empty response, malformed payload, 404 vs 500 |

**Flag as WARNING when** an applicable corner case is untested AND the code
visibly handles it wrongly or not at all (no guard, an off-by-one comparison,
\`<\` where \`<=\` is needed).

**Flag as SUGGESTION when** an applicable corner case is untested but the code
appears to handle it; recommend the test that would lock the behaviour in.

**How to report:** one finding per function, listing the missing cases in the
rationale, citing the line of the comparison or guard the cases exercise.

**Do not flag:** cases ruled out by the type system or by validation in the
same diff (e.g. a Zod schema with \`.min(1)\` already excludes the empty string).
`,
  },
  {
    name: 'Over-Mocking',
    description:
      'Flag tests that mock so much that they verify the mocks instead of the code under test.',
    type: 'convention',
    body: `# Over-Mocking

A test must exercise real behaviour of the unit it is named after. Mocks are
for slow, non-deterministic or external boundaries: network, LLM providers,
GitHub, the clock, randomness, the filesystem when it is not the subject.

**Flag as WARNING when:**
- the unit under test itself is mocked (\`vi.mock\` of the module the test
  imports to test, or \`vi.spyOn(obj, 'method').mockReturnValue\` on the method
  being tested);
- the only assertions are on mock calls (\`toHaveBeenCalledWith\`) and nothing
  checks the returned value, the persisted row, or the rendered output;
- pure functions, Zod schemas, or in-repo helpers with no I/O are mocked;
- a server integration test (\`*.it.test.ts\`) mocks the database or the
  repository instead of using the real Postgres container.

**Flag as SUGGESTION when:**
- a snapshot is the only assertion of a component or a payload whose meaning
  matters (a snapshot accepts any change on update);
- a mock returns a hand-written shape that does not satisfy the shared Zod
  contract, so the test passes against data production never sends.

**How to report:** cite the \`vi.mock\` / spy line, name what is being faked, and
say which real dependency or assertion should replace it.

**Do not flag:** mocks of the LLM provider, GitHub, git, the clock or random
sources; in-memory fakes that implement a port interface.
`,
  },
];
