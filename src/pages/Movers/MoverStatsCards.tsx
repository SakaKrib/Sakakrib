import { CalendarDays, CheckCircle2, Clock3, WalletCards } from 'lucide-react';
import type { MoverBooking, MoverPayout } from '@/lib/Movers/moverApi';
import { formatKES } from '@/lib/utils';

interface Props {
  bookings: MoverBooking[];
  payouts: MoverPayout[];
}

const normalized = (value: string | null | undefined) => value?.trim().toLowerCase().replace(/-/g, '_') ?? '';

export default function MoverStatsCards({ bookings, payouts }: Props) {
  const pending = bookings.filter((b) => normalized(b.status) === 'pending').length;
  const active = bookings.filter((b) => ['confirmed', 'in_progress', 'ongoing'].includes(normalized(b.status))).length;
  const completed = bookings.filter((b) => normalized(b.status) === 'completed').length;
  const earned = payouts
    .filter((p) => p.payout_completed_at || ['completed', 'paid', 'released', 'settled'].includes(normalized(p.final_payment_status)))
    .reduce((sum, payout) => sum + Number(payout.net_mover_payable || 0), 0);

  const cards = [
    { label: 'Pending requests', value: pending, icon: Clock3 },
    { label: 'Active jobs', value: active, icon: CalendarDays },
    { label: 'Completed jobs', value: completed, icon: CheckCircle2 },
    { label: 'Mover earnings', value: formatKES(earned), icon: WalletCards },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon: Icon }) => (
        <div key={label} className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50">
              <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
