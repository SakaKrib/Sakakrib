import type { Profile } from '@/lib/supabase';

interface GatewayUser {
  id: string;
  email: string | null;
}

export interface GatewaySessionResponse {
  authenticated?: boolean;
  success?: boolean;
  user?: GatewayUser;
  profile?: Profile;
  requiresEmailVerification?: boolean;
  email?: string | null;
  profile_id?: string | null;
  error?: string;
}

type AuthGatewayAction =
  | 'signup'
  | 'login'
  | 'session'
  | 'refresh'
  | 'verify_otp'
  | 'set_role'
  | 'logout';

const getBaseUrl = (): string => {
  const configured = import.meta.env.VITE_DJANGO_API_URL as string | undefined;
  return (configured || '').replace(/\/+$/, '');
};

const readJson = async <T>(response: Response): Promise<T | null> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

/**
 * Django HttpOnly-cookie authentication transport.
 *
 * Supabase is no longer involved in browser authentication. The browser only
 * sends/receives the Django access and refresh cookies; token values are never
 * read by JavaScript.
 */
export const authGateway = async (
  action: AuthGatewayAction,
  payload: Record<string, unknown> = {},
): Promise<GatewaySessionResponse> => {
  const isSession = action === 'session';
  const path = isSession ? '/api/accounts/session/' : `/api/accounts/${action === 'verify_otp' ? 'verify-otp' : action === 'set_role' ? 'set-role' : `${action}/`}`;

  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: isSession ? 'GET' : 'POST',
    credentials: 'include',
    headers: {
      ...(isSession ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(isSession ? {} : { body: JSON.stringify(payload) }),
  });

  const body = await readJson<GatewaySessionResponse>(response) ?? {};

  // Authentication endpoints intentionally expose 401/403 as structured
  // responses so AuthContext can distinguish signed-out and unverified states.
  if (!response.ok && response.status !== 401 && response.status !== 403) {
    throw new Error(body.error ?? 'Authentication service error.');
  }

  return body;
};

export const gatewaySignup = (
  email: string,
  password: string,
  fullName: string,
) =>
  authGateway('signup', {
    email,
    password,
    fullName,
  });

export const gatewayLogin = (
  email: string,
  password: string,
) =>
  authGateway('login', {
    email,
    password,
  });

export const gatewayVerifyOtp = (
  email: string,
  otp: string,
) =>
  authGateway('verify_otp', {
    email,
    otp,
  });

export const gatewaySession = () =>
  authGateway('session');

export const gatewayRefresh = () =>
  authGateway('refresh');

export const gatewayLogout = () =>
  authGateway('logout');
