import { describe, expect, it } from 'vitest';

import { migrationViolations } from './migration-rules.mjs';

const merged = [
  '20260924000003_profile_avatars.sql',
  '20260925000001_cron_schedule_installers.sql',
];

describe('migration rules', () => {
  it('accepts a new, later migration', () => {
    const added = '20260926000001_next_change.sql';
    expect(
      migrationViolations({
        baseFiles: merged,
        headFiles: [...merged, added],
        changes: [{ status: 'A', path: `supabase/migrations/${added}` }],
      }),
    ).toEqual([]);
  });

  it('rejects editing, deleting, or renaming a merged migration', () => {
    const violations = migrationViolations({
      baseFiles: merged,
      headFiles: merged,
      changes: [
        { status: 'M', path: `supabase/migrations/${merged[0]}` },
        { status: 'D', path: `supabase/migrations/${merged[1]}` },
      ],
    });
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('must not change');
  });

  it('rejects a new migration that sorts before merged ones', () => {
    const backdated = '20260901000099_backdated.sql';
    expect(
      migrationViolations({
        baseFiles: merged,
        headFiles: [...merged, backdated],
        changes: [{ status: 'A', path: `supabase/migrations/${backdated}` }],
      }),
    ).toEqual([expect.stringContaining('must sort after')]);
  });

  it('rejects malformed names and duplicate versions', () => {
    const violations = migrationViolations({
      baseFiles: merged,
      headFiles: [...merged, '20260926000001_a.sql', '20260926000001_b.sql', 'fix.sql'],
      changes: [],
    });
    expect(violations).toEqual([
      expect.stringContaining('is also used by'),
      expect.stringContaining('expected <14-digit timestamp>'),
    ]);
  });
});
