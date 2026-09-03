interface GatewayUser {
  id: string;
  email: string | null;
}

interface GatewayProfile {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  role?: string;
  [key: string]: unknown;
}

export interface GatewaySessionResponse {
  authenticated?: boolean;
  success?: boolean;
  user?: GatewayUser;
  profile?: GatewayProfile;
  requiresEmailVerification?: boolean;
  email?: string | null;
  profile_id?: string | null;
  error?: string;
  message?: string;
}

type AuthGatewayAction =
  | 'signup'
  | 'login'
  | 'google'
  | 'session'
  | 'refresh'
  | 'verify_otp'
  | 'resend_otp'
  | 'set_role'
  | 'logout';

const getBaseUrl = (): string => {
  const configured = import.meta.env.VITE_DJANGO_API_URL as string | undefined;
  return (configured || '').replace(/\/+$/, '');
};

const actionPath: Record<Exclude<AuthGatewayAction, 'session'>, string> = {
  signup: '/api/accounts/signup/',
  login: '/api/accounts/login/',
  google: '/api/accounts/google/',
  refresh: '/api/accounts/refresh/',
  verify_otp: '/api/accounts/verify-otp/',
  resend_otp: '/api/accounts/resend-otp/',
  set_role: '/api/accounts/set-role/',
  logout: '/api/accounts/logout/',
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

/** Browser authentication transport. Tokens are HttpOnly Django cookies. */
export const authGateway = async (
  action: AuthGatewayAction,
  payload: Record<string, unknown> = {},
): Promise<GatewaySessionResponse> => {
  const isSession = action === 'session';
  const path = isSession ? '/api/accounts/session/' : actionPath[action];

  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: isSession ? 'GET' : 'POST',
    credentials: 'include',
    headers: isSession ? undefined : { 'Content-Type': 'application/json' },
    ...(isSession ? {} : { body: JSON.stringify(payload) }),
  });

  const body = await readJson<GatewaySessionResponse>(response) ?? {};

  if (!response.ok && response.status !== 401 && response.status !== 403) {
    throw new Error(body.error ?? body.message ?? `Authentication request failed (${response.status}).`);
  }

  return body;
};

export const gatewaySignup = (email: string, password: string, fullName: string) =>
  authGateway('signup', { email, password, fullName });

export const gatewayLogin = (email: string, password: string) =>
  authGateway('login', { email, password });

export const gatewayGoogleLogin = (credential: string) =>
  authGateway('google', { credential });

export const gatewayVerifyOtp = (email: string, otp: string) =>
  authGateway('verify_otp', { email, otp });

export const gatewayResendOtp = (email: string) =>
  authGateway('resend_otp', { email });

export const gatewaySession = () => authGateway('session');
export const gatewayRefresh = () => authGateway('refresh');
export const gatewayLogout = () => authGateway('logout');
