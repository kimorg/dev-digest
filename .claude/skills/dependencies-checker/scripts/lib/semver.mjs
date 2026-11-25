// Minimal semver: parse, compare, range satisfaction for the forms package.json uses
// (^, ~, x-ranges, comparators, hyphen-less AND sets, ||). No dependencies.
// Anything it cannot read (git URLs, file:, link:, workspace:, npm: aliases, tags) is
// "non-registry" and reported as unchecked rather than guessed.

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(v) {
  const m = VERSION_RE.exec(String(v ?? '').trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] };
}

export function compare(a, b) {
  for (const k of ['major', 'minor', 'patch']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1; // release > prerelease
  if (!b.pre.length) return -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny && +x !== +y) return +x < +y ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** True when the declared spec points somewhere other than the npm registry. */
export function isNonRegistry(spec) {
  const s = String(spec ?? '').trim();
  return /^(file:|link:|workspace:|portal:|git\+|git:|github:|https?:|npm:)/.test(s) || /^[\w-]+\/[\w.-]+(#.*)?$/.test(s);
}

// "1", "1.2", "1.x", "1.2.*" → { parts:[1,2], wild:true }
function parsePartial(s) {
  const segs = s.replace(/^v/, '').split('.');
  const parts = [];
  for (const seg of segs.slice(0, 3)) {
    if (seg === 'x' || seg === 'X' || seg === '*' || seg === '') break;
    const m = /^(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(seg);
    if (!m) return null;
    parts.push(+m[1]);
  }
  const pre = /-([0-9A-Za-z.-]+)$/.exec(s);
  return { parts, pre: pre && parts.length === 3 ? pre[1].split('.') : [] };
}

const v3 = (p, pre = []) => ({ major: p[0] ?? 0, minor: p[1] ?? 0, patch: p[2] ?? 0, pre });

// One comparator → list of [op, version] constraints (all must hold).
function expand(token) {
  const m = /^(\^|~>?|>=|<=|>|<|=)?\s*(.+)$/.exec(token);
  if (!m) return null;
  const op = m[1] ?? '';
  const p = parsePartial(m[2]);
  if (!p) return null;
  const { parts, pre } = p;
  if (parts.length === 0) return op === '<' || op === '>' ? [['<', v3([0, 0, 0])]] : []; // "*" / "x"
  const lo = v3(parts, pre);
  if (op === '^') {
    let hi;
    if (lo.major > 0 || parts.length === 1) hi = v3([lo.major + 1]);
    else if (lo.minor > 0 || parts.length === 2) hi = v3([0, lo.minor + 1]);
    else hi = v3([0, 0, lo.patch + 1]);
    return [['>=', lo], ['<', hi]];
  }
  if (op === '~' || op === '~>') {
    const hi = parts.length === 1 ? v3([lo.major + 1]) : v3([lo.major, lo.minor + 1]);
    return [['>=', lo], ['<', hi]];
  }
  if (parts.length < 3) {
    // x-range: 1.2 → >=1.2.0 <1.3.0 ; with operators adjust bounds
    const hiParts = parts.length === 1 ? [parts[0] + 1] : [parts[0], parts[1] + 1];
    if (op === '' || op === '=') return [['>=', lo], ['<', v3(hiParts)]];
    if (op === '>') return [['>=', v3(hiParts)]];
    if (op === '<=') return [['<', v3(hiParts)]];
    return [[op, lo]];
  }
  return [[op === '' ? '=' : op, lo]];
}

function holds(v, [op, ref]) {
  const c = compare(v, ref);
  switch (op) {
    case '=': return c === 0;
    case '>': return c > 0;
    case '>=': return c >= 0;
    case '<': return c < 0;
    case '<=': return c <= 0;
    default: return false;
  }
}

/**
 * @returns {boolean|null} true/false, or null when the range is not checkable
 * (non-registry spec, dist-tag such as "latest", unparsable).
 */
export function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v || range == null) return null;
  const r = String(range).trim();
  if (isNonRegistry(r)) return null;
  if (r === '' || r === '*' || r === 'x') return v.pre.length === 0;
  if (/^[a-z][\w-]*$/i.test(r) && r !== 'x') return null; // dist-tag
  let anyParsed = false;
  for (const alt of r.split('||')) {
    const set = alt.trim().replace(/(\^|~>?|>=|<=|>|<|=)\s+/g, '$1');
    // hyphen range "1.2.3 - 2.3.4"
    const hy = /^(\S+)\s+-\s+(\S+)$/.exec(set);
    const tokens = hy ? [`>=${hy[1]}`, `<=${hy[2]}`] : set.split(/\s+/).filter(Boolean);
    const cons = [];
    let ok = true;
    for (const t of tokens) {
      const e = expand(t);
      if (!e) { ok = false; break; }
      cons.push(...e);
    }
    if (!ok) continue;
    anyParsed = true;
    // prereleases only match a comparator on the same [major, minor, patch] tuple
    if (v.pre.length && !cons.some(([, ref]) => ref.pre.length && ref.major === v.major && ref.minor === v.minor && ref.patch === v.patch)) continue;
    if (cons.every((c) => holds(v, c))) return true;
  }
  return anyParsed ? false : null;
}

/** Lowest version a declared range allows, e.g. "^3.24.1" → 3.24.1. null when unknown. */
export function rangeFloor(range) {
  const m = /(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/.exec(String(range ?? ''));
  if (!m || isNonRegistry(range)) return null;
  const n = (s) => (s === undefined || s === 'x' || s === '*' ? 0 : +s);
  return { major: +m[1], minor: n(m[2]), patch: n(m[3]), pre: [] };
}

/** "Compatibility line": major for >=1, 0.minor for 0.x — what a caret range keeps fixed. */
export function line(version) {
  const v = typeof version === 'string' ? parseVersion(version) : version;
  if (!v) return null;
  return v.major > 0 ? `${v.major}` : `0.${v.minor}`;
}
