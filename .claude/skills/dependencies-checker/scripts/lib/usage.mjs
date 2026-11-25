// Pure helpers: which packages a source file uses, what kind of file it is, and what kind of
// dependency a package is. No I/O here — collect.mjs feeds file contents in.
import { builtinModules } from 'node:module';

const BUILTINS = new Set(builtinModules.flatMap((m) => [m, m.split('/')[0]]));

export const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;
export const STYLE_EXT = /\.(?:css|scss|sass|less|pcss)$/;

/** Bare package name of an import specifier, or null for relative / builtin / URL specifiers. */
export function packageOf(spec) {
  const s = String(spec).trim();
  if (!s || s.startsWith('.') || s.startsWith('/') || s.startsWith('#') || s.startsWith('~')) return null;
  if (/^[a-z][\w+.-]*:/i.test(s)) return null; // node:, bun:, virtual:, http:, data:
  const segs = s.split('/');
  const name = s.startsWith('@') ? (segs.length >= 2 && segs[1] ? `${segs[0]}/${segs[1]}` : null) : segs[0];
  if (!name || BUILTINS.has(name)) return null;
  if (!/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) return null;
  return name;
}

const STRIP_BLOCK_COMMENTS = /\/\*[\s\S]*?\*\//g;
const STRIP_LINE_COMMENTS = /^[ \t]*\/\/[^\n]*$/gm;
// Template literals hold code samples in tests (`import x from 'react'`), never real imports.
const STRIP_TEMPLATES = /`(?:\\[\s\S]|[^`\\])*`/g;

/**
 * Module specifiers a file references, with whether the reference is type-only.
 * Regex-based on purpose (fast, no parser); block comments are stripped first so JSDoc
 * examples do not count. Returns [{ spec, typeOnly }].
 */
export function extractImports(text, file = '') {
  const out = [];
  const raw = String(text).replace(STRIP_BLOCK_COMMENTS, '');
  if (STYLE_EXT.test(file)) {
    const src = raw;
    for (const m of src.matchAll(/@(?:import|plugin|use|forward|config)\s+(?:url\()?\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[1], typeOnly: false });
    return out;
  }
  const src = raw.replace(STRIP_LINE_COMMENTS, '').replace(STRIP_TEMPLATES, '``');
  // import x from 'y' | import type x from 'y' | export { x } from 'y' | export * from 'y'
  for (const m of src.matchAll(/(?:^|[;\n}])\s*(import|export)\s+(type\s+)?([^;'"]*?)\s*\bfrom\s*['"]([^'"\n]+)['"]/g)) {
    const clause = m[3] ?? '';
    const inlineTypesOnly = /^\{\s*(?:type\s+[\w$]+(?:\s+as\s+[\w$]+)?\s*,?\s*)+\}$/.test(clause.trim());
    out.push({ spec: m[4], typeOnly: Boolean(m[2]) || inlineTypesOnly });
  }
  for (const m of src.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"\n]+)['"]/g)) out.push({ spec: m[1], typeOnly: false });
  for (const m of src.matchAll(/(?<!\btypeof\s+)\bimport\s*\(\s*['"]([^'"\n]+)['"]/g)) out.push({ spec: m[1], typeOnly: false });
  for (const m of src.matchAll(/\brequire(?:\.resolve)?\s*\(\s*['"]([^'"\n]+)['"]/g)) out.push({ spec: m[1], typeOnly: false });
  // typeof import('x') in .d.ts / JSDoc-free type positions
  for (const m of src.matchAll(/\btypeof\s+import\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g)) out.push({ spec: m[1], typeOnly: true });
  return out;
}

/** String literals equal to a package name (e.g. environment: 'jsdom', transport target 'pino-pretty'). */
export function stringRefs(text, names) {
  const hits = new Set();
  for (const m of String(text).matchAll(/['"`](@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)['"`]/gi)) {
    const n = packageOf(m[1]) ?? m[1];
    if (names.has(n)) hits.add(n);
  }
  return hits;
}

/** True when a client file is a React client component (ships to the browser in Next.js). */
export function isClientComponent(text) {
  return /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/.test(String(text));
}

/**
 * Context of a file inside its package: "test", "config", "script", "style" or "src".
 * `rel` is the path relative to the package root, with forward slashes.
 */
