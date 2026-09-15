import type { SupabaseClient } from '@supabase/supabase-js';

export type MemoryRow = Record<string, unknown>;
export type MemoryOperation = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

export interface MemoryError {
  code: string;
  message?: string;
}

interface FailurePlan {
  table: string;
  operation: MemoryOperation;
  error: MemoryError;
}

export type MemoryRpcHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

interface Filter {
  field: string;
  kind: 'eq' | 'in' | 'not';
  value: unknown;
}

interface QueryResult {
  data: unknown;
  error: MemoryError | null;
  count?: number | null;
}

interface MemorySelectOptions {
  count?: 'exact';
}

interface MemoryDeleteOptions {
  count?: 'exact';
}

interface MemoryUpsertOptions {
  onConflict?: string;
}

/**
 * Small in-memory PostgREST double for shared lifecycle tests.
 *
 * It models only the query-builder operations used by the sync engine and
 * push path, while retaining filters and mutation order like a real query.
 * Tests still exercise production SQL-shaped calls without needing Supabase.
 */
export class MemorySupabase {
  readonly operations: string[] = [];
  readonly rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
  private readonly tables = new Map<string, MemoryRow[]>();
  private readonly failures: FailurePlan[] = [];
  private readonly rpcHandlers = new Map<string, MemoryRpcHandler>();
  private nextId = 1;

  constructor(seed: Record<string, MemoryRow[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) {
      this.tables.set(
        table,
        rows.map((row) => ({ ...row })),
      );
    }
  }

  from(table: string): MemoryQuery {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return new MemoryQuery(this, table);
  }

  rpc(name: string, params: Record<string, unknown>): Promise<QueryResult> {
    this.rpcCalls.push({ name, params });
    const handler = this.rpcHandlers.get(name);
    if (!handler) {
      return Promise.reject(
        new Error(`MemorySupabase does not implement RPC "${name}"; register a handler first.`),
      );
    }

    return Promise.resolve(handler(params)).then((data) => ({ data, error: null }));
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }

  rows(table: string): MemoryRow[] {
    return this.tables.get(table) ?? [];
  }

  failNext(
    table: string,
    operation: MemoryOperation,
    error: MemoryError = { code: 'TEST_FAILURE' },
  ): void {
    this.failures.push({ table, operation, error });
  }

  onRpc(name: string, handler: MemoryRpcHandler): void {
    this.rpcHandlers.set(name, handler);
  }

  nextGeneratedId(): string {
    const suffix = String(this.nextId).padStart(12, '0');
    this.nextId += 1;
    return `00000000-0000-0000-0000-${suffix}`;
  }

  consumeFailure(table: string, operation: MemoryOperation): MemoryError | null {
    const index = this.failures.findIndex(
      (failure) => failure.table === table && failure.operation === operation,
    );
    if (index < 0) return null;
    const [failure] = this.failures.splice(index, 1);
    return failure?.error ?? null;
  }

  execute(
    table: string,
    operation: MemoryOperation,
    filters: Filter[],
    projection: string | null,
    payload: MemoryRow | MemoryRow[] | null,
    onConflict: string | null,
    limit: number | null,
    countExact: boolean,
  ): QueryResult {
    this.operations.push(`${operation}:${table}`);
    const failure = this.consumeFailure(table, operation);
    if (failure) return { data: null, error: failure, count: null };

    const tableRows = this.tables.get(table) ?? [];
    const filtered = filterRows(tableRows, filters);
    const matching = filtered.slice(0, limit ?? filtered.length);

    switch (operation) {
      case 'select':
        return {
          data: matching.map((row) => project(row, projection)),
          error: null,
          ...(countExact ? { count: filtered.length } : {}),
        };
      case 'insert':
        return this.insert(tableRows, payload, projection, countExact);
      case 'update':
        return this.update(matching, payload, projection, countExact);
      case 'upsert':
        return this.upsert(tableRows, payload, onConflict, projection, countExact);
      case 'delete':
        return this.remove(tableRows, matching, countExact);
    }
  }

  private insert(
    tableRows: MemoryRow[],
    payload: MemoryRow | MemoryRow[] | null,
    projection: string | null,
    countExact: boolean,
  ): QueryResult {
    const rows = asRows(payload);
    for (const row of rows) {
      const inserted = { ...row };
      if (inserted.id === undefined) inserted.id = this.nextGeneratedId();
      tableRows.push(inserted);
    }
    return {
      data: rows.map((_, index) =>
        project(tableRows[tableRows.length - rows.length + index]!, projection),
      ),
      error: null,
      ...(countExact ? { count: rows.length } : {}),
    };
  }

  private update(
    matching: MemoryRow[],
    payload: MemoryRow | MemoryRow[] | null,
    projection: string | null,
    countExact: boolean,
  ): QueryResult {
    const values = asSingleRow(payload);
    for (const row of matching) Object.assign(row, values);
    return {
      data: matching.map((row) => project(row, projection)),
      error: null,
      ...(countExact ? { count: matching.length } : {}),
    };
  }

  private upsert(
    tableRows: MemoryRow[],
    payload: MemoryRow | MemoryRow[] | null,
    onConflict: string | null,
    projection: string | null,
    countExact: boolean,
  ): QueryResult {
    const incoming = asRows(payload);
    const touched: MemoryRow[] = [];
    const conflictFields = (onConflict ?? '')
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean);

    for (const row of incoming) {
      const existing =
        conflictFields.length === 0
          ? undefined
          : tableRows.find((candidate) =>
              conflictFields.every((field) => candidate[field] === row[field]),
            );
      if (existing) {
        Object.assign(existing, row);
        touched.push(existing);
      } else {
        const inserted = { ...row };
        if (inserted.id === undefined) inserted.id = this.nextGeneratedId();
        tableRows.push(inserted);
        touched.push(inserted);
      }
    }

    return {
      data: touched.map((row) => project(row, projection)),
      error: null,
      ...(countExact ? { count: touched.length } : {}),
    };
  }

  private remove(tableRows: MemoryRow[], matching: MemoryRow[], countExact: boolean): QueryResult {
    const removeSet = new Set(matching);
    const before = tableRows.length;
    const remaining = tableRows.filter((row) => !removeSet.has(row));
    tableRows.splice(0, tableRows.length, ...remaining);
    return { data: null, error: null, count: countExact ? before - remaining.length : null };
  }
}

export class MemoryQuery implements PromiseLike<QueryResult> {
  private operation: MemoryOperation = 'select';
  private filters: Filter[] = [];
  private projection: string | null = null;
  private payload: MemoryRow | MemoryRow[] | null = null;
  private onConflict: string | null = null;
  private limitValue: number | null = null;
  private countExact = false;

  constructor(
    private readonly database: MemorySupabase,
    private readonly table: string,
  ) {}

  select(columns = '*', options?: MemorySelectOptions): this {
    const selectOptions = supportedOptions(options, '.select()', ['count']);
    if (selectOptions.count !== undefined && selectOptions.count !== 'exact') {
      throw new Error('MemorySupabase only implements .select({ count: "exact" }).');
    }
    this.projection = normaliseProjection(columns);
    this.countExact = selectOptions.count === 'exact';
    return this;
  }

  eq(field: string, value: unknown): this {
    this.filters.push({ field, kind: 'eq', value });
    return this;
  }

  in(field: string, values: unknown[]): this {
    if (!Array.isArray(values)) {
      throw new Error('MemorySupabase .in() requires an array of values.');
    }
    this.filters.push({ field, kind: 'in', value: values });
    return this;
  }

  not(field: string, operator: string, value: unknown): this {
    if (operator !== 'is' || value !== null) {
      throw new Error(
        'MemorySupabase only implements .not(field, "is", null); add support before using another form.',
      );
    }
    this.filters.push({ field, kind: 'not', value: { operator, value } });
    return this;
  }

  or(_filters: string): this {
    throw new Error(
      'MemorySupabase does not implement .or(); add support before testing code that depends on it.',
    );
  }

