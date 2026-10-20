import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCandidate, ConventionScan, ConventionStatus } from '@devdigest/shared';
import type { VerifiedConvention } from './domain.js';
import { toConventionDto, toScanDto } from './helpers.js';
import type {
  ConventionPatch,
  ConventionRepo,
  ConventionStore,
  NewConventionScan,
} from './ports.js';

/**
 * Conventions data access (L02). Owns `conventions` and `convention_scans`;
 * reads `repos` only to resolve the repo within the workspace.
 */
export class ConventionRepository implements ConventionStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ConventionRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name, fullName: t.repos.fullName })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async getLatestScan(repoId: string): Promise<ConventionScan | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row ? toScanDto(row) : undefined;
  }

  async listConventions(
    repoId: string,
    statuses: ConventionStatus[],
  ): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.repoId, repoId), inArray(t.conventions.status, statuses)))
      .orderBy(sql`${t.conventions.confidence} desc nulls last`, t.conventions.createdAt);
    return rows.map(toConventionDto);
  }

  async replacePendingWithScan(
    scan: NewConventionScan,
    candidates: VerifiedConvention[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(and(eq(t.conventions.repoId, scan.repoId), eq(t.conventions.status, 'pending')));
      const [row] = await tx.insert(t.conventionScans).values(scan).returning({ id: t.conventionScans.id });
      if (!candidates.length) return;
      await tx.insert(t.conventions).values(
        candidates.map((c) => ({
          ...c,
          workspaceId: scan.workspaceId,
          repoId: scan.repoId,
          scanId: row!.id,
          status: 'pending' as const,
        })),
      );
    });
  }

  async insertFailedScan(scan: NewConventionScan): Promise<void> {
    await this.db.insert(t.conventionScans).values(scan);
  }

  async updateConvention(
    workspaceId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionCandidate | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toConventionDto(row) : undefined;
  }

  async setStatus(
    workspaceId: string,
    repoId: string,
    ids: string[],
    status: 'pending' | 'accepted',
  ): Promise<void> {
    await this.db
      .update(t.conventions)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
          ne(t.conventions.status, 'rejected'),
        ),
      );
  }
}
