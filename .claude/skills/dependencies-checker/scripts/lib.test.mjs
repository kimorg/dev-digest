// Run: node --test '.claude/skills/dependencies-checker/scripts/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normaliseAudit, normaliseOutdated } from './lib/online.mjs';
import { componentMap, fmtBytes, hotspots, packageDiagram } from './lib/render.mjs';
import { buildFindings, crossPackage, groupVulns } from './lib/rules.mjs';
import { createScanner } from './lib/scan.mjs';
import { line, satisfies } from './lib/semver.mjs';
import { categoryOf, extractImports, fileContext, isClientComponent, licenseClass, packageOf, scriptsUsingBin, stringRefs, typesTarget } from './lib/usage.mjs';

// ---------- semver ----------
test('satisfies: caret, tilde, x-ranges, comparators, alternatives', () => {
  assert.equal(satisfies('3.25.76', '^3.24.1'), true);
  assert.equal(satisfies('4.0.0', '^3.24.1'), false);
  assert.equal(satisfies('0.33.5', '^0.33.1'), true);
  assert.equal(satisfies('0.34.0', '^0.33.1'), false, '^0.x keeps the minor fixed');
  assert.equal(satisfies('0.0.4', '^0.0.3'), false);
  assert.equal(satisfies('1.2.9', '~1.2.3'), true);
  assert.equal(satisfies('1.3.0', '~1.2.3'), false);
  assert.equal(satisfies('1.9.0', '1.x'), true);
  assert.equal(satisfies('1.5.0', '>=1.2 <2'), true);
  assert.equal(satisfies('2.0.0', '>=1.2 <2'), false);
  assert.equal(satisfies('2.0.0', '^1.0.0 || ^2.0.0'), true);
  assert.equal(satisfies('2.4.0', '1.0.0 - 2.3.4'), false);
  assert.equal(satisfies('0.43.0', '0.43.0'), true);
  assert.equal(satisfies('5.0.0', '*'), true);
});

test('satisfies: prereleases and uncheckable specs', () => {
  assert.equal(satisfies('2.0.0-beta.2', '^2.0.0-beta.1'), true);
  assert.equal(satisfies('2.1.0-beta.1', '^2.0.0'), false, 'prerelease outside its tuple does not match');
  assert.equal(satisfies('1.0.0', 'latest'), null);
  assert.equal(satisfies('1.0.0', 'workspace:*'), null);
  assert.equal(satisfies('1.0.0', 'github:user/repo'), null);
  assert.equal(satisfies('1.0.0', 'file:../x'), null);
});

test('line: major, or 0.minor', () => {
  assert.equal(line('3.25.76'), '3');
  assert.equal(line('0.38.4'), '0.38');
  assert.equal(line('nope'), null);
});

// ---------- usage ----------
test('packageOf: scoped, deep, builtin, relative, protocol', () => {
  assert.equal(packageOf('@tanstack/react-query'), '@tanstack/react-query');
  assert.equal(packageOf('@dnd-kit/core/dist/x'), '@dnd-kit/core');
  assert.equal(packageOf('react-dom/client'), 'react-dom');
  assert.equal(packageOf('next/font/google'), 'next');
  assert.equal(packageOf('node:fs'), null);
  assert.equal(packageOf('fs/promises'), null);
  assert.equal(packageOf('./x'), null);
  assert.equal(packageOf('#internal'), null);
  assert.equal(packageOf('@scope'), null);
});

test('extractImports: value, type-only, inline types, side effect, dynamic, require, re-export', () => {
  const src = [
    "import { z } from 'zod';",
    "import type { Foo } from 'type-only-pkg';",
    "import { type A, type B } from 'inline-types';",
    "import { type A, b } from 'mixed';",
    "import 'side-effect-pkg';",
    "const m = await import(/* @vite-ignore */ 'dyn-pkg' as string);",
    "const r = require('req-pkg');",
    "export * from 'reexport-pkg';",
    "type T = typeof import('typeof-pkg');",
  ].join('\n');
  const got = Object.fromEntries(extractImports(src, 'a.ts').map((x) => [x.spec, x.typeOnly]));
  assert.deepEqual(got, { zod: false, 'type-only-pkg': true, 'inline-types': true, mixed: false, 'side-effect-pkg': false, 'dyn-pkg': false, 'req-pkg': false, 'reexport-pkg': false, 'typeof-pkg': true });
});

test('extractImports: code inside template literals and comments is not an import', () => {
  const src = [
    '/** import nope from "jsdoc-pkg" */',
    "// import x from 'commented-pkg'",
    "const fixture = `import { useState } from 'react';\nimport 'side-effect';`;",
    "import { real } from 'real-pkg';",
  ].join('\n');
  assert.deepEqual(extractImports(src, 'a.test.ts').map((x) => x.spec), ['real-pkg']);
});

