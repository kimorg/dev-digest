// Finding rules. Pure: take the collected model, return findings with a default priority.
// The catalogue (what each rule means, false positives, how to fix) is
// references/rules.md — keep the two in sync (ids, priorities, thresholds).
import { line } from './semver.mjs';

export const THRESHOLDS = {
  heavyProdBytes: 20 * 1024 * 1024, // exclusive footprint of one runtime dependency
  heavyDevBytes: 50 * 1024 * 1024, // exclusive footprint of one dev/tooling dependency
  duplicateBytes: 5 * 1024 * 1024, // extra bytes from a package installed in 2+ versions
};

export const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3'];

export const RULES = {
  'DC-INSTALL': 'Package or dependency not installed',
  'DC-RANGE': 'Installed version outside the declared range',
  'DC-BROKEN-TREE': 'Transitive dependency missing from the installed tree',
  'DC-UNDECLARED': 'Imported but not declared (phantom dependency)',
  'DC-UNUSED': 'Declared but never used',
  'DC-WEAK-USE': 'Only referenced as a string — verify',
  'DC-DEV-IN-PROD': 'devDependency imported by production code',
  'DC-PROD-TOOLING': 'Runtime dependency used only by tests, config or tooling',
  'DC-TYPE-ONLY': 'Runtime dependency imported only for types',
  'DC-DRIFT': 'Different versions of one dependency across packages',
  'DC-DUPLICATE': 'Same package installed in several versions',
  'DC-HEAVY': 'Heavy dependency (large exclusive footprint)',
  'DC-LICENSE': 'License needs a look',
  'DC-NATIVE': 'Native binaries or install scripts in the tree',
  'DC-LOOSE-RANGE': 'Unbounded or non-registry version spec',
  'DC-VULN': 'Known vulnerability (npm advisory)',
  'DC-OUTDATED': 'Major version(s) behind latest',
  'DC-DEPRECATED': 'Deprecated by its maintainers',
};

const MB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const lower = (p) => PRIORITY_ORDER[Math.min(PRIORITY_ORDER.indexOf(p) + 1, 3)];

