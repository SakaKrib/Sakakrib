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

const FUNCTION_NAME = 'auth-gateway';

const getFunctionUrl = (): string => {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

  if (!baseUrl) {
    throw new Error('VITE_SUPABASE_URL is not configured.');
  }

  return `${baseUrl.replace(/\/$/, '')}/functions/v1/${FUNCTION_NAME}`;
};

const getPublishableKey = (): string => {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!key) {
    throw new Error('VITE_SUPABASE_ANON_KEY is not configured.');
  }

  return key;
};

/**
 * Browser-side transport for the HttpOnly auth gateway.
 *
 * IMPORTANT:
 * - No user access token is read from JavaScript.
 * - No refresh token is read from JavaScript.
 * - credentials: 'include' allows the browser to send/receive
 *   the HttpOnly authentication cookies.
 * - The Supabase publishable/anon key is public and is NOT a
 *   user authentication credential.
 *
 * User authentication is performed server-side by auth-gateway
 * using the HttpOnly cookies.
 */
export const authGateway = async (
  action: AuthGatewayAction,
  payload: Record<string, unknown> = {},
): Promise<GatewaySessionResponse> => {
  const response = await fetch(getFunctionUrl(), {
    method: 'POST',

    // Required for HttpOnly cookies.
    credentials: 'include',

    headers: {
      'Content-Type': 'application/json',

      // Public Supabase project key used to invoke the Edge Function.
      // DO NOT put the user's JWT here.
      apikey: getPublishableKey(),
    },

    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as GatewaySessionResponse;

  /*
   * 401/403 are intentionally returned to the AuthContext so it
   * can handle:
   *
   * - unauthenticated sessions
   * - expired sessions
   * - email verification requirements
   */
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