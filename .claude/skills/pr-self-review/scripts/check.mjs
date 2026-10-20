#!/usr/bin/env node
// Deterministic gate behind the git hooks. It never runs the review — it checks the review's marker.
//   check.mjs commit                 .githooks/pre-commit   staged files == reviewed files, verdict PASS
//   check.mjs record                 .githooks/post-commit  approve HEAD if pre-commit passed for this tree
//   check.mjs push                   .githooks/pre-push     every outgoing commit is approved
//   check.mjs pr-merge [<n>]         before `gh pr merge`   PR head == local HEAD, its commits approved
//   check.mjs approve-existing [<base>]  humans only: approve commits made before the hooks existed
// Exit 0 = allowed, 1 = blocked. PR_SELF_REVIEW_SKIP=1 = human emergency bypass (logged).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  repoRoot, git, loadRouting, readMarker, stagedChanges, operationInProgress, evaluateCommit, evaluateCommits,
  evaluatePrHead, formatBlock, writePending, readPending, clearPending, readApproved, appendApproved, commitsIn,
  commitExists, defaultRemoteBranch, headSha, logSkip, ZERO_SHA,
} from './lib.mjs';

const [mode, arg] = process.argv.slice(2);
const root = repoRoot();
const routing = loadRouting();
const err = (s) => process.stderr.write(s + '\n');

function finish(result) {
  if (result.ok) {
    err(`✔ pr-self-review (${mode}): ${result.reason}`);
    process.exit(0);
  }
  err(formatBlock(result, { mode }));
  process.exit(1);
}

if (process.env.PR_SELF_REVIEW_SKIP === '1' && mode !== 'record') {
  logSkip(mode, root);
  if (mode === 'commit') clearPending(root); // a skipped commit is never approved
  err(`⚠ pr-self-review (${mode}): SKIPPED via PR_SELF_REVIEW_SKIP=1 — logged to .git/pr-self-review/skipped.log. Explain why in the PR.`);
  process.exit(0);
}

switch (mode) {
  case 'commit': {
    const op = operationInProgress(root);
    if (op) {
      clearPending(root);
      err(`pr-self-review (commit): ${op} in progress — not checked; pre-push checks the resulting commits.`);
      process.exit(0);
    }
    const result = evaluateCommit({ marker: readMarker(root), staged: stagedChanges(root), routing });
    if (result.ok) writePending(git(['write-tree'], { root }).trim(), root);
    else clearPending(root);
    finish(result);
    break;
  }

  case 'record': {
    // Runs after every commit (also --no-verify ones): approve only a tree pre-commit let through.
    const pending = readPending(root);
    clearPending(root);
    const tree = git(['rev-parse', 'HEAD^{tree}'], { root, allowFail: true })?.trim();
    if (!pending || pending.tree !== tree) process.exit(0);
    const entries = commitsIn(['-1', 'HEAD'], root).filter((c) => c.patchId);
    appendApproved(entries.map((c) => ({ ...c, via: 'review' })), root);
    process.exit(0);
    break;
  }

  case 'push': {
    // stdin: "<local ref> <local sha> <remote ref> <remote sha>" per pushed ref.
    let input = '';
    try {
      input = readFileSync(0, 'utf8');
    } catch {
      // no stdin — nothing to push
    }
    const commits = [];
    for (const line of input.split('\n').filter(Boolean)) {
      const [, localSha, , remoteSha] = line.split(' ');
      if (!localSha || ZERO_SHA.test(localSha)) continue; // branch deletion
      const range = [localSha, '--not', '--remotes'];
      if (remoteSha && !ZERO_SHA.test(remoteSha) && commitExists(remoteSha, root)) range.push(remoteSha);
      commits.push(...commitsIn(range, root));
    }
    finish(evaluateCommits({ commits, approved: readApproved(root), routing }));
    break;
  }

  case 'pr-merge': {
    let pr;
    try {
      const out = execFileSync('gh', ['pr', 'view', ...(arg ? [arg] : []), '--json', 'headRefOid,baseRefName'], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      pr = JSON.parse(out);
    } catch (e) {
      finish({ ok: false, reason: 'cannot read the PR with `gh pr view` — merge is not allowed without the check', details: [String(e.stderr || e.message).trim()] });
    }
    const head = evaluatePrHead({ prHead: pr.headRefOid, localHead: headSha(root) ?? '' });
    if (!head.ok) finish(head);
    const base = `origin/${pr.baseRefName}`;
    finish(evaluateCommits({ commits: commitsIn(['HEAD', '--not', base], root), approved: readApproved(root), routing }));
    break;
  }

  case 'approve-existing': {
    const base = arg || defaultRemoteBranch(root);
    const approved = readApproved(root);
    const fresh = commitsIn(['HEAD', '--not', base], root).filter((c) => c.patchId && !approved.has(c.patchId));
    appendApproved(fresh.map((c) => ({ ...c, via: 'approve-existing' })), root);
    logSkip(`approve-existing ${base} (${fresh.length} commit(s))`, root);
    err(`⚠ pr-self-review: approved ${fresh.length} existing commit(s) on HEAD not in ${base} WITHOUT a review (logged).`);
    for (const c of fresh) err(`    ${c.sha.slice(0, 12)}`);
    err('  This is a human escape hatch for commits made before the hooks were enabled. Agents must not run it.');
    process.exit(0);
    break;
  }

  default:
    err('usage: check.mjs <commit|record|push|pr-merge [<n>]|approve-existing [<base>]>');
    process.exit(2);
}