export function buildFindings(model) {
  const out = [];
  const add = (f) => out.push({ dep: null, bytes: 0, ...f, title: RULES[f.rule] });

  for (const pkg of model.packages) {
    const P = pkg.dir;
    if (!pkg.installed) {
      add({ rule: 'DC-INSTALL', priority: 'P0', package: P, evidence: `${P}/node_modules is missing — sizes, usage of installed bins and the tree were not measured`, fix: `cd ${P} && ${pkg.pm} install` });
      continue;
    }
    for (const d of pkg.deps) {
      if (d.section === 'peer') continue;
      if (!d.installed) {
        if (d.section !== 'optional') add({ rule: 'DC-INSTALL', priority: 'P0', package: P, dep: d.name, evidence: `declared ${d.declared} in ${d.section}, not resolvable from ${P}/node_modules`, fix: `cd ${P} && ${pkg.pm} install` });
        continue;
      }
      if (d.satisfies === false) add({ rule: 'DC-RANGE', priority: 'P1', package: P, dep: d.name, evidence: `declared ${d.declared}, installed ${d.installed}`, fix: `cd ${P} && ${pkg.pm} install (lockfile and node_modules disagree with package.json)` });
      if (d.looseSpec) add({ rule: 'DC-LOOSE-RANGE', priority: d.looseSpec === 'non-registry' ? 'P3' : 'P2', package: P, dep: d.name, evidence: `"${d.name}": "${d.declared}" (${d.looseSpec})`, fix: d.looseSpec === 'non-registry' ? 'Prefer a published registry version, or document why the non-registry source is needed' : `Use a caret range on the installed version: "^${d.installed}"` });

      const u = d.usage;
      if (d.status === 'unused') {
        const pulled = d.alsoPulledBy?.length ? `; also installed as a dependency of ${d.alsoPulledBy.slice(0, 3).join(', ')} — removing it frees nothing, it only pins the version` : '';
        add({ rule: 'DC-UNUSED', priority: pulled ? 'P3' : d.section === 'prod' ? 'P1' : 'P2', package: P, dep: d.name, bytes: d.exclusiveBytes, evidence: `no import, bin, config string, peer or @types use found in ${P} (${d.section}, exclusive ${MB(d.exclusiveBytes)})${pulled}`, fix: pulled ? `Remove unless the explicit pin is intended (then say so in a comment/README): cd ${P} && ${pkg.pm} remove ${d.name}` : `cd ${P} && ${pkg.pm} remove ${d.name}` });
      } else if (d.status === 'indirect' && u.stringRefs > 0 && !u.peerOf.length && !u.typesForUsed) {
        add({ rule: 'DC-WEAK-USE', priority: 'P3', package: P, dep: d.name, evidence: `only a string literal '${d.name}' in ${u.stringRefs} file(s) — plugin/transport/environment name?`, fix: 'Confirm the string loads the package (config plugin, transport, test environment); remove the dependency if not' });
      }
      if (d.section === 'dev' && u.valueFiles.src > 0) {
        add({ rule: 'DC-DEV-IN-PROD', priority: pkg.runtimeStart ? 'P1' : 'P3', package: P, dep: d.name, evidence: `${u.valueFiles.src} production file(s) import it at runtime, e.g. ${u.examples.src ?? '?'}`, fix: `Move to dependencies: cd ${P} && ${pkg.pm} add ${d.name}` });
      }
      if (d.section === 'prod' && d.status === 'used' && u.valueFiles.src === 0 && u.typeFiles.src === 0 && !u.runtimeBins.length) {
        const where = [u.valueFiles.test && 'tests', u.valueFiles.config && 'config', u.valueFiles.style && 'stylesheets', u.valueFiles.script && 'scripts', u.bins.length && `npm scripts (${u.bins.flatMap((b) => b.scripts).join(', ')})`].filter(Boolean).join(', ');
        add({ rule: 'DC-PROD-TOOLING', priority: 'P2', package: P, dep: d.name, bytes: d.exclusiveBytes, evidence: `used only by ${where || 'non-production code'}; ships with a production install (exclusive ${MB(d.exclusiveBytes)})`, fix: `Move to devDependencies: cd ${P} && ${pkg.pm} add -D ${d.name}` });
      }
      if (d.section === 'prod' && d.category === 'library' && u.valueFiles.src === 0 && u.typeFiles.src > 0 && !u.runtimeBins.length && Object.values(u.valueFiles).every((n) => n === 0)) {
        add({ rule: 'DC-TYPE-ONLY', priority: 'P3', package: P, dep: d.name, evidence: `${u.typeFiles.src} file(s) import it with \`import type\` only`, fix: 'Keep in dependencies only if its types appear in this package\'s public API; otherwise move to devDependencies' });
      }
      const heavyLimit = d.section === 'prod' && d.category === 'library' ? THRESHOLDS.heavyProdBytes : THRESHOLDS.heavyDevBytes;
      if (d.exclusiveBytes >= heavyLimit) {
        add({ rule: 'DC-HEAVY', priority: heavyLimit === THRESHOLDS.heavyProdBytes ? 'P2' : 'P3', package: P, dep: d.name, bytes: d.exclusiveBytes, evidence: `exclusive ${MB(d.exclusiveBytes)} (${d.exclusiveCount} packages only it pulls in), closure ${MB(d.closureBytes)}${u.clientFiles ? `; imported by ${u.clientFiles} 'use client' file(s) → browser bundle` : ''}`, fix: 'Check whether a lighter alternative, a sub-path import or lazy loading (dynamic import) covers the use' });
      }
      if (d.deprecated) add({ rule: 'DC-DEPRECATED', priority: d.section === 'prod' ? 'P1' : 'P2', package: P, dep: d.name, evidence: `installed ${d.installed}: "${String(d.deprecated).slice(0, 140)}"`, fix: 'Follow the deprecation notice (replacement package or new major)' });
    }

    for (const u of pkg.undeclared) {
      const prodish = u.contexts.includes('src');
      const priority = !u.resolvable ? (prodish ? 'P0' : 'P1') : prodish ? 'P1' : 'P2';
      add({ rule: 'DC-UNDECLARED', priority, package: P, dep: u.name, evidence: `${u.files} file(s) (${u.contexts.join(', ')}), e.g. ${u.example}; ${u.resolvable ? `resolves only by hoisting (installed ${u.version})` : 'NOT resolvable — breaks at runtime/compile time'}`, fix: `cd ${P} && ${pkg.pm} add ${prodish ? '' : '-D '}${u.name}` });
    }

    for (const m of pkg.missingTransitive) {
      add({ rule: 'DC-BROKEN-TREE', priority: 'P1', package: P, dep: m.name, evidence: `${m.from} depends on ${m.name}, which is not installed`, fix: `cd ${P} && rm -rf node_modules && ${pkg.pm} install` });
    }

    for (const dup of pkg.duplicates.filter((x) => x.extraBytes >= THRESHOLDS.duplicateBytes)) {
      add({ rule: 'DC-DUPLICATE', priority: 'P2', package: P, dep: dup.name, bytes: dup.extraBytes, evidence: `${dup.versions.map((v) => v.version).join(', ')} installed; +${MB(dup.extraBytes)} for the extra copies`, fix: `See who pulls each copy (\`${pkg.pm === 'pnpm' ? 'pnpm why' : 'npm explain'} ${dup.name}\`); align ranges or add an override` });
    }
    const smallDups = pkg.duplicates.filter((x) => x.extraBytes < THRESHOLDS.duplicateBytes);
    if (smallDups.length) {
      const extra = smallDups.reduce((s, x) => s + x.extraBytes, 0);
      add({ rule: 'DC-DUPLICATE', priority: 'P3', package: P, bytes: extra, evidence: `${smallDups.length} more package(s) in 2+ versions, +${MB(extra)} total: ${smallDups.slice(0, 5).map((x) => `${x.name} (${x.versions.map((v) => v.version).join(', ')})`).join('; ')}${smallDups.length > 5 ? '; …' : ''}`, fix: `\`${pkg.pm} dedupe\` and re-check` });
    }

    const lic = pkg.licenses.flagged;
    const byClass = (cls, prod) => lic.filter((l) => l.class === cls && l.prod === prod);
    const licRule = (cls, prod, priority) => {
      const hits = byClass(cls, prod);
      if (hits.length) add({ rule: 'DC-LICENSE', priority, package: P, evidence: `${cls} in the ${prod ? 'production' : 'dev-only'} tree: ${hits.slice(0, 6).map((l) => `${l.name}@${l.version} (${l.license})`).join(', ')}${hits.length > 6 ? `, +${hits.length - 6} more` : ''}`, fix: cls === 'unknown' ? 'Read the package LICENSE file; record the result' : 'Check that the license fits how the code is distributed (legal sign-off for copyleft in shipped code)' });
    };
    licRule('strong-copyleft', true, 'P1');
    licRule('unknown', true, 'P2');
    licRule('weak-copyleft', true, 'P3');
    licRule('strong-copyleft', false, 'P3');

    if (pkg.native.length) {
      add({ rule: 'DC-NATIVE', priority: 'P3', package: P, evidence: pkg.native.slice(0, 8).map((n) => `${n.name}@${n.version}${n.installScripts.length ? ` [${n.installScripts.join('/')}]` : ''}${n.native ? ' [native]' : ''}`).join(', ') + (pkg.native.length > 8 ? `, +${pkg.native.length - 8} more` : ''), fix: pkg.pm === 'pnpm' ? 'Keep the allowBuilds / onlyBuiltDependencies list in pnpm-workspace.yaml explicit; platform-specific packages need CI on the same OS/arch' : 'Review install scripts (`npm query ":attr(scripts, [postinstall])"`); consider `ignore-scripts=true` with an allowlist' });
    }

    if (pkg.online) {
      for (const g of groupVulns(pkg.online.vulns)) {
        const base = { critical: 'P0', high: 'P0', moderate: 'P1', low: 'P2', info: 'P3' }[g.severity] ?? 'P2';
        const direct = pkg.deps.some((d) => d.name === g.name);
        add({ rule: 'DC-VULN', priority: g.prod === false ? lower(base) : base, package: P, dep: g.name, evidence: `${g.count} advisor${g.count > 1 ? 'ies' : 'y'}, worst ${g.severity}${g.prod === false ? ', dev-only tree' : g.prod ? ', production tree' : ''}${direct ? ', direct dependency' : ', transitive'}: ${g.titles.slice(0, 3).join('; ')}${g.count > 3 ? '; …' : ''}${g.url ? ` — ${g.url}` : ''}`, fix: g.fix ?? (direct ? `Upgrade: \`${pkg.pm} update ${g.name}\`` : `Upgrade the parent that pulls it in, or pin a patched version with ${pkg.pm === 'pnpm' ? '`pnpm.overrides`' : '`overrides`'}`) });
      }
      for (const o of pkg.online.outdated) {
        if (o.majorsBehind > 0) {
          const d = pkg.deps.find((x) => x.name === o.name);
          const runtimeLib = d?.category === 'library' && d.section !== 'dev';
          const priority = o.name === '@types/node' || d?.category === 'types' ? 'P3' : runtimeLib ? (o.majorsBehind >= 2 ? 'P1' : 'P2') : o.majorsBehind >= 2 ? 'P2' : 'P3';
          const note = o.name === '@types/node' ? ' — @types/node should follow the Node major you run, not npm latest' : '';
          add({ rule: 'DC-OUTDATED', priority, package: P, dep: o.name, evidence: `installed ${o.current}, latest ${o.latest} (${o.majorsBehind} breaking release${o.majorsBehind > 1 ? 's' : ''} behind)${note}`, fix: o.name === '@types/node' ? 'Keep on the major of the Node runtime (engines / .nvmrc); bump together with Node' : `Read the changelog, then \`${pkg.pm} add ${o.dev ? '-D ' : ''}${o.name}@^${o.latest}\`` });
        }
        if (o.deprecated && !pkg.deps.find((d) => d.name === o.name)?.deprecated) add({ rule: 'DC-DEPRECATED', priority: o.dev ? 'P2' : 'P1', package: P, dep: o.name, evidence: `${o.name}@${o.current} is marked deprecated in the registry`, fix: 'Find the replacement named in the npm page / README' });
      }
    }
  }

  for (const drift of model.cross.drift) {
    const lib = drift.category === 'library';
    add({ rule: 'DC-DRIFT', priority: lib ? (drift.sharesSource ? 'P1' : 'P2') : 'P3', package: drift.packages.map((p) => p.dir).join(', '), dep: drift.name, evidence: `${drift.packages.map((p) => `${p.dir}: ${p.installed ?? p.declared}`).join(' · ')}${drift.sharesSource ? ' — these packages share source via tsconfig aliases' : ''}`, fix: drift.sharesSource ? 'Align on one major (same range in every package); shared source compiled against two majors breaks types or runtime' : 'Align ranges when you next touch these packages (one upgrade, one test pass)' });
  }

  out.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || b.bytes - a.bytes || a.rule.localeCompare(b.rule) || String(a.package).localeCompare(String(b.package)) || String(a.dep).localeCompare(String(b.dep)));
  return out.map((f, i) => ({ id: `F${String(i + 1).padStart(2, '0')}`, ...f }));
}

