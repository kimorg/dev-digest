#!/usr/bin/env node
// dependencies-checker collector: scans every package of the repo and writes
//   --json <file>  the model (schema 1) — facts + default-priority findings
//   --md   <file>  the report skeleton (tables + Mermaid) with <!-- AGENT:* --> slots
// Read-only and offline unless --online. Usage:
//   node .claude/skills/dependencies-checker/scripts/collect.mjs --json t/deps.json --md t/deps.md
//        [--packages server,client] [--online] [--top 12] [--root <repo>] [--quiet]
// Without --json / --md the JSON model goes to stdout. All options: SKILL.md § Usage.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { onlineChecks } from './lib/online.mjs';
import { renderReport } from './lib/render.mjs';
import { THRESHOLDS, buildFindings, crossPackage } from './lib/rules.mjs';
import { createScanner, readJson } from './lib/scan.mjs';
import { isNonRegistry, satisfies } from './lib/semver.mjs';
import { CODE_EXT, RUNTIME_SCRIPTS, STYLE_EXT, binsOf, categoryOf, extractImports, fileContext, isClientComponent, licenseClass, packageOf, scriptsUsingBin, stringRefs, typesTarget } from './lib/usage.mjs';

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(name);
if (flag('--help') || flag('-h')) {
  const lines = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1);
  console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith('//'))).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const ROOT = resolve(opt('--root') ?? execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const ONLINE = flag('--online');
const TOP = Number(opt('--top', '12'));
const ONLY = opt('--packages')?.split(',').map((s) => s.trim().replace(/\/$/, ''));
const log = (...m) => !flag('--quiet') && console.error(...m);

// ---------- discovery ----------
const EXCLUDE_PKG = /(^|\/)(node_modules|fixtures|clones)\/|^\.claude\/|^\.cursor\//;
const allPackageDirs = git('ls-files', '-z', '--', '*package.json', 'package.json').split('\0').filter(Boolean)
  .filter((f) => basename(f) === 'package.json' && !EXCLUDE_PKG.test(f))
  .map((f) => dirname(f)).filter((d) => d !== '.').sort();
const packageDirs = ONLY ? allPackageDirs.filter((d) => ONLY.includes(d)) : allPackageDirs;
if (ONLY && packageDirs.length !== ONLY.length) {
  console.error(`unknown package(s): ${ONLY.filter((d) => !allPackageDirs.includes(d)).join(', ')} — known: ${allPackageDirs.join(', ')}`);
  process.exit(2);
}
const ownerOf = (relPath) => allPackageDirs.filter((d) => relPath === d || relPath.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0] ?? null;

const tracked = git('ls-files', '-z', '-co', '--exclude-standard').split('\0').filter(Boolean);

function readTsconfigPaths(dir) {
  const file = join(ROOT, dir, 'tsconfig.json');
  if (!existsSync(file)) return {};
  const text = readFileSync(file, 'utf8').replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, s) => s ?? '').replace(/,(\s*[}\]])/g, '$1');
  try {
    const cfg = JSON.parse(text);
    const base = cfg.compilerOptions?.baseUrl ?? '.';
    return Object.fromEntries(Object.entries(cfg.compilerOptions?.paths ?? {}).map(([k, v]) => [k, (v ?? []).map((t) => join(dir, base, t))]));
  } catch {
    return {};
  }
}

// ---------- per package ----------
const DEP_SECTIONS = [['dependencies', 'prod'], ['optionalDependencies', 'optional'], ['devDependencies', 'dev'], ['peerDependencies', 'peer']];
const aliasEdges = new Map(); // `${from}→${targetDir}` → { from, targetDir, alias, files:Set }
const portRefs = []; // { from, port, file }
const portOwners = new Map(); // port → package dir

function scanPackage(dir) {
  const abs = join(ROOT, dir);
  const manifest = readJson(join(abs, 'package.json')) ?? {};
  const pm = existsSync(join(abs, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(abs, 'yarn.lock')) ? 'yarn' : 'npm';
  const lockfile = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json'].find((f) => existsSync(join(abs, f))) ?? null;
  const installed = existsSync(join(abs, 'node_modules'));
  const scanner = installed ? createScanner(abs) : null;
  const scripts = manifest.scripts ?? {};
  log(`· ${dir} (${pm}${installed ? '' : ', not installed'})`);

  // declared deps (first section wins: prod > optional > dev > peer)
  const declared = new Map();
  for (const [field, section] of DEP_SECTIONS) for (const [name, spec] of Object.entries(manifest[field] ?? {})) if (!declared.has(name)) declared.set(name, { name, section, declared: String(spec) });
  const declaredNames = new Set(declared.keys());

  // ports this package serves
  for (const cmd of Object.values(scripts)) for (const m of String(cmd).matchAll(/(?:\s-p|--port)[\s=]+(\d{2,5})\b/g)) portOwners.set(m[1], dir);

  // source files
  const aliases = readTsconfigPaths(dir);
  const aliasKeys = Object.keys(aliases).map((k) => ({ key: k, prefix: k.endsWith('/*') ? k.slice(0, -1) : null, exact: k.endsWith('/*') ? null : k, targets: aliases[k] }));
  const matchAlias = (spec) => aliasKeys.find((a) => (a.exact && spec === a.exact) || (a.prefix && spec.startsWith(a.prefix)));
  const files = tracked.filter((f) => ownerOf(f) === dir && (CODE_EXT.test(f) || STYLE_EXT.test(f)) && !f.includes('/node_modules/'));
  const usage = new Map([...declaredNames].map((n) => [n, { valueFiles: { src: 0, test: 0, config: 0, script: 0, style: 0 }, typeFiles: { src: 0, test: 0, config: 0, script: 0, style: 0 }, examples: {}, clientFiles: 0, stringRefs: 0 }]));
  const undeclared = new Map();
  let tsFiles = 0;

  for (const f of files) {
    let text;
    try {
      if (statSync(join(ROOT, f)).size > 2 * 1024 * 1024) continue;
      text = readFileSync(join(ROOT, f), 'utf8');
    } catch {
      continue;
    }
    if (/\.[cm]?tsx?$/.test(f)) tsFiles++;
    const rel = relative(dir, f);
    const ctx = fileContext(rel);
    const client = isClientComponent(text);
    const perFile = new Map(); // pkg → { value:boolean }
    for (const { spec, typeOnly } of extractImports(text, f)) {
      const alias = matchAlias(spec);
      // an alias into node_modules (e.g. "zod": ["./node_modules/zod"]) is still a package import
      if (alias && !alias.targets.some((t) => t.includes('node_modules'))) {
        for (const t of alias.targets.slice(0, 1)) {
          const targetDir = t.replace(/\/\*$/, '').replace(/\/index\.[cm]?[jt]sx?$/, '').replace(/\.[cm]?[jt]sx?$/, '');
          const key = `${dir}→${targetDir}`;
          if (!aliasEdges.has(key)) aliasEdges.set(key, { from: dir, targetDir, alias: alias.exact ?? alias.prefix.replace(/\/$/, ''), files: new Set() });
          aliasEdges.get(key).files.add(f);
        }
        continue;
      }
      const name = packageOf(spec);
      if (!name || name === manifest.name) continue;
      const prev = perFile.get(name) ?? { value: false };
      perFile.set(name, { value: prev.value || !typeOnly, spec });
    }
    for (const [name, { value, spec }] of perFile) {
      if (usage.has(name)) {
        const u = usage.get(name);
        (value ? u.valueFiles : u.typeFiles)[ctx]++;
        u.examples[ctx === 'src' ? 'src' : 'other'] ??= f;
        if (client && value) u.clientFiles++;
      } else if (!name.startsWith('@types/')) {
        const und = undeclared.get(name) ?? { name, files: 0, contexts: new Set(), example: `${f} → '${spec}'` };
        und.files++;
        und.contexts.add(ctx);
        undeclared.set(name, und);
      }
    }
    // a package name as a string in a config file is a plugin / preset / environment → config use
    for (const n of stringRefs(text, declaredNames)) {
      if (perFile.has(n)) continue;
      if (ctx === 'config') usage.get(n).valueFiles.config++;
      else usage.get(n).stringRefs++;
    }
    const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of noComments.matchAll(/(?:localhost|127\.0\.0\.1):(\d{2,5})\b/g)) if (ctx !== 'test') portRefs.push({ from: dir, port: m[1], file: f });
    if (ctx !== 'test') for (const l of noComments.split('\n')) {
      if (/:\/\//.test(l)) continue;
      const m = /(?:\b[Pp]ort|_PORT|_port|[a-z]Port|\bPORT)\b[^\n]{0,60}?\b(\d{4,5})\b/.exec(l);
      if (m && !portOwners.has(m[1])) portOwners.set(m[1], dir);
    }
  }

  // installed tree
  const directNodes = new Map(); // name → realdir
  for (const d of declared.values()) {
    if (d.section === 'peer' || !scanner) continue;
    const r = scanner.resolve(scanner.root, d.name);
    if (r) directNodes.set(d.name, r);
  }
  const closures = new Map();
  const reach = new Map(); // node key → count of direct deps reaching it
  const missingTransitive = [];
  for (const [name, dirReal] of directNodes) {
    const c = scanner.closure(dirReal);
    closures.set(name, c.keys);
    for (const k of c.keys) reach.set(k, (reach.get(k) ?? 0) + 1);
    missingTransitive.push(...c.missing);
  }
  const nodeInfo = new Map();
  const info = (k) => {
    if (!nodeInfo.has(k)) nodeInfo.set(k, scanner.node(k));
    return nodeInfo.get(k);
  };
  const sum = (keys) => [...keys].reduce((s, k) => s + info(k).bytes, 0);

  const deps = [];
  for (const d of declared.values()) {
    const real = directNodes.get(d.name);
    const m = real ? scanner.manifest(real) : null;
    const keys = closures.get(d.name) ?? new Set();
    const exclusive = [...keys].filter((k) => reach.get(k) === 1);
    const u = usage.get(d.name);
    const bins = m ? binsOf(m).map((bin) => ({ bin, scripts: scriptsUsingBin(scripts, bin) })).filter((b) => b.scripts.length) : [];
    const runtimeBins = bins.filter((b) => b.scripts.some((s) => RUNTIME_SCRIPTS.has(s))).map((b) => b.bin);
    const peerOf = [...directNodes].filter(([n, r]) => n !== d.name && scanner.manifest(r)?.peerDependencies?.[d.name] !== undefined).map(([n]) => n);
    const typesFor = typesTarget(d.name);
    const typesForUsed = typesFor ? (typesFor === 'node' ? tsFiles > 0 : (usage.get(typesFor) && sumFiles(usage.get(typesFor)) > 0) || (declaredNames.has(typesFor) && d.name !== typesFor)) : false;
    const direct = sumFiles(u) > 0 || bins.length > 0;
    const indirect = u.stringRefs > 0 || peerOf.length > 0 || typesForUsed;
    const alsoPulledBy = real ? [...closures].filter(([n, ks]) => n !== d.name && ks.has(real)).map(([n]) => n) : [];
    const looseSpec = isNonRegistry(d.declared) ? 'non-registry' : /^(\*|x|latest|>=?\s*[\d.]+)$/i.test(d.declared.trim()) ? 'unbounded' : null;
    deps.push({
      ...d,
      category: categoryOf(d.name),
      installed: m?.version ?? null,
      satisfies: m ? satisfies(m.version, d.declared) : null,
      looseSpec,
      description: m?.description ?? null,
      license: m ? info(real).license : null,
      deprecated: m && typeof m.deprecated === 'string' ? m.deprecated : null,
      own: real ? info(real).bytes : 0,
      closureBytes: sum(keys),
      closureCount: keys.size,
      exclusiveBytes: sum(exclusive),
      exclusiveCount: exclusive.length,
      nativeInClosure: [...keys].some((k) => info(k).native || info(k).installScripts.length),
      alsoPulledBy,
      usage: { ...u, bins, runtimeBins, peerOf, typesFor, typesForUsed },
      status: direct ? 'used' : indirect ? 'indirect' : 'unused',
    });
  }

  // package totals, duplicates, licenses, native
  const union = (pred) => new Set(deps.filter(pred).flatMap((d) => [...(closures.get(d.name) ?? [])]));
  const prodKeys = union((d) => d.section === 'prod' || d.section === 'optional');
  const allKeys = union(() => true);
  const byName = new Map();
  for (const k of allKeys) {
    const n = info(k);
    if (!byName.has(n.name)) byName.set(n.name, new Map());
    const vs = byName.get(n.name);
    vs.set(n.version, (vs.get(n.version) ?? 0) + n.bytes);
  }
  const duplicates = [...byName].filter(([, vs]) => vs.size > 1).map(([name, vs]) => {
    const versions = [...vs].map(([version, bytes]) => ({ version, bytes })).sort((a, b) => b.bytes - a.bytes);
    return { name, versions, extraBytes: versions.slice(1).reduce((s, v) => s + v.bytes, 0) };
  }).sort((a, b) => b.extraBytes - a.extraBytes);
  const licenseCounts = {};
  const flagged = [];
  for (const k of allKeys) {
    const n = info(k);
    licenseCounts[n.license] = (licenseCounts[n.license] ?? 0) + 1;
    const cls = licenseClass(n.license);
    if (cls !== 'permissive') flagged.push({ name: n.name, version: n.version, license: n.license, class: cls, prod: prodKeys.has(k) });
  }
  const native = [...allKeys].map(info).filter((n) => n.native || n.installScripts.length).map((n) => ({ name: n.name, version: n.version, native: n.native, installScripts: n.installScripts })).sort((a, b) => a.name.localeCompare(b.name));
  const seenMissing = new Set();

  const devNames = new Set(deps.filter((d) => d.section === 'dev').map((d) => d.name));
  let online = null;
  if (ONLINE && installed) {
    log(`  online: ${pm} audit + outdated …`);
    online = onlineChecks(pm, abs, devNames);
    for (const e of online.errors) log(`  ! ${e}`);
  }

  return {
    dir,
    name: manifest.name ?? dir,
    description: manifest.description ?? null,
    pm,
    lockfile,
    installed,
    runtimeStart: Object.keys(scripts).some((s) => RUNTIME_SCRIPTS.has(s)),
    sourceFiles: files.length,
    deps,
    undeclared: [...undeclared.values()].map((u) => {
      const r = scanner?.resolve(scanner.root, u.name);
      return { ...u, contexts: [...u.contexts].sort(), resolvable: Boolean(r), version: r ? scanner.manifest(r)?.version ?? null : null };
    }).sort((a, b) => b.files - a.files),
    totals: {
      direct: { prod: deps.filter((d) => d.section === 'prod' || d.section === 'optional').length, dev: deps.filter((d) => d.section === 'dev').length },
      prodCount: prodKeys.size,
      prodBytes: scanner ? sum(prodKeys) : 0,
      allCount: allKeys.size,
      allBytes: scanner ? sum(allKeys) : 0,
    },
    duplicates,
    licenses: { counts: licenseCounts, flagged },
    native,
    missingTransitive: missingTransitive.filter((m) => !seenMissing.has(`${m.from}>${m.name}`) && seenMissing.add(`${m.from}>${m.name}`)),
    online,
  };
}

function sumFiles(u) {
  return Object.values(u.valueFiles).reduce((a, b) => a + b, 0) + Object.values(u.typeFiles).reduce((a, b) => a + b, 0);
}

// ---------- infra from compose files ----------
function composeServices() {
  const out = new Map();
  for (const f of tracked.filter((x) => /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(x) && !EXCLUDE_PKG.test(x))) {
    let text;
    try {
      text = readFileSync(join(ROOT, f), 'utf8');
    } catch {
      continue;
    }
    const svc = /^services:\s*\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m.exec(text)?.[1] ?? '';
    for (const block of svc.split(/^(?= {2}[\w.-]+:\s*$)/m)) {
      const name = /^ {2}([\w.-]+):\s*$/m.exec(block)?.[1];
      if (!name) continue;
      const image = /^\s+image:\s*["']?([^"'\s]+)/m.exec(block)?.[1] ?? null;
      for (const p of block.matchAll(/^\s+-\s*["']?(?:[\d.]+:)?(\d{2,5}):\d{2,5}/gm)) if (!out.has(p[1])) out.set(p[1], { name, image, file: f });
    }
  }
  return out;
}

// ---------- main ----------
const t0 = Date.now();
const packages = packageDirs.map(scanPackage);
const services = composeServices();

const nodes = packages.map((p) => ({ id: `pkg:${p.dir}`, kind: 'package', dir: p.dir, label: p.dir }));
const edges = [];
const pkgNodeOf = (relDir) => {
  const owner = ownerOf(relDir);
  if (!owner) return null;
  // the owner's whole source root (e.g. reviewer-core/src) means "that package"
  if (relDir === owner || relDir === `${owner}/src`) return { id: `pkg:${owner}`, owner };
  return { id: `vend:${relDir}`, owner, vendored: true };
};
const vendoredAliases = new Map(); // alias → Set(vendored node ids)
for (const e of aliasEdges.values()) {
  if (e.targetDir.includes('node_modules')) continue;
  const target = pkgNodeOf(e.targetDir);
  if (!target || target.id === `pkg:${e.from}`) continue; // self alias such as @/* → ./src/*
  if (target.vendored && !nodes.some((n) => n.id === target.id)) nodes.push({ id: target.id, kind: 'vendored', dir: e.targetDir, label: e.targetDir });
  if (!packages.some((p) => p.dir === target.owner) && !nodes.some((n) => n.id === `pkg:${target.owner}`)) nodes.push({ id: `pkg:${target.owner}`, kind: 'package', dir: target.owner, label: target.owner });
  if (target.vendored) {
    if (!vendoredAliases.has(e.alias)) vendoredAliases.set(e.alias, new Set());
    vendoredAliases.get(e.alias).add(target.id);
  }
  edges.push({ from: `pkg:${e.from}`, to: target.id, kind: 'alias', label: `${e.alias} · ${e.files.size} files`, files: e.files.size });
}
for (const [alias, ids] of vendoredAliases) {
  const list = [...ids];
  for (let i = 1; i < list.length; i++) edges.push({ from: list[0], to: list[i], kind: 'copy', label: `two copies of ${alias}` });
}
const runtimeSeen = new Set();
for (const r of portRefs) {
  const ownerPkg = portOwners.get(r.port);
  const svc = services.get(r.port);
  let to;
  let kind = 'http';
  if (ownerPkg && ownerPkg !== r.from) to = `pkg:${ownerPkg}`;
  else if (svc) {
    to = `infra:${svc.name}`;
    kind = 'tcp';
    if (!nodes.some((n) => n.id === to)) nodes.push({ id: to, kind: 'infra', label: `${svc.name} · ${svc.image ?? 'container'} · :${r.port}` });
  } else if (!ownerPkg) {
    to = `ext:${r.port}`;
    if (!nodes.some((n) => n.id === to)) nodes.push({ id: to, kind: 'external', label: `localhost:${r.port}` });
  } else continue;
  const key = `${r.from}→${to}`;
  if (runtimeSeen.has(key)) continue;
  runtimeSeen.add(key);
  edges.push({ from: `pkg:${r.from}`, to, kind, label: `${kind === 'tcp' ? 'TCP' : 'HTTP'} :${r.port}`, example: r.file });
}

// packages share source when one aliases into the other, or both alias into the same vendored dir
const aliasTargets = (dir) => new Set(edges.filter((e) => e.kind === 'alias' && e.from === `pkg:${dir}`).map((e) => e.to));
const sharesSource = (a, b) => {
  const ta = aliasTargets(a);
  const tb = aliasTargets(b);
  return ta.has(`pkg:${b}`) || tb.has(`pkg:${a}`) || [...ta].some((x) => tb.has(x));
};

const repoName = (() => {
  try {
    return basename(git('remote', 'get-url', 'origin').trim()).replace(/\.git$/, '');
  } catch {
    return basename(ROOT);
  }
})();
const model = {
  schema: 1,
  repo: repoName,
  generatedAt: new Date().toISOString(),
  mode: ONLINE ? 'online' : 'offline',
  git: {
    sha: git('rev-parse', '--short', 'HEAD').trim(),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD').trim(),
    dirty: git('status', '--porcelain').split('\n').filter(Boolean).length,
  },
  thresholds: THRESHOLDS,
  packages,
  internal: { nodes, edges },
  cross: crossPackage(packages, sharesSource),
};
model.findings = buildFindings(model);

const jsonOut = opt('--json');
const mdOut = opt('--md');
const write = (file, text) => {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, text);
};
if (jsonOut) write(jsonOut, `${JSON.stringify(model, null, 2)}\n`);
if (mdOut) write(mdOut, `${renderReport(model, { top: TOP })}\n`);
if (!jsonOut && !mdOut) process.stdout.write(`${JSON.stringify(model, null, 2)}\n`);

const c = ['P0', 'P1', 'P2', 'P3'].map((p) => `${p} ${model.findings.filter((f) => f.priority === p).length}`).join(' · ');
log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${packages.length} packages, ${model.findings.length} findings (${c})`);
