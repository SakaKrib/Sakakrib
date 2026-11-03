/**
 * Remembers that the email-verification (OTP) modal is open, so it survives the page being
 * reloaded while the user is away copying their code from Gmail.
 *
 * Why this exists: Android (and mobile Chrome) reclaim the WebView/tab's memory while another
 * app is in the foreground. When the user comes back, the page reloads and every piece of
 * React state, including "the modal is open", is lost. The server still knows verification is
 * pending, but nothing re-opened the modal. We keep just enough in localStorage to restore it.
 *
 * Stored: the email address being verified and the auth mode. No password and no code.
 * It expires after TTL_MS and is cleared when verification succeeds or the user dismisses it.
 */

const KEY = 'saka-krib-pending-otp';
const TTL_MS = 30 * 60 * 1000;

export type PendingAuthMode = 'signin' | 'signup' | 'forgot';

export interface PendingOtp {
  email: string;
  mode: PendingAuthMode;
  savedAt: number;
}

export function loadPendingOtp(): PendingOtp | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingOtp>;
    if (
      typeof value.email !== 'string' ||
      !value.email ||
      typeof value.savedAt !== 'number' ||
      Date.now() - value.savedAt > TTL_MS
    ) {
      localStorage.removeItem(KEY);
      return null;
    }
    const mode: PendingAuthMode =
      value.mode === 'signin' || value.mode === 'forgot' ? value.mode : 'signup';
    return { email: value.email, mode, savedAt: value.savedAt };
  } catch {
    return null;
  }
}

export function savePendingOtp(email: string, mode: PendingAuthMode): void {
  try {
    const existing = loadPendingOtp();
    // Keep the original timestamp while the same verification is still in progress, so
    // reopening the app does not extend the expiry forever.
    const savedAt = existing && existing.email === email ? existing.savedAt : Date.now();
    localStorage.setItem(KEY, JSON.stringify({ email, mode, savedAt }));
  } catch {
    /* storage unavailable: the modal simply will not survive a reload */
  }
}

export function clearPendingOtp(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
