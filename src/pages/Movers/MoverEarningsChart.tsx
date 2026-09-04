import { BarChart3 } from 'lucide-react';
import type { MoverPayout } from '@/lib/Movers/moverApi';
import { formatKES } from '@/lib/utils';

interface Props { payouts: MoverPayout[] }

export default function MoverEarningsChart({ payouts }: Props) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: date.toLocaleDateString('en-KE', { month: 'short' }), total: 0 };
  });

  for (const payout of payouts) {
    const date = new Date(payout.payout_completed_at || payout.updated_at || payout.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const month = months.find((item) => item.key === `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    if (month) month.total += Number(payout.net_mover_payable || 0);
  }

  const maximum = Math.max(...months.map((month) => month.total), 1);

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Earnings trend</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Released mover payout value over the last six months.</p>
        </div>
        <BarChart3 className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>
      <div className="mt-6 grid h-40 grid-cols-6 items-end gap-3">
        {months.map((month) => (
          <div key={month.key} className="flex h-full flex-col items-center justify-end gap-2">
            <div className="flex h-full w-full items-end rounded-lg bg-gray-100 p-1 dark:bg-brand-800/40">
              <div className="w-full rounded-md bg-brand-500/80" style={{ height: `${Math.max((month.total / maximum) * 100, month.total > 0 ? 8 : 2)}%` }} title={formatKES(month.total)} />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{month.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
