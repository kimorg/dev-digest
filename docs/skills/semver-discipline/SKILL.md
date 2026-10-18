---
name: Semver Discipline
description: Flag a breaking contract change that ships without a major version bump, and a version bump that does not match what the diff changes.
type: convention
---
# Semver Discipline

Semantic versioning is the promise a version number makes to consumers:
`MAJOR.MINOR.PATCH`.
- **MAJOR** — any breaking change to the public contract (see the Breaking
  Change and Response Schema skills).
- **MINOR** — backward-compatible additions: a new route, field, export or
  optional param.
- **PATCH** — backward-compatible fixes that do not change the contract.

For an HTTP API the major version is often in the path or a header (`/v1` →
`/v2`, `Accept-Version`). A new major API version that keeps the old one working
counts as a correct major bump.

Versioned artifacts to check: `version` in a published `package.json`,
`info.version` in an OpenAPI document, `CHANGELOG.md`, a version constant or the
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
- the package is `0.x` and the diff breaks the contract: under semver a `0.x`
  minor may break, but the CHANGELOG should say so explicitly.

**How to report:** cite the line of the version field (or of the breaking change
when no version file is in the diff), state the current bump and the bump the
change requires, and name the change that requires it.

**Do not flag:** private or unpublished packages (`"private": true`) and apps
without versioned consumers, a missing bump when the repository visibly releases
through tooling (changesets, semantic-release) that computes the version, or the
breaking change itself (Breaking Change reports it; do not repeat it here).
