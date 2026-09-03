import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile, UserRole } from '@/types/domain';
import {
  authGateway,
  gatewayGoogleLogin,
  gatewayLogin,
  gatewayLogout,
  gatewayResendOtp,
  gatewaySignup,
  gatewayVerifyOtp,
} from '@/lib/authGateway';
import { protectedPost } from '@/lib/djangoApi';

interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata: Record<string, unknown>;
}

interface AuthSession {
  /** Compatibility shape only. Django authentication tokens are never exposed to JS. */
  user: AuthUser;
}

interface AuthResult {
  error: string | null;
  requiresEmailVerification?: boolean;
}

interface AuthContextValue {
  session: AuthSession | null;
  profile: Profile | null;
  loading: boolean;
  needsRoleSelection: boolean;
  needsEmailVerification: boolean;
  pendingVerificationEmail: string | null;
  isAuthenticated: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<AuthResult>;
  verifyEmailOtp: (email: string, otp: string) => Promise<{ error: string | null }>;
  resendSignupOtp: (email: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  setRole: (role: UserRole) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const toAuthSession = (user: { id: string; email?: string | null }): AuthSession => ({
  user: { id: user.id, email: user.email ?? undefined, user_metadata: {} },
});

const loadGoogleIdentityScript = async (): Promise<void> => {
  const existing = document.querySelector('script[data-sakakrib-google-identity]');
  if (existing) {
    if ((window as any).google?.accounts?.id) return;
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load Google sign-in.')), { once: true });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.sakakribGoogleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Google sign-in.'));
    document.head.appendChild(script);
  });
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

  const clearAuthState = () => { setSession(null); setProfile(null); };
  const clearVerificationState = () => { setNeedsEmailVerification(false); setPendingVerificationEmail(null); };
  const requireEmailVerification = (email: string | null) => {
    clearAuthState();
    setNeedsEmailVerification(true);
    setPendingVerificationEmail(email ? normalizeEmail(email) : null);
  };

  const applyGatewayAuth = (result: Awaited<ReturnType<typeof authGateway>>) => {
    if (!result.authenticated || !result.user || !result.profile) {
      clearAuthState();
      return false;
    }
    if (result.profile.email_verified !== true) {
      requireEmailVerification(result.email ?? result.user.email ?? null);
      return false;
    }
    setSession(toAuthSession(result.user));
    setProfile(result.profile);
    clearVerificationState();
    return true;
  };

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        const result = await authGateway('session');
        if (!mounted) return;
        if (result.authenticated) applyGatewayAuth(result);
        else if (result.requiresEmailVerification) requireEmailVerification(result.email ?? null);
        else { clearAuthState(); clearVerificationState(); }
      } catch (error) {
        console.error('Django auth initialization error:', error);
        if (mounted) { clearAuthState(); clearVerificationState(); }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void initialize();
    return () => { mounted = false; };
  }, []);

  const isAuthenticated = Boolean(session && profile?.email_verified === true);
  const needsRoleSelection = Boolean(!loading && isAuthenticated && !profile?.role);

  const signUp = async (email: string, password: string, fullName: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = fullName.trim();
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (password.length < 8) return { error: 'Password must be at least 8 characters long.' };
    if (!normalizedName) return { error: 'Please enter your full name.' };
    try {
      const result = await gatewaySignup(normalizedEmail, password, normalizedName);
      if (result.authenticated) { applyGatewayAuth(result); return { error: null }; }
      requireEmailVerification(result.email ?? normalizedEmail);
      return { error: null, requiresEmailVerification: true };
    } catch (error) {
      console.error('Django signup error:', error);
      return { error: error instanceof Error ? error.message : 'Unable to create your account.' };
    }
  };

  const verifyEmailOtp = async (email: string, otp: string) => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedOtp = otp.replace(/\D/g, '');
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (normalizedOtp.length !== 6) return { error: 'Please enter the 6-digit verification code.' };
    try {
      const result = await gatewayVerifyOtp(normalizedEmail, normalizedOtp);
      if (!result.success || !result.authenticated) return { error: result.error ?? 'Unable to verify your email.' };
      if (!applyGatewayAuth(result)) return { error: 'Email verification succeeded, but your authenticated profile could not be loaded.' };
      return { error: null };
    } catch (error) {
      console.error('Django OTP verification error:', error);
      return { error: error instanceof Error ? error.message : 'Invalid or expired verification code.' };
    }
  };

  const resendSignupOtp = async (email: string) => {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    requireEmailVerification(normalizedEmail);
    try {
      const result = await gatewayResendOtp(normalizedEmail);
      return result.success ? { error: null } : { error: result.error ?? 'Unable to send a new verification code.' };
    } catch (error) {
      console.error('Django OTP resend error:', error);
      return { error: error instanceof Error ? error.message : 'Unable to send a new verification code.' };
    }
  };

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (!password) return { error: 'Please enter your password.' };
    try {
      const result = await gatewayLogin(normalizedEmail, password);
      if (!result.authenticated) {
        if (result.requiresEmailVerification) {
          requireEmailVerification(result.email ?? normalizedEmail);
          return { error: result.error ?? 'Your email is not verified. Please verify it before signing in.', requiresEmailVerification: true };
        }
        clearAuthState();
        return { error: result.error ?? 'Unable to sign in.' };
      }
      applyGatewayAuth(result);
      return { error: null };
    } catch (error) {
      console.error('Django sign-in error:', error);
      clearAuthState();
      return { error: error instanceof Error ? error.message : 'Unable to sign in.' };
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) throw new Error('Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID.');
    await loadGoogleIdentityScript();
    const google = (window as any).google;
    if (!google?.accounts?.id) throw new Error('Google sign-in is unavailable. Please try again.');

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve();
      };

      google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        callback: async (response: { credential?: string }) => {
          try {
            if (!response.credential) return finish(new Error('Google did not return an ID token.'));
            const result = await gatewayGoogleLogin(response.credential);
            if (!result.authenticated || !result.user || !result.profile) return finish(new Error(result.error ?? 'Google authentication failed.'));
            if (!applyGatewayAuth(result)) return finish(new Error('Google authentication succeeded but the profile could not be loaded.'));
            finish();
          } catch (error) {
            finish(error instanceof Error ? error : new Error('Google authentication failed.'));
          }
        },
      });

      google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) finish(new Error('Google sign-in was not available. Please try again or use email and password.'));
        else if (notification.isDismissedMoment?.()) finish(new Error('Google sign-in was cancelled.'));
      });
    });
  };

  const signOut = async (): Promise<void> => {
    try { await gatewayLogout(); }
    catch (error) { console.error('Django sign-out error:', error); }
    finally {
      clearAuthState();
      clearVerificationState();
      try { (window as any).google?.accounts?.id?.disableAutoSelect?.(); } catch { /* optional Google SDK */ }
    }
  };

  const refreshProfile = async (): Promise<void> => {
    try {
      const result = await authGateway('session');
      if (!result.authenticated) {
        if (result.requiresEmailVerification) requireEmailVerification(result.email ?? null);
        else clearAuthState();
        return;
      }
      applyGatewayAuth(result);
    } catch (error) {
      console.error('Django session refresh error:', error);
      clearAuthState();
    }
  };

  const setRole = async (role: UserRole) => {
    if (!session?.user) return { error: 'Not authenticated.' };
    if (!profile) return { error: 'Application profile is required.' };
    const allowedRoles: UserRole[] = ['renter', 'landlord', 'mover', 'real_estate'];
    if (!allowedRoles.includes(role)) return { error: 'Invalid role selected.' };
    try {
      await protectedPost('/api/accounts/set-role/', { role });
      await refreshProfile();
      return { error: null };
    } catch (error) {
      console.error('Django role selection error:', error);
      return { error: error instanceof Error ? error.message : 'Unable to save your role.' };
    }
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, needsRoleSelection, needsEmailVerification, pendingVerificationEmail, isAuthenticated, signUp, verifyEmailOtp, resendSignupOtp, signIn, signInWithGoogle, signOut, setRole, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
