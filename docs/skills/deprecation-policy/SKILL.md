---
name: Deprecation Policy
description: Require public contract to be marked deprecated, with a replacement and a removal date, before it is removed; flag silent removals and incomplete deprecations.
type: convention
---
# Deprecation Policy

Public contract is removed in two steps: first **deprecate** it while it still
works, then **remove** it in a later major version. A silent removal gives
consumers no warning and no migration path.

A correct deprecation does all of this:
- the old route, field, param or export **keeps working** in this release;
- it is **marked** where consumers look: `@deprecated` in the JSDoc / TSDoc of
  an export or type, `deprecated: true` in OpenAPI or `.describe('Deprecated: …')`
  on a Zod field, `@deprecated` in GraphQL;
- the marker names the **replacement** ("use `GET /v2/orders`") and the planned
  **removal version or date**;
- for HTTP routes, responses carry a `Deprecation` header and, once the date is
  set, a `Sunset` header (with an optional `Link: <…>; rel="deprecation"` to
  the migration notes);
- the CHANGELOG lists the deprecation.

**Flag as WARNING when:**
- the diff removes or renames public contract that was not marked deprecated
  before (no `@deprecated`, no `deprecated: true` in the removed lines). Report
  the missing deprecation step only; if Breaking Change already reports the
  removal itself, add this rule to that finding's rationale instead of a second
  finding;
- the diff marks something deprecated but already changes its behaviour or
  breaks it in the same release.

**Flag as SUGGESTION when:**
- a deprecation names no replacement or no removal version or date;
- a deprecated HTTP route sends no `Deprecation` header;
- a deprecation is not mentioned in the CHANGELOG while the repository keeps one.

**How to report:** cite the line of the removal or of the deprecation marker,
say which step of the policy is missing, and give the exact marker to add (for
example `/** @deprecated Use createOrderV2; removed in 3.0.0. */`).

**Do not flag:** removal of contract that the diff shows was already deprecated
(the marker is in the removed lines) when the major version is bumped, internal
code, or code the same PR introduces.
