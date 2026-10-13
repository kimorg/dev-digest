import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * findings-export module.
 *   GET    /reviews/:id/findings/export       → findings of a review as CSV
 *   GET    /findings/stats?severity=…         → finding counts per category
 *   POST   /reviews/:id/findings/dismiss-all  → dismiss every finding of a review
 */
const ExportQuery = z.object({ limit: z.string().optional() });
const StatsQuery = z.object({ severity: z.string().default('CRITICAL') });

function toCsv(rows: any[]): string {
  if (rows.length === 0) return '';
  const header = Object.keys(rows[0]).join(',');
  const lines = rows.map((r) => Object.values(r).join(','));
  return [header, ...lines].join('\n');
}

export default async function findingsExportRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // ---- CSV export of one review's findings ---------------------------
  app.get(
    '/reviews/:id/findings/export',
    { schema: { params: IdParams, querystring: ExportQuery } },
    async (req, reply) => {
      await getContext(container, req);
      const limit = Number(req.query.limit) || 500;

      try {
        const rows = await container.db
          .select()
          .from(t.findings)
          .where(eq(t.findings.reviewId, req.params.id))
          .limit(limit);

        const out = [];
        for (const f of rows) {
          const [review] = await container.db
            .select({ model: t.reviews.model, score: t.reviews.score })
            .from(t.reviews)
            .where(eq(t.reviews.id, f.reviewId));
          out.push({
            severity: f.severity,
            category: f.category,
            file: f.file,
            line: f.startLine,
            title: f.title,
            model: review?.model ?? '',
            score: review?.score ?? '',
          });
        }

        reply.header('content-type', 'text/csv');
        return toCsv(out);
      } catch {
        reply.header('content-type', 'text/csv');
        return '';
      }
    },
  );

  // ---- Per-category counts for one severity --------------------------
  app.get('/findings/stats', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const { severity } = StatsQuery.parse(req.query);

    const result = await container.db.execute(
      sql.raw(`
        SELECT f.category, count(*)::int AS total
        FROM findings f
        JOIN reviews r ON r.id = f.review_id
        WHERE r.workspace_id = '${workspaceId}' AND f.severity = '${severity}'
        GROUP BY f.category
      `),
    );
    return { severity, categories: result };
  });

  // ---- Bulk dismiss ---------------------------------------------------
  app.post(
    '/reviews/:id/findings/dismiss-all',
    { schema: { params: IdParams } },
    async (req) => {
      await getContext(container, req);
      const rows = await container.db
        .select({ id: t.findings.id })
        .from(t.findings)
        .where(eq(t.findings.reviewId, req.params.id));

      rows.forEach(async (row) => {
        await container.db
          .update(t.findings)
          .set({ dismissedAt: new Date() })
          .where(eq(t.findings.id, row.id));
      });

      return { ok: true, dismissed: rows.length };
    },
  );
}