export function fileContext(rel) {
  const r = rel.replace(/\\/g, '/');
  if (/(^|\/)(test|tests|__tests__|__mocks__|fixtures|e2e)\//.test(r) || /\.(test|spec|it\.test)\.[cm]?[jt]sx?$/.test(r) || /(^|\/)vitest\.setup\.[cm]?[jt]s$/.test(r)) return 'test';
  if (!r.includes('/') && (/\.config\.[cm]?[jt]s$/.test(r) || /^(next-env\.d\.ts|\.eslintrc\.[cm]?js)$/.test(r))) return 'config';
  if (/^(scripts|bin|tools)\//.test(r)) return 'script';
  if (STYLE_EXT.test(r)) return 'style'; // processed at build time
  return 'src';
}

// Category of a dependency by name. Section (prod/dev) is reported separately.
const TEST = /^(vitest|@vitest\/.+|jest|@jest\/.+|ts-jest|mocha|chai|sinon|ava|@testing-library\/.+|jsdom|happy-dom|testcontainers|@testcontainers\/.+|playwright|@playwright\/.+|supertest|msw|nock|c8|nyc|cypress|agent-browser)$/;
const TOOLING = /^(typescript|tsx|ts-node|esbuild|vite|@vitejs\/.+|rollup|@rollup\/.+|webpack|turbo|postcss|autoprefixer|tailwindcss|@tailwindcss\/.+|drizzle-kit|eslint|eslint-.+|@eslint\/.+|@typescript-eslint\/.+|prettier|prettier-.+|pino-pretty|dependency-cruiser|nodemon|concurrently|rimraf|cross-env|husky|lint-staged|knip|depcheck|gray-matter)$/;

export function categoryOf(name) {
  if (name.startsWith('@types/')) return 'types';
  if (TEST.test(name)) return 'test';
  if (TOOLING.test(name)) return 'tooling';
  return 'library';
}

/** "@types/node" → "node", "@types/babel__core" → "@babel/core". */
export function typesTarget(name) {
  if (!name.startsWith('@types/')) return null;
  const t = name.slice('@types/'.length);
  return t.includes('__') ? `@${t.replace('__', '/')}` : t;
}

/** Bin names of a manifest. */
export function binsOf(manifest) {
  const b = manifest?.bin;
  if (!b) return [];
  if (typeof b === 'string') return [String(manifest.name).split('/').pop()];
  return Object.keys(b);
}

/** Which npm scripts invoke a bin (word-boundary match, `npx`/`pnpm exec` included). */
export function scriptsUsingBin(scripts, bin) {
  const re = new RegExp(`(^|[\\s;&|(]|npx\\s+|exec\\s+)${bin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s;&|)])`);
  return Object.entries(scripts ?? {}).filter(([, cmd]) => re.test(String(cmd))).map(([k]) => k);
}

/** Script names that run in production (not dev/test/lint/build tooling). */
export const RUNTIME_SCRIPTS = new Set(['start', 'serve', 'prestart', 'poststart']);

const PERMISSIVE = new Set(['MIT', 'MIT-0', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'Unlicense', 'CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'Python-2.0', 'Zlib', 'WTFPL', 'BSD', 'Artistic-2.0']);
const WEAK_COPYLEFT = /^(LGPL|MPL|EPL|CDDL)/i;
const STRONG_COPYLEFT = /^(GPL|AGPL|SSPL|OSL|EUPL)/i;

/** Normalise a manifest's license field to an SPDX-ish string. */
export function licenseOf(manifest) {
  const l = manifest?.license ?? manifest?.licenses;
  if (!l) return 'UNKNOWN';
  if (typeof l === 'string') return l.trim();
  if (Array.isArray(l)) return l.map((x) => (typeof x === 'string' ? x : x?.type)).filter(Boolean).join(' OR ') || 'UNKNOWN';
  return l.type ?? 'UNKNOWN';
}

/** permissive | weak-copyleft | strong-copyleft | unknown — for an SPDX expression. */
export function licenseClass(expr) {
  const e = String(expr ?? '').replace(/[()]/g, ' ').trim();
  if (!e || /^(UNKNOWN|UNLICENSED|SEE LICENSE)/i.test(e)) return 'unknown';
  const alts = e.split(/\s+OR\s+/i).map((alt) => alt.split(/\s+AND\s+/i).map((x) => x.trim()));
  const classOf = (id) => (PERMISSIVE.has(id.replace(/\+$/, '')) ? 0 : WEAK_COPYLEFT.test(id) ? 1 : STRONG_COPYLEFT.test(id) ? 2 : 3);
  // OR → the consumer may pick the best alternative; AND → the worst term applies
  const best = Math.min(...alts.map((terms) => Math.max(...terms.map(classOf))));
  return ['permissive', 'weak-copyleft', 'strong-copyleft', 'unknown'][best];
}
