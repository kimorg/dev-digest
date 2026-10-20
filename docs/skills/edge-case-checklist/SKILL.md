---
name: Edge Case Checklist
description: Check that tests of changed code cover its boundary inputs; flag each relevant corner case that no test exercises.
type: rubric
---
# Edge Case Checklist

For each changed function, walk this checklist and keep only the rows that
apply to its inputs. A row applies when the function accepts that kind of value
and the diff gives no reason to believe it cannot occur.

| Input kind | Corner cases to test |
|---|---|
| Collections | empty, exactly one element, duplicates, very large |
| Numbers | `0`, negative, `NaN`, max/min, the value exactly at a limit and ±1 |
| Strings | empty, whitespace only, unicode / emoji, very long, case differences |
| Optional values | `null`, `undefined`, a missing key vs a key set to `undefined` |
| Ranges / pagination | `from > to`, `from == to`, last page, `limit = 0` |
| Dates & time | timezone other than UTC, DST change, month/year end, leap day |
| Concurrency | the same operation twice in parallel, a retry after partial failure |
| External I/O | timeout, empty response, malformed payload, 404 vs 500 |

**Flag as WARNING when** an applicable corner case is untested AND the code
visibly handles it wrongly or not at all (no guard, an off-by-one comparison,
`<` where `<=` is needed).

**Flag as SUGGESTION when** an applicable corner case is untested but the code
appears to handle it; recommend the test that would lock the behaviour in.

**How to report:** one finding per function, listing the missing cases in the
rationale, citing the line of the comparison or guard the cases exercise.

**Do not flag:** cases ruled out by the type system or by validation in the
same diff (e.g. a Zod schema with `.min(1)` already excludes the empty string).
