import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloneDocSource } from '../src/modules/project-context/infrastructure/clone-doc-source.js';

// SPEC-005 AC-14, AC-59, EC-9, EC-14, NFR-5 — against a real temp directory.
describe('CloneDocSource (real fs)', () => {
  let base: string;
  let clone: string;
  const src = new CloneDocSource();

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'dd-ctx-source-'));
    clone = join(base, 'clone');
    await mkdir(join(clone, 'server', 'docs'), { recursive: true });
    await mkdir(join(clone, '.git'), { recursive: true });
    await writeFile(join(clone, 'server', 'AGENTS.md'), '# Agents\n');
    await writeFile(join(clone, 'server', 'docs', 'auth.md'), '# Auth\n');
    await writeFile(join(clone, 'server', 'docs', 'empty.md'), '');
    await writeFile(join(clone, 'server', 'docs', 'big.md'), 'x'.repeat(401 * 1024));
    await writeFile(join(clone, '.git', 'config'), 'url = https://x-access-token:ghp_secret@github.com/a/b.git\n');
    await writeFile(join(base, 'secrets.md'), 'TOP SECRET');
    // symlinks: to a file outside the clone, to .git/config, to a file inside
    await symlink(join(base, 'secrets.md'), join(clone, 'server', 'docs', 'leak-outside.md'));
    await symlink(join(clone, '.git', 'config'), join(clone, 'server', 'docs', 'leak-git.md'));
    await symlink(join(clone, 'server', 'AGENTS.md'), join(clone, 'server', 'docs', 'alias.md'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('list skips symbolic links (outside the clone, .git/config, and in-clone aliases)', async () => {
    const paths = (await src.list(clone)).map((f) => f.path).sort();
    expect(paths).toEqual([
      'server/AGENTS.md',
      'server/docs/auth.md',
      'server/docs/big.md',
      'server/docs/empty.md',
    ]);
  });

  it('read never returns bytes from outside the clone: ../, symlinks and .git are not ok', async () => {
    for (const path of [
      '../secrets.md',
      'server/docs/../../../secrets.md',
      'server/docs/leak-outside.md',
      'server/docs/leak-git.md',
      'server/docs/alias.md',
      '.git/config',
    ]) {
      const res = await src.read(clone, path);
      expect(res.status, path).not.toBe('ok');
      expect(JSON.stringify(res), path).not.toContain('TOP SECRET');
      expect(JSON.stringify(res), path).not.toContain('ghp_secret');
    }
    expect((await src.read(clone, 'server/docs/missing.md')).status).toBe('missing');
    expect(await src.read(clone, 'server/AGENTS.md')).toMatchObject({ status: 'ok', content: '# Agents\n' });
  });

  it('read: a 401 KB file is too_large without content; an empty file is ok with size 0', async () => {
    const big = await src.read(clone, 'server/docs/big.md');
    expect(big).toEqual({ status: 'too_large', sizeBytes: 401 * 1024 });
    expect(await src.read(clone, 'server/docs/empty.md')).toEqual({
      status: 'ok',
      content: '',
      sizeBytes: 0,
    });
  });
});
