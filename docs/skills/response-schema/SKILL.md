---
name: Response Schema
description: Check every change to the shape of a response (field types, required and nullable fields, enums, formats) and flag the ones existing clients cannot parse.
type: rubric
---
# Response Schema

A client is written against the response it saw: it reads fields by name,
assumes their types and treats a required field as always there. For every
response the diff changes — a route's `response` schema, a shared DTO or Zod
contract, a serializer or mapper, a GraphQL type — classify each change with
this table.

| Change to a response field | Severity |
|---|---|
| removed or renamed | CRITICAL |
| type changed (`number` → `string`, object → array, scalar → object) | CRITICAL |
| required → optional, or becomes `nullable` (clients read it without a null check) | CRITICAL |
| moved to another level (`user.email` → `user.contact.email`) | CRITICAL |
| a new value in an enum the client switches on | WARNING |
| format or unit changed with the same type (date string format, cents → units, id int → uuid) | WARNING |
| number precision or range changed (integer → float, a larger max) | WARNING |
| a list becomes paginated or wrapped (`[...]` → `{ items: [...] }`) | CRITICAL |
| a new optional field | do not flag |
| optional → required, nullable → non-null (it only tightens the guarantee) | do not flag |

**Flag drift as WARNING when** the handler now returns data that no longer
matches the response schema it declares (a field the mapper stopped setting, a
`null` the schema does not allow), even if the schema itself did not change.

**Escalate to CRITICAL only** for the rows marked CRITICAL above, when the
response is part of a public contract and the old shape is not still served
(by an older API version or a negotiated format).

**How to report:** one finding per changed field. Cite the schema or mapper
line, quote the old and the new type or shape, and name the client read that
breaks (`res.total.toFixed()` on a value that is now a string).

**Do not flag:** request schemas (Breaking Change covers inputs), internal DTOs
that never leave the service, a response the same PR introduces, or a change
behind a new API version.
