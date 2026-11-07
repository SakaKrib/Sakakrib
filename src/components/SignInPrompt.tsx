import { LogIn } from 'lucide-react';
import { useNav } from '@/context/NavContext';

/** Inline notice shown to visitors who are not signed in. Reuses the app's existing card/button styles. */
export default function SignInPrompt({ message, className = 'mb-6' }: { message: string; className?: string }) {
  const { setAuthModalOpen, setAuthMode } = useNav();
  return (
    <div className={`card flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => { setAuthMode('signin'); setAuthModalOpen(true); }} className="btn-primary inline-flex items-center gap-2 text-sm"><LogIn className="h-4 w-4" />Sign in</button>
        <button type="button" onClick={() => { setAuthMode('signup'); setAuthModalOpen(true); }} className="btn-secondary text-sm">Sign up</button>
      </div>
    </div>
  );
}
