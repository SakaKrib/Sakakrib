import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, type Profile, type UserRole } from '@/lib/supabase';
import { authGateway } from '@/lib/authGateway';

interface RegistrationEmailApplication {
  email: string;
  applicant_email?: string;
  full_name?: string;
  purpose?: string;
  [key: string]: unknown;
}

interface AuthSession {
  /** UI compatibility object. Authentication tokens are deliberately excluded. */
  user: Pick<User, 'id' | 'email' | 'user_metadata'>;
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

const toAuthSession = (user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): AuthSession => ({
  user: {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? {},
  },
});

const sendRegistrationEmail = async (
  type: 'otp_verification' | 'sign_in_notification' | 'sign_up_welcome',
  application: RegistrationEmailApplication,
): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('send-notification-emails', {
    body: { type, application },
  });

  if (error) {
    let message = error.message || 'Email delivery failed.';
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.json();
        if (body && typeof body === 'object') {
          if (typeof (body as { error?: unknown }).error === 'string') message = (body as { error: string }).error;
          else if (typeof (body as { message?: unknown }).message === 'string') message = (body as { message: string }).message;
        }
      } catch {
        // Preserve the original error message.
      }
    }
    throw new Error(message);
  }

  if (data && typeof data === 'object' && 'success' in data && data.success === false) {
    throw new Error('error' in data && typeof data.error === 'string' ? data.error : 'Email delivery failed.');
  }
};

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

  const isProfileEmailVerified = (nextProfile: Profile | null) => nextProfile?.email_verified === true;

  const applyGatewayAuth = (result: Awaited<ReturnType<typeof authGateway>>) => {
    if (!result.authenticated || !result.user || !result.profile) {
      clearAuthState();
      return false;
    }

    if (!isProfileEmailVerified(result.profile as Profile)) {
      requireEmailVerification(result.email ?? result.user.email ?? null);
      return false;
    }

    setSession(toAuthSession(result.user));
    setProfile(result.profile as Profile);
    clearVerificationState();
    return true;
  };

  // The browser no longer asks Supabase for a session. The HttpOnly cookie is
  // resolved by auth-gateway and only safe user/profile data returns to React.
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const result = await authGateway('session');
        if (!mounted) return;

        if (result.authenticated) applyGatewayAuth(result);
        else if (result.requiresEmailVerification) requireEmailVerification(result.email ?? null);
        else {
          clearAuthState();
          clearVerificationState();
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
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

  const isAuthenticated = Boolean(session && profile && profile.email_verified === true);
  const needsRoleSelection = Boolean(!loading && isAuthenticated && !profile?.role);

  const signUp = async (email: string, password: string, fullName: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = fullName.trim();

    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (password.length < 6) return { error: 'Password must be at least 6 characters long.' };
    if (!normalizedName) return { error: 'Please enter your full name.' };

    try {
      const result = await authGateway('signup', {
        email: normalizedEmail,
        password,
        fullName: normalizedName,
      });

      if (result.error) {
        clearAuthState();
        return { error: result.error };
      }

      if (result.authenticated) {
        applyGatewayAuth(result);
        try {
          await sendRegistrationEmail('sign_up_welcome', {
            email: normalizedEmail,
            applicant_email: normalizedEmail,
            full_name: normalizedName,
          });
        } catch (error) {
          console.error('Welcome email delivery failed:', error);
        }
        return { error: null, requiresEmailVerification: false };
      }

      requireEmailVerification(result.email ?? normalizedEmail);
      try {
        await sendRegistrationEmail('otp_verification', {
          email: normalizedEmail,
          applicant_email: normalizedEmail,
          full_name: normalizedName,
          purpose: 'verify your Saka Krib account',
        });
      } catch (error) {
        console.error('OTP email delivery failed:', error);
        return {
          error: error instanceof Error
            ? `Your account was created, but the verification email could not be sent: ${error.message}`
            : 'Your account was created, but the verification email could not be sent.',
          requiresEmailVerification: true,
        };
      }

      return { error: null, requiresEmailVerification: true };
    } catch (error) {
      console.error('Signup gateway error:', error);
      return { error: error instanceof Error ? error.message : 'Unable to create your account.' };
    }
  };

  const verifyEmailOtp = async (email: string, otp: string) => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedOtp = otp.replace(/\D/g, '');

    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (normalizedOtp.length !== 6) return { error: 'Please enter the 6-digit verification code.' };

    try {
      const result = await authGateway('verify_otp', { email: normalizedEmail, otp: normalizedOtp });
      if (!result.success) return { error: result.error ?? 'Invalid or expired verification code.' };

      clearAuthState();
      clearVerificationState();
      return { error: null };
    } catch (error) {
      console.error('Email OTP verification error:', error);
      return { error: error instanceof Error ? error.message : 'Invalid or expired verification code.' };
    }
  };

  const resendSignupOtp = async (email: string) => {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };

    requireEmailVerification(normalizedEmail);

    try {
      const { data, error } = await supabase.functions.invoke('send-notification-emails', {
        body: {
          type: 'otp_verification',
          application: {
            email: normalizedEmail,
            applicant_email: normalizedEmail,
            purpose: 'verify your Saka Krib account',
          },
        },
      });

      if (error) throw new Error(error.message || 'Unable to send a new verification code.');
      if (data && typeof data === 'object' && 'success' in data && data.success === false) {
        throw new Error('error' in data && typeof data.error === 'string' ? data.error : 'Unable to send a new verification code.');
      }
      return { error: null };
    } catch (error) {
      console.error('OTP resend error:', error);
      return { error: error instanceof Error ? error.message : 'Unable to send a new verification code.' };
    }
  };

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (!password) return { error: 'Please enter your password.' };

    try {
      const result = await authGateway('login', { email: normalizedEmail, password });

      if (!result.authenticated) {
        if (result.requiresEmailVerification) {
          requireEmailVerification(result.email ?? normalizedEmail);
          const resendResult = await resendSignupOtp(normalizedEmail);
          if (resendResult.error) return {
            error: `Your email is not verified. ${resendResult.error}`,
            requiresEmailVerification: true,
          };
          return {
            error: 'Your email is not verified. A new verification code has been sent to your email.',
            requiresEmailVerification: true,
          };
        }
        clearAuthState();
        return { error: result.error ?? 'Unable to sign in.' };
      }

      applyGatewayAuth(result);

      try {
        await sendRegistrationEmail('sign_in_notification', {
          email: normalizedEmail,
          applicant_email: normalizedEmail,
          full_name: result.profile?.full_name ?? undefined,
        });
      } catch (error) {
        console.error('Sign-in notification email failed:', error);
      }

      return { error: null };
    } catch (error) {
      console.error('Sign-in gateway error:', error);
      clearAuthState();
      return { error: error instanceof Error ? error.message : 'Unable to sign in.' };
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    // Deliberately disabled until the server-side OAuth callback is implemented.
    // Using supabase.auth.signInWithOAuth here would reintroduce browser token handling.
    console.warn('Google OAuth HttpOnly migration is pending its server callback implementation.');
  };

  const signOut = async (): Promise<void> => {
    try {
      await authGateway('logout');
    } catch (error) {
      console.error('Sign out gateway error:', error);
    } finally {
      clearAuthState();
      clearVerificationState();
    }
  };

  const setRole = async (role: UserRole) => {
    if (!session?.user) return { error: 'Not authenticated.' };
    if (!profile) return { error: 'Application profile is required.' };
    if (!isProfileEmailVerified(profile)) return { error: 'Email verification is required before setting a role.' };

    const { error } = await supabase.from('profiles').update({ role }).eq('id', session.user.id);
    if (error) return { error: error.message };
    await refreshProfile();
    return { error: null };
  };

  const refreshProfile = async (): Promise<void> => {
    if (!session?.user) {
      clearAuthState();
      return;
    }

    try {
      const result = await authGateway('session');
      if (!result.authenticated) {
        if (result.requiresEmailVerification) requireEmailVerification(result.email ?? session.user.email ?? null);
        else clearAuthState();
        return;
      }
      applyGatewayAuth(result);
    } catch (error) {
      console.error('Session refresh error:', error);
      clearAuthState();
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
