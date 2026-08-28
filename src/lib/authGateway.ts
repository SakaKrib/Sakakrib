import type { Profile } from '@/lib/supabase';

interface GatewayUser {
  id: string;
  email: string | null;
}

export interface GatewaySessionResponse {
  authenticated: boolean;
  user?: GatewayUser;
  profile?: Profile;
  requiresEmailVerification?: boolean;
  email?: string | null;
  error?: string;
}

const FUNCTION_NAME = 'auth-gateway';

const getFunctionUrl = (): string => {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

  if (!baseUrl) {
    throw new Error('VITE_SUPABASE_URL is not configured.');
  }

  return `${baseUrl.replace(/\/$/, '')}/functions/v1/${FUNCTION_NAME}`;
};

const getAnonKey = (): string => {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!key) {
    throw new Error('VITE_SUPABASE_ANON_KEY is not configured.');
  }

  return key;
};

export const authGateway = async (
  action: 'login' | 'session' | 'refresh' | 'logout',
  payload: Record<string, unknown> = {},
): Promise<GatewaySessionResponse> => {
  const response = await fetch(getFunctionUrl(), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      // This is the public Supabase publishable/anon key, not a user token.
      apikey: getAnonKey(),
      Authorization: `Bearer ${getAnonKey()}`,
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as GatewaySessionResponse;

  if (!response.ok && response.status !== 401 && response.status !== 403) {
    throw new Error(body.error ?? 'Authentication service error.');
  }

  return body;
};
