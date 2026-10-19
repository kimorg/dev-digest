import { describe, it, expect } from 'vitest';
import { isUnreadableFileError } from '../src/modules/conventions/helpers.js';
import { PathEscapeError, ValidationError } from '../src/platform/errors.js';

// The conventions scan skips a file it can't read instead of failing the whole scan.
describe('isUnreadableFileError', () => {
  it('is true for a missing file, a directory, and a path outside the working tree', () => {
    for (const code of ['ENOENT', 'EISDIR', 'ENOTDIR']) {
      expect(isUnreadableFileError(Object.assign(new Error(code), { code }))).toBe(true);
    }
    expect(isUnreadableFileError(new PathEscapeError('.git/config'))).toBe(true);
  });

  it('is false for any other failure, so the scan still reports it', () => {
    expect(isUnreadableFileError(Object.assign(new Error('EACCES'), { code: 'EACCES' }))).toBe(false);
    expect(isUnreadableFileError(new ValidationError())).toBe(false);
    expect(isUnreadableFileError(new Error('boom'))).toBe(false);
    expect(isUnreadableFileError(null)).toBe(false);
  });
});
