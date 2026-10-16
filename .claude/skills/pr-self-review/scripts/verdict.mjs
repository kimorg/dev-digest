#!/usr/bin/env node
// Findings → verdict, report and marker. Usage:
//   node .claude/skills/pr-self-review/scripts/verdict.mjs "$TMP/plan.json" "$TMP/findings"
// Exit 0 = PASS, 1 = BLOCKED (any CRITICAL), 2 = the review itself is broken (nothing recorded).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  repoRoot, loadRouting, ruleOf, workingChanges, validateFindings, dedupeFindings, buildMarker,
  driftedFiles, writeMarker, hooksEnabled, HOOKS_PATH,
} from './lib.mjs';
import { runChecks } from './checks.mjs';

const [planPath, findingsDir] = process.argv.slice(2);
const say = (s = '') => process.stdout.write(s + '\n');
const die = (lines) => {
  process.stderr.write(['✖ pr-self-review: the review is incomplete — nothing was recorded.', ...lines.map((l) => `    ${l}`)].join('\n') + '\n');
  process.exit(2);
};

if (!planPath || !findingsDir) die(['usage: verdict.mjs <plan.json> <findings-dir>']);

const root = repoRoot();
const routing = loadRouting();
let plan;
try {
  plan = JSON.parse(readFileSync(planPath, 'utf8'));
} catch (err) {
  die([`cannot read plan ${planPath}: ${err.message}`]);
}

const drift = driftedFiles(plan, workingChanges(root), routing);
if (drift.length) die(['files changed after collect.mjs — re-run collect.mjs and review again:', ...drift]);

const errors = [];
const all = [];
for (const [skill, files] of Object.entries(plan.buckets)) {
  const file = join(findingsDir, `${skill}.json`);
  if (!existsSync(file)) {
    errors.push(`missing ${file} — every planned skill must write a findings file (use "findings": [] when clean)`);
    continue;
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${file}: invalid JSON (${err.message})`);
    continue;
  }
  const res = validateFindings(doc, { skill, files, rule: ruleOf(skill, routing) });
  errors.push(...res.errors);
  all.push(...res.findings);
}
if (errors.length) die(errors);

// Deterministic checks (typecheck, dependency-cruiser vs HEAD) — CRITICAL on any new error.
const checks = runChecks(plan, root);
const findings = dedupeFindings([...all, ...checks.findings]);
const marker = buildMarker(plan, findings, undefined, checks.notes);
writeMarker(marker, root);

const { CRITICAL, WARNING, SUGGESTION } = marker.counts;
say(`## PR self-review: ${marker.verdict}`);
say('');
say(`${plan.files.length} file(s) · ${marker.skills.length} skill(s) · ${CRITICAL} critical · ${WARNING} warning · ${SUGGESTION} suggestion`);
if (checks.notes.length) say(`Checks: ${checks.notes.join(' · ')}`);
for (const sev of ['CRITICAL', 'WARNING', 'SUGGESTION']) {
  const group = findings.filter((f) => f.severity === sev);
  if (!group.length) continue;
  say('');
  say(`### ${sev}`);
  for (const f of group) {
    say(`- ${f.file}${f.line ? `:${f.line}` : ''} — ${f.title} [${f.skills.join(', ')}]`);
    for (const r of f.related ?? []) say(`  also: ${r}`);
    if (f.fix) say(`  fix: ${f.fix}`);
  }
}
if (plan.unreviewedFiles?.length) {
  say('');
  say(`No skill covers: ${plan.unreviewedFiles.join(', ')}`);
}
if (plan.unroutedSkills?.length) {
  say('');
  say(`Skills without a route (add them to routing.json): ${plan.unroutedSkills.map((s) => s.name).join(', ')}`);
}
if (!hooksEnabled(root)) {
  say('');
  say(`Note: git hooks are not enabled in this clone — run \`git config core.hooksPath ${HOOKS_PATH}\`.`);
}
say('');
say(marker.verdict === 'PASS'
  ? 'Recorded. You may commit these changes; any further edit needs a new review.'
  : 'Recorded as BLOCKED. Fix every CRITICAL above, then run the review again. Do not lower severities.');
process.exit(marker.verdict === 'PASS' ? 0 : 1);
