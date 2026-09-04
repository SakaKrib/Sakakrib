import { ArrowUpRight, ReceiptText, WalletCards } from 'lucide-react';
import type { MoverInvoice, MoverPayout } from '@/lib/Movers/moverApi';
import { formatKES } from '@/lib/utils';

interface Props {
  invoices: MoverInvoice[];
  payouts: MoverPayout[];
}

const normalize = (value: string | null | undefined) => value?.trim().toLowerCase().replace(/-/g, '_') ?? '';

export default function MoverFinanceOverview({ invoices, payouts }: Props) {
  const outstanding = invoices
    .filter((invoice) => !['paid', 'completed', 'settled', 'released', 'cancelled'].includes(normalize(invoice.status)))
    .reduce((sum, invoice) => sum + Number(invoice.mover_net_kes || 0), 0);
  const released = payouts
    .filter((payout) => Boolean(payout.payout_completed_at || payout.final_payment_released_at))
    .reduce((sum, payout) => sum + Number(payout.net_mover_payable || 0), 0);
  const recentInvoices = [...invoices].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-brand-800">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Finance</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Invoices and mover payout position.</p>
        </div>
        <WalletCards className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
          <p className="text-xs text-gray-500 dark:text-gray-400">Pending mover net</p>
          <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{formatKES(outstanding)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
          <p className="text-xs text-gray-500 dark:text-gray-400">Released payouts</p>
          <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{formatKES(released)}</p>
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-brand-800">
        {recentInvoices.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No mover invoices yet.</div>
        ) : recentInvoices.map((invoice) => (
          <div key={invoice.id} className="flex items-center gap-3 border-b border-gray-100 p-4 last:border-b-0 dark:border-brand-800">
            <ReceiptText className="h-5 w-5 shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{invoice.invoice_number}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{invoice.status}</p>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatKES(Number(invoice.mover_net_kes || 0))}</p>
            <ArrowUpRight className="h-4 w-4 text-gray-400" />
          </div>
        ))}
      </div>
    </section>
  );
}
