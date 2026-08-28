import type { Profile } from '@/lib/supabase';

export interface GatewayUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface GatewaySession {
  authenticated: boolean;
  user: GatewayUser | null;
  profile: Profile | null;
  requiresEmailVerification?: boolean;
  email?: string | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment configuration.');
}

export const AUTH_GATEWAY_URL = `${SUPABASE_URL}/functions/v1/auth-gateway`;

class GatewayError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
  }
}

async function request<T>(action: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(
    `${AUTH_GATEWAY_URL}?action=${encodeURIComponent(action)}`,
    {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        ...(options.headers ?? {}),
      },
    },
  );

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new GatewayError(
      typeof payload.error === 'string'
        ? payload.error
        : `Authentication request failed (${response.status}).`,
      response.status,
    );
  }

  return payload;
}

export const authGateway = {
  async session(): Promise<GatewaySession> {
    try {
      return await request<GatewaySession>('session');
    } catch (error) {
      if (error instanceof GatewayError && error.status === 401) {
        try {
          return await this.refresh();
        } catch {
          return {
            authenticated: false,
            user: null,
            profile: null,
          };
        }
      }

      return {
        authenticated: false,
        user: null,
        profile: null,
      };
    }
  },

  async signIn(email: string, password: string) {
    return request<GatewaySession>('login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async signUp(email: string, password: string, fullName: string) {
    return request<{
      created: boolean;
      userId: string;
      requiresEmailVerification: boolean;
      email: string;
      sessionCreated: boolean;
    }>('signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    });
  },

  async verifyEmailOtp(email: string, otp: string) {
    return request<GatewaySession & { verified?: boolean }>('verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
  },

  async refresh() {
    return request<GatewaySession>('refresh', { method: 'POST' });
  },

  async signOut() {
    return request<{ authenticated: false }>('logout', {
      method: 'POST',
    });
  },

  async profile() {
    return request<{ profile: Profile }>('profile');
  },

  async setRole(role: string) {
    return request<{ success: boolean }>('set-role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  },

  oauthCallbackUrl(redirectTo = window.location.origin) {
    const safeRedirect = new URL(redirectTo, window.location.origin);
    if (safeRedirect.origin !== window.location.origin) {
      throw new Error('Invalid OAuth redirect destination.');
    }

    return `${AUTH_GATEWAY_URL}?action=oauth-callback&redirect=${encodeURIComponent(safeRedirect.toString())}`;
  },
};