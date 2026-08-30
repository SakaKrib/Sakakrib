import {
  protectedDelete,
  protectedGet,
  protectedPatch,
  protectedPost,
  protectedFunctionPost,
} from '@/lib/protectedApi';

/* ============================================================
 * COMPATIBILITY SHIM
 *
 * Replicates the small subset of the supabase-js query builder
 * actually used across this codebase's service files (.from().select()
 * .eq()/.in()/.order()/.limit()/.single()/.maybeSingle(), .insert(),
 * .update(), .delete(), and .rpc()) — implemented entirely on top of
 * protectedApi.ts's cookie-based transport (/rest/v1/... paths).
 *
 * NOT a full supabase-js reimplementation — only what this codebase's
 * service files call. If a file uses a query pattern not covered here
 * (e.g. .or(), .neq(), .gte()), extend this shim rather than adding a
 * second transport mechanism.
 *
 * ASSUMPTION, NOT VERIFIED: that protected-api's proxy returns raw
 * PostgREST response bodies unwrapped (a plain array for SELECT, the
 * function's own return value for RPC) — this matches protectedApi.ts's
 * own implementation (readJson() does no envelope unwrapping), but I
 * have not seen protected-api's actual source. If it wraps responses
 * differently, only the two `execute()`/`rpc()` blocks below need
 * adjusting — nothing else in any service file would need to change.
 * ============================================================ */

interface ShimResult<T> {
  data: T | null;
  error: { message: string } | null;
}

class QueryBuilder<T = unknown> {
  private table: string;
  private selectCols = '*';
  private filters: string[] = [];
  private orderClauses: string[] = [];
  private limitVal: number | null = null;
  private singleMode: 'none' | 'single' | 'maybeSingle' = 'none';
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: unknown = null;

  constructor(table: string) {
    this.table = table;
  }

  select(cols = '*') {
    this.selectCols = cols;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push(`${column}=eq.${encodeURIComponent(String(value))}`);
    return this;
  }

  in(column: string, values: unknown[]) {
    const list = values.map((v) => encodeURIComponent(String(v))).join(',');
    this.filters.push(`${column}=in.(${list})`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderClauses.push(`${column}.${opts?.ascending === false ? 'desc' : 'asc'}`);
    return this;
  }

  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybeSingle';
    return this;
  }

  insert(row: Record<string, unknown>) {
    this.op = 'insert';
    this.payload = row;
    return this;
  }

  update(row: Record<string, unknown>) {
    this.op = 'update';
    this.payload = row;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  private buildQueryString(): string {
    const params: string[] = [];

    if (this.op === 'select' && this.selectCols) {
      params.push(`select=${encodeURIComponent(this.selectCols)}`);
    }

    params.push(...this.filters);

    if (this.orderClauses.length > 0) {
      params.push(`order=${this.orderClauses.join(',')}`);
    }

    if (this.limitVal !== null) {
      params.push(`limit=${this.limitVal}`);
    }

    return params.length > 0 ? `?${params.join('&')}` : '';
  }

  private async execute(): Promise<ShimResult<T>> {
    const path = `/rest/v1/${this.table}${this.buildQueryString()}`;

    const singleHeaders =
      this.singleMode !== 'none'
        ? { Accept: 'application/vnd.pgrst.object+json' }
        : undefined;

    try {
      let data: unknown;

      if (this.op === 'select') {
        data = await protectedGet(path, { headers: singleHeaders });
      } else if (this.op === 'insert') {
        data = await protectedPost(path, this.payload, {
          headers: { ...singleHeaders, Prefer: 'return=representation' },
        });
      } else if (this.op === 'update') {
        data = await protectedPatch(path, this.payload, {
          headers: { ...singleHeaders, Prefer: 'return=representation' },
        });
      } else {
        data = await protectedDelete(path);
      }

      // Insert/update return arrays from PostgREST even for a single
      // row unless the Accept header above requested an object — for
      // insert/update we always want the row itself, not a 1-item array.
      if (
        (this.op === 'insert' || this.op === 'update') &&
        Array.isArray(data)
      ) {
        data = data[0] ?? null;
      }

      if (this.singleMode === 'maybeSingle' && Array.isArray(data)) {
        data = data[0] ?? null;
      }

      return { data: data as T, error: null };
    } catch (err) {
      return {
        data: null,
        error: {
          message: err instanceof Error ? err.message : 'Request failed',
        },
      };
    }
  }

  // Thenable — lets callers `await supabase.from(...).select()...`
  // exactly as they already do with supabase-js, no call-site changes.
  then<TResult1 = ShimResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: ShimResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

async function rpc<T = unknown>(
  name: string,
  params?: Record<string, unknown>
): Promise<ShimResult<T>> {
  try {
    const data = await protectedPost<T>(`/rest/v1/rpc/${name}`, params ?? {});
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : 'RPC request failed',
      },
    };
  }
}

export const supabase = {
  from: <T = unknown>(table: string) => new QueryBuilder<T>(table),
  rpc,
  functions: {
    invoke: async <T = unknown>(
      functionName: string,
      options?: { body?: unknown }
    ): Promise<ShimResult<T>> => {
      try {
        const path = `/${functionName.replace(/^\/+/, '')}`;
        const data = await protectedFunctionPost<T>(
          path,
          options?.body ?? {}
        );

        return { data, error: null };
      } catch (err) {
        return {
          data: null,
          error: {
            message:
              err instanceof Error
                ? err.message
                : 'Function request failed',
          },
        };
      }
    },
  },
};

/* ============================================================
 * CURRENT USER ID
 *
 * Under the HttpOnly-cookie model, supabase.auth.getUser() cannot
 * work client-side (no session object exists in JS at all). This
 * replaces it via get_my_profile() — a minimal new RPC (added this
 * session, SECURITY INVOKER, relies on the existing profiles RLS
 * `auth.uid() = id` policy — no elevated privilege) that returns the
 * caller's own row exactly like every other get_my_* RPC in this app.
 *
 * Throws the same "session expired" message callers already expect
 * from the old requireUserId() pattern, so call sites don't need to
 * change their error handling.
 * ============================================================ */

export async function getCurrentUserId(): Promise<string> {
  const { data, error } = await rpc<{ id: string } | null>('get_my_profile');

  if (error || !data?.id) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  return data.id;
}