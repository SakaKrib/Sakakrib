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
 * This intentionally keeps the existing supabase-style API used by
 * the landlord services. The transport is still the HttpOnly-cookie
 * protectedApi transport; only the TypeScript boundary is made
 * compatible with the existing call sites.
 *
 * IMPORTANT:
 * - Existing exports are preserved exactly.
 * - No landlord service/component needs to change.
 * - The default generic is intentionally `any`, not `unknown`.
 *   The old supabase-js client exposed structurally usable response
 *   values at these call sites. Using `unknown` here causes a cascade
 *   of errors such as `.map()`, `.rent_paid_in_advance`, `.id`, etc.
 * - This is a compatibility layer, not a new application-wide type
 *   model. Strongly typed callers can still supply their own generic.
 * ============================================================ */

interface ShimResult<T> {
  data: T | null;
  error: { message: string } | null;
}

class QueryBuilder<T = any> {
  private table: string;
  private selectCols = '*';
  private filters: string[] = [];
  private orderClauses: string[] = [];
  private limitVal: number | null = null;
  private singleMode: 'none' | 'single' | 'maybeSingle' = 'none';
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any = null;

  constructor(table: string) {
    this.table = table;
  }

  select(cols = '*') {
    this.selectCols = cols;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push(
      `${column}=eq.${encodeURIComponent(String(value))}`
    );
    return this;
  }

  in(column: string, values: any[]) {
    const list = values
      .map((value) => encodeURIComponent(String(value)))
      .join(',');

    this.filters.push(`${column}=in.(${list})`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderClauses.push(
      `${column}.${opts?.ascending === false ? 'desc' : 'asc'}`
    );
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

  insert(row: Record<string, any>) {
    this.op = 'insert';
    this.payload = row;
    return this;
  }

  update(row: Record<string, any>) {
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
      let data: any;

      if (this.op === 'select') {
        data = await protectedGet<any>(path, {
          headers: singleHeaders,
        });
      } else if (this.op === 'insert') {
        data = await protectedPost<any>(path, this.payload, {
          headers: {
            ...singleHeaders,
            Prefer: 'return=representation',
          },
        });
      } else if (this.op === 'update') {
        data = await protectedPatch<any>(path, this.payload, {
          headers: {
            ...singleHeaders,
            Prefer: 'return=representation',
          },
        });
      } else {
        data = await protectedDelete<any>(path);
      }

      /*
       * Preserve the old service behaviour:
       * insert/update are normally used for one row in this codebase,
       * so unwrap a one-item PostgREST representation when necessary.
       */
      if (
        (this.op === 'insert' || this.op === 'update') &&
        Array.isArray(data)
      ) {
        data = data[0] ?? null;
      }

      /*
       * maybeSingle() must turn an empty array into null while keeping
       * a returned object unchanged.
       */
      if (this.singleMode === 'maybeSingle' && Array.isArray(data)) {
        data = data[0] ?? null;
      }

      return {
        data: data as T,
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: {
          message:
            err instanceof Error
              ? err.message
              : 'Request failed',
        },
      };
    }
  }

  // Thenable — preserves the existing `await supabase.from(...)...`
  // call pattern without changing any service/component exports.
  then<TResult1 = ShimResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: ShimResult<T>
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

async function rpc<T = any>(
  name: string,
  params?: Record<string, any>
): Promise<ShimResult<T>> {
  try {
    const data = await protectedPost<T>(
      `/rest/v1/rpc/${name}`,
      params ?? {}
    );

    return {
      data,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: {
        message:
          err instanceof Error
            ? err.message
            : 'RPC request failed',
      },
    };
  }
}

/*
 * EXPORTS PRESERVED:
 * `supabase` and `getCurrentUserId` remain the same exports.
 */
export const supabase = {
  from: <T = any>(table: string) => new QueryBuilder<T>(table),
  rpc,
  functions: {
    invoke: async <T = any>(
      functionName: string,
      options?: { body?: unknown }
    ): Promise<ShimResult<T>> => {
      try {
        const path = `/${functionName.replace(/^\/+/, '')}`;

        const data = await protectedFunctionPost<T>(
          path,
          options?.body ?? {}
        );

        return {
          data,
          error: null,
        };
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
 * work client-side because the session is not exposed to JavaScript.
 * This keeps the existing getCurrentUserId() export and obtains the
 * caller's ID through the existing RPC.
 * ============================================================ */

export async function getCurrentUserId(): Promise<string> {
  const { data, error } = await rpc<{ id: string } | null>(
    'get_my_profile'
  );

  if (error || !data?.id) {
    throw new Error(
      'Your session has expired. Please sign in again.'
    );
  }

  return data.id;
}
