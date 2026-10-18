/** Constants for the skills module (L02). */

/** Version recorded for a newly created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Largest decoded upload accepted by POST /skills/import (fits the 1 MB bodyLimit as base64). */
export const MAX_IMPORT_UPLOAD_BYTES = 512 * 1024;

/** Largest total uncompressed size an imported archive may declare (zip-bomb guard). */
export const MAX_IMPORT_UNCOMPRESSED_BYTES = 2 * 1024 * 1024;

/** Most entries an imported archive may hold. */
export const MAX_IMPORT_ENTRIES = 200;

/** The file inside an archive that holds the skill; everything else is ignored. */
export const SKILL_CORE_FILE = 'SKILL.md';

/** Archive folders added by OS zip tools — never treated as the skill's top-level folder. */
export const IGNORED_ARCHIVE_DIRS = ['__MACOSX'];
