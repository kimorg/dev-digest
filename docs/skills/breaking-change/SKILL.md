---
name: Breaking Change
description: Flag every change that removes or alters a public contract so that a consumer written against the old version stops working.
type: custom
---
# Breaking Change

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
- an accepted input is **narrowed**: a shorter `max`, a new `min`, a stricter
  regex, an enum value no longer accepted, a type that accepts less;
- an HTTP method or path changes, or a param moves (query → body, path → query);
- a status code or error code changes for the same outcome (`200` → `201`,
  `404` → `400`), or a success becomes an error;
- an exported function's signature changes incompatibly: parameter order,
  return type, sync → async.

**Flag as CRITICAL when** the diff makes one of the changes above to a public
surface AND leaves no compatibility path: no alias for the old name, no old
route kept next to the new one, no new major API version (`/v2`) that keeps the
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
