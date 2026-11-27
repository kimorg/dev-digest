import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md = @AGENTS.md, the
 * package AGENTS.md maps, skills and subagents, loaded via settingSources:["project"]) behaves as
 * documented. Organized by scenario, not by a single artifact, because these behaviors are
 * cross-cutting. Every case names the AGENTS.md rule it guards — reword or drop that rule and the
 * case should go red.
 *
 * Budget: 9 Claude sessions total.
 *   - 5 × trace     → 1 session each                      = 5
 *   - 1 × contrast  → treatment + control                 = 2
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *
 * Assert on the doc a map ROUTES to, never on reading the map itself: a nested CLAUDE.md
 * (`@AGENTS.md`) is auto-loaded by Claude Code when work enters the package, so an explicit
 * `Read server/AGENTS.md` shows up only in some runs. Only `Read` calls count as reads (not
 * Grep/Glob — see run-claude.ts).
 *
 * `trace` folds several assertions into ONE session and stops early once its evidence is in — so
 * a dispatch-bearing trace never waits out the nested subagent's full run. A trace with
 * `avoidFilesRead` runs to its natural end instead (a forbidden read may come after the expected
 * one), so it gets a "don't write code, just report" prompt and enough maxTurns to finish.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): server API map routing + subagent dispatch ----------------------------
  // server/AGENTS.md: "Overview, request/DI flow, API map, env vars: [README](README.md)".
  // Agent description of architecture-reviewer: "onion rings and module self-containment in server/".
  // The endpoint must NOT already exist, or the model reviews existing code inline instead of
  // planning-then-dispatching. GET /reviews/:id/export is absent from server/src/modules.
  {
    kind: "trace",
    name: "API-route task reads server/README.md AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з документацією API цього репо (мапою маршрутів пакета server). Потім " +
      "ОБОВʼЯЗКОВО запусти сабагента architecture-reviewer, щоб він оцінив мій план на відповідність " +
      "onion-шарам — не рецензуй сам. Код не пиши.",
    expectFilesRead: ["server/README.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 10,
  },

  // --- trace (1 session): reviewer-core map routing -> README.md "Pipeline" ---------------------
  // reviewer-core/AGENTS.md: "Pure review engine: diff → prompt → LLM → grounded findings.
  // Pipeline and public API: [README](README.md)". Push toward CONSULTING docs, not exploring
  // source: open phrasing ("розберись, як усе влаштовано") sends the model straight into src/.
  {
    kind: "trace",
    name: "pipeline task follows reviewer-core/AGENTS.md to README.md",
    prompt:
      "Я збираюся змінити review pipeline у reviewer-core. Перш ніж торкатися коду — за настановами " +
      "цього репо знайди документ, який описує pipeline цього пакета, і прочитай саме його. Код не змінюй.",
    expectFilesRead: ["reviewer-core/README.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): "unexpected behavior" -> the package's INSIGHTS.md --------------------
  // Root AGENTS.md › Where docs live: "`INSIGHTS.md` (learned gotchas)"; reviewer-core/AGENTS.md
  // has no other gotchas file. If this goes red, the INSIGHTS.md system has become write-only.
  {
    kind: "trace",
    name: "reviewer-core surprise is looked up in reviewer-core/INSIGHTS.md",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 6,
  },

  // --- trace (1 session): Session protocol step 1 — THIS package's INSIGHTS.md, not another's ----
  // Root AGENTS.md › Session protocol: "Start: before working in a package, read its INSIGHTS.md
  // and state the top 3 points relevant to the task." The prompt names the protocol, not the file.
  // The negative half is the real assertion: a model that reads every INSIGHTS.md it finds would
  // pass a positive-only version.
  {
    kind: "trace",
    name: "server task starts with server/INSIGHTS.md per Session protocol, not client's",
    prompt:
      "Хочу додати новий Fastify-маршрут у server/src/modules/reviews. Код не пиши і сабагентів не " +
      "запускай — лише виконай крок «Start» з Session protocol цього репо для цієї задачі і коротко " +
      "звітуй.",
    expectFilesRead: ["server/INSIGHTS.md"],
    avoidFilesRead: ["client/INSIGHTS.md", "e2e/INSIGHTS.md", "mcp/INSIGHTS.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): contract change -> BOTH vendored copies --------------------------------
  // Root AGENTS.md › Gotchas: "@devdigest/shared (Zod contracts) is vendored twice ... The copies
  // have already drifted; a contract change must be applied to both." Reading one side only is
  // exactly the trap the rule warns about.
  {
    kind: "trace",
    name: "contract change opens both the server and the client copy of findings.ts",
    prompt:
      "Хочу додати поле `reviewedAt` у контракт findings. Код не змінюй — за настановами цього репо " +
      "визнач, які саме файли контракту треба звірити перед зміною, і прочитай їх.",
    expectFilesRead: [
      "server/src/vendor/shared/contracts/findings.ts",
      "client/src/vendor/shared/contracts/findings.ts",
    ],
    maxTurns: 10,
  },

  // --- contrast (2 sessions): Session protocol "Start" changes what a code task reads -----------
  // Root AGENTS.md › Session protocol: "Start: before working in a package, read its INSIGHTS.md".
  // A narrow code task (rename a function) that never names the protocol, INSIGHTS or docs:
  // without the harness the model just Greps the identifier. `countBlockers` appears in no .md
  // file, so search alone never surfaces reviewer-core/INSIGHTS.md. If the protocol is reworded
  // to skip small tasks, this goes red — that is the point.
  // Picked 2026-11-26 by probing on the snapshots: treatment 5/5 read it, control 0/3.
  // Rejected (control read the target too): docs/agent-prompts/ (Security reviewer
  // prompt), client|e2e INSIGHTS.md on an open "prepare for the task" prompt, docs/deps/ report
  // (and its treatment stopped at INSIGHTS.md), the client copy of findings.ts (control 1/2).
  {
    kind: "contrast",
    name: "starting a reviewer-core rename reads reviewer-core/INSIGHTS.md only with the harness",
    // Phrased as STARTING the task, not as a lookup: "find where it's used" read as Q&A and the
    // treatment skipped the protocol 1/5 (probe) and 1/1 (runner); this phrasing went 5/5.
    prompt:
      "Беруся за задачу в reviewer-core: перейменувати функцію `countBlockers` на `countGateBlockers` " +
      "в оголошенні та всіх місцях використання. Почни роботу над задачею, але поки зупинись на плані: " +
      "які файли й рядки зміняться. Код не пиши й нічого не змінюй.",
    expectFileRead: "reviewer-core/INSIGHTS.md",
    tools: ["Read", "Grep", "Glob"],
    maxTurns: 8,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  // engineering-insights description: "... or immediately after discovering something non-obvious
  // (a surprising behavior, a dead end, a fix for a confusing error)". Write/Edit/Bash are fenced
  // off in workflowTask, so the only way to "record" is the Skill tool — the trace stays honest
  // and the run can't touch the real INSIGHTS.md.
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    // "Хочу це зафіксувати" reads as both "record" and "fix" in Ukrainian and let the model start
    // debugging; stating the fix is already applied removes that. Deliberately does NOT name
    // INSIGHTS.md, which invites handling the file directly instead of delegating to the skill.
    // The discovery must be TRUE, COMPLETE and CONSISTENT WITH THE LIVE TREE — the model checks
    // all three before recording, and asks instead of activating when one fails:
    //   - "pgvector returned zero rows on a dimension mismatch" is false (pgvector raises an
    //     error) → 1/4 activations on 2026-11-26;
    //   - "fix applied: dimensions changed + new migration" is not in the tree (still 1536, no
    //     new migration) → 0/5 on 2026-11-27, every run flagged the discrepancy.
    // So it is a DEAD END that was reverted (the skill names dead ends explicitly): nothing in it
    // contradicts server/ (vector(1536) in 0000_init.sql, dimensions: 1536 in the two schemas,
    // text-embedding-3-small in the adapters, no vector index).
    prompt:
      "Щойно в server/ спробував перейти на модель ембедингів text-embedding-3-large (3072 виміри) " +
      "і вперся в глухий кут: запис ембедингів падав з `ERROR: expected 1536 dimensions, not 3072`. " +
      "Спершу шукав проблему в адаптері ембедера, а насправді розмірність задає колонка " +
      "`vector(1536)` з міграції `0000_init.sql` (і `dimensions: 1536` у Drizzle-схемах " +
      "context.ts та knowledge.ts), тож зміна моделі тягне за собою нову міграцію й переембединг " +
      "наявних рядків. Зміни в адаптері я відкотив, лишаємося на text-embedding-3-small. Хочу " +
      "задокументувати цю знахідку, щоб команда не наступила на ті самі граблі.",
    skill: "engineering-insights",
    shouldActivate: true,
    // The Session protocol spends 2–3 turns on INSIGHTS.md / AGENTS.md before the skill; the run
    // stops as soon as the skill engages (runWorkflowCases), so the headroom costs nothing on a pass.
    maxTurns: 10,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
