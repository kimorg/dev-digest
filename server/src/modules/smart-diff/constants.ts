import type { SmartDiffRole } from '@devdigest/shared';

/** Order the groups are returned (and shown) in. */
export const SMART_DIFF_DISPLAY_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

/** Order the classifier tries roles in; the first match wins, `core` is the fallback. */
export const SMART_DIFF_CHECK_ORDER = ['boilerplate', 'tests', 'wiring', 'docs'] as const;

/**
 * Path patterns per role (glob in the comment next to each). Directories match as a
 * segment at any depth. Test patterns are limited to code extensions so that
 * `tsconfig.test.json` is wiring, not a test.
 */
export const ROLE_PATTERNS: Record<(typeof SMART_DIFF_CHECK_ORDER)[number], readonly RegExp[]> = {
  boilerplate: [
    /(^|\/)(pnpm-lock\.yaml|package-lock\.json|package\.json)$/, // lockfiles + package.json
    /\.lock$/, // *.lock
    /(^|\/)(dist|build|__snapshots__)\//, // dist/ build/ __snapshots__/
    /\.snap$/, // *.snap
    /\.generated\.[^/]+$/, // *.generated.*
    /\.min\.(js|css)$/, // *.min.js *.min.css
  ],
  tests: [
    /\.(test|spec)\.[cm]?[jt]sx?$/, // *.test.ts *.spec.js
    /(^|\/)(test|tests|__tests__|e2e|fixtures|__mocks__)\//, // test/ tests/ e2e/ ...
  ],
  wiring: [
    /(^|\/)index\.[^/]+$/, // index.*
    /\.config\.[^/]+$/, // *.config.*
    /(^|\/)tsconfig[^/]*\.json$/, // tsconfig*.json
    /(^|\/)\.[^/]*rc(\.[^/]+)?$/, // .eslintrc.cjs
    /(^|\/)\.env(\.[^/]+)?$/, // .env .env.example
    /(^|\/)(docker-compose[^/]*|Dockerfile[^/]*)$/, // docker-compose*.yml Dockerfile*
    /(^|\/)\.(github|claude|githooks)\//, // .github/ .claude/ .githooks/
  ],
  docs: [
    /\.(md|mdx|txt|rst)$/i, // *.md *.txt
    /(^|\/)(README|CHANGELOG|LICENSE|LICENCE|CONTRIBUTING)[^/]*$/i, // README* CHANGELOG* LICENSE*
    /(^|\/)docs?\//, // docs/ doc/
  ],
};

/** A PR above this many changed lines (additions + deletions) gets a split suggestion. */
export const SPLIT_THRESHOLD_LINES = 500;
