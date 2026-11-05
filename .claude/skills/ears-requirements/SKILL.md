---
name: ears-requirements
description: "EARS (Easy Approach to Requirements Syntax) rules for acceptance criteria in DevDigest specs (specs/, <package>/specs/): the five patterns plus the complex one, English and Ukrainian forms, testability rules, AC IDs, bad → good rewrites and how each pattern maps to a test. Use only when writing, rewriting or checking acceptance criteria of a spec — drafting a spec, reworking an UNTESTABLE or AMBIGUOUS criterion, or turning criteria into tests. Not for code, plans or docs."
metadata:
  version: "1.0.0"
---

# EARS requirements

EARS was introduced by Mavin, Wilkinson, Harwood and Novak (Rolls-Royce) at IEEE RE'09. It
splits a requirement into **the condition** and **the system's response**, so that each
criterion is unambiguous and has a test. In DevDigest every acceptance criterion of a spec in
the current template (`Spec ID:` line) is written in EARS.

## Patterns

| Pattern | When to use | English (spec file) | Ukrainian (draft) |
|---|---|---|---|
| Ubiquitous | always true, no condition | The `<system>` shall `<response>`. | `<система>` повинна (shall) `<реакція>`. |
| Event-driven | response to a trigger | **When** `<trigger>`, the `<system>` shall `<response>`. | **КОЛИ** `<подія>`, `<система>` повинна (shall) … |
| State-driven | behaviour during a state | **While** `<state>`, the `<system>` shall `<response>`. | **ПОКИ** `<стан>`, … |
| Unwanted behaviour | errors, failures, abuse, limits | **If** `<unwanted condition>`, **then** the `<system>` shall `<response>`. | **ЯКЩО** `<умова>`, **ТОДІ** … |
| Optional feature | a setting, flag or optional capability | **Where** `<feature is enabled / present>`, the `<system>` shall `<response>`. | **ДЕ** `<опція>`, … |
| Complex | state + trigger (or feature + trigger) | **While** `<state>`, **when** `<trigger>`, the `<system>` shall `<response>`. | **ПОКИ** …, **КОЛИ** …, … |

Choosing: a condition that *happens* → When; a condition that *lasts* → While; something that
*should not happen but can* → If…then; something that *exists only in some configurations* →
Where; none → Ubiquitous. Use Complex only when both parts are needed; otherwise split.

## Rules

1. **One criterion, one `shall`, one behaviour.** "and" between two responses → two criteria.
   "and/or" → decide, or ask.
2. **The `<system>` is an observable actor** a test can talk to: "the API", "the PR page",
   "the review run", "the MCP server", "the Settings → Models screen". Not a class, a module or
   a layer.
3. **The response is observable:** a status code, a visible text or state, a stored value, a
   returned field, an emitted event, a time or count limit. If no test could see it, it is not a
   criterion.
4. **No vague words.** Replace `fast`, `quickly`, `user-friendly`, `intuitive`, `properly`,
   `correctly`, `appropriate`, `robust`, `secure`, `as needed`, `etc.`, `and so on`, `support`
   (without saying what) with a number or a concrete outcome. If you can't, it is an open question.
5. **No "shall not" as a free-standing rule.** State the unwanted condition and the response:
   not "The API shall not accept long titles" but "If the title exceeds 200 characters, then the
   API shall respond 400 with `title_too_long`".
6. **Every error path is its own Unwanted-behaviour criterion**: timeouts, empty or malformed
   responses, missing permissions, limits, duplicates, partial failure.
7. **Every setting or flag gets an Optional-feature criterion**, and the behaviour when it is
   off is stated (its own criterion or the Ubiquitous default).
8. **No implementation.** No file paths, function or component names, libraries, layers or
   algorithms. Contracts (endpoint, field, status code, event) are allowed — they are observable.
9. **Active voice, present tense, terms used consistently** — one name per concept across the
   spec ("review run" everywhere, not "run" / "job" / "analysis").

## IDs

- Each criterion starts with `AC-<n> (<Pattern>)`: `AC-3 (Unwanted behaviour): If …`.
- IDs are stable once the spec is `approved`: never renumber; a removed criterion leaves a gap;
  a new one takes the next number. Plans, tests and verification trace by these IDs.
- Edge cases (`EC-n`) and non-functional requirements (`NFR-n`) point to the AC that covers
  them.

## Bad → good

| Bad | Problem | Good |
|---|---|---|
| The PR page should load findings quickly. | vague, no pattern | AC-1 (Event-driven): When the user opens a PR page with a finished review run, the PR page shall show its findings within 2 s. |
| The system validates the repo URL and clones it. | two behaviours, no actor | AC-2 (Event-driven): When the user submits a repo URL, the API shall validate it. · AC-3 (Unwanted behaviour): If the repo URL is not a GitHub HTTPS URL, then the API shall respond 400 with `invalid_repo_url`. |
| Errors are handled gracefully. | untestable | AC-4 (Unwanted behaviour): If the LLM call times out, then the review run shall end with status `failed` and the error text `LLM timeout`. |
| While reviewing, show progress. | no system, no observable | AC-5 (State-driven): While a review run is `running`, the PR page shall show the run's status and elapsed time. |
| Cost badge works when enabled. | vague; off state missing | AC-6 (Optional feature): Where cost tracking is enabled, the PR page shall show the run cost in USD with 2 decimals. · AC-7 (Ubiquitous): The PR page shall show no cost badge when cost tracking is disabled. |
| The service shall use a retry helper on 5xx. | implementation | AC-8 (Unwanted behaviour): If GitHub responds 5xx, then the API shall retry up to 3 times before reporting `github_unavailable`. |

## Pattern → test

How a criterion becomes a test (planner's Tests table, test-writer, plan-verifier evidence):

| Pattern | Test shape |
|---|---|
| Ubiquitous | an invariant checked on several representative inputs |
| Event-driven | arrange the precondition → perform the trigger → assert the response |
| State-driven | put the system in the state → assert the behaviour; also assert it stops outside the state |
| Unwanted behaviour | a negative test that reproduces the condition (stub the failure) → assert the response |
| Optional feature | two tests: feature on → the behaviour; feature off → the default |
| Complex | the state as the precondition, the trigger as the action; plus the trigger outside the state |

## Self-check

- [ ] Every criterion has an ID, a pattern and exactly one `shall`.
- [ ] Every response is observable by a test; no vague word from rule 4 is left.
- [ ] Every error path, limit and edge case has an Unwanted-behaviour criterion.
- [ ] Every setting has an Optional-feature criterion and a stated off behaviour.
- [ ] No implementation detail; the actor is something a test can talk to.
- [ ] Terms are consistent; IDs of an approved spec were not renumbered.
