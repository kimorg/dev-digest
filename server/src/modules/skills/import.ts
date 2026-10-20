import { unzipSync } from 'fflate';
import { parse as parseYaml } from 'yaml';
import { SKILL_BODY_MAX, SKILL_NAME_MAX, SkillType } from '@devdigest/shared';
import type { SkillImportDraft } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import {
  IGNORED_ARCHIVE_DIRS,
  MAX_IMPORT_ENTRIES,
  MAX_IMPORT_UNCOMPRESSED_BYTES,
  MAX_IMPORT_UPLOAD_BYTES,
  SKILL_CORE_FILE,
} from './constants.js';

/**
 * Skill import parser (POST /skills/import). Pure: bytes in → draft out, no DB,
 * no filesystem. An archive is read in memory; only its SKILL.md is ever
 * decompressed — every other entry is listed in `ignored_files` and never
 * executed, unpacked or stored.
 */

/** A rejected upload — the shared error handler answers 422 with this `code`. */
export class SkillImportError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 422);
    this.name = 'SkillImportError';
  }
}

const BASE64_RE = /^[A-Za-z0-9+/\s]*={0,2}\s*$/;
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const HEADING_RE = /^#[ \t]+(.+?)[ \t#]*$/m;

/** Decode the base64 upload and enforce the upload size limit. */
export function decodeUpload(contentBase64: string): Uint8Array {
  if (!BASE64_RE.test(contentBase64)) {
    throw new SkillImportError('skill_import_invalid', 'File content is not valid base64');
  }
  const bytes = Buffer.from(contentBase64, 'base64');
  if (bytes.byteLength === 0) {
    throw new SkillImportError('skill_import_invalid', 'File is empty');
  }
  if (bytes.byteLength > MAX_IMPORT_UPLOAD_BYTES) {
    throw new SkillImportError(
      'skill_import_too_large',
      `File is larger than ${MAX_IMPORT_UPLOAD_BYTES / 1024} KB`,
    );
  }
  return new Uint8Array(bytes);
}

/** Parse a `.md` or `.zip` upload into a reviewable draft. Throws SkillImportError. */
export function parseSkillUpload(filename: string, bytes: Uint8Array): SkillImportDraft {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md')) return parseSkillMarkdown(decodeText(bytes, filename), baseName(filename), []);
  if (lower.endsWith('.zip')) return parseSkillArchive(bytes);
  throw new SkillImportError(
    'skill_import_unsupported',
    'Only .md files and .zip archives can be imported',
  );
}

function parseSkillArchive(bytes: Uint8Array): SkillImportDraft {
  // Pass 1: read the central directory only (filter → false decompresses nothing).
  const entries: { name: string; originalSize: number }[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entries.push({ name: f.name, originalSize: f.originalSize });
        return false;
      },
    });
  } catch {
    throw new SkillImportError('skill_import_invalid', 'File is not a valid .zip archive');
  }

  if (entries.length > MAX_IMPORT_ENTRIES) {
    throw new SkillImportError(
      'skill_import_too_large',
      `Archive has more than ${MAX_IMPORT_ENTRIES} entries`,
    );
  }
  const declared = entries.reduce((sum, e) => sum + e.originalSize, 0);
  if (declared > MAX_IMPORT_UNCOMPRESSED_BYTES) {
    throw new SkillImportError(
      'skill_import_too_large',
      `Archive unpacks to more than ${MAX_IMPORT_UNCOMPRESSED_BYTES / (1024 * 1024)} MB`,
    );
  }

  const files = entries.map((e) => e.name).filter((n) => !n.endsWith('/'));
  const core = findCoreFile(files);
  if (!core) {
    throw new SkillImportError(
      'skill_archive_no_core',
      `Archive has no ${SKILL_CORE_FILE} at its root or in its only top-level folder`,
    );
  }

  // Pass 2: decompress the core file only.
  const unpacked = unzipSync(bytes, { filter: (f) => f.name === core });
  const coreBytes = unpacked[core];
  if (!coreBytes || coreBytes.byteLength > MAX_IMPORT_UNCOMPRESSED_BYTES) {
    throw new SkillImportError('skill_import_invalid', `Could not read ${core}`);
  }
  const folder = core.includes('/') ? core.slice(0, core.indexOf('/')) : '';
  const ignored = files.filter((n) => n !== core);
  return parseSkillMarkdown(decodeText(coreBytes, core), folder || 'skill', ignored);
}

/** SKILL.md at the root, else inside the archive's single top-level folder. */
function findCoreFile(files: string[]): string | undefined {
  if (files.includes(SKILL_CORE_FILE)) return SKILL_CORE_FILE;
  const topDirs = new Set(
    files
      .filter((n) => n.includes('/'))
      .map((n) => n.slice(0, n.indexOf('/')))
      .filter((d) => !IGNORED_ARCHIVE_DIRS.includes(d)),
  );
  const rootFiles = files.filter((n) => !n.includes('/'));
  if (topDirs.size !== 1 || rootFiles.length > 0) return undefined;
  const [dir] = [...topDirs];
  const candidate = `${dir}/${SKILL_CORE_FILE}`;
  return files.includes(candidate) ? candidate : undefined;
}

/**
 * Split optional YAML frontmatter (`name`, `description`, `type`) from the body.
 * Name falls back to the first `# ` heading, then to `fallbackName`.
 */
export function parseSkillMarkdown(
  text: string,
  fallbackName: string,
  ignoredFiles: string[],
): SkillImportDraft {
  const warnings: string[] = [];
  let meta: Record<string, unknown> = {};
  let body = text;

  const fm = FRONTMATTER_RE.exec(text);
  if (fm) {
    body = text.slice(fm[0].length);
    try {
      const parsed: unknown = parseYaml(fm[1] ?? '');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
      } else {
        warnings.push('Frontmatter is not a key/value map — ignored.');
      }
    } catch {
      warnings.push('Frontmatter is not valid YAML — ignored.');
    }
  }
  body = body.trim();
  if (body.length === 0) {
    throw new SkillImportError('skill_import_invalid', 'The skill has no body');
  }
  if (body.length > SKILL_BODY_MAX) {
    throw new SkillImportError(
      'skill_import_too_large',
      `The skill body is longer than ${SKILL_BODY_MAX} characters`,
    );
  }

  let name = str(meta.name) ?? HEADING_RE.exec(body)?.[1]?.trim() ?? fallbackName;
  if (name.length > SKILL_NAME_MAX) {
    name = name.slice(0, SKILL_NAME_MAX);
    warnings.push(`Name was cut to ${SKILL_NAME_MAX} characters.`);
  }

  const description = str(meta.description) ?? '';
  if (!description) warnings.push('No description — write one before saving.');

  const rawType = str(meta.type);
  const type = SkillType.safeParse(rawType);
  if (!type.success) {
    warnings.push(
      rawType ? `Unknown type "${rawType}" — defaulted to custom.` : 'No type — defaulted to custom.',
    );
  }

  return {
    name,
    description,
    type: type.success ? type.data : 'custom',
    body,
    ignored_files: ignoredFiles,
    warnings,
  };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function decodeText(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new SkillImportError('skill_import_invalid', `${label} is not UTF-8 text`);
  }
}

function baseName(filename: string): string {
  const leaf = filename.split(/[\\/]/).pop() ?? filename;
  return leaf.replace(/\.md$/i, '') || 'skill';
}
