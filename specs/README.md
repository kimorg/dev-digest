# specs — cross-package specs

This folder holds **only specs of features that change two or more packages** (`server`,
`client`, `reviewer-core`, `mcp`). For example: server + client, or server + reviewer-core. A
feature that stays inside one package has its spec in that package's `specs/` folder. A
cross-package feature has **one** spec here and no copies in the packages.

Specs are written before implementation by the [`spec-creator`](../.claude/agents/spec-creator.md)
agent, after the user approves them. A spec says *what* to build and how to check it. It never
says *how* to build it in code. [`implementation-planner`](../.claude/agents/implementation-planner.md)
turns an approved spec into a plan in [`docs/plans/`](../docs/plans/README.md).

## Rules for every spec (root and packages)

| What | Where |
|---|---|
| Feature in one package | `<package>/specs/NNN-<slug>.md` |
| Feature in several packages | `specs/NNN-<slug>.md` (here) |
| e2e journeys | acceptance criteria of the owning spec (`e2e/specs/` holds flow files only) |

- **File name:** `NNN-<slug>.md`, with no date. `NNN` is one three-digit sequence across
  `specs/`, `server/specs/`, `client/specs/`, `reviewer-core/specs/` and `mcp/specs/`: take the
  highest number and add 1. `<slug>` is the feature name in kebab-case English.
- **`Spec ID: SPEC-NNN`** uses the same number as the file name.
- **Status:** `draft` → `approved` → `implemented`. `implementation-planner` plans only
  `approved` specs. A spec that replaces an earlier decision gets a new number and a
  `Supersedes:` link, and the old spec stays unchanged.
- **Language:** the file is always English. The draft you review is in the language of your
  request and stays in the chat.
- **No implementation details.** A spec may contain:
  - workflow and sequence diagrams (Mermaid);
  - communication between services;
  - contracts: endpoints, fields, errors, events;
  - the logical DB schema.

  A spec has no file paths, function names, layers or libraries.
- **Acceptance criteria use EARS** — full rules, examples and the pattern → test mapping in the
  [`ears-requirements`](../.claude/skills/ears-requirements/SKILL.md) skill. Each criterion is
  `AC-<n> (<pattern>)` with one `shall`:

  | Pattern | Form |
  |---|---|
  | Ubiquitous | The \<system\> shall … |
  | Event-driven | When \<trigger\>, the \<system\> shall … |
  | State-driven | While \<state\>, the \<system\> shall … |
  | Unwanted behaviour | If \<condition\>, then the \<system\> shall … |
  | Optional feature | Where \<feature is enabled\>, the \<system\> shall … |

- Specs `001`–`004` in the packages predate this template. Keep them as they are.

## Template

```md
# Spec: <feature name>
Spec ID: SPEC-NNN
Status: draft | approved | implemented
Supersedes: <relative link | none>
Modules: <server, client, reviewer-core, mcp>

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Workflows and contracts      (optional: Mermaid diagrams, API / events, logical DB schema)
## Edge cases
## Non-functional requirements
## Inputs and provenance        (source → what it gave → used in which AC)
## Untrusted inputs             (external data the feature handles and how)
## Open questions
```

The full guidance for each section is in [`spec-creator`](../.claude/agents/spec-creator.md).
