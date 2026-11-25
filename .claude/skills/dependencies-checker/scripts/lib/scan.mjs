// Installed-tree scanner: resolves dependencies the way Node does (works for npm's hoisted
// layout and pnpm's .pnpm store with symlinks), measures each installed package on disk and
// builds the transitive closure of every direct dependency. Read-only, offline.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { licenseOf } from './usage.mjs';

const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall'];

export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} boundary package root (real path); resolution never walks above it, so a
 *   stray node_modules higher up (e.g. the git-ignored root one) is never picked up.
 */
export function createScanner(boundary) {
  const root = realpathSync(boundary);
  const manifests = new Map(); // realdir → manifest
  const sizes = new Map(); // realdir → { bytes, files, native }

  function manifest(dir) {
    if (!manifests.has(dir)) manifests.set(dir, readJson(join(dir, 'package.json')));
    return manifests.get(dir);
  }

  /** Node-style lookup of `name` starting at `fromDir`. Returns the real dir or null. */
  function resolve(fromDir, name) {
    let dir = fromDir;
    for (;;) {
      if (basename(dir) !== 'node_modules') {
        const cand = join(dir, 'node_modules', name);
        if (existsSync(join(cand, 'package.json'))) {
          try {
            return realpathSync(cand);
          } catch {
            return null;
          }
        }
      }
      if (dir === root || !(dir + sep).startsWith(root + sep)) return null;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  /** Apparent size of a package directory, nested node_modules and symlinks excluded. */
  function size(dir) {
    if (sizes.has(dir)) return sizes.get(dir);
    const acc = { bytes: 0, files: 0, native: false };
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop();
      let entries;
      try {
        entries = readdirSync(d, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        const p = join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'node_modules') stack.push(p);
        } else if (e.isFile()) {
          try {
            acc.bytes += lstatSync(p).size;
            acc.files += 1;
            if (e.name.endsWith('.node')) acc.native = true;
          } catch {
            /* vanished */
          }
        }
      }
    }
    sizes.set(dir, acc);
    return acc;
  }

  /** Node record for an installed package directory. */
  function node(dir) {
    const m = manifest(dir) ?? {};
    const s = size(dir);
    const hooks = INSTALL_HOOKS.filter((h) => m.scripts?.[h]);
    return {
      key: dir,
      name: m.name ?? basename(dir),
      version: m.version ?? '?',
      license: licenseOf(m),
      bytes: s.bytes,
      files: s.files,
      native: s.native || Boolean(m.gypfile) || existsSync(join(dir, 'binding.gyp')),
      installScripts: hooks,
      deprecated: typeof m.deprecated === 'string' ? m.deprecated : null,
    };
  }

  /**
   * Transitive closure (dependencies + installed optionalDependencies; peers are the
   * consumer's job and are not followed). Returns { keys:Set, missing:[{from,name}] }.
   */
  function closure(startDir) {
    const keys = new Set([startDir]);
    const missing = [];
    const queue = [startDir];
    while (queue.length) {
      const dir = queue.shift();
      const m = manifest(dir) ?? {};
      const optional = new Set(Object.keys(m.optionalDependencies ?? {}));
      const names = new Set([...Object.keys(m.dependencies ?? {}), ...optional]);
      for (const name of names) {
        const r = resolve(dir, name);
        if (!r) {
          if (!optional.has(name)) missing.push({ from: m.name ?? dir, name });
          continue;
        }
        if (!keys.has(r)) {
          keys.add(r);
          queue.push(r);
        }
      }
    }
    return { keys, missing };
  }

  return { root, manifest, resolve, size, node, closure };
}
