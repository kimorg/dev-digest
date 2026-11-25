#!/usr/bin/env node
// Parses every ```mermaid block of a Markdown file with the real Mermaid parser.
// Borrows `mermaid` + `jsdom` from an installed package (default: client/) — nothing is installed.
//   node .claude/skills/dependencies-checker/scripts/check-mermaid.mjs <report.md> [--from client]
// Exit 0 = all blocks parse, 1 = at least one fails, 3 = mermaid/jsdom not installed (skipped).
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.error('usage: check-mermaid.mjs <file.md> [--from <package dir with mermaid + jsdom>]');
  process.exit(2);
}
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const fromIdx = rest.indexOf('--from');
const from = resolve(root, fromIdx >= 0 && rest[fromIdx + 1] ? rest[fromIdx + 1] : 'client');
if (!existsSync(join(from, 'node_modules', 'mermaid')) || !existsSync(join(from, 'node_modules', 'jsdom'))) {
  console.error(`skipped: ${from}/node_modules has no mermaid + jsdom`);
  process.exit(3);
}
const req = createRequire(join(from, 'package.json'));
const { JSDOM } = req('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Element = dom.window.Element;
const mermaid = (await import(req.resolve('mermaid'))).default;
mermaid.initialize({ startOnLoad: false });

const blocks = [...readFileSync(file, 'utf8').matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
let failed = 0;
for (const [i, b] of blocks.entries()) {
  try {
    await mermaid.parse(b);
  } catch (e) {
    failed++;
    console.error(`block ${i + 1}: ${String(e?.message ?? e).split('\n').slice(0, 4).join(' ')}`);
  }
}
console.error(`${blocks.length} mermaid block(s), ${failed} failed`);
process.exit(failed ? 1 : 0);
