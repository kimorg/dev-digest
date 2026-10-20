import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { SKILL_BODY_MAX } from '@devdigest/shared';
import {
  SkillImportError,
  decodeUpload,
  parseSkillUpload,
} from '../src/modules/skills/import.js';
import { MAX_IMPORT_ENTRIES, MAX_IMPORT_UPLOAD_BYTES } from '../src/modules/skills/constants.js';

const SKILL_MD = `---
name: Over-Mocking
description: Flag tests that only verify mocks.
type: convention
---
# Over-Mocking

Flag it.
`;

const md = (text: string) => strToU8(text);
const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

function importError(fn: () => unknown): SkillImportError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SkillImportError);
    return err as SkillImportError;
  }
  throw new Error('expected a SkillImportError');
}

describe('parseSkillUpload — markdown', () => {
  it('reads name / description / type from frontmatter and strips it from the body', () => {
    const draft = parseSkillUpload('over-mocking.md', md(SKILL_MD));
    expect(draft).toEqual({
      name: 'Over-Mocking',
      description: 'Flag tests that only verify mocks.',
      type: 'convention',
      body: '# Over-Mocking\n\nFlag it.',
      ignored_files: [],
      warnings: [],
    });
  });

  it('without frontmatter: name from the first heading, type custom, warnings for the gaps', () => {
    const draft = parseSkillUpload('x.md', md('Intro\n\n# Edge Cases\n\nCheck 0 and -1.'));
    expect(draft.name).toBe('Edge Cases');
    expect(draft.type).toBe('custom');
    expect(draft.description).toBe('');
    expect(draft.warnings).toEqual([
      'No description — write one before saving.',
      'No type — defaulted to custom.',
    ]);
  });

  it('falls back to the file name when there is no heading', () => {
    expect(parseSkillUpload('dir/my-rule.md', md('just text')).name).toBe('my-rule');
  });

  it('an unknown type and broken YAML degrade to warnings, not errors', () => {
    const unknownType = parseSkillUpload('a.md', md('---\nname: A\ntype: magic\n---\nbody'));
    expect(unknownType.type).toBe('custom');
    expect(unknownType.warnings).toContain('Unknown type "magic" — defaulted to custom.');

    const broken = parseSkillUpload('b.md', md('---\nname: [unclosed\n---\n# B\nbody'));
    expect(broken.name).toBe('B');
    expect(broken.warnings).toContain('Frontmatter is not valid YAML — ignored.');
  });

  it('rejects an empty body, an over-long body and non-UTF-8 bytes', () => {
    expect(importError(() => parseSkillUpload('a.md', md('---\nname: A\n---\n'))).code).toBe(
      'skill_import_invalid',
    );
    expect(
      importError(() => parseSkillUpload('a.md', md('x'.repeat(SKILL_BODY_MAX + 1)))).code,
    ).toBe('skill_import_too_large');
    expect(
      importError(() => parseSkillUpload('a.md', new Uint8Array([0xff, 0xfe, 0xfd]))).code,
    ).toBe('skill_import_invalid');
  });

  it('rejects other extensions', () => {
    expect(importError(() => parseSkillUpload('run.sh', md('echo'))).code).toBe(
      'skill_import_unsupported',
    );
  });
});

describe('parseSkillUpload — archive', () => {
  it('the docs fixture: core from the single top-level folder, the script only listed', () => {
    const bytes = readFileSync(new URL('../../docs/skills/flaky-test-patterns.zip', import.meta.url));
    const draft = parseSkillUpload('flaky-test-patterns.zip', new Uint8Array(bytes));
    expect(draft.name).toBe('Flaky Test Patterns');
    expect(draft.type).toBe('custom');
    expect(draft.body.startsWith('# Flaky Test Patterns')).toBe(true);
    expect(draft.ignored_files).toEqual(['flaky-test-patterns/scripts/check.sh']);
  });

  it('SKILL.md at the root; every other entry is ignored', () => {
    const draft = parseSkillUpload(
      's.zip',
      zip({ 'SKILL.md': SKILL_MD, 'scripts/run.py': 'print(1)', 'README.md': 'readme' }),
    );
    expect(draft.name).toBe('Over-Mocking');
    expect(draft.ignored_files.sort()).toEqual(['README.md', 'scripts/run.py']);
  });

  it('ignores __MACOSX when finding the top-level folder', () => {
    const draft = parseSkillUpload(
      's.zip',
      zip({ 'rule/SKILL.md': SKILL_MD, '__MACOSX/rule/._SKILL.md': 'junk' }),
    );
    expect(draft.name).toBe('Over-Mocking');
    expect(draft.ignored_files).toEqual(['__MACOSX/rule/._SKILL.md']);
  });

  it('no core file → skill_archive_no_core (missing, nested too deep, or two top-level folders)', () => {
    for (const files of [
      { 'rule/README.md': 'x' },
      { 'a/b/SKILL.md': SKILL_MD },
      { 'a/SKILL.md': SKILL_MD, 'b/SKILL.md': SKILL_MD },
    ]) {
      expect(importError(() => parseSkillUpload('s.zip', zip(files))).code).toBe(
        'skill_archive_no_core',
      );
    }
  });

  it('rejects too many entries and a non-zip payload', () => {
    const many: Record<string, string> = { 'SKILL.md': SKILL_MD };
    for (let i = 0; i < MAX_IMPORT_ENTRIES; i++) many[`f${i}.txt`] = '';
    expect(importError(() => parseSkillUpload('s.zip', zip(many))).code).toBe(
      'skill_import_too_large',
    );
    expect(importError(() => parseSkillUpload('s.zip', md('not a zip'))).code).toBe(
      'skill_import_invalid',
    );
  });

  it('rejects an archive that declares more than 2 MB uncompressed (zip bomb guard)', () => {
    const bomb = zipSync({ 'SKILL.md': strToU8(SKILL_MD), 'big.txt': new Uint8Array(3 * 1024 * 1024) });
    expect(importError(() => parseSkillUpload('s.zip', bomb)).code).toBe('skill_import_too_large');
  });
});

describe('decodeUpload', () => {
  it('decodes base64 and enforces the size limit', () => {
    expect(Buffer.from(decodeUpload(Buffer.from('hi').toString('base64'))).toString()).toBe('hi');
    const big = Buffer.alloc(MAX_IMPORT_UPLOAD_BYTES + 1).toString('base64');
    expect(importError(() => decodeUpload(big)).code).toBe('skill_import_too_large');
    expect(importError(() => decodeUpload('***')).code).toBe('skill_import_invalid');
  });
});