test('extractImports: stylesheets', () => {
  const css = '@import "tailwindcss";\n@plugin "@tailwindcss/typography";\n.a { color: red }';
  assert.deepEqual(extractImports(css, 'styles.css').map((x) => x.spec), ['tailwindcss', '@tailwindcss/typography']);
});

test('fileContext', () => {
  assert.equal(fileContext('src/app/page.tsx'), 'src');
  assert.equal(fileContext('test/x.test.ts'), 'test');
  assert.equal(fileContext('src/a/b.it.test.ts'), 'test');
  assert.equal(fileContext('src/__tests__/x.tsx'), 'test');
  assert.equal(fileContext('vitest.config.ts'), 'config');
  assert.equal(fileContext('next.config.mjs'), 'config');
  assert.equal(fileContext('src/lib/x.config.ts'), 'src', 'only root-level *.config.* files are config');
  assert.equal(fileContext('scripts/gen.mjs'), 'script');
  assert.equal(fileContext('src/styles/globals.css'), 'style');
});

test('stringRefs, client components, bins in scripts', () => {
  assert.deepEqual([...stringRefs("environment: 'jsdom', target: \"pino-pretty\"", new Set(['jsdom', 'pino-pretty', 'zod']))].sort(), ['jsdom', 'pino-pretty']);
  assert.equal(isClientComponent("'use client';\nimport x from 'y'"), true);
  assert.equal(isClientComponent("// header\n\"use client\"\n"), true);
  assert.equal(isClientComponent("import x from 'y';\n'use client'"), false);
  assert.deepEqual(scriptsUsingBin({ test: 'vitest run', dev: 'tsx watch src/a.ts', e: 'npx tsc --noEmit', x: 'vitest-ish' }, 'vitest'), ['test']);
  assert.deepEqual(scriptsUsingBin({ e: 'npx tsc --noEmit' }, 'tsc'), ['e']);
});

test('categoryOf, typesTarget, licenseClass', () => {
  assert.equal(categoryOf('@types/node'), 'types');
  assert.equal(categoryOf('vitest'), 'test');
  assert.equal(categoryOf('@testing-library/react'), 'test');
  assert.equal(categoryOf('typescript'), 'tooling');
  assert.equal(categoryOf('fastify'), 'library');
  assert.equal(typesTarget('@types/react-dom'), 'react-dom');
  assert.equal(typesTarget('@types/babel__core'), '@babel/core');
  assert.equal(licenseClass('MIT'), 'permissive');
  assert.equal(licenseClass('(MIT OR GPL-3.0)'), 'permissive', 'OR lets the consumer pick');
  assert.equal(licenseClass('MIT AND GPL-3.0'), 'strong-copyleft', 'AND applies every term');
  assert.equal(licenseClass('LGPL-3.0-or-later'), 'weak-copyleft');
  assert.equal(licenseClass('SEE LICENSE IN README.md'), 'unknown');
  assert.equal(licenseClass('UNKNOWN'), 'unknown');
});

// ---------- scanner ----------
function pkgDir(dir, manifest, bytes = 100) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'index.js'), 'x'.repeat(bytes));
}

test('scanner: npm hoisted + nested layout, closure, boundary', () => {
  const root = mkdtempSync(join(tmpdir(), 'dc-npm-'));
  pkgDir(join(root, 'node_modules', 'stray'), { name: 'stray', version: '1.0.0' }); // above the boundary
  const app = join(root, 'app');
  pkgDir(app, { name: 'app', dependencies: { a: '^1.0.0' } });
  pkgDir(join(app, 'node_modules', 'a'), { name: 'a', version: '1.0.0', license: 'MIT', dependencies: { b: '^1', c: '^2' }, optionalDependencies: { gone: '1' } }, 1000);
  pkgDir(join(app, 'node_modules', 'b'), { name: 'b', version: '1.2.0', scripts: { postinstall: 'node x' } }, 200);
  pkgDir(join(app, 'node_modules', 'a', 'node_modules', 'c'), { name: 'c', version: '2.0.0', dependencies: { stray: '1' } }, 300);
  const s = createScanner(app);
  const a = s.resolve(s.root, 'a');
  assert.ok(a);
  assert.equal(s.resolve(s.root, 'stray'), null, 'never resolves above the package root');
  const { keys, missing } = s.closure(a);
  assert.deepEqual([...keys].map((k) => s.node(k).name).sort(), ['a', 'b', 'c']);
  assert.deepEqual(missing, [{ from: 'c', name: 'stray' }], 'missing optional deps are not reported, missing regular ones are');
  assert.ok(s.node(a).bytes >= 1000 && s.node(a).bytes < 1300, 'nested node_modules excluded from own size');
  assert.deepEqual(s.node(s.resolve(s.root, 'b')).installScripts, ['postinstall']);
});

