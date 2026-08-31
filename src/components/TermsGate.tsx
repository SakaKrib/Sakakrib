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

interface TermsGateProps {
  context: 'landlord' | 'mover' | 'listing';
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

export default function TermsGate({
  context,
  onAccept,
  children,
}: TermsGateProps) {
  const [accepted, setAccepted] =
    useState(false);

  const [scrolled, setScrolled] =
    useState(false);

  const [platformSettings, setPlatformSettings] =
    useState<
      Awaited<
        ReturnType<typeof getPlatformSettings>
      > | null
    >(null);

  const scrollRef =
    useRef<HTMLDivElement>(null);

  /*
  |--------------------------------------------------------------------------
  | LOAD PLATFORM SETTINGS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    let mounted = true;

    const loadPlatformSettings = async () => {
      try {
        const settings =
          await getPlatformSettings();

        if (mounted) {
          setPlatformSettings(settings);
        }
      } catch (settingsError) {
        console.error(
          'Failed to load platform settings:',
          settingsError
        );

        if (mounted) {
          setPlatformSettings(null);
        }
      }
    };

    loadPlatformSettings();

    return () => {
      mounted = false;
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | COMMISSION RATE
  |--------------------------------------------------------------------------
  |
  | Database value should be stored as a decimal fraction:
  |
  | 0.20  = 20%
  | 0.15  = 15%
  | 0.05  = 5%
  | 0.002 = 0.2%
  |
  */

  const commissionRate =
    platformSettings?.mover_commission_rate != null
      ? Number(
          platformSettings.mover_commission_rate
        ) * 100
      : null;

  const formattedCommissionRate =
    commissionRate !== null
      ? commissionRate % 1 === 0
        ? commissionRate.toFixed(0)
        : commissionRate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
      : 'the applicable';

  /*
  |--------------------------------------------------------------------------
  | TERMS CONTENT
  |--------------------------------------------------------------------------
  */

  const termsContent: Record<
    string,
    TermsContent
  > = {
    landlord: {
      title:
        'Saka Krib — Landlord Terms & Conditions',

      sections: [
        {
          heading:
            '1. Account Verification',

          body:
            'All landlords must complete KYC verification, including National ID validation and identity verification through our IPRS/Smile ID integration, before posting any property listings.',
        },

        {
          heading:
            '2. Listing Accuracy',

          body:
            'You agree to provide accurate, complete, and truthful information about your properties. Misleading listings, fake photos, or false pricing will result in immediate account suspension.',
        },

        {
          heading:
            '3. Freemium Listing Model',

          body:
            'Each landlord receives 3 free listings. Starting from the 4th listing, a fee of KES 1,000 per listing applies. Real estate agencies are subject to a 15% commission model instead.',
        },

        {
          heading:
            '4. Platform Payment Policy',

          body:
            "SECURITY NOTICE: Renters are strictly advised to make all payments through the Saka Krib website. Any off-platform payments (e.g., direct cash or private M-Pesa to landlords) will NOT be tracked and are entirely out of Saka Krib's hands or liability.",
        },

        {
          heading:
            '5. Prohibited Conduct',

          body:
            'Discriminatory practices, harassment of renters, or soliciting off-platform payments are strictly prohibited and will result in permanent ban.',
        },

        {
          heading:
            '6. Data & Privacy',

          body:
            'Your contact information will be shared with verified renters who express interest in your listings. Saka Krib reserves the right to verify all submitted data.',
        },

        {
          heading:
            '7. Liability',

          body:
            'Saka Krib is a marketplace platform and does not guarantee rental outcomes. Landlords are responsible for property condition, legal compliance, and tenant agreements.',
        },
      ],
    },

    mover: {
      title:
        'Saka Krib — Mover Terms & Conditions',

      sections: [
        {
          heading:
            '1. Account Verification',

          body:
            'All movers must complete KYC verification, including National ID, Driving License validation, and vehicle documentation, before accepting any moving jobs.',
        },

        {
          heading:
            `2. ${formattedCommissionRate}% Commission Rule`,

          body:
            commissionRate !== null
              ? `When a renter books your services through Saka Krib, a ${formattedCommissionRate}% platform commission is automatically calculated from the applicable booking amount. This commission is processed through the platform payment system.`
              : 'When a renter books your services through Saka Krib, the applicable platform commission is automatically calculated from the booking amount and processed through the platform payment system.',
        },

        {
          heading:
            '3. Platform Payment Policy',

          body:
            "SECURITY NOTICE: Renters are strictly advised to make all payments through the Saka Krib website. Any off-platform payments (e.g., direct cash or private M-Pesa to movers) will NOT be tracked and are entirely out of Saka Krib's hands or liability.",
        },

        {
          heading:
            '4. Service Standards',

          body:
            'Movers must maintain professional conduct, arrive on time, handle items with care, and complete jobs as agreed. Repeated complaints will result in account suspension.',
        },

        {
          heading:
            '5. Vehicle & License Requirements',

          body:
            'You must maintain a valid driving license and roadworthy vehicle. Any changes to vehicle or license status must be reported immediately.',
        },

        {
          heading:
            '6. Insurance & Liability',

          body:
            'Movers are responsible for any damage to client property during transit. Saka Krib recommends appropriate insurance coverage.',
        },

        {
          heading:
            '7. Booking Cancellation',

          body:
            'Cancellations must be communicated promptly. Repeated last-minute cancellations will affect your rating and may lead to account review.',
        },
      ],
    },

    listing: {
      title:
        'Saka Krib — Listing Creation Terms',

      sections: [
        {
          heading:
            '1. Listing Accuracy',

          body:
            'You confirm that all information provided — price, location, photos, description — is accurate and represents the actual property available.',
        },

        {
          heading:
            '2. Photo & Media Rights',

          body:
            'You confirm you have the right to use all uploaded photos and videos. Saka Krib is not liable for copyright infringement by users.',
        },

        {
          heading:
            '3. Platform Payment Policy',

          body:
            "SECURITY NOTICE: Renters are strictly advised to make all payments through the Saka Krib website. Any off-platform payments will NOT be tracked and are entirely out of Saka Krib's hands or liability.",
        },

        {
          heading:
            '4. Pricing & Fees',

          body:
            'First 3 listings are free. From the 4th listing, KES 1,000 applies (landlords) or 15% commission (agencies). Payment is processed via Pesapal or PayPal.',
        },

        {
          heading:
            '5. Community Feed',

          body:
            'Publishing a listing automatically creates a post in the Saka Krib Community Feed with an AI-generated caption. You may edit or delete this post at any time.',
        },

        {
          heading:
            '6. Listing Duration',

          body:
            'Listings remain active until you remove them or mark them as unavailable. Stale listings may be reviewed by Saka Krib.',
        },
      ],
    },
  };

  const content =
    termsContent[context];

  /*
  |--------------------------------------------------------------------------
  | SCROLL HANDLER
  |--------------------------------------------------------------------------
  */

  const handleScroll = () => {
    const el = scrollRef.current;

    if (!el) {
      return;
    }

    const atBottom =
      el.scrollTop +
        el.clientHeight >=
      el.scrollHeight - 20;

    if (atBottom) {
      setScrolled(true);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div className="space-y-6">

      {/* SECURITY WARNING BANNER */}

      <div className="rounded-xl border-2 border-error-300 bg-error-50 p-4 dark:border-error-700 dark:bg-error-900/20">
        <div className="flex items-start gap-3">

          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-error-600 dark:text-error-400" />

          <div>
            <h3 className="text-sm font-bold text-error-800 dark:text-error-300">
              SECURITY NOTICE
            </h3>

            <p className="mt-1 text-sm text-error-700 dark:text-error-400">
              Renters are strictly advised to
              make all payments through the Saka
              Krib website. Any off-platform
              payments (e.g., direct cash or
              private M-Pesa to movers/landlords)
              will NOT be tracked and are entirely
              out of Saka Krib's hands or liability.
            </p>
          </div>

        </div>
      </div>

      {/* TERMS BOX */}

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
          className="max-h-64 overflow-y-auto px-5 py-4"
        >
          <div className="space-y-4">

            {content.sections.map(
              (section, i) => (
                <div key={i}>

                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {section.heading}
                  </h4>

                  <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    {section.body}
                  </p>

                </div>
              )
            )}

          </div>
        </div>

        {/* ACCEPTANCE */}

        <div className="border-t border-gray-200 px-5 py-4 dark:border-brand-800">

          {!scrolled && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-warning-600 dark:text-warning-500">
              <Lock className="h-3.5 w-3.5" />
              Please scroll to the bottom to unlock
              the acceptance checkbox.
            </p>
          )}

          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 transition-opacity',
              !scrolled &&
                'pointer-events-none opacity-50'
            )}
          >
            <input
              type="checkbox"
              checked={accepted}
              disabled={!scrolled}
              onChange={(event) => {
                const checked =
                  event.target.checked;

                setAccepted(checked);

                if (checked) {
                  onAccept();
                }
              }}
              className="mt-0.5 h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-brand-600 dark:bg-brand-800"
            />

            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              I read and accept the Saka Krib
              Terms & Conditions
            </span>
          </label>

        </div>
      </div>

      {/* CHILDREN / FORM */}

      <div
        className={cn(
          'transition-all',
          !accepted &&
            'pointer-events-none opacity-40'
        )}
      >
        {!accepted && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-gray-100 py-3 text-sm font-medium text-gray-500 dark:bg-brand-800 dark:text-gray-400">
            <Lock className="h-4 w-4" />
            Accept the terms above to unlock the
            form
          </div>
        )}

        {children}
      </div>
    </div>
  );
};