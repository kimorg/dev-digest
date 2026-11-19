import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/** One run of the conventions extractor over a repo (L02). `failed` rows keep the error. */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['done', 'failed'] }).notNull(),
    model: text('model'),
    /** Clone HEAD the samples were read at — evidence links pin to it. */
    headSha: text('head_sha'),
    sampleFiles: jsonb('sample_files').$type<string[]>().notNull().default([]),
    sampleCount: integer('sample_count').notNull().default(0),
    candidateCount: integer('candidate_count').notNull().default(0),
    droppedCount: integer('dropped_count').notNull().default(0),
    error: text('error'),
    createdAt: now(),
  },
  (t) => ({ repoCreatedIdx: index('convention_scans_repo_created_idx').on(t.repoId, t.createdAt) }),
);

/** A convention candidate: a rule the model proposed, backed by verified evidence lines. */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path'),
    evidenceLineStart: integer('evidence_line_start'),
    evidenceLineEnd: integer('evidence_line_end'),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ repoStatusIdx: index('conventions_repo_status_idx').on(t.repoId, t.status) }),
);