test('scanner: pnpm store layout through symlinks', () => {
  const app = mkdtempSync(join(tmpdir(), 'dc-pnpm-'));
  pkgDir(app, { name: 'app', dependencies: { a: '1' } });
  const store = join(app, 'node_modules', '.pnpm');
  pkgDir(join(store, 'a@1.0.0', 'node_modules', 'a'), { name: 'a', version: '1.0.0', dependencies: { b: '1' } });
  pkgDir(join(store, 'b@1.0.0', 'node_modules', 'b'), { name: 'b', version: '1.0.0' });
  symlinkSync(join(store, 'b@1.0.0', 'node_modules', 'b'), join(store, 'a@1.0.0', 'node_modules', 'b'));
  symlinkSync(join(store, 'a@1.0.0', 'node_modules', 'a'), join(app, 'node_modules', 'a'));
  const s = createScanner(app);
  const { keys } = s.closure(s.resolve(s.root, 'a'));
  assert.deepEqual([...keys].map((k) => s.node(k).name).sort(), ['a', 'b']);
  assert.equal(s.resolve(s.root, 'b'), null, 'b is not hoisted to the top level');
});

// ---------- rules ----------
const usage = (o = {}) => ({ valueFiles: { src: 0, test: 0, config: 0, script: 0, style: 0 }, typeFiles: { src: 0, test: 0, config: 0, script: 0, style: 0 }, examples: {}, clientFiles: 0, stringRefs: 0, bins: [], runtimeBins: [], peerOf: [], typesFor: null, typesForUsed: false, ...o });
const dep = (o) => ({ section: 'prod', category: 'library', declared: '^1.0.0', installed: '1.0.0', satisfies: true, looseSpec: null, own: 0, closureBytes: 0, closureCount: 1, exclusiveBytes: 0, exclusiveCount: 1, alsoPulledBy: [], status: 'used', usage: usage(), ...o });
const pkg = (o) => ({ dir: 'server', name: '@x/api', pm: 'pnpm', installed: true, runtimeStart: true, deps: [], undeclared: [], missingTransitive: [], duplicates: [], licenses: { counts: {}, flagged: [] }, native: [], online: null, totals: { direct: { prod: 0, dev: 0 }, prodBytes: 0, allBytes: 0, prodCount: 0, allCount: 0 }, ...o });
const model = (packages, drift = []) => ({ packages, cross: { matrix: [], drift } });
const rulesOf = (fs) => fs.map((f) => `${f.rule}:${f.dep}:${f.priority}`);

test('rules: unused, pinned-only, dev-in-prod, prod-tooling, undeclared', () => {
  const fs = buildFindings(model([pkg({
    deps: [
      dep({ name: 'unused-lib', status: 'unused' }),
      dep({ name: 'pin-only', section: 'dev', status: 'unused', alsoPulledBy: ['parent'] }),
      dep({ name: 'dev-used-in-src', section: 'dev', usage: usage({ valueFiles: { src: 2, test: 0, config: 0, script: 0, style: 0 } }) }),
      dep({ name: 'tool-in-prod', usage: usage({ valueFiles: { src: 0, test: 3, config: 0, script: 0, style: 0 } }) }),
      dep({ name: 'served-by-start', usage: usage({ bins: [{ bin: 'tsx', scripts: ['start'] }], runtimeBins: ['tsx'] }) }),
    ],
    undeclared: [{ name: 'ghost', files: 1, contexts: ['src'], example: 'a.ts', resolvable: false }, { name: 'hoisted', files: 1, contexts: ['test'], example: 'b.ts', resolvable: true, version: '1.0.0' }],
  })]));
  const r = rulesOf(fs);
  assert.ok(r.includes('DC-UNDECLARED:ghost:P0'));
  assert.ok(r.includes('DC-UNUSED:unused-lib:P1'));
  assert.ok(r.includes('DC-DEV-IN-PROD:dev-used-in-src:P1'));
  assert.ok(r.includes('DC-PROD-TOOLING:tool-in-prod:P2'));
  assert.ok(r.includes('DC-UNDECLARED:hoisted:P2'));
  assert.ok(r.includes('DC-UNUSED:pin-only:P3'), 'a dep also pulled in by another one frees nothing');
  assert.ok(!r.some((x) => x.includes('served-by-start')), 'a bin used by `start` is a runtime use');
  assert.deepEqual(fs.map((f) => f.id), fs.map((_, i) => `F${String(i + 1).padStart(2, '0')}`));
  assert.equal(fs[0].priority, 'P0', 'sorted by priority');
});

