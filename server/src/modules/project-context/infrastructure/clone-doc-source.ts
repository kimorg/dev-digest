import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { CONTEXT_PACKAGES, MAX_CONTEXT_DOC_BYTES } from '../constants.js';
import type { ContextDocSource, DocReadResult, FoundDocFile } from '../ports.js';

const SKIP_DIRS = new Set(['.git', 'node_modules']);

/** True when `full` is inside `root` and not under a `.git` segment. */
function isInside(root: string, full: string): boolean {
  if (!full.startsWith(root + sep)) return false;
  return !relative(root, full)
    .split(sep)
    .some((s) => s.toLowerCase() === '.git');
}

/**
 * Reads markdown docs from a clone's working copy. Never follows symlinks and
 * never reads a file whose real path leaves the clone or sits under `.git/`.
 */
export class CloneDocSource implements ContextDocSource {
  async exists(root: string): Promise<boolean> {
    try {
      return (await stat(root)).isDirectory();
    } catch {
      return false;
    }
  }

  async list(root: string): Promise<FoundDocFile[]> {
    let realRoot: string;
    try {
      realRoot = await realpath(resolve(root));
    } catch {
      return [];
    }
    const out: FoundDocFile[] = [];
    // Only the pattern roots: package roots (files only), package docs/specs, specs, docs/plans.
    for (const pkg of CONTEXT_PACKAGES) {
      await this.walk(realRoot, join(realRoot, pkg), false, out);
      await this.walk(realRoot, join(realRoot, pkg, 'docs'), true, out);
      await this.walk(realRoot, join(realRoot, pkg, 'specs'), true, out);
    }
    await this.walk(realRoot, join(realRoot, 'specs'), true, out);
    await this.walk(realRoot, join(realRoot, 'docs', 'plans'), true, out);
    return out;
  }

  async read(root: string, path: string): Promise<DocReadResult> {
    let realRoot: string;
    try {
      realRoot = await realpath(resolve(root));
    } catch {
      return { status: 'missing' };
    }
    const full = resolve(realRoot, path);
    if (!isInside(realRoot, full)) return { status: 'unsafe' };
    let info;
    try {
      info = await lstat(full);
    } catch {
      return { status: 'missing' };
    }
    if (info.isSymbolicLink()) return { status: 'unsafe' };
    if (!info.isFile()) return { status: 'missing' };
    try {
      if (!isInside(realRoot, await realpath(full))) return { status: 'unsafe' };
    } catch {
      return { status: 'missing' };
    }
    if (info.size > MAX_CONTEXT_DOC_BYTES) return { status: 'too_large', sizeBytes: info.size };
    try {
      return { status: 'ok', content: await readFile(full, 'utf8'), sizeBytes: info.size };
    } catch {
      return { status: 'missing' };
    }
  }

  private async walk(
    realRoot: string,
    dir: string,
    recursive: boolean,
    out: FoundDocFile[],
  ): Promise<void> {
    try {
      const info = await lstat(dir);
      if (info.isSymbolicLink() || !info.isDirectory()) return;
      if (!isInside(realRoot, await realpath(dir))) return;
    } catch {
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive && !SKIP_DIRS.has(entry.name)) await this.walk(realRoot, full, true, out);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      try {
        if (!isInside(realRoot, await realpath(full))) continue;
        const size = (await lstat(full)).size;
        out.push({ path: relative(realRoot, full).split(sep).join('/'), sizeBytes: size });
      } catch {
        continue;
      }
    }
  }
}
