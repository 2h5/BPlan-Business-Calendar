import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@^1.0.0';

import { MemorySupabase } from './memory-supabase.ts';

Deno.test('models simple filtered selects and exact counts', async () => {
  const db = new MemorySupabase({
    items: [
      { id: 'one', owner_id: 'user-1', archived_at: null },
      { id: 'two', owner_id: 'user-1', archived_at: '2026-01-01T00:00:00.000Z' },
      { id: 'three', owner_id: 'user-2', archived_at: null },
    ],
  });

  const result = await db
    .from('items')
    .select('id, owner_id', { count: 'exact' })
    .eq('owner_id', 'user-1')
    .not('archived_at', 'is', null);

  assertEquals(result, {
    data: [{ id: 'two', owner_id: 'user-1' }],
    error: null,
    count: 1,
  });
});

Deno.test('preserves supported update, upsert, and delete behavior', async () => {
  const db = new MemorySupabase({
    items: [
      { id: 'one', value: 'old' },
      { id: 'two', value: 'keep' },
    ],
  });

  const updated = await db
    .from('items')
    .update({ value: 'new' })
    .eq('id', 'one')
    .select('id, value');
  assertEquals(updated.data, [{ id: 'one', value: 'new' }]);

  const upserted = await db
    .from('items')
    .upsert({ id: 'two', value: 'reconciled' }, { onConflict: 'id' })
    .select('id, value')
    .single();
  assertEquals(upserted.data, { id: 'two', value: 'reconciled' });

  const deleted = await db.from('items').delete({ count: 'exact' }).eq('id', 'one');
  assertEquals(deleted, { data: null, error: null, count: 1 });
  assertEquals(db.rows('items'), [{ id: 'two', value: 'reconciled' }]);
});

Deno.test('fails loudly for unsupported query behavior', async () => {
  const db = new MemorySupabase({ items: [{ id: 'one' }] });

  assertThrows(
    () => db.from('items').or('id.eq.one'),
    Error,
    'MemorySupabase does not implement .or();',
  );
  assertThrows(
    () => db.from('items').not('id', 'eq', 'one'),
    Error,
    'MemorySupabase only implements .not(field, "is", null);',
  );
  assertThrows(
    () => db.from('items').select('owner(*)'),
    Error,
    'MemorySupabase only implements flat column projections;',
  );
  assertThrows(
    () => db.from('items').select('id', { count: 'exact' }).limit(-1),
    Error,
    'MemorySupabase .limit() requires a non-negative integer.',
  );
  assertThrows(
    () => db.from('items').upsert({ id: 'one' }, { ignoreDuplicates: true } as never),
    Error,
    'MemorySupabase does not implement .upsert() option "ignoreDuplicates".',
  );
  await assertRejects(
    () => db.rpc('unregistered_rpc', {}),
    Error,
    'MemorySupabase does not implement RPC "unregistered_rpc";',
  );
});
