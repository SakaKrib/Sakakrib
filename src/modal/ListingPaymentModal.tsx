import { useEffect, useState } from 'react';
import {
  X,
  DollarSign,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { ListingRole } from '@/lib/Listingentitlement';

// ============================================================
// TYPES
// ============================================================

interface SubscriptionPlan {
  id: string;
  name: string;
  audience: 'LANDLORD' | 'REAL_ESTATE';
  monthly_price_kes: number;
  annual_price_kes: number;
  max_listings: number | null;
  max_units_per_listing: number | null;
}

type ModalTab = 'pay' | 'subscribe';

interface ListingPaymentModalProps {
  open: boolean;
  onClose: () => void;

  role: ListingRole;

  // From the loaded entitlement — never hardcoded here.
  amountKes: number;

  paymentLoading: boolean;
  paymentCompleted: boolean;
  selectedPaymentMethod: 'MPESA' | 'PAYPAL' | null;
  onSelectPaymentMethod: (method: 'MPESA' | 'PAYPAL') => void;
  onPayNow: () => Promise<boolean>;

  // Called when the user picks a plan and wants to continue on the
  // dedicated subscription page. This modal does not start checkout
  // itself — it hands off with the chosen plan/cycle as a hint.
  onContinueToSubscription: (
    plan: SubscriptionPlan,
    billingCycle: 'monthly' | 'annual'
  ) => void;

  error?: string | null;
}

// ============================================================
// FORMAT HELPER (local, so this component has no hidden deps)
// ============================================================

function formatKES(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ============================================================
// COMPONENT
// ============================================================

export default function ListingPaymentModal({
  open,
  onClose,
  role,
  amountKes,
  paymentLoading,
  paymentCompleted,
  selectedPaymentMethod,
  onSelectPaymentMethod,
  onPayNow,
  onContinueToSubscription,
  error,
}: ListingPaymentModalProps) {
  const [tab, setTab] = useState<ModalTab>('pay');

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [billingCycle, setBillingCycle] =
    useState<'monthly' | 'annual'>('monthly');

  const [selectedPlanId, setSelectedPlanId] =
    useState<string | null>(null);

  // Reset to the Pay tab each time the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setTab('pay');
      setSelectedPlanId(null);
    }
  }, [open]);

  // Fetch plans live from Supabase the first time the Subscribe
  // tab is opened. subscription_plans has a permissive SELECT
  // policy for authenticated users, so no RPC is needed.
  useEffect(() => {
    if (!open || tab !== 'subscribe' || plans.length > 0 || plansLoading) {
      return;
    }

    let cancelled = false;

    const loadPlans = async () => {
      setPlansLoading(true);
      setPlansError(null);

      const { data, error: fetchError } = await supabase
        .from('subscription_plans')
        .select(
          'id, name, audience, monthly_price_kes, annual_price_kes, max_listings, max_units_per_listing'
        )
        .eq('audience', role === 'landlord' ? 'LANDLORD' : 'REAL_ESTATE')
        .order('monthly_price_kes', { ascending: true });

      if (cancelled) {
        return;
      }

      if (fetchError) {
        setPlansError(
          fetchError.message || 'Unable to load subscription plans.'
        );
      } else {
        setPlans(
          (data || []).map((row) => ({
            ...row,
            monthly_price_kes: Number(row.monthly_price_kes),
            annual_price_kes: Number(row.annual_price_kes),
            max_listings:
              row.max_listings === null ? null : Number(row.max_listings),
            max_units_per_listing:
              row.max_units_per_listing === null
                ? null
                : Number(row.max_units_per_listing),
          }))
        );
      }

      setPlansLoading(false);
    };

    loadPlans();

    return () => {
      cancelled = true;
    };
  }, [open, tab, role, plans.length, plansLoading]);

  if (!open) {
    return null;
  }

  const selectedPlan =
    plans.find((plan) => plan.id === selectedPlanId) || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-xl dark:bg-brand-950 sm:rounded-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-brand-800 dark:bg-brand-950">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Listing Payment
          </h3>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-brand-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5 dark:border-brand-800">
          <button
            type="button"
            onClick={() => setTab('pay')}
            className={cn(
              'border-b-2 px-3 py-3 text-sm font-semibold transition-colors',
              tab === 'pay'
                ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            )}
          >
            Pay {formatKES(amountKes)}
          </button>

          <button
            type="button"
            onClick={() => setTab('subscribe')}
            className={cn(
              'border-b-2 px-3 py-3 text-sm font-semibold transition-colors',
              tab === 'subscribe'
                ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            )}
          >
            Subscribe instead
          </button>
        </div>

        <div className="p-5">

          {/* =====================================================
              PAY TAB
          ====================================================== */}

          {tab === 'pay' && (
            <div className="space-y-5">

              <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 dark:border-warning-800 dark:bg-warning-900/20">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-warning-800 dark:text-warning-300">
                      One-time listing fee
                    </h4>
                    <p className="mt-1 text-sm text-warning-700 dark:text-warning-400">
                      Covers publishing this single listing.
                    </p>
                  </div>

                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatKES(amountKes)}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={paymentLoading || paymentCompleted}
                  onClick={() => onSelectPaymentMethod('MPESA')}
                  className={cn(
                    'rounded-xl border-2 p-4 text-left transition',
                    selectedPaymentMethod === 'MPESA'
                      ? 'border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/20'
                      : 'border-gray-200 hover:border-brand-400 dark:border-brand-700',
                    (paymentLoading || paymentCompleted) &&
                      'cursor-not-allowed opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        M-Pesa
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Pay directly using M-Pesa.
                      </p>
                    </div>
                    {selectedPaymentMethod === 'MPESA' && (
                      <CheckCircle2 className="h-5 w-5 text-brand-600" />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  disabled
                  title="PayPal is not yet available for the individual listing fee."
                  className="cursor-not-allowed rounded-xl border-2 border-gray-200 p-4 text-left opacity-50 dark:border-brand-700"
                >
                  <p className="font-semibold text-gray-900 dark:text-white">
                    PayPal
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Coming soon
                  </p>
                </button>
              </div>

              {error && (
                <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
                  {error}
                </div>
              )}

              {paymentCompleted ? (
                <div className="flex items-center gap-2 rounded-lg bg-success-50 px-4 py-3 text-sm font-medium text-success-700 dark:bg-success-900/20 dark:text-success-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Payment confirmed. You can close this and publish your listing.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onPayNow}
                  disabled={!selectedPaymentMethod || paymentLoading}
                  className={cn(
                    'btn-primary w-full',
                    (!selectedPaymentMethod || paymentLoading) &&
                      'cursor-not-allowed opacity-50'
                  )}
                >
                  {paymentLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Waiting for confirmation...
                    </>
                  ) : (
                    <>
                      <DollarSign className="h-4 w-4" />
                      Pay {formatKES(amountKes)}
                    </>
                  )}
                </button>
              )}

              {paymentLoading && (
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                  Check your phone for the M-Pesa prompt.
                </p>
              )}

            </div>
          )}

          {/* =====================================================
              SUBSCRIBE TAB
          ====================================================== */}

          {tab === 'subscribe' && (
            <div className="space-y-5">

              <div className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/20">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <p className="text-sm text-brand-700 dark:text-brand-400">
                  A subscription covers multiple listings — no per-listing fee
                  while it's active.
                </p>
              </div>

              {/* Billing cycle toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={cn(
                    'flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                    billingCycle === 'monthly'
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                      : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400'
                  )}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={cn(
                    'flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                    billingCycle === 'annual'
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                      : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400'
                  )}
                >
                  Annual
                </button>
              </div>

              {plansLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading plans...
                </div>
              )}

              {plansError && (
                <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
                  {plansError}
                </div>
              )}

              {!plansLoading && !plansError && (
                <div className="space-y-3">
                  {plans.map((plan) => {
                    const price =
                      billingCycle === 'monthly'
                        ? plan.monthly_price_kes
                        : plan.annual_price_kes;

                    const isSelected = selectedPlanId === plan.id;

                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() =>
                          setSelectedPlanId(
                            isSelected ? null : plan.id
                          )
                        }
                        className={cn(
                          'w-full rounded-xl border-2 p-4 text-left transition',
                          isSelected
                            ? 'border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/20'
                            : 'border-gray-200 hover:border-brand-400 dark:border-brand-700'
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold capitalize text-gray-900 dark:text-white">
                              {plan.name.toLowerCase()}
                            </p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {plan.max_listings
                                ? `Up to ${plan.max_listings} listings`
                                : 'Unlimited listings'}
                              {plan.max_units_per_listing
                                ? ` · up to ${plan.max_units_per_listing} units each`
                                : ''}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="font-bold text-gray-900 dark:text-white">
                              {formatKES(price)}
                            </p>
                            <p className="text-xs text-gray-400">
                              /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {plans.length === 0 && (
                    <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No subscription plans are available right now.
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={!selectedPlan}
                onClick={() =>
                  selectedPlan &&
                  onContinueToSubscription(selectedPlan, billingCycle)
                }
                className={cn(
                  'btn-primary w-full',
                  !selectedPlan && 'cursor-not-allowed opacity-50'
                )}
              >
                Continue to subscription
                <ArrowRight className="h-4 w-4" />
              </button>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}