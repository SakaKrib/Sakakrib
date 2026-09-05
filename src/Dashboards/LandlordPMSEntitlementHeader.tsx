import { useEffect, useState } from 'react';
import PMSStatusBanner from '@/components/PMS/PMSStatusBanner';
import PMSUsageBar from '@/components/PMS/PMSUsageBar';
import { protectedGet } from '@/lib/djangoApi';

type DashboardData = {
  subscription?: {
    subscription_id?: string | null;
    plan_id?: string | null;
    plan_name?: 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE' | null;
    max_listings?: number | null;
    billing_cycle?: 'MONTHLY' | 'ANNUAL' | null;
    status?: 'PENDING_PAYMENT' | 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED' | 'CANCELLED' | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
    grace_period_end?: string | null;
    auto_renew?: boolean;
  } | null;
  capacity?: {
    listings_used?: number;
    max_listings?: number | null;
    listings_remaining?: number | null;
  } | null;
};

export default function LandlordPMSEntitlementHeader() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    protectedGet<DashboardData>('/api/core/pms/dashboard/')
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const subscription = data?.subscription;
  const capacity = data?.capacity;

  if (!subscription?.status || !subscription.current_period_end) {
    return null;
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <PMSStatusBanner
        subscription={{
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          grace_period_end: subscription.grace_period_end ?? null,
        }}
      />
      <PMSUsageBar
        capacity={{
          listings_used: Number(capacity?.listings_used ?? 0),
          max_listings: capacity?.max_listings ?? null,
          listings_remaining: capacity?.listings_remaining ?? null,
        }}
      />
    </section>
  );
}
