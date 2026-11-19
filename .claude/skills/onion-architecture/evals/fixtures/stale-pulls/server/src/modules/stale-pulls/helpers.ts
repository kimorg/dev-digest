import type { PullRow } from '../../db/rows.js';
import type { StalePull } from './types.js';

export function toStalePull(row: Pick<PullRow, 'id' | 'number' | 'title' | 'author' | 'updatedAt'>, findingCount: number): StalePull {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    updatedAt: row.updatedAt.toISOString(),
    findingCount,
  };
}
