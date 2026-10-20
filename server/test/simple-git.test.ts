import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { PathEscapeError } from '../src/platform/errors.js';

// readFile takes paths from model output (conventions evidence), so it must only read the
// clone's working tree: not via `..`, not via a committed symlink, and never `.git/` (token).
describe('SimpleGitClient.readFile stays inside the working tree', () => {
  const repo = { owner: 'acme', name: 'api' };
  let base: string;
  let git: SimpleGitClient;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'dd-simple-git-'));
    const clone = join(base, 'clones', repo.owner, repo.name);
    await mkdir(join(clone, 'src'), { recursive: true });
    await mkdir(join(clone, '.git'), { recursive: true });
    await writeFile(join(clone, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(clone, '.git', 'config'), 'url = https://x-access-token:ghp_test@github.com/acme/api.git\n');
    await writeFile(join(base, 'secrets.json'), '{"key":"sk-test"}');
    await symlink(join(base, 'secrets.json'), join(clone, 'tsconfig.json'));
    await symlink(join(clone, '.git', 'config'), join(clone, 'git-config.txt'));
    await symlink(join(clone, 'src', 'a.ts'), join(clone, 'alias.ts'));
    git = new SimpleGitClient(join(base, 'clones'));
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('reads a regular file in the clone', async () => {
    expect(await git.readFile(repo, 'src/a.ts')).toBe('export const a = 1;\n');
  });

  it('follows a symlink that stays inside the working tree', async () => {
    expect(await git.readFile(repo, 'alias.ts')).toBe('export const a = 1;\n');
  });

  it('rejects a symlink that points outside the clone', async () => {
    await expect(git.readFile(repo, 'tsconfig.json')).rejects.toBeInstanceOf(PathEscapeError);
  });

  it('rejects a `..` path', async () => {
    await expect(git.readFile(repo, '../../../secrets.json')).rejects.toBeInstanceOf(PathEscapeError);
  });

  it('rejects `.git/` in any case, directly or through a symlink', async () => {
    await expect(git.readFile(repo, '.git/config')).rejects.toBeInstanceOf(PathEscapeError);
    await expect(git.readFile(repo, '.GIT/config')).rejects.toBeInstanceOf(PathEscapeError);
    await expect(git.readFile(repo, 'git-config.txt')).rejects.toBeInstanceOf(PathEscapeError);
  });

  it('fails with ENOENT for a missing file, so callers can treat it as missing', async () => {
    await expect(git.readFile(repo, 'nope.ts')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
