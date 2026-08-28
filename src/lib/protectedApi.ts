import { AUTH_GATEWAY_URL } from '@/lib/authGateway';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase anon key configuration.');
}

const PROTECTED_API_URL = AUTH_GATEWAY_URL.replace(/auth-gateway$/, 'protected-api');

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
  operation: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(PROTECTED_API_URL, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      operation,
      ...payload,
    }),
  });

  const responsePayload = (await response.json().catch(() => ({}))) as T & ProtectedApiErrorShape;

  if (!response.ok) {
    throw new ProtectedApiError(
      typeof responsePayload.error === 'string'
        ? responsePayload.error
        : `Protected API request failed (${response.status}).`,
      response.status,
      typeof responsePayload.code === 'string' ? responsePayload.code : undefined,
    );
  }

  return responsePayload;
}

export const protectedApi = {
  async profile() {
    return request<{ profile: unknown }>('profile');
  },

  async updateProfile(patch: Record<string, unknown>) {
    return request<{ profile: unknown }>('profile-update', { patch });
  },

  async list<T = unknown>(
    resource: string,
    options?: { limit?: number; offset?: number },
  ) {
    return request<{ data: T[]; count?: number }>('list', {
      resource,
      limit: options?.limit,
      offset: options?.offset,
    });
  },

  async create<T = unknown>(resource: string, values: Record<string, unknown>) {
    return request<{ data: T }>('create', { resource, values });
  },

  async update<T = unknown>(
    resource: string,
    id: string,
    values: Record<string, unknown>,
  ) {
    return request<{ data: T }>('update', {
      resource,
      id,
      values,
    });
  },

  async remove(resource: string, id: string) {
    return request<{ success: boolean }>('delete', {
      resource,
      id,
    });
  },

  async rpc<T = unknown>(
    functionName: string,
    args: Record<string, unknown> = {},
  ) {
    return request<{ data: T }>('rpc', {
      functionName,
      args,
    });
  },
};
