import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';

import {
  ShieldAlert,
  Lock,
  FileText,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { getPlatformSettings } from '@/lib/utils';
import { protectedGet } from '@/lib/djangoApi';

interface TermsGateProps {
  context: 'landlord' | 'real_estate' | 'mover' | 'listing';
  onAccept: () => void;
  children: ReactNode;
}

interface TermsSection {
  heading: string;
  body: string;
}

interface TermsContent {
  title: string;
  sections: TermsSection[];
}

interface SubscriptionPlan {
  plan_name?: string;
  audience?: string;
  billing_cycle?: string;
  max_listings?: number | null;
  max_units_per_listing?: number | null;
  monthly_price_kes?: number | null;
  annual_price_kes?: number | null;
}

interface SubscriptionPlansResponse {
  plans?: SubscriptionPlan[];
}

function formatKES(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) {
    return 'the applicable amount';
  }

  return `KES ${Number(value).toLocaleString('en-KE')}`;
}

function formatLimit(value: number | null | undefined): string {
  if (value == null) {
    return 'unlimited';
  }

  return Number(value).toLocaleString('en-KE');
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) {
    return 'the applicable';
  }

  const percent = Number(value) * 100;

  return percent % 1 === 0
    ? percent.toFixed(0)
    : percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function findPlan(
  plans: SubscriptionPlan[],
  name: string
): SubscriptionPlan | null {
  return (
    plans.find(
      (plan) =>
        String(plan.plan_name || '').toUpperCase() === name
    ) || null
  );
}

function buildPlanText(
  plans: SubscriptionPlan[],
  name: string
): string {
  const plan = findPlan(plans, name);

  if (!plan) {
    return `${name} plan: current limits and pricing are displayed by Saka Krib at the time of subscription.`;
  }

  const monthly = formatKES(plan.monthly_price_kes);
  const annual = formatKES(plan.annual_price_kes);
  const listings = formatLimit(plan.max_listings);
  const units = formatLimit(plan.max_units_per_listing);

  return `${name}: up to ${listings} listings, with up to ${units} units per listing; ${monthly} monthly or ${annual} annually, according to the current subscription configuration.`;
}

