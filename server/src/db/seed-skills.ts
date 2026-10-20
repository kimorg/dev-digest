/**
 * Skills seeded for the built-in agents, one list per agent, in link order.
 *
 * These mirror the human-readable originals in `docs/skills/<slug>/SKILL.md` (the
 * frontmatter becomes name/description/type, the rest is the body). Keep the two in
 * sync when you edit a skill. The Test Quality Reviewer's 4th skill, Flaky Test
 * Patterns, is deliberately NOT seeded: it is imported through the UI from
 * `docs/skills/flaky-test-patterns.zip`.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

/** Skills seeded for the Test Quality Reviewer, in link order. */
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

/** Skills seeded for the API Contract Reviewer, in link order. */
export const API_CONTRACT_SKILLS: SeedSkill[] = [
  {
    name: 'Breaking Change',
    description:
      'Flag every change that removes or alters a public contract so that a consumer written against the old version stops working.',
    type: 'custom',
    body: `# Breaking Change

A change is **breaking** when a client, caller or subscriber that worked before
the diff fails, or silently gets different results, after it, without changing
its own code. Check every contract surface the diff touches: routes, schemas,
exports of a package entry point, event and webhook payloads, documented CLI
flags and env vars.

Breaking (the consumer must change):
- a route, export, field, param, header, enum value or event is **removed or
  renamed** (a rename is a removal plus an addition);
- an input becomes **required**: a new required body field, query param or
  function argument, or an optional one made mandatory;
- an accepted input is **narrowed**: a shorter \`max\`, a new \`min\`, a stricter
  regex, an enum value no longer accepted, a type that accepts less;
- an HTTP method or path changes, or a param moves (query → body, path → query);
- a status code or error code changes for the same outcome (\`200\` → \`201\`,
  \`404\` → \`400\`), or a success becomes an error;
- an exported function's signature changes incompatibly: parameter order,
  return type, sync → async.

**Flag as CRITICAL when** the diff makes one of the changes above to a public
surface AND leaves no compatibility path: no alias for the old name, no old
route kept next to the new one, no new major API version (\`/v2\`) that keeps the
old one working.

**Flag as WARNING when:**
- a breaking change ships with a compatibility path that is only partial (the old
  route still exists but now behaves differently);
- a default value, sort order, pagination size or unit changes in a way consumers
  can observe, while every field keeps its name and type;
- the surface is probably public but the diff does not show it (an exported
  type outside the package's entry point, an undocumented route used by the
  client in this repo).

**How to report:** cite the line where the contract changes, quote the old and
the new form, and name the consumer call that breaks. Say what keeps it working
(keep and deprecate the old form, an alias, a new version).

**Do not flag:** additive changes (a new optional field or param, a new route,
a new export), changes to internal modules, private helpers or tests, or a
contract the same PR introduces (nothing can depend on it yet).
`,
  },
  {
    name: 'Response Schema',
    description:
      'Check every change to the shape of a response (field types, required and nullable fields, enums, formats) and flag the ones existing clients cannot parse.',
    type: 'rubric',
    body: `# Response Schema

A client is written against the response it saw: it reads fields by name,
assumes their types and treats a required field as always there. For every
response the diff changes — a route's \`response\` schema, a shared DTO or Zod
contract, a serializer or mapper, a GraphQL type — classify each change with
this table.

| Change to a response field | Severity |
|---|---|
| removed or renamed | CRITICAL |
| type changed (\`number\` → \`string\`, object → array, scalar → object) | CRITICAL |
| required → optional, or becomes \`nullable\` (clients read it without a null check) | CRITICAL |
| moved to another level (\`user.email\` → \`user.contact.email\`) | CRITICAL |
| a new value in an enum the client switches on | WARNING |
| format or unit changed with the same type (date string format, cents → units, id int → uuid) | WARNING |
| number precision or range changed (integer → float, a larger max) | WARNING |
| a list becomes paginated or wrapped (\`[...]\` → \`{ items: [...] }\`) | CRITICAL |
| a new optional field | do not flag |
| optional → required, nullable → non-null (it only tightens the guarantee) | do not flag |

**Flag drift as WARNING when** the handler now returns data that no longer
matches the response schema it declares (a field the mapper stopped setting, a
\`null\` the schema does not allow), even if the schema itself did not change.

**Escalate to CRITICAL only** for the rows marked CRITICAL above, when the
response is part of a public contract and the old shape is not still served
(by an older API version or a negotiated format).

**How to report:** one finding per changed field. Cite the schema or mapper
line, quote the old and the new type or shape, and name the client read that
breaks (\`res.total.toFixed()\` on a value that is now a string).

**Do not flag:** request schemas (Breaking Change covers inputs), internal DTOs
that never leave the service, a response the same PR introduces, or a change
behind a new API version.
`,
  },
  {
    name: 'Semver Discipline',
    description:
      'Flag a breaking contract change that ships without a major version bump, and a version bump that does not match what the diff changes.',
    type: 'convention',
    body: `# Semver Discipline

Semantic versioning is the promise a version number makes to consumers:
\`MAJOR.MINOR.PATCH\`.
- **MAJOR** — any breaking change to the public contract (see the Breaking
  Change and Response Schema skills).
- **MINOR** — backward-compatible additions: a new route, field, export or
  optional param.
- **PATCH** — backward-compatible fixes that do not change the contract.

For an HTTP API the major version is often in the path or a header (\`/v1\` →
\`/v2\`, \`Accept-Version\`). A new major API version that keeps the old one working
counts as a correct major bump.

Versioned artifacts to check: \`version\` in a published \`package.json\`,
\`info.version\` in an OpenAPI document, \`CHANGELOG.md\`, a version constant or the
route prefix.

**Flag as WARNING when:**
- the diff makes a breaking change to a public contract and the version is
  bumped only by MINOR or PATCH, or not at all while the diff edits other
  versioned artifacts (a CHANGELOG entry without a version bump);
- a CHANGELOG entry or commit marks the change as breaking but the major
  version is not bumped;
- the major version is bumped but the diff contains no breaking change (a false
  signal that makes consumers spend time on a migration).

**Flag as SUGGESTION when:**
- the package has a CHANGELOG and the diff adds a contract feature or a
  breaking change without an entry for it;
- the package is \`0.x\` and the diff breaks the contract: under semver a \`0.x\`
  minor may break, but the CHANGELOG should say so explicitly.

**How to report:** cite the line of the version field (or of the breaking change
when no version file is in the diff), state the current bump and the bump the
change requires, and name the change that requires it.

**Do not flag:** private or unpublished packages (\`"private": true\`) and apps
without versioned consumers, a missing bump when the repository visibly releases
through tooling (changesets, semantic-release) that computes the version, or the
breaking change itself (Breaking Change reports it; do not repeat it here).
`,
  },
  {
    name: 'Deprecation Policy',
    description:
      'Require public contract to be marked deprecated, with a replacement and a removal date, before it is removed; flag silent removals and incomplete deprecations.',
    type: 'convention',
    body: `# Deprecation Policy

Public contract is removed in two steps: first **deprecate** it while it still
works, then **remove** it in a later major version. A silent removal gives
consumers no warning and no migration path.

A correct deprecation does all of this:
- the old route, field, param or export **keeps working** in this release;
- it is **marked** where consumers look: \`@deprecated\` in the JSDoc / TSDoc of
  an export or type, \`deprecated: true\` in OpenAPI or \`.describe('Deprecated: …')\`
  on a Zod field, \`@deprecated\` in GraphQL;
- the marker names the **replacement** ("use \`GET /v2/orders\`") and the planned
  **removal version or date**;
- for HTTP routes, responses carry a \`Deprecation\` header and, once the date is
  set, a \`Sunset\` header (with an optional \`Link: <…>; rel="deprecation"\` to
  the migration notes);
- the CHANGELOG lists the deprecation.

**Flag as WARNING when:**
- the diff removes or renames public contract that was not marked deprecated
  before (no \`@deprecated\`, no \`deprecated: true\` in the removed lines). Report
  the missing deprecation step only; if Breaking Change already reports the
  removal itself, add this rule to that finding's rationale instead of a second
  finding;
- the diff marks something deprecated but already changes its behaviour or
  breaks it in the same release.

**Flag as SUGGESTION when:**
- a deprecation names no replacement or no removal version or date;
- a deprecated HTTP route sends no \`Deprecation\` header;
- a deprecation is not mentioned in the CHANGELOG while the repository keeps one.

**How to report:** cite the line of the removal or of the deprecation marker,
say which step of the policy is missing, and give the exact marker to add (for
example \`/** @deprecated Use createOrderV2; removed in 3.0.0. */\`).

**Do not flag:** removal of contract that the diff shows was already deprecated
(the marker is in the removed lines) when the major version is bumped, internal
code, or code the same PR introduces.
`,
  },
];
