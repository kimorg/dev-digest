// Markdown + Mermaid rendering of the collected model. Pure: model in, string out.
// The section layout is the contract in references/report-template.md.
import { PRIORITY_ORDER, RULES } from './rules.mjs';

export function fmtBytes(b) {
  if (b == null) return '—';
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 * 1024) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

const mb = (b) => Math.round((b / 1024 / 1024) * 10) / 10;
const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const q = (s) => String(s).replace(/"/g, '#quot;').replace(/[<>]/g, (c) => (c === '<' ? '#lt;' : '#gt;'));
const id = (s) => String(s).replace(/[^A-Za-z0-9]/g, '_');
const trunc = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function usageSummary(d) {
  const u = d.usage;
  const parts = [];
  for (const ctx of ['src', 'test', 'config', 'style', 'script']) {
    const n = u.valueFiles[ctx] + u.typeFiles[ctx];
    if (n) parts.push(`${ctx} ${n}${u.typeFiles[ctx] && !u.valueFiles[ctx] ? ' (types)' : ''}`);
  }
  if (u.bins.length) parts.push(`bin ${u.bins.map((b) => `${b.bin}→${b.scripts.join('/')}`).join(', ')}`);
  if (u.peerOf.length) parts.push(`peer of ${u.peerOf.slice(0, 3).join(', ')}`);
  if (u.typesFor && u.typesForUsed) parts.push(`types for ${u.typesFor}`);
  if (u.stringRefs && !parts.length) parts.push(`string ref ×${u.stringRefs}`);
  return parts.join(' · ') || '**unused**';
}

function depFlags(d, findingsByDep) {
  const tags = new Set();
  for (const f of findingsByDep.get(d.name) ?? []) tags.add(f.rule.replace('DC-', '').toLowerCase());
  if (d.usage.clientFiles) tags.add('browser');
  if (d.nativeInClosure) tags.add('native');
  return [...tags].map((t) => `\`${t}\``).join(' ');
}

// ---------- diagrams ----------

export function componentMap(model) {
  const L = ['```mermaid', 'flowchart LR'];
  const { nodes, edges } = model.internal;
  L.push('  subgraph repo["Repository packages"]');
  for (const n of nodes.filter((x) => x.kind === 'package')) {
    const p = model.packages.find((x) => x.dir === n.dir);
    const t = p?.totals;
    const sizes = p?.installed ? `runtime ${fmtBytes(t.prodBytes)} · total ${fmtBytes(t.allBytes)}` : 'not installed';
    L.push(`    ${id(n.id)}["<b>${q(n.dir)}</b><br/>${q(p?.name ?? '')} · ${q(p?.pm ?? '')}<br/>${t?.direct.prod ?? 0} runtime · ${t?.direct.dev ?? 0} dev deps<br/>${q(sizes)}"]`);
  }
  for (const n of nodes.filter((x) => x.kind === 'vendored')) L.push(`    ${id(n.id)}[["${q(n.label)}<br/><i>vendored source</i>"]]`);
  L.push('  end');
  for (const n of nodes.filter((x) => x.kind === 'infra')) L.push(`  ${id(n.id)}[("${q(n.label)}")]`);
  for (const n of nodes.filter((x) => x.kind === 'external')) L.push(`  ${id(n.id)}(["${q(n.label)}"])`);
  for (const e of edges) {
    const arrow = e.kind === 'alias' ? '-->' : e.kind === 'copy' ? '<-.->' : '-.->';
    L.push(`  ${id(e.from)} ${arrow}|"${q(e.label)}"| ${id(e.to)}`);
  }
  L.push('  classDef pkg fill:#e8f1ff,stroke:#3b6fd8,color:#0b1f44');
  L.push('  classDef vend fill:#fff4e0,stroke:#d08a1e,color:#3d2600');
  L.push('  classDef infra fill:#eef7ee,stroke:#3c8c3c,color:#0f2e0f');
  const cls = (kind, c) => {
    const ids = nodes.filter((x) => x.kind === kind).map((x) => id(x.id));
    if (ids.length) L.push(`  class ${ids.join(',')} ${c}`);
  };
  cls('package', 'pkg');
  cls('vendored', 'vend');
  cls('infra', 'infra');
  cls('external', 'infra');
  L.push('```');
  return L.join('\n');
}

export function packageDiagram(pkg, findingsByDep, top) {
  const L = ['```mermaid', 'flowchart LR'];
  const root = `pkg_${id(pkg.dir)}`;
  L.push(`  ${root}(["<b>${q(pkg.dir)}</b><br/>${q(pkg.name)}"])`);
  const groups = [
    ['prod', 'Runtime — dependencies'],
    ['dev', 'Dev — devDependencies'],
  ];
  const classes = { unused: [], heavy: [], drift: [], warn: [] };
  for (const [section, title] of groups) {
    const deps = pkg.deps.filter((d) => (section === 'prod' ? d.section === 'prod' || d.section === 'optional' : d.section === 'dev')).sort((a, b) => b.closureBytes - a.closureBytes);
    if (!deps.length) continue;
    const sg = `${root}_${section}`;
    L.push(`  subgraph ${sg}["${q(title)} · ${deps.length}"]`);
    L.push('    direction TB');
    for (const d of deps.slice(0, top)) {
      const nid = `${sg}_${id(d.name)}`;
      L.push(`    ${nid}["${q(d.name)}<br/>${q(d.installed ?? d.declared)} · ${fmtBytes(d.closureBytes)}"]`);
      const rules = new Set((findingsByDep.get(d.name) ?? []).map((f) => f.rule));
      if (rules.has('DC-UNUSED')) classes.unused.push(nid);
      else if (rules.has('DC-HEAVY')) classes.heavy.push(nid);
      else if (rules.has('DC-DRIFT')) classes.drift.push(nid);
      else if (rules.size) classes.warn.push(nid);
    }
    if (deps.length > top) {
      const rest = deps.slice(top);
      L.push(`    ${sg}_more["+${rest.length} more<br/>${fmtBytes(rest.reduce((s, d) => s + d.exclusiveBytes, 0))} exclusive"]`);
    }
    L.push('  end');
    L.push(`  ${root} --> ${sg}`);
  }
  L.push('  classDef unused fill:#fde8e8,stroke:#c43c3c,stroke-dasharray:4 3,color:#3d0b0b');
  L.push('  classDef heavy fill:#fff1db,stroke:#d08a1e,color:#3d2600');
  L.push('  classDef drift fill:#f1e8ff,stroke:#7a4fd0,color:#21094d');
  L.push('  classDef warn fill:#fffbe0,stroke:#b9a21c,color:#332b00');
  for (const [c, ids] of Object.entries(classes)) if (ids.length) L.push(`  class ${ids.join(',')} ${c}`);
  L.push('```');
  return L.join('\n');
}

export function footprintPie(title, slices) {
  const rows = slices.filter((s) => s.bytes > 0);
  if (!rows.length) return '';
  return ['```mermaid', `pie showData title ${title.replace(/[":]/g, '')}`, ...rows.map((s) => `  "${s.label.replace(/"/g, "'")}" : ${mb(s.bytes)}`), '```'].join('\n');
}

function packagePie(pkg, n = 7) {
  const deps = [...pkg.deps].filter((d) => d.exclusiveBytes > 0).sort((a, b) => b.exclusiveBytes - a.exclusiveBytes);
  const topDeps = deps.slice(0, n);
  const rest = deps.slice(n).reduce((s, d) => s + d.exclusiveBytes, 0);
  const shared = pkg.totals.allBytes - deps.reduce((s, d) => s + d.exclusiveBytes, 0);
  return footprintPie(`${pkg.dir} install footprint, MB (exclusive per direct dependency)`, [
    ...topDeps.map((d) => ({ label: d.name, bytes: d.exclusiveBytes })),
    { label: `${deps.length - topDeps.length} other deps`, bytes: rest },
    { label: 'shared by 2+ direct deps', bytes: shared },
  ]);
}

/** Dependencies with findings in 2+ packages or under 2+ rules, worst first. */
export function hotspots(findings, limit = 15) {
  const by = new Map();
  for (const f of findings) {
    if (!f.dep) continue;
    const h = by.get(f.dep) ?? { dep: f.dep, worst: 'P3', ids: [], rules: new Set(), packages: new Set() };
    if (PRIORITY_ORDER.indexOf(f.priority) < PRIORITY_ORDER.indexOf(h.worst)) h.worst = f.priority;
    h.ids.push(f.id);
    h.rules.add(f.rule);
    for (const p of String(f.package).split(', ')) h.packages.add(p);
    by.set(f.dep, h);
  }
  return [...by.values()]
    .filter((h) => h.packages.size > 1 || h.rules.size > 1)
    .map((h) => ({ ...h, rules: [...h.rules], packages: [...h.packages] }))
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.worst) - PRIORITY_ORDER.indexOf(b.worst) || b.ids.length - a.ids.length || a.dep.localeCompare(b.dep))
    .slice(0, limit);
}

// ---------- report ----------

export function renderReport(model, { top = 12 } = {}) {
  const out = [];
  const g = model.git;
  const P = (...l) => out.push(...l);
  const counts = (fs) => PRIORITY_ORDER.map((p) => fs.filter((f) => f.priority === p).length);

  P(`# Dependency report — ${model.repo}`, '');
  P(`> Generated ${model.generatedAt.slice(0, 10)} by the \`dependencies-checker\` skill · commit \`${g.sha}\` on \`${g.branch}\`${g.dirty ? ` (${g.dirty} uncommitted file(s))` : ''} · mode **${model.mode}** · ${model.packages.length} packages.`);
  P('> Sizes are apparent bytes of installed packages in each `node_modules`, not browser-bundle sizes. **Exclusive** = what removing that one dependency would free; **closure** = it plus everything it pulls in.', '');

  P('## 1. Summary', '', '<!-- AGENT:SUMMARY — 3–5 bullets: overall health, the top risks, the biggest wins with numbers. -->', '');

  P('## 2. Component map', '');
  P('Solid arrows: source imports through tsconfig path aliases (label = alias · files importing it). Dashed: runtime calls found as `localhost:<port>` references. Double-dashed: vendored copies of the same module.', '');
  P(componentMap(model), '');

  P('## 3. Packages at a glance', '');
  P('| Package | Manager | Direct (runtime / dev) | Installed packages | Runtime footprint | Total footprint | Heaviest direct dependency | Findings P0 · P1 · P2 · P3 |');
  P('|---|---|---|---|---|---|---|---|');
  for (const pkg of model.packages) {
    const t = pkg.totals;
    const heaviest = [...pkg.deps].sort((a, b) => b.closureBytes - a.closureBytes)[0];
    const c = counts(model.findings.filter((f) => f.package === pkg.dir || String(f.package).split(', ').includes(pkg.dir)));
    P(`| **${pkg.dir}** \`${pkg.name}\` | ${pkg.pm} | ${t.direct.prod} / ${t.direct.dev} | ${pkg.installed ? t.allCount : '—'} | ${pkg.installed ? fmtBytes(t.prodBytes) : '—'} | ${pkg.installed ? fmtBytes(t.allBytes) : 'not installed'} | ${heaviest && heaviest.closureBytes ? `${heaviest.name} (${fmtBytes(heaviest.closureBytes)})` : '—'} | ${c.join(' · ')} |`);
  }
  P('');
  P(footprintPie('Total install footprint by package, MB', model.packages.filter((p) => p.installed).map((p) => ({ label: p.dir, bytes: p.totals.allBytes }))), '');

  const byPkgDep = new Map();
  for (const f of model.findings) {
    for (const dir of String(f.package).split(', ')) {
      if (!byPkgDep.has(dir)) byPkgDep.set(dir, new Map());
      const m = byPkgDep.get(dir);
      if (f.dep) m.set(f.dep, [...(m.get(f.dep) ?? []), f]);
    }
  }

  P('## 4. Package details', '');
  model.packages.forEach((pkg, i) => {
    const fbd = byPkgDep.get(pkg.dir) ?? new Map();
    P(`### 4.${i + 1} \`${pkg.dir}\` — ${pkg.name}`, '');
    if (!pkg.installed) {
      P(`Not installed — run \`cd ${pkg.dir} && ${pkg.pm} install\` and re-run the check. Declared: ${pkg.deps.map((d) => `\`${d.name}\``).join(', ') || 'nothing'}.`, '');
      return;
    }
    const t = pkg.totals;
    P(`${pkg.description ? `${cell(pkg.description)}  \n` : ''}**${t.direct.prod}** runtime + **${t.direct.dev}** dev direct dependencies → **${t.allCount}** installed packages, **${fmtBytes(t.allBytes)}** (runtime tree ${t.prodCount} packages, ${fmtBytes(t.prodBytes)}). Lockfile: \`${pkg.lockfile ?? 'none'}\`.`, '');
    P(packageDiagram(pkg, fbd, top), '');
    P(packagePie(pkg), '');
    P('| Dependency | Section · category | Declared → installed | Purpose | Used by (files) | Own | Closure | Exclusive | License | Flags |');
    P('|---|---|---|---|---|---|---|---|---|---|');
    const order = { prod: 0, optional: 1, dev: 2, peer: 3 };
    for (const d of [...pkg.deps].sort((a, b) => order[a.section] - order[b.section] || b.closureBytes - a.closureBytes)) {
      P(`| \`${d.name}\` | ${d.section} · ${d.category} | ${cell(d.declared)} → ${d.installed ?? '**missing**'} | ${cell(trunc(d.description, 70))} | ${cell(usageSummary(d))} | ${fmtBytes(d.own)} | ${fmtBytes(d.closureBytes)} (${d.closureCount}) | ${fmtBytes(d.exclusiveBytes)} | ${cell(d.license)} | ${depFlags(d, fbd)} |`);
    }
    P('');
    if (pkg.undeclared.length) {
      P('**Imported but not declared:**', '', '| Package | Files | Where | Resolves? | Example |', '|---|---|---|---|---|');
      for (const u of pkg.undeclared) P(`| \`${u.name}\` | ${u.files} | ${u.contexts.join(', ')} | ${u.resolvable ? `yes (${u.version}, hoisted)` : '**no**'} | \`${cell(u.example)}\` |`);
      P('');
    }
    const lic = Object.entries(pkg.licenses.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
    P(`**Licenses (whole tree):** ${lic || '—'}  `);
    P(`**In 2+ versions:** ${pkg.duplicates.length ? pkg.duplicates.slice(0, 6).map((d) => `${d.name} (${d.versions.map((v) => v.version).join(', ')})`).join(', ') + (pkg.duplicates.length > 6 ? `, +${pkg.duplicates.length - 6} more` : '') : 'none'}  `);
    P(`**Native code / install scripts:** ${pkg.native.length ? pkg.native.map((n) => `${n.name}@${n.version}`).join(', ') : 'none'}`, '');
  });

  P('## 5. Cross-package versions', '');
  if (!model.cross.matrix.length) P('No dependency is declared by more than one package.', '');
  else {
    const dirs = model.packages.map((p) => p.dir);
    P(`Dependencies declared by 2+ packages. ⚠ = packages are on different compatibility lines (major, or minor for 0.x).`, '');
    P(`| Dependency | ${dirs.join(' | ')} |`, `|---|${dirs.map(() => '---').join('|')}|`);
    for (const e of model.cross.matrix) {
      const drift = model.cross.drift.some((d) => d.name === e.name);
      P(`| ${drift ? '⚠ ' : ''}\`${e.name}\` | ${dirs.map((dir) => {
        const p = e.packages.find((x) => x.dir === dir);
        return p ? `${p.installed ?? p.declared}${p.section === 'dev' ? ' (dev)' : ''}` : '';
      }).join(' | ')} |`);
    }
    P('');
  }

  P('## 6. Findings', '');
  const c = counts(model.findings);
  P(`**${model.findings.length}** findings: P0 **${c[0]}** · P1 **${c[1]}** · P2 **${c[2]}** · P3 **${c[3]}**. Priorities are the rule defaults; the *Triage* column records the reviewer's check (confirmed / false positive / re-prioritised, with the reason).`, '');
  const hot = hotspots(model.findings);
  if (hot.length) {
    P('### Hotspots', '', 'Dependencies that collect findings in several packages or under several rules — usually one fix closes all of them.', '');
    P('| Dependency | Worst | Findings | Rules | Packages |', '|---|---|---|---|---|');
    for (const h of hot) P(`| \`${h.dep}\` | ${h.worst} | ${h.ids.join(', ')} | ${h.rules.join(', ')} | ${h.packages.join(', ')} |`);
    P('', '### All findings', '');
  }
  P('| ID | P | Rule | Package | Dependency | Evidence | Suggested fix | Triage |', '|---|---|---|---|---|---|---|---|');
  for (const f of model.findings) P(`| ${f.id} | ${f.priority} | ${f.rule} — ${cell(RULES[f.rule])} | ${cell(f.package)} | ${f.dep ? `\`${f.dep}\`` : '—'} | ${cell(f.evidence)} | ${cell(f.fix)} | <!-- AGENT:TRIAGE:${f.id} --> |`);
  P('');

  P('## 7. Prioritised plan', '', '<!-- AGENT:PLAN — P0 / P1 / P2 buckets; each item: what, which findings (IDs), effort S/M/L, expected gain with numbers, command or first step. -->', '');
  P('## 8. Recommendations', '', '<!-- AGENT:ADVICE — 3–7 structural recommendations (policies, tooling, upgrades to plan), each with why and how. -->', '');

  P('## 9. Method and limits', '');
  P(`- Packages: every tracked \`package.json\` outside \`.claude/\`, \`server/clones/\`, fixtures and \`node_modules\` (${model.packages.map((p) => `\`${p.dir}\``).join(', ')}).`);
  P('- Graph: resolved from the installed `node_modules` the way Node resolves (pnpm store and npm hoisting both), following `dependencies` and installed `optionalDependencies`; peers are not followed.');
  P('- Usage: regex scan of tracked + untracked (not ignored) source, config and style files for imports, `require`, dynamic `import()`, CSS `@import`/`@plugin`, bins used in npm scripts, string literals equal to a package name, peers of other direct deps and `@types/*` targets. Generated, vendored or re-exported usage may be missed — triage `DC-UNUSED` before removing anything.');
  P(`- ${model.mode === 'online' ? 'Online: `audit` and `outdated` of each package manager against the npm registry.' : 'Offline: vulnerabilities, outdated and deprecated versions were **not** checked. Re-run with `--online` to include them.'}`);
  P(`- Thresholds: heavy runtime dependency ≥ ${fmtBytes(model.thresholds.heavyProdBytes)} exclusive, heavy dev dependency ≥ ${fmtBytes(model.thresholds.heavyDevBytes)}, notable duplicate ≥ ${fmtBytes(model.thresholds.duplicateBytes)} extra.`);
  P(`- Reproduce: \`node .claude/skills/dependencies-checker/scripts/collect.mjs${model.mode === 'online' ? ' --online' : ''} --json <tmp>/deps.json --md <tmp>/deps.md\``, '');
  return out.join('\n');
}
