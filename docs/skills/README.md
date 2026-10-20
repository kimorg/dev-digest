# Skills

A **skill** is a reusable markdown instruction block (name, description, type, body)
that any review agent can link. At run time the bodies of an agent's linked, enabled
skills are injected into the prompt's `## Skills / rules` section in the order set on
the agent's **Skills** tab. Spec: [server](../../server/specs/003-skills.md) ·
[client](../../client/specs/003-skills.md).

> The DB is the source of truth at run time. These files are the human-readable
> originals; the seeded ones are mirrored in `server/src/db/seed-skills.ts`.

## File format

One folder per skill, core file `SKILL.md`:

```md
---
name: Uncovered Branches          # shown on the card; unique per workspace
description: Flag every new …     # the skill's interface — write it as a directive
type: custom                      # rubric | convention | security | custom
---
# Uncovered Branches
…body: what to flag, at which severity (CRITICAL / WARNING / SUGGESTION), how to report…
```

Write the body with the same rules as an agent prompt
([agent-prompts/README.md](../agent-prompts/README.md)): use the schema's severity
words, never describe the JSON shape, never set a findings quota.

## Test Quality Reviewer skills

| Skill | Type | How it gets into the DB |
|-------|------|-------------------------|
| [Uncovered Branches](uncovered-branches/SKILL.md) | custom | seeded, linked #1 |
| [Edge Case Checklist](edge-case-checklist/SKILL.md) | rubric | seeded, linked #2 |
| [Over-Mocking](over-mocking/SKILL.md) | convention | seeded, linked #3 |
| [Flaky Test Patterns](flaky-test-patterns/SKILL.md) | custom | **imported** via Skills → Add Skill → From file, using [`flaky-test-patterns.zip`](flaky-test-patterns.zip) |

The archive also carries `scripts/check.sh` on purpose: the importer must list it as
an ignored file and never run or store it. Rebuild the archive after editing the folder:

```sh
cd docs/skills && rm -f flaky-test-patterns.zip && zip -rX flaky-test-patterns.zip flaky-test-patterns
```

## API Contract Reviewer skills

| Skill | Type | How it gets into the DB |
|-------|------|-------------------------|
| [Breaking Change](breaking-change/SKILL.md) | custom | seeded, linked #1 |
| [Response Schema](response-schema/SKILL.md) | rubric | seeded, linked #2 |
| [Semver Discipline](semver-discipline/SKILL.md) | convention | seeded, linked #3 |
| [Deprecation Policy](deprecation-policy/SKILL.md) | convention | seeded, linked #4 |

When several of these match one change, the agent's prompt reports it once, at the most
severe level, and names the other rules in the rationale.

## Trust

An imported skill is somebody else's instructions inside your agent's prompt. Read the
preview before saving; imported skills are saved **disabled** until you enable them.