  limit(value: number): this {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('MemorySupabase .limit() requires a non-negative integer.');
    }
    this.limitValue = value;
    return this;
  }

  insert(values: MemoryRow | MemoryRow[]): this {
    this.operation = 'insert';
    this.payload = values;
    return this;
  }

  update(values: MemoryRow): this {
    this.operation = 'update';
    this.payload = values;
    return this;
  }

  upsert(values: MemoryRow | MemoryRow[], options: MemoryUpsertOptions = {}): this {
    const upsertOptions = supportedOptions(options, '.upsert()', ['onConflict']);
    const onConflict = upsertOptions.onConflict;
    if (onConflict !== undefined && typeof onConflict !== 'string') {
      throw new Error('MemorySupabase .upsert() requires onConflict to be a string.');
    }
    this.operation = 'upsert';
    this.payload = values;
    this.onConflict = onConflict === undefined ? null : onConflict;
    return this;
  }

  delete(options: MemoryDeleteOptions = {}): this {
    const deleteOptions = supportedOptions(options, '.delete()', ['count']);
    if (deleteOptions.count !== undefined && deleteOptions.count !== 'exact') {
      throw new Error('MemorySupabase only implements .delete({ count: "exact" }).');
    }
    this.operation = 'delete';
    this.countExact = deleteOptions.count === 'exact';
    return this;
  }

  maybeSingle(): Promise<QueryResult> {
    return this.executeSingle(false);
  }

  single(): Promise<QueryResult> {
    return this.executeSingle(true);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private executeSingle(required: boolean): Promise<QueryResult> {
    const result = this.execute();
    if (result.error) return Promise.resolve(result);

    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length === 1) return Promise.resolve({ ...result, data: rows[0] });
    if (!required && rows.length === 0) return Promise.resolve({ ...result, data: null });
    return Promise.resolve({
      data: null,
      error: { code: 'PGRST116', message: 'Expected one row.' },
    });
  }

  private execute(): QueryResult {
    return this.database.execute(
      this.table,
      this.operation,
      this.filters,
      this.projection,
      this.payload,
      this.onConflict,
      this.limitValue,
      this.countExact,
    );
  }
}

function asRows(payload: MemoryRow | MemoryRow[] | null): MemoryRow[] {
  if (payload === null) {
    throw new Error('MemorySupabase mutation payload cannot be null.');
  }
  const values: unknown[] = Array.isArray(payload) ? payload : [payload];
  if (values.some((value) => !isRecord(value))) {
    throw new Error('MemorySupabase mutation payload must contain row objects.');
  }
  return values.map((value) => value as MemoryRow);
}

function asSingleRow(payload: MemoryRow | MemoryRow[] | null): MemoryRow {
  if (payload === null || Array.isArray(payload) || !isRecord(payload)) {
    throw new Error('MemorySupabase .update() requires one row object.');
  }
  return payload;
}

function filterRows(rows: MemoryRow[], filters: Filter[]): MemoryRow[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.kind === 'eq') return row[filter.field] === filter.value;
      if (filter.kind === 'in') {
        if (!Array.isArray(filter.value)) {
          throw new Error('MemorySupabase internal .in() filter is malformed.');
        }
        return filter.value.includes(row[filter.field]);
      }

      if (!isRecord(filter.value)) {
        throw new Error('MemorySupabase internal .not() filter is malformed.');
      }
      const operator = filter.value.operator;
      const value = filter.value.value;
      if (operator !== 'is' || value !== null) {
        throw new Error('MemorySupabase internal .not() filter uses an unsupported operator.');
      }
      return row[filter.field] !== null && row[filter.field] !== undefined;
    }),
  );
}

function normaliseProjection(projection: string): string {
  if (typeof projection !== 'string') {
    throw new Error('MemorySupabase .select() requires a column list string.');
  }
  const trimmed = projection.trim();
  if (trimmed === '*') return '*';
  if (trimmed.length === 0) {
    throw new Error('MemorySupabase .select() requires at least one column.');
  }

  const fields = trimmed.split(',').map((field) => field.trim());
  if (fields.some((field) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field))) {
    throw new Error(
      'MemorySupabase only implements flat column projections; nested or aliased selects need explicit support.',
    );
  }
  return fields.join(',');
}

function project(row: MemoryRow, projection: string | null): MemoryRow {
  if (!projection || projection === '*') return { ...row };
  const fields = projection.split(',').map((field) => field.trim());

  const selected: MemoryRow = {};
  for (const field of fields) {
    if (field in row) selected[field] = row[field];
  }
  return selected;
}

function supportedOptions(
  options: unknown,
  operation: string,
  supported: readonly string[],
): Record<string, unknown> {
  if (options === undefined) return {};
  if (!isRecord(options)) {
    throw new Error(`MemorySupabase ${operation} options must be an object.`);
  }
  for (const key of Object.keys(options)) {
    if (!supported.includes(key)) {
      throw new Error(`MemorySupabase does not implement ${operation} option "${key}".`);
    }
  }
  return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
