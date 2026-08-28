import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, type Profile, type UserRole } from '@/lib/supabase';
import { authGateway, type GatewaySession, type GatewayUser } from '@/lib/authGateway';

interface RegistrationEmailApplication {
  email: string;
  applicant_email?: string;
  full_name?: string;
  purpose?: string;
  [key: string]: unknown;
}
interface AuthResult { error: string | null; requiresEmailVerification?: boolean; }
export interface AuthSession { user: GatewayUser; }
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

const sendRegistrationEmail = async (
  type: 'otp_verification' | 'sign_in_notification' | 'sign_up_welcome',
  application: RegistrationEmailApplication,
) => {
  const { data, error } = await supabase.functions.invoke('send-notification-emails', { body: { type, application } });
  if (error) throw new Error(error.message || 'Email delivery failed.');
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

  const clearAuthState = () => { setSession(null); setProfile(null); };
  const requireEmailVerification = (email: string | null) => {
    clearAuthState();
    setNeedsEmailVerification(true);
    setPendingVerificationEmail(email ? normalizeEmail(email) : null);
  };
  const clearVerificationState = () => { setNeedsEmailVerification(false); setPendingVerificationEmail(null); };

  const applyGatewaySession = (result: GatewaySession) => {
    if (result.authenticated && result.user && result.profile?.email_verified === true) {
      setSession({ user: result.user });
      setProfile(result.profile);
      clearVerificationState();
      return true;
    }
    clearAuthState();
    if (result.requiresEmailVerification) requireEmailVerification(result.email ?? result.profile?.email ?? result.user?.email ?? null);
    return false;
  };

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try { applyGatewaySession(await authGateway.session()); }
      catch (error) { console.error('HttpOnly auth initialization error:', error); clearAuthState(); clearVerificationState(); }
      finally { if (mounted) setLoading(false); }
    };
    void initialize();

    const refreshOnFocus = async () => {
      if (!mounted || document.visibilityState !== 'visible') return;
      try { applyGatewaySession(await authGateway.session()); } catch { /* session remains cleared */ }
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => { mounted = false; window.removeEventListener('focus', refreshOnFocus); };
  }, []);

  const isAuthenticated = Boolean(session?.user && profile?.email_verified === true);
  const needsRoleSelection = !loading && isAuthenticated && !profile?.role;

  const signUp = async (email: string, password: string, fullName: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = fullName.trim();
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (password.length < 6) return { error: 'Password must be at least 6 characters long.' };
    if (!normalizedName) return { error: 'Please enter your full name.' };
    try {
      const result = await authGateway.signUp(normalizedEmail, password, normalizedName);
      requireEmailVerification(normalizedEmail);
      try {
        await sendRegistrationEmail('otp_verification', { email: normalizedEmail, applicant_email: normalizedEmail, full_name: normalizedName, purpose: 'verify your Saka Krib account' });
      } catch (error) {
        return { error: error instanceof Error ? `Your account was created, but the verification email could not be sent: ${error.message}` : 'Your account was created, but the verification email could not be sent.', requiresEmailVerification: true };
      }
      if (result.sessionCreated) applyGatewaySession(await authGateway.session());
      return { error: null, requiresEmailVerification: true };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to create your account.' }; }
  };

  const verifyEmailOtp = async (email: string, otp: string): Promise<{ error: string | null }> => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedOtp = otp.replace(/\D/g, '');
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (normalizedOtp.length !== 6) return { error: 'Please enter the 6-digit verification code.' };
    try {
      const result = await authGateway.verifyEmailOtp(normalizedEmail, normalizedOtp);
      if (result.authenticated && result.user && result.profile?.email_verified === true) {
        setSession({ user: result.user }); setProfile(result.profile); clearVerificationState(); return { error: null };
      }
      if (result.verified) { clearAuthState(); clearVerificationState(); return { error: null }; }
      requireEmailVerification(normalizedEmail);
      return { error: 'Email verification has not been completed.' };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Invalid or expired verification code.' }; }
  };

  const resendSignupOtp = async (email: string): Promise<{ error: string | null }> => {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    requireEmailVerification(normalizedEmail);
    try {
      await sendRegistrationEmail('otp_verification', { email: normalizedEmail, applicant_email: normalizedEmail, purpose: 'verify your Saka Krib account' });
      return { error: null };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to send a new verification code.' }; }
  };

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) return { error: 'Please enter a valid email address.' };
    if (!password) return { error: 'Please enter your password.' };
    try {
      const result = await authGateway.signIn(normalizedEmail, password);
      if (!applyGatewaySession(result)) {
        const resend = await resendSignupOtp(normalizedEmail);
        return { error: resend.error ? `Your email is not verified. ${resend.error}` : 'Your email is not verified. A new verification code has been sent to your email.', requiresEmailVerification: true };
      }
      const signedInProfile = result.profile;
      try { await sendRegistrationEmail('sign_in_notification', { email: normalizedEmail, applicant_email: normalizedEmail, full_name: signedInProfile?.full_name ?? undefined }); }
      catch (error) { console.error('Sign-in notification email failed:', error); }
      return { error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      if (/not confirmed|not verified|email.*confirm/i.test(message)) {
        requireEmailVerification(normalizedEmail);
        const resend = await resendSignupOtp(normalizedEmail);
        return { error: resend.error ? `Your email has not been verified. ${resend.error}` : 'Your email is not verified. A new verification code has been sent to your email.', requiresEmailVerification: true };
      }
      return { error: message };
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    console.error('Google sign-in is paused during the HttpOnly migration. Password authentication is now cookie-based.');
  };

  const signOut = async () => {
    try { await authGateway.signOut(); } catch (error) { console.error('HttpOnly sign-out error:', error); }
    clearAuthState(); clearVerificationState();
  };

  const setRole = async (role: UserRole): Promise<{ error: string | null }> => {
    if (!isAuthenticated || !profile) return { error: 'Not authenticated.' };
    if (profile.email_verified !== true) return { error: 'Email verification is required before setting a role.' };
    try { await authGateway.setRole(role); applyGatewaySession(await authGateway.session()); return { error: null }; }
    catch (error) { return { error: error instanceof Error ? error.message : 'Unable to set role.' }; }
  };

  const refreshProfile = async () => {
    if (!session?.user) { clearAuthState(); return; }
    try { applyGatewaySession(await authGateway.session()); }
    catch (error) { console.error('Profile refresh error:', error); clearAuthState(); }
  };

  return <AuthContext.Provider value={{ session, profile, loading, needsRoleSelection, needsEmailVerification, pendingVerificationEmail, isAuthenticated, signUp, verifyEmailOtp, resendSignupOtp, signIn, signInWithGoogle, signOut, setRole, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}