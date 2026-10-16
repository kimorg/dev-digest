#!/usr/bin/env node
// Uncommitted changes → review plan (which skill reviews which files). Usage:
//   node .claude/skills/pr-self-review/scripts/collect.mjs > "$TMP/plan.json"
// JSON plan goes to stdout, a human summary to stderr.
import { repoRoot, headOrEmpty, workingChanges, fileText, loadRouting, discoverSkills, buildPlan } from './lib.mjs';

const root = repoRoot();
const routing = loadRouting();
const plan = buildPlan({
  base: headOrEmpty(root),
  changes: workingChanges(root),
  routing,
  discovered: discoverSkills(root),
  getText: (path) => fileText(path, root),
  root,
});

process.stdout.write(JSON.stringify(plan, null, 2) + '\n');

const say = (s = '') => process.stderr.write(s + '\n');
if (plan.empty) {
  say('pr-self-review: no reviewable uncommitted changes — run verdict.mjs to record an empty PASS.');
} else {
  say(`pr-self-review plan — ${plan.files.length} file(s), ${plan.totalLines} changed line(s), base ${plan.base.slice(0, 12)}`);
  for (const [skill, paths] of Object.entries(plan.buckets)) {
    say(`  ${skill.padEnd(24)} ${String(paths.length).padStart(3)} file(s)  ${plan.bucketLines[skill]} line(s)`);
  }
  if (plan.unreviewedFiles.length) say(`  no skill covers: ${plan.unreviewedFiles.join(', ')}`);
}
if (plan.excludedFiles.length) say(`  excluded (not reviewed, not checked by hooks): ${plan.excludedFiles.length} file(s)`);
for (const s of plan.unroutedSkills) {
  say(`  ⚠ skill "${s.name}" has no route in routing.json — add one or list it in ignoreSkills. (${s.description.slice(0, 120)})`);
}
