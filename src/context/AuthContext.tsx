import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authGateway } from '@/lib/authGateway';

type UserRole = 'renter' | 'landlord' | 'mover' | 'real_estate' | 'admin';

export interface AppProfile {
  id: string;
  email: string | null;
  full_name?: string | null;
  phone?: string | null;
  city?: string | null;
  county?: string | null;
  email_verified?: boolean;
  role?: UserRole | string | null;
  profile_photo_url?: string | null;
  [key: string]: unknown;
}

interface AuthUser {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
}

interface AuthSession { user: AuthUser; }
interface AuthResult { error: string | null; requiresEmailVerification?: boolean; }

interface AuthContextValue {
  session: AuthSession | null;
  profile: AppProfile | null;
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
  user: { id: user.id, email: user.email ?? null, user_metadata: user.user_metadata ?? {} },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

  const clearAuthState = () => { setSession(null); setProfile(null); };
  const clearVerificationState = () => { setNeedsEmailVerification(false); setPendingVerificationEmail(null); };
  const requireEmailVerification = (email: string | null) => {
    clearAuthState(); setNeedsEmailVerification(true); setPendingVerificationEmail(email ? normalizeEmail(email) : null);
  };
  const isProfileEmailVerified = (nextProfile: AppProfile | null) => nextProfile?.email_verified === true;

  const applyGatewayAuth = (result: Awaited<ReturnType<typeof authGateway>>) => {
    if (!result.authenticated || !result.user || !result.profile) { clearAuthState(); return false; }
    const nextProfile = result.profile as AppProfile;
    if (!isProfileEmailVerified(nextProfile)) { requireEmailVerification(result.email ?? result.user.email ?? null); return false; }
    setSession(toAuthSession(result.user)); setProfile(nextProfile); clearVerificationState(); return true;
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
        console.error('Auth initialization error:', error);
        if (mounted) { clearAuthState(); clearVerificationState(); }
      } finally { if (mounted) setLoading(false); }
    };
    void initialize();
    return () => { mounted = false; };
  }, []);

  const isAuthenticated = Boolean(session && profile && profile.email_verified === true);
  const needsRoleSelection = Boolean(!loading && isAuthenticated && !profile?.role);

  const signUp = async (email: string, password: string, fullName: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email); const normalizedName = fullName.trim();
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (password.length < 6) return { error: 'Password must be at least 6 characters long.' };
    if (!normalizedName) return { error: 'Please enter your full name.' };
    try {
      const result = await authGateway('signup', { email: normalizedEmail, password, fullName: normalizedName });
      if (result.error) { clearAuthState(); return { error: result.error }; }
      if (result.authenticated) { applyGatewayAuth(result); return { error: null, requiresEmailVerification: false }; }
      requireEmailVerification(result.email ?? normalizedEmail);
      return { error: null, requiresEmailVerification: true };
    } catch (error) {
      console.error('Signup error:', error);
      return { error: error instanceof Error ? error.message : 'Unable to create your account.' };
    }
  };

  const verifyEmailOtp = async (email: string, otp: string) => {
    const normalizedEmail = normalizeEmail(email); const normalizedOtp = otp.replace(/\D/g, '');
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (normalizedOtp.length !== 6) return { error: 'Please enter the 6-digit verification code.' };
    try {
      const result = await authGateway('verify_otp', { email: normalizedEmail, otp: normalizedOtp });
      if (!result.success || !result.authenticated || !result.user || !result.profile) return { error: result.error ?? 'Unable to establish your authenticated session after verification.' };
      return applyGatewayAuth(result) ? { error: null } : { error: 'Email verification succeeded, but your authenticated profile could not be loaded.' };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Invalid or expired verification code.' }; }
  };

  const resendSignupOtp = async (email: string) => {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    requireEmailVerification(normalizedEmail);
    try {
      const result = await authGateway('resend_otp', { email: normalizedEmail });
      return result.error ? { error: result.error } : { error: null };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to send a new verification code.' }; }
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
          if (resendResult.error) return { error: `Your email is not verified. ${resendResult.error}`, requiresEmailVerification: true };
          return { error: 'Your email is not verified. A new verification code has been sent to your email.', requiresEmailVerification: true };
        }
        clearAuthState(); return { error: result.error ?? 'Unable to sign in.' };
      }
      applyGatewayAuth(result);
      return { error: null };
    } catch (error) {
      console.error('Sign-in error:', error); clearAuthState();
      return { error: error instanceof Error ? error.message : 'Unable to sign in.' };
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    throw new Error('Google OAuth is not yet wired to the Django server callback.');
  };

  const signOut = async () => {
    try { await authGateway('logout'); } catch (error) { console.error('Sign out error:', error); }
    finally { clearAuthState(); clearVerificationState(); }
  };

  const refreshProfile = async () => {
    if (!session?.user) { clearAuthState(); return; }
    try {
      const result = await authGateway('session');
      if (!result.authenticated) {
        if (result.requiresEmailVerification) requireEmailVerification(result.email ?? session.user.email ?? null);
        else clearAuthState();
        return;
      }
      applyGatewayAuth(result);
    } catch (error) { console.error('Session refresh error:', error); clearAuthState(); }
  };

  const setRole = async (role: UserRole) => {
    if (!session?.user) return { error: 'Not authenticated.' };
    if (!profile) return { error: 'Application profile is required.' };
    if (!isProfileEmailVerified(profile)) return { error: 'Email verification is required before setting a role.' };
    if (!['renter', 'landlord', 'mover', 'real_estate', 'admin'].includes(role)) return { error: 'Invalid role selected.' };
    try {
      const result = await authGateway('set_role', { role });
      if (result.error || result.authenticated === false) return { error: result.error ?? 'Unable to save your role.' };
      await refreshProfile(); return { error: null };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to save your role.' }; }
  };

  return <AuthContext.Provider value={{ session, profile, loading, needsRoleSelection, needsEmailVerification, pendingVerificationEmail, isAuthenticated, signUp, verifyEmailOtp, resendSignupOtp, signIn, signInWithGoogle, signOut, setRole, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