test('rules: not installed, range mismatch, heavy, drift', () => {
  const fs = buildFindings(model([
    pkg({ dir: 'a', installed: false }),
    pkg({ dir: 'b', deps: [dep({ name: 'old', satisfies: false, installed: '0.9.0' }), dep({ name: 'big', exclusiveBytes: 30 * 1024 * 1024 }), dep({ name: 'gone', installed: null })] }),
  ], [{ name: 'zod', category: 'library', sharesSource: true, packages: [{ dir: 'b', installed: '3.25.0' }, { dir: 'c', installed: '4.0.0' }] }]));
  const r = rulesOf(fs);
  assert.ok(r.includes('DC-INSTALL:null:P0'));
  assert.ok(r.includes('DC-INSTALL:gone:P0'));
  assert.ok(r.includes('DC-RANGE:old:P1'));
  assert.ok(r.includes('DC-HEAVY:big:P2'));
  assert.ok(r.includes('DC-DRIFT:zod:P1'));
});

test('crossPackage: drift by compatibility line', () => {
  const p = (dir, installed) => ({ dir, deps: [dep({ name: 'zod', installed })] });
  const { matrix, drift } = crossPackage([p('server', '3.25.76'), p('core', '3.24.0'), p('mcp', '4.6.7')], (a, b) => [a, b].sort().join() === 'core,server');
  assert.equal(matrix.length, 1);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].sharesSource, false, 'server and core are on the same line; mcp shares no source');
  const d2 = crossPackage([p('server', '3.25.76'), p('core', '4.0.0')], () => true).drift;
  assert.equal(d2[0].sharesSource, true);
});

test('online: audit formats, outdated, grouping', () => {
  const pnpm = { advisories: { 1: { module_name: 'esbuild', severity: 'moderate', title: 't1', url: 'u', vulnerable_versions: '<=0.24.2', patched_versions: '>=0.25.0', findings: [{ dev: true, paths: ['.>vitest>vite>esbuild'] }] } } };
  assert.deepEqual(normaliseAudit(pnpm)[0], { name: 'esbuild', severity: 'moderate', title: 't1', url: 'u', range: '<=0.24.2', prod: false, fix: 'Upgrade esbuild to >=0.25.0' });
  const npm = { vulnerabilities: { next: { severity: 'critical', range: '<15.5.24', via: [{ title: 'RCE', url: 'u2' }], fixAvailable: { name: 'next', version: '15.5.24', isSemVerMajor: false } }, child: { severity: 'high', via: ['next'] } } };
  const n = normaliseAudit(npm, new Set(['next']));
  assert.equal(n.length, 1, 'entries that only point at another vulnerable package are skipped');
  assert.equal(n[0].prod, true);
  const o = normaliseOutdated({ a: { current: '0.43.0', latest: '0.51.3', dependencyType: 'dependencies' }, b: { current: '2.1.9', latest: '5.1.1' }, c: { current: '1.0.0', latest: '1.2.0' } }, new Set(['b']));
  assert.deepEqual(o.map((x) => [x.name, x.majorsBehind, x.dev]), [['a', 1, false], ['b', 3, true], ['c', 0, false]]);
  const g = groupVulns([{ name: 'x', severity: 'moderate', title: 'a', prod: false }, { name: 'x', severity: 'critical', title: 'b', url: 'u', prod: true }]);
  assert.deepEqual([g[0].severity, g[0].count, g[0].prod, g[0].url], ['critical', 2, true, 'u']);
});

// ---------- render ----------
test('render: mermaid labels are escaped, hotspots group by dependency', () => {
  assert.equal(fmtBytes(1536), '2 KB');
  assert.equal(fmtBytes(5 * 1024 * 1024), '5.0 MB');
  const p = pkg({ dir: 'client', name: 'web"<x>', deps: [dep({ name: '@a/b"c', installed: '1.0.0', closureBytes: 10 })] });
  const d = packageDiagram(p, new Map(), 5);
  assert.ok(d.includes('web#quot;#lt;x#gt;') && d.includes('@a/b#quot;c'));
  assert.ok(!/\["[^"\]]*"[^"\]]*"\]/.test(d.replace(/#quot;/g, '')), 'no raw quote inside a label');
  const m = componentMap({ packages: [p], internal: { nodes: [{ id: 'pkg:client', kind: 'package', dir: 'client' }], edges: [] } });
  assert.ok(m.startsWith('```mermaid\nflowchart LR'));
  const h = hotspots([
    { id: 'F01', priority: 'P0', rule: 'DC-VULN', package: 'client', dep: 'zod' },
    { id: 'F02', priority: 'P2', rule: 'DC-DRIFT', package: 'client, mcp', dep: 'zod' },
    { id: 'F03', priority: 'P1', rule: 'DC-UNUSED', package: 'server', dep: 'lonely' },
  ]);
  assert.deepEqual(h.map((x) => [x.dep, x.worst, x.packages.length]), [['zod', 'P0', 2]]);
});
