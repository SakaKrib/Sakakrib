import { djangoApi } from '@/lib/djangoApi';

export interface GatewayUser {
  id: string;
  email: string | null;
}

export interface GatewaySessionResponse {
  authenticated?: boolean;
  success?: boolean;
  user?: GatewayUser;
  profile?: Record<string, unknown>;
  requiresEmailVerification?: boolean;
  email?: string | null;
  profile_id?: string | null;
  error?: string;
}

type AuthGatewayAction = 'signup' | 'login' | 'session' | 'refresh' | 'verify_otp' | 'set_role' | 'logout' | 'resend_otp';

const call = async (action: AuthGatewayAction, payload: Record<string, unknown> = {}): Promise<GatewaySessionResponse> => {
  try {
    switch (action) {
      case 'signup': return await djangoApi.post('/api/auth/signup/', payload);
      case 'login': return await djangoApi.post('/api/auth/login/', payload);
      case 'verify_otp': return await djangoApi.post('/api/auth/verify-otp/', payload);
      case 'resend_otp': return await djangoApi.post('/api/auth/resend-otp/', payload);
      case 'refresh': return await djangoApi.post('/api/auth/refresh/');
      case 'logout': return await djangoApi.post('/api/auth/logout/');
      case 'set_role': return await djangoApi.post('/api/auth/set-role/', payload);
      case 'session':
      default: return await djangoApi.get('/api/auth/session/');
    }
  } catch (error) {
    return { authenticated: false, error: error instanceof Error ? error.message : 'Authentication service error.' };
  }
};

/** Django is the authentication authority. Tokens remain HttpOnly cookies. */
export const authGateway = (action: AuthGatewayAction, payload: Record<string, unknown> = {}) => call(action, payload);
export const gatewaySignup = (email: string, password: string, fullName: string) => authGateway('signup', { email, password, fullName });
export const gatewayLogin = (email: string, password: string) => authGateway('login', { email, password });
export const gatewayVerifyOtp = (email: string, otp: string) => authGateway('verify_otp', { email, otp });
export const gatewayResendOtp = (email: string) => authGateway('resend_otp', { email });
export const gatewaySession = () => authGateway('session');
export const gatewayRefresh = () => authGateway('refresh');
export const gatewayLogout = () => authGateway('logout');
export const gatewaySetRole = (role: string) => authGateway('set_role', { role });
