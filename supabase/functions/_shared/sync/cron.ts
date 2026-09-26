import { constantTimeEqual } from '../billing/constant-time.ts';
import { EdgeError } from '../errors/index.ts';

export const SYNC_CRON_SECRET_HEADER = 'X-Sync-Cron-Secret';

/**
 * Fail closed: without a configured secret the scheduled endpoint refuses to
 * run at all, because an open endpoint that drains a job queue is worse than a
 * schedule that never fires.
 */
export function requireCronSecret(request: Request, expected: string | undefined): void {
  if (!expected) {
    console.error(JSON.stringify({ code: 'CRON_SECRET_MISSING' }));
    throw new EdgeError('NOT_AUTHORIZED', 'Scheduled sync is not configured.', 503);
  }

  const supplied = request.headers.get(SYNC_CRON_SECRET_HEADER);
  if (!supplied || !constantTimeEqual(supplied, expected)) {
    throw new EdgeError('NOT_AUTHORIZED', 'Not allowed.', 403);
  }
}

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

export const CRON_PAGE_SIZE = 500;

/**
 * Read every row a scheduled task selects, one stable page at a time.
 *
 * A single capped read silently starves whatever sorts past the cap: the
 * same first N connections would be reconciled every day and the rest never.
 * `fetchPage` must apply a total order (for example `.order('id')`) before
 * `.range(from, to)`, so pages neither overlap nor skip rows.
 */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = CRON_PAGE_SIZE,
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: rows, error };

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