export default function TermsGate({
  context,
  onAccept,
  children,
}: TermsGateProps) {
  const [accepted, setAccepted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [platformSettings, setPlatformSettings] = useState<
    Awaited<ReturnType<typeof getPlatformSettings>> | null
  >(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<
    SubscriptionPlan[]
  >([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    const loadTermsConfiguration = async () => {
      const [settingsResult, plansResult] = await Promise.allSettled([
        getPlatformSettings(),
        protectedGet<SubscriptionPlansResponse>('/api/subscriptions/plans/'),
      ]);

      if (!mounted) {
        return;
      }

      if (settingsResult.status === 'fulfilled') {
        setPlatformSettings(settingsResult.value);
      } else {
        console.error(
          'Failed to load platform settings:',
          settingsResult.reason
        );
        setPlatformSettings(null);
      }

      if (plansResult.status === 'fulfilled') {
        setSubscriptionPlans(
          Array.isArray(plansResult.value?.plans)
            ? plansResult.value.plans
            : []
        );
      } else {
        console.error(
          'Failed to load subscription plans for terms:',
          plansResult.reason
        );
        setSubscriptionPlans([]);
      }
    };

    loadTermsConfiguration();

    return () => {
      mounted = false;
    };
  }, []);

  const moverCommission =
    platformSettings?.mover_commission_rate != null
      ? formatPercent(platformSettings.mover_commission_rate)
      : 'the applicable';

  const listingFeeText =
    'Any applicable listing fee, entitlement charge, or other listing-related amount is determined by Saka Krib’s current backend configuration and is shown to you before the relevant transaction. Saka Krib does not rely on a fixed amount stated in these terms.';

  const termsContent: Record<string, TermsContent> = {
    landlord: {
      title: 'Saka Krib — Landlord Terms & Conditions',
      sections: [
        {
          heading: '1. Account, Identity & Approval',
          body:
            'You must provide truthful account information and complete the identity-verification process required for your account. Where landlord registration or approval is required, you may not represent yourself as an approved landlord until Saka Krib has completed the applicable review.',
        },
        {
          heading: '2. Listing Accuracy & Authority',
          body:
            'You must have the lawful authority to advertise each property and must provide accurate information about location, rent, availability, amenities, photographs, ownership or management status, and other material facts. You must promptly correct information that becomes inaccurate or unavailable.',
        },
        {
          heading: '3. Listing Fees & Entitlements',
          body: listingFeeText,
        },
        {
          heading: '4. Renter Enquiries & Transactions',
          body:
            'Saka Krib provides marketplace and communication functionality but does not become a party to the landlord-renter tenancy agreement unless expressly stated for a particular service. You remain responsible for your representations, tenancy terms, property condition, lawful charges, and dealings with renters.',
        },
        {
          heading: '5. Platform Payments & Off-Platform Transactions',
          body:
            'Where Saka Krib provides an in-platform payment flow, use the payment flow presented by the platform and provide accurate payment information. Cash, private mobile-money transfers, bank transfers, or other transactions made outside an applicable Saka Krib payment flow may not appear in Saka Krib records and are outside Saka Krib payment protection, reconciliation, and dispute records.',
        },
        {
          heading: '6. Community Content & Media',
          body:
            'You must have the necessary rights to upload photographs, videos, descriptions, logos, and other material. Listing-related content may be used to operate Saka Krib features, including community or promotional functionality. You remain responsible for material you submit.',
        },
        {
          heading: '7. Prohibited Conduct',
          body:
            'Fraudulent listings, impersonation, discriminatory or abusive conduct, false availability, deceptive pricing, unauthorized property advertising, misuse of renter information, and attempts to bypass platform controls are prohibited. Saka Krib may restrict, suspend, or terminate access where permitted by law.',
        },
        {
          heading: '8. Responsibility & Platform Limitations',
          body:
            'You are responsible for the property, services, documents, agreements, and representations you control. Saka Krib does not guarantee that a listing will attract renters, that a renter will perform a tenancy obligation, or that information supplied by another user is accurate. Platform availability may be affected by maintenance, technical problems, payment-provider failures, or events outside Saka Krib’s reasonable control.',
        },
      ],
    },

    real_estate: {
      title: 'Saka Krib — Real Estate Terms & Conditions',
      sections: [
        {
          heading: '1. Professional Account, KYC & Application Approval',
          body:
            'Real estate users must provide truthful information, complete the required identity verification, and complete the real estate application and approval workflow where required. A real estate account must not claim approval, authority, or professional status that it has not been granted.',
        },
        {
          heading: '2. Property, Listing & Unit Responsibility',
          body:
            'You are responsible for ensuring that properties, listings, units, prices, availability, photographs, documents, and management information entered into Saka Krib are accurate and that you have the authority to manage or advertise them. You must promptly update or remove information that is no longer accurate.',
        },
        {
          heading: '3. Property Management Subscription',
          body:
            'Access to the Real Estate Property Management System (PMS) is controlled by the subscription associated with the real estate account. Subscription status, billing cycle, listing capacity, unit capacity, pricing, and other plan attributes are determined by Saka Krib’s current backend configuration and displayed at the time of subscription.',
        },
        {
          heading: '4. Current PMS Plans',
          body:
            `${buildPlanText(subscriptionPlans, 'STARTER')} ${buildPlanText(subscriptionPlans, 'GROWTH')} ${buildPlanText(subscriptionPlans, 'PRO')}`,
        },
        {
          heading: '5. Subscription Status, Payment & Grace Period',
          body:
            'A subscription may move through the platform’s configured lifecycle, including pending payment, active, grace-period, expired, or cancelled states. PMS access and write permissions may change according to the current subscription state. Any grace-period duration is controlled by backend configuration and is not treated as a fixed value in these terms.',
        },
        {
          heading: '6. Team Members & PMS Permissions',
          body:
            'The subscribing real estate account administrator is responsible for team access. The PMS supports administrator, team-manager, and agent roles with different permissions. Administrators may add team members, change team roles, suspend members, create and manage listings, assign listings, and perform administrator-only actions. Team managers and agents receive only the permissions granted by the PMS access rules and listing assignments. Credentials must not be shared.',
        },
        {
          heading: '7. PMS Records & Operations',
          body:
            'PMS functionality may include listings, units, assignments, calendars, leases, invoices, financial records, analytics, reports, media, notifications, and payment settings. These tools assist with property-management operations; they do not replace your responsibility to maintain accurate records, comply with applicable agreements and laws, or independently verify important financial and legal information.',
        },
        {
          heading: '8. Payments & Financial Information',
          body:
            'Where Saka Krib provides payment functionality, payments are processed through the configured payment methods and providers. You must provide accurate payment information and must not manipulate payment status, invoices, financial records, callbacks, or transaction references. A payment shown as pending is not the same as a confirmed successful payment.',
        },
        {
          heading: '9. Professional Conduct & Compliance',
          body:
            'Fraud, unauthorized property representation, misleading listings, misuse of tenant or owner information, discrimination, harassment, credential sharing, payment manipulation, and attempts to bypass subscription or access controls are prohibited. Saka Krib may restrict or terminate access where permitted by law.',
        },
        {
          heading: '10. Platform Role & Limitations',
          body:
            'Saka Krib supplies marketplace and property-management software. Unless expressly stated for a specific service, Saka Krib is not the owner, landlord, tenant, property manager, estate agent, insurer, lender, or party to the underlying tenancy or management agreement. Users remain responsible for the services and representations they provide.',
        },
      ],
    },

    mover: {
      title: 'Saka Krib — Mover Terms & Conditions',
      sections: [
        {
          heading: '1. Mover Account & Verification',
          body:
            'Movers must provide truthful information and complete the verification and registration requirements applicable to their mover account. You must maintain the licenses, vehicle information, and other credentials required to lawfully provide the moving services you advertise.',
        },
        {
          heading: '2. Quotes, Bookings & Service Details',
          body:
            'Moving prices and booking details are generated or confirmed using the information supplied for the move and the platform’s current pricing configuration. You must review the booking details before accepting a job and must not intentionally misrepresent the service, route, vehicle, availability, or price.',
        },
        {
          heading: '3. Platform Commission',
          body:
            `The current mover platform commission is ${moverCommission}% where the configured commission applies. The commission is calculated by the backend from the applicable booking amount. If the platform administrator changes the configured commission, the applicable current value may change accordingly and the platform’s current transaction calculation controls.`,
        },
        {
          heading: '4. Payments & Payment Confirmation',
          body:
            'Where Saka Krib provides a payment flow, you must use the applicable platform process and must not interfere with payment callbacks, transaction references, payment status, escrow records, or payout information. A payment is not considered confirmed merely because a renter states that they have initiated a payment.',
        },
        {
          heading: '5. Off-Platform Payments',
          body:
            'You must not pressure renters to bypass an applicable Saka Krib payment flow. Off-platform payments may not be recorded in Saka Krib’s payment, escrow, reconciliation, or dispute systems and may leave the transaction outside platform protections and records.',
        },
        {
          heading: '6. Moving Service Standards',
          body:
            'You must provide the service professionally, communicate material delays or changes, handle customer property with reasonable care, and perform the agreed moving service. You are responsible for complying with applicable transport, licensing, road-safety, insurance, and other requirements relevant to your services.',
        },
        {
          heading: '7. Cancellations, Disputes & Completion',
          body:
            'Bookings may have platform-defined cancellation, completion, dispute, escrow-release, and payout states. You must provide truthful completion information and cooperate with legitimate dispute-resolution procedures. Repeated cancellations, non-performance, fraud, or abuse of the booking system may result in account review or restriction.',
        },
        {
          heading: '8. Live Location & Journey Tracking',
          body:
            'When live moving tracking is enabled for an eligible booking, location information may be collected and displayed to authorized participants for journey coordination and safety-related tracking. Location access is subject to the device, browser, security, and booking conditions required by the platform. You must not falsify, manipulate, or misuse location information.',
        },
        {
          heading: '9. Property Damage & Insurance',
          body:
            'You remain responsible for the moving services you provide and for handling customer property with reasonable care. Saka Krib does not represent that every mover has a particular insurance policy or coverage level. Movers should maintain any insurance or protection appropriate to their operations and legal obligations.',
        },
      ],
    },

    listing: {
      title: 'Saka Krib — Listing Creation Terms & Conditions',
      sections: [
        {
          heading: '1. Authority & Accuracy',
          body:
            'By creating a listing, you confirm that you are authorized to advertise the property and that the information supplied is accurate, current, and not materially misleading. This includes price, location, availability, property details, amenities, photographs, and other information shown to prospective renters.',
        },
        {
          heading: '2. Listing Entitlements & Charges',
          body: listingFeeText,
        },
        {
          heading: '3. Media & Intellectual Property',
          body:
            'You must have the right to upload and publish photographs, videos, descriptions, logos, floor plans, and other media. You grant Saka Krib the permissions reasonably necessary to host, display, process, and distribute your submitted listing content as part of operating the platform and its listing-related features.',
        },
        {
          heading: '4. Community & AI-Assisted Content',
          body:
            'A listing may be used by platform features that create or publish related community content, including AI-assisted captions or descriptions. AI-generated material may require your review and does not replace your responsibility for the accuracy and legality of the underlying listing information.',
        },
        {
          heading: '5. Listing Availability & Removal',
          body:
            'You are responsible for keeping listings current and for removing or updating listings when a property is no longer available or the material information changes. Saka Krib may restrict, hide, review, or remove listings that are inaccurate, stale, unlawful, duplicative, abusive, or otherwise inconsistent with platform rules.',
        },
        {
          heading: '6. Payments & Fees',
          body:
            'Where a listing-related charge applies, the applicable amount and available payment method are determined by the current backend configuration and the payment options presented to you. You must not manipulate payment references, transaction status, or entitlement checks.',
        },
        {
          heading: '7. Prohibited Listings',
          body:
            'You may not publish fraudulent, deceptive, discriminatory, illegal, unauthorized, duplicated, or materially misleading listings. You must not use listings to collect information for unrelated purposes, impersonate another person or business, or circumvent platform controls.',
        },
        {
          heading: '8. Platform Limitations',
          body:
            'Saka Krib provides listing and marketplace technology and does not guarantee renter interest, tenancy outcomes, property condition, availability of any particular listing, or the accuracy of information supplied by other users. Users should independently verify important property and transaction information before entering an agreement.',
        },
      ],
    },
  };

  const content = termsContent[context];

  const handleScroll = () => {
    const el = scrollRef.current;

    if (!el) {
      return;
    }

    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 20;

    if (atBottom) {
      setScrolled(true);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;

    if (!el) {
      return;
    }

    if (el.scrollHeight <= el.clientHeight + 20) {
      setScrolled(true);
    }
  }, [content, subscriptionPlans, platformSettings]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border-2 border-error-300 bg-error-50 p-4 dark:border-error-700 dark:bg-error-900/20">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-error-600 dark:text-error-400" />
          <div>
            <h3 className="text-sm font-bold text-error-800 dark:text-error-300">
              SECURITY & PAYMENT NOTICE
            </h3>
            <p className="mt-1 text-sm text-error-700 dark:text-error-400">
              Use Saka Krib payment flows whenever a platform payment option is provided.
              Do not share credentials, falsify payment status, manipulate transaction
              references, or pressure another user to bypass platform controls. Transactions
              completed outside an applicable Saka Krib payment flow may not be recorded or
              protected by Saka Krib’s payment, escrow, reconciliation, or dispute systems.
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-brand-800 dark:bg-brand-800/50">
          <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {content.title}
          </h3>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-96 overflow-y-auto px-5 py-4"
        >
          <div className="space-y-4">
            {content.sections.map((section, i) => (
              <div key={i}>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {section.heading}
                </h4>
                <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-4 dark:border-brand-800">
          {!scrolled && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-warning-600 dark:text-warning-500">
              <Lock className="h-3.5 w-3.5" />
              Please scroll to the bottom to unlock the acceptance checkbox.
            </p>
          )}

          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 transition-opacity',
              !scrolled && 'pointer-events-none opacity-50'
            )}
          >
            <input
              type="checkbox"
              checked={accepted}
              disabled={!scrolled}
              onChange={(event) => {
                const checked = event.target.checked;

                setAccepted(checked);

                if (checked) {
                  onAccept();
                }
              }}
              className="mt-0.5 h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-brand-600 dark:bg-brand-800"
            />

            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              I have read and accept the Saka Krib Terms & Conditions.
            </span>
          </label>
        </div>
      </div>

      <div
        className={cn(
          'transition-all',
          !accepted && 'pointer-events-none opacity-40'
        )}
      >
        {!accepted && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-gray-100 py-3 text-sm font-medium text-gray-500 dark:bg-brand-800 dark:text-gray-400">
            <Lock className="h-4 w-4" />
            Accept the terms above to unlock the form.
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
