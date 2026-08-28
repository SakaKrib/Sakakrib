import { AUTH_GATEWAY_URL } from '@/lib/authGateway';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase anon key configuration.');
}

export interface ProtectedApiErrorShape {
  error?: string;
  code?: string;
}

export class ProtectedApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ProtectedApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  action: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('apikey', SUPABASE_ANON_KEY);

  const response = await fetch(
    `${AUTH_GATEWAY_URL.replace(/auth-gateway$/, 'protected-api')}?action=${encodeURIComponent(action)}`,
    {
      ...options,
      credentials: 'include',
      headers,
    },
  );

  const payload = (await response.json().catch(() => ({}))) as T & ProtectedApiErrorShape;

  if (!response.ok) {
    throw new ProtectedApiError(
      typeof payload.error === 'string'
        ? payload.error
        : `Protected API request failed (${response.status}).`,
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined,
    );
  }

  return payload;
}

export const protectedApi = {
  request,

  async profile() {
    return request<{ profile: unknown }>('profile');
  },

  async updateProfile(patch: Record<string, unknown>) {
    return request<{ profile: unknown }>('profile-update', {
      method: 'POST',
      body: JSON.stringify({ patch }),
    });
  },

  async list<T = unknown>(resource: string, options?: { limit?: number; offset?: number }) {
    return request<{ data: T[]; count?: number }>('list', {
      method: 'POST',
      body: JSON.stringify({
        resource,
        limit: options?.limit,
        offset: options?.offset,
      }),
    });
  },

  async create<T = unknown>(resource: string, values: Record<string, unknown>) {
    return request<{ data: T }>('create', {
      method: 'POST',
      body: JSON.stringify({ resource, values }),
    });
  },

  async update<T = unknown>(
    resource: string,
    id: string,
    values: Record<string, unknown>,
  ) {
    return request<{ data: T }>('update', {
      method: 'POST',
      body: JSON.stringify({ resource, id, values }),
    });
  },

  async remove(resource: string, id: string) {
    return request<{ success: boolean }>('delete', {
      method: 'POST',
      body: JSON.stringify({ resource, id }),
    });
  },

  async rpc<T = unknown>(functionName: string, args: Record<string, unknown> = {}) {
    return request<{ data: T }>('rpc', {
      method: 'POST',
      body: JSON.stringify({ functionName, args }),
    });
  },
};