const SEVERITY = ['info', 'low', 'moderate', 'high', 'critical'];

/** One entry per vulnerable package: worst severity, all advisory titles, prod if any path is prod. */
export function groupVulns(vulns) {
  const by = new Map();
  for (const v of vulns) {
    const g = by.get(v.name) ?? { name: v.name, severity: 'info', count: 0, titles: [], url: null, prod: null, fixes: new Set() };
    g.count++;
    if (SEVERITY.indexOf(v.severity) > SEVERITY.indexOf(g.severity)) {
      g.severity = v.severity;
      g.url = v.url ?? g.url;
    }
    g.url ??= v.url;
    if (v.title && !g.titles.includes(v.title)) g.titles.push(v.title);
    g.prod = v.prod === true || g.prod === true ? true : v.prod === false && g.prod !== true ? false : g.prod;
    if (v.fix) g.fixes.add(v.fix);
    by.set(v.name, g);
  }
  return [...by.values()].map(({ fixes, ...g }) => ({ ...g, fix: fixes.size ? [...fixes].slice(-1)[0] : null }));
}

/** Cross-package version matrix and drift (by compatibility line: major, or 0.minor). */
export function crossPackage(packages, sharesSource) {
  const byName = new Map();
  for (const pkg of packages) {
    for (const d of pkg.deps) {
      if (d.section === 'peer') continue;
      if (!byName.has(d.name)) byName.set(d.name, { name: d.name, category: d.category, packages: [] });
      byName.get(d.name).packages.push({ dir: pkg.dir, declared: d.declared, installed: d.installed, section: d.section });
    }
  }
  const matrix = [...byName.values()].filter((e) => e.packages.length > 1).sort((a, b) => b.packages.length - a.packages.length || a.name.localeCompare(b.name));
  const drift = [];
  for (const e of matrix) {
    const lines = new Set(e.packages.map((p) => line(p.installed ?? '') ?? `declared ${p.declared}`));
    if (lines.size > 1) {
      const dirs = e.packages.map((p) => p.dir);
      const linked = dirs.some((a) => dirs.some((b) => a !== b && sharesSource(a, b) && lineOf(e, a) !== lineOf(e, b)));
      drift.push({ ...e, lines: [...lines], sharesSource: linked });
    }
  }
  return { matrix, drift };
}

function lineOf(entry, dir) {
  const p = entry.packages.find((x) => x.dir === dir);
  return line(p?.installed ?? '') ?? p?.declared;
}
