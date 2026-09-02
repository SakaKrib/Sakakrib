import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';

import {
  X,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { cn, validateEmail } from '@/lib/utils';

import EmailOtpVerification from '@/components/EmailOtpVerification';

interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'Contains uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Contains lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Contains a number', test: (pw) => /\d/.test(pw) },
  { label: 'Contains a special character', test: (pw) => /[@$!%*?&^#]/.test(pw) },
];

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function AuthModal() {
  const { signIn, signUp, signInWithGoogle, verifyEmailOtp, resendSignupOtp, needsEmailVerification, pendingVerificationEmail } = useAuth();
  const { authModalOpen, setAuthModalOpen, setRoleModalOpen, authMode, setAuthMode } = useNav();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordStrength = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const allRulesPassed = passwordStrength === PASSWORD_RULES.length;
  const verificationEmail = (pendingVerificationEmail || email).trim().toLowerCase();

  const clearAuthFields = () => { setEmail(''); setPassword(''); setFullName(''); setOtpStep(false); setShowPassword(false); setError(null); setInfo(null); setLoading(false); };

  useEffect(() => {
    if (!authModalOpen) return;
    setError(null); setInfo(null); setShowPassword(false); setLoading(false);
    if (needsEmailVerification && pendingVerificationEmail) {
      const normalizedEmail = pendingVerificationEmail.trim().toLowerCase();
      setEmail(normalizedEmail); setPassword(''); setOtpStep(true);
    }
  }, [authModalOpen, needsEmailVerification, pendingVerificationEmail]);
