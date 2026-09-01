import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile, UserRole } from '@/lib/supabase';
import {
  authGateway,
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
  user: {
    id: user.id,
    email: user.email ?? undefined,
    user_metadata: {},
  },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

  const clearAuthState = () => {
    setSession(null);
    setProfile(null);
  };

  const clearVerificationState = () => {
    setNeedsEmailVerification(false);
    setPendingVerificationEmail(null);
  };

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

        if (result.authenticated) {
          applyGatewayAuth(result);
        } else if (result.requiresEmailVerification) {
          requireEmailVerification(result.email ?? null);
        } else {
          clearAuthState();
          clearVerificationState();
        }
      } catch (error) {
        console.error('Django auth initialization error:', error);
        if (mounted) {
          clearAuthState();
          clearVerificationState();
        }
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
      if (result.authenticated) {
        applyGatewayAuth(result);
        return { error: null };
      }

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
      if (!result.success || !result.authenticated) {
        return { error: result.error ?? 'Unable to verify your email.' };
      }
      if (!applyGatewayAuth(result)) {
        return { error: 'Email verification succeeded, but your authenticated profile could not be loaded.' };
      }
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
          return {
            error: result.error ?? 'Your email is not verified. Please verify it before signing in.',
            requiresEmailVerification: true,
          };
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
    console.warn('Google OAuth Django callback is not migrated yet.');
  };

  const signOut = async (): Promise<void> => {
    try {
      await gatewayLogout();
    } catch (error) {
      console.error('Django sign-out error:', error);
    } finally {
      clearAuthState();
      clearVerificationState();
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
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        needsRoleSelection,
        needsEmailVerification,
        pendingVerificationEmail,
        isAuthenticated,
        signUp,
        verifyEmailOtp,
        resendSignupOtp,
        signIn,
        signInWithGoogle,
        signOut,
        setRole,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
