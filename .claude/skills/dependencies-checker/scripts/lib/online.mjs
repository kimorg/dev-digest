// Opt-in (--online) registry checks: `audit` and `outdated` of the package's own manager.
// Both commands exit non-zero when they find something, so the exit code is ignored and only
// the JSON on stdout is read. Normalisers are pure and unit-tested against both formats.
import { spawnSync } from 'node:child_process';
import { parseVersion } from './semver.mjs';

function runJson(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  const text = (r.stdout ?? '').trim();
  if (!text) return { error: (r.stderr || r.error?.message || `${cmd} produced no output`).trim().split('\n').slice(-3).join(' ') };
  try {
    return { json: JSON.parse(text) };
  } catch {
    return { error: `${cmd} ${args.join(' ')}: output is not JSON` };
  }
}

/**
 * npm ≥7 (`vulnerabilities`) and npm-6 / pnpm (`advisories`) audit formats →
 * [{ name, severity, title, url, range, prod|null, fix|null }]
 */
export function normaliseAudit(json, prodNames = null) {
  const out = [];
  if (!json || typeof json !== 'object') return out;
  if (json.advisories) {
    for (const a of Object.values(json.advisories)) {
      // pnpm marks each finding with `dev`; paths look like ".>vitest>vite>esbuild"
      const findings = a.findings ?? [];
      const prod = findings.length && findings.every((f) => typeof f.dev === 'boolean') ? findings.some((f) => !f.dev) : null;
      out.push({ name: a.module_name, severity: a.severity, title: a.title, url: a.url, range: a.vulnerable_versions, prod, fix: a.patched_versions && a.patched_versions !== '<0.0.0' ? `Upgrade ${a.module_name} to ${a.patched_versions}` : null });
    }
  } else if (json.vulnerabilities) {
    for (const [name, v] of Object.entries(json.vulnerabilities)) {
      const advisories = (v.via ?? []).filter((x) => typeof x === 'object');
      if (!advisories.length) continue; // pulled in by another vulnerable package; reported there
      const a = advisories[0];
      const fix = v.fixAvailable === false ? 'No fix available yet — consider replacing or isolating it' : typeof v.fixAvailable === 'object' ? `Upgrade ${v.fixAvailable.name} to ${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? ' (major)' : ''}` : null;
      out.push({ name, severity: v.severity, title: advisories.map((x) => x.title).filter(Boolean).join('; '), url: a.url, range: v.range, prod: prodNames ? prodNames.has(name) : null, fix });
    }
  }
  return out;
}

/** pnpm (`{name:{current,latest,dependencyType,isDeprecated}}`) and npm outdated → rows. */
export function normaliseOutdated(json, devNames = new Set()) {
  if (!json || typeof json !== 'object') return [];
  return Object.entries(json).map(([name, o]) => {
    const cur = parseVersion(o.current);
    const lat = parseVersion(o.latest);
    // breaking releases behind: majors, or for 0.x a newer minor (caret treats 0.x minors as breaking)
    const majorsBehind = !cur || !lat ? 0 : lat.major > cur.major ? lat.major - cur.major : lat.major === 0 && cur.major === 0 && lat.minor > cur.minor ? 1 : 0;
    return { name, current: o.current ?? null, wanted: o.wanted ?? null, latest: o.latest ?? null, majorsBehind, deprecated: Boolean(o.isDeprecated), dev: o.dependencyType ? o.dependencyType === 'devDependencies' : devNames.has(name) };
  }).filter((o) => o.current && o.latest);
}

export function onlineChecks(pm, cwd, devNames) {
  const audit = pm === 'pnpm' ? runJson('pnpm', ['audit', '--json'], cwd) : runJson('npm', ['audit', '--json'], cwd);
  // npm's v2 report has no dev flag: a second, production-only audit tells prod from dev
  const prodAudit = pm === 'npm' && audit.json?.vulnerabilities && Object.keys(audit.json.vulnerabilities).length ? runJson('npm', ['audit', '--omit=dev', '--json'], cwd) : null;
  const prodNames = prodAudit?.json?.vulnerabilities ? new Set(Object.keys(prodAudit.json.vulnerabilities)) : null;
  const outdated = pm === 'pnpm' ? runJson('pnpm', ['outdated', '--format', 'json'], cwd) : runJson('npm', ['outdated', '--json'], cwd);
  return {
    vulns: audit.json ? normaliseAudit(audit.json, prodNames) : [],
    outdated: outdated.json ? normaliseOutdated(outdated.json, devNames) : [],
    errors: [audit.error && `audit: ${audit.error}`, outdated.error && `outdated: ${outdated.error}`].filter(Boolean),
  };
}
