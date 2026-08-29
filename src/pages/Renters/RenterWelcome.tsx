import { Home, Sparkles } from 'lucide-react';

import type { Profile } from '@/lib/supabase';

/* ============================================================
 * PROPS
 * ============================================================ */

interface RenterWelcomeProps {
  profile: Profile | null;
}

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function RenterWelcome({
  profile,
}: RenterWelcomeProps) {
  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] || 'there';

  return (
    <section className="mb-6">
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-900 sm:p-7">

        {/* Decorative background */}

        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-50 dark:bg-brand-800/40" />

        <div className="pointer-events-none absolute -bottom-20 -left-10 h-32 w-32 rounded-full bg-brand-50/70 dark:bg-brand-800/30" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

          {/* Welcome content */}

          <div className="flex items-start gap-4">

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50">
              <Home className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            </div>

            <div>

              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
                  Renter Dashboard
                </p>

                <Sparkles className="h-4 w-4 text-brand-500 dark:text-brand-400" />
              </div>

              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
                Welcome back, {firstName}
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                Manage your rental home, keep track of your rent,
                view invoices, and manage your moving services from
                one place.
              </p>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
};