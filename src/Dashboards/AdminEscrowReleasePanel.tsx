import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { protectedPost } from '@/lib/djangoApi';

type RecordValue = Record<string, any>;

interface Props {
  bookings: RecordValue[];
  invoices: RecordValue[];
  payments: RecordValue[];
  payouts: RecordValue[];
  disputes: RecordValue[];
  onRefresh: () => Promise<void>;
  workingId?: string | null;
}

const money = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'KES 0.00';
};
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();

function Badge({ children, tone = 'warning' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const classes = tone === 'success'
    ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300'
    : tone === 'danger'
      ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300'
      : tone === 'neutral'
        ? 'bg-gray-100 text-gray-700 dark:bg-brand-900 dark:text-gray-300'
        : 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${classes}`}>{children}</span>;
}

export default function AdminEscrowReleasePanel({ bookings, invoices, payments, payouts, disputes, onRefresh, workingId }: Props) {
  const [query, setQuery] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  const records = useMemo(() => bookings.map((booking: RecordValue) => {
    const invoice = invoices.find((item: RecordValue) => String(item.booking_id) === String(booking.id));
    const payment = payments.filter((item: RecordValue) => String(item.booking_id) === String(booking.id)).sort((a: RecordValue, b: RecordValue) => new Date(String(b.paid_at || b.created_at || 0)).getTime() - new Date(String(a.paid_at || a.created_at || 0)).getTime())[0];
    const payout = payouts.find((item: RecordValue) => String(item.booking_id) === String(booking.id));
    const dispute = disputes.find((item: RecordValue) => String(item.booking_id) === String(booking.id) && normalized(item.status) === 'open');
    const renterConfirmed = Boolean(booking.renter_confirmed_delivery_at);
    const moverConfirmed = Boolean(booking.mover_confirmed_delivery_at);
    const paymentHeld = normalized(payment?.status) === 'held' || normalized(invoice?.status) === 'paid';
    const payoutReleased = normalized(payout?.final_payment_status) === 'released' || Boolean(payout?.payout_completed_at);
    const cancelled = normalized(booking.status) === 'cancelled';
    const eligible = Boolean(invoice?.booking_id && paymentHeld && renterConfirmed && moverConfirmed && !dispute && !cancelled && payout && !payoutReleased && ['held', 'failed'].includes(normalized(payout.final_payment_status)));
    return { booking, invoice, payment, payout, dispute, renterConfirmed, moverConfirmed, paymentHeld, payoutReleased, cancelled, eligible };
  }), [bookings, invoices, payments, payouts, disputes]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => !needle || [record.booking.id, record.invoice?.invoice_number, record.booking.mover_id, record.booking.renter_id, record.payout?.mover_name, record.payment?.mpesa_receipt, record.payment?.provider_transaction_id].some((value) => String(value ?? '').toLowerCase().includes(needle)));
  }, [query, records]);
  const selected = records.find((record) => record.booking.id === selectedBookingId) || null;
  const eligibleCount = records.filter((record) => record.eligible).length;
  const heldAmount = records.filter((record) => record.paymentHeld && !record.payoutReleased).reduce((sum, record) => sum + Number(record.invoice?.amount_kes || record.booking.total_amount || 0), 0);
  const processingCount = records.filter((record) => normalized(record.payout?.final_payment_status) === 'processing').length;

  const release = async () => {
    if (!selected?.eligible) return;
    if (confirmation.trim().toUpperCase() !== 'RELEASE') { setError('Type RELEASE to authorize this escrow release.'); return; }
    setReleasing(true); setError(null);
    try {
      await protectedPost(`/api/core/bookings/${encodeURIComponent(String(selected.booking.id))}/escrow/release/`, {});
      setConfirmation(''); setSelectedBookingId(null); await onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Escrow release failed.'); }
    finally { setReleasing(false); }
  };

  return <section className="space-y-5">
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-800 dark:bg-brand-950"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-brand-600"/><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">Escrow release control</p></div><h3 className="mt-2 text-xl font-bold text-gray-900 dark:text-white">Release mover funds after delivery</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">The renter payment is tied to its booking, invoice and mover payout. Django remains authoritative: the admin cannot override the amount or bypass delivery, payment, dispute or payout-state checks.</p></div><button type="button" onClick={() => void onRefresh()} className="btn-secondary inline-flex shrink-0 items-center gap-2"><RefreshCw className="h-4 w-4"/>Refresh escrow</button></div></div>
    {error && <div className="flex items-start gap-3 rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="Release-ready" value={eligibleCount} detail="Both parties confirmed delivery" icon={ShieldCheck} tone="success"/><SummaryCard label="Funds held" value={money(heldAmount)} detail="Paid moving invoices not fully released" icon={WalletCards}/><SummaryCard label="Payout processing" value={processingCount} detail="Awaiting M-Pesa provider callback" icon={Clock3} tone="warning"/><SummaryCard label="Escrow records" value={records.length} detail="Booking-linked escrow records" icon={Landmark}/></div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
      <div className="card overflow-hidden"><div className="border-b border-gray-200 p-5 dark:border-brand-800"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-gray-900 dark:text-white">Booking-linked escrow</h3><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Search by booking, invoice, mover, renter or M-Pesa receipt.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search escrow..." className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 dark:border-brand-800 dark:bg-brand-950 dark:text-white"/></div></div></div>
        <div className="divide-y divide-gray-100 dark:divide-brand-800">{filtered.slice(0,50).map((record) => { const selectedRow = selectedBookingId === record.booking.id; const payoutStatus = normalized(record.payout?.final_payment_status); return <button key={record.booking.id} type="button" onClick={() => { setSelectedBookingId(String(record.booking.id)); setError(null); }} className={`w-full p-5 text-left transition hover:bg-gray-50 dark:hover:bg-brand-900/30 ${selectedRow ? 'bg-brand-50/70 dark:bg-brand-900/30' : ''}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Truck className="h-4 w-4 text-brand-600"/><span className="font-semibold text-gray-900 dark:text-white">{record.payout?.mover_name || `Mover ${String(record.booking.mover_id || '').slice(0,8)}`}</span>{record.eligible ? <Badge tone="success">Ready</Badge> : record.dispute ? <Badge tone="danger">Dispute open</Badge> : record.payoutReleased ? <Badge tone="success">Released</Badge> : <Badge>{payoutStatus || 'Held'}</Badge>}</div><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Booking {String(record.booking.id).slice(0,8)} · {record.invoice?.invoice_number || 'No invoice number'}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Renter payment: {record.payment?.provider || record.booking.payment_method || '—'} · receipt {record.payment?.mpesa_receipt || record.payment?.provider_transaction_id || '—'}</p></div><div className="flex items-center gap-4 lg:text-right"><div><p className="text-lg font-bold text-gray-900 dark:text-white">{money(record.payout?.net_mover_payable || record.invoice?.mover_net_kes || record.booking.total_amount)}</p><p className="text-xs text-gray-500">Mover net payable</p></div><ChevronRight className="h-5 w-5 text-gray-400"/></div></div><div className="mt-4 grid gap-2 sm:grid-cols-4"><Check label="Renter delivery" value={record.renterConfirmed}/><Check label="Mover delivery" value={record.moverConfirmed}/><Check label="Payment held" value={record.paymentHeld}/><Check label="No open dispute" value={!record.dispute}/></div></button>; })}{!filtered.length && <div className="p-10 text-center text-sm text-gray-500">No escrow records match your search.</div>}</div></div>
      <div className="card p-5">{!selected ? <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><Landmark className="h-10 w-10 text-gray-300"/><h3 className="mt-4 font-bold text-gray-900 dark:text-white">Select an escrow record</h3><p className="mt-2 max-w-xs text-sm leading-6 text-gray-500">Review the linked renter payment, mover payout and delivery confirmations before releasing funds.</p></div> : <div><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-600">Selected escrow</p><h3 className="mt-1 font-bold text-gray-900 dark:text-white">{selected.invoice?.invoice_number || `Booking ${String(selected.booking.id).slice(0,8)}`}</h3></div><button type="button" onClick={() => setSelectedBookingId(null)} className="text-gray-400 hover:text-gray-600"><XCircle className="h-5 w-5"/></button></div><div className="mt-5 space-y-3"><Detail label="Renter" value={String(selected.booking.renter_id || '—')}/><Detail label="Mover" value={selected.payout?.mover_name || String(selected.booking.mover_id || '—')}/><Detail label="Renter payment" value={money(selected.payment?.amount_kes || selected.invoice?.amount_kes || selected.booking.total_amount)}/><Detail label="Mover net" value={money(selected.payout?.net_mover_payable || selected.invoice?.mover_net_kes)}/><Detail label="Payment provider" value={selected.payment?.provider || selected.booking.payment_method || '—'}/><Detail label="M-Pesa receipt" value={selected.payment?.mpesa_receipt || selected.payment?.provider_transaction_id || '—'}/><Detail label="Payment settled" value={dateTime(selected.payment?.paid_at || selected.invoice?.paid_at)}/><Detail label="Delivery confirmations" value={`${selected.renterConfirmed ? 'Renter ✓' : 'Renter pending'} · ${selected.moverConfirmed ? 'Mover ✓' : 'Mover pending'}`}/></div>{!selected.eligible && <div className="mt-5 rounded-xl bg-warning-50 p-4 text-sm text-warning-800 dark:bg-warning-900/20 dark:text-warning-200"><p className="font-bold">Release blocked by Django</p><ul className="mt-2 space-y-1 text-xs leading-5">{!selected.paymentHeld && <li>• Renter payment has not reached HELD state.</li>}{!selected.renterConfirmed && <li>• Renter has not confirmed delivery.</li>}{!selected.moverConfirmed && <li>• Mover has not confirmed delivery.</li>}{selected.dispute && <li>• An open dispute must be resolved first.</li>}{selected.cancelled && <li>• Cancelled bookings cannot be released.</li>}{!selected.payout && <li>• Mover payout record is missing.</li>}{selected.payout && !['held','failed'].includes(normalized(selected.payout.final_payment_status)) && !selected.payoutReleased && <li>• Final payout is not currently available for release.</li>}</ul></div>}{selected.eligible && <div className="mt-5 space-y-3 rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-900/10"><div className="flex items-start gap-2 text-sm text-success-800 dark:text-success-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><span><strong>Ready for admin release.</strong> Django has verified payment, both delivery confirmations and no open dispute.</span></div><label className="block text-xs font-bold uppercase tracking-wide text-success-800 dark:text-success-200">Authorization input</label><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type RELEASE" className="w-full rounded-xl border border-success-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-success-500 dark:border-success-700 dark:bg-brand-950 dark:text-white"/><button type="button" disabled={releasing || workingId === selected.booking.id || confirmation.trim().toUpperCase() !== 'RELEASE'} onClick={() => void release()} className="btn-primary inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">{releasing ? <Loader2 className="h-4 w-4 animate-spin"/> : <Landmark className="h-4 w-4"/>}Release escrow & initiate mover payout</button></div>}</div>}</div>
    </div>
  </section>;
}

function SummaryCard({ label, value, detail, icon: Icon, tone = 'default' }: { label: string; value: string | number; detail: string; icon: typeof Landmark; tone?: 'default' | 'success' | 'warning' }) { const toneClass = tone === 'success' ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300' : tone === 'warning' ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300' : 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300'; return <div className="card p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}><Icon className="h-5 w-5"/></span></div></div>; }
function Check({ label, value }: { label: string; value: boolean }) { return <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-brand-900/40"><span className="text-[11px] text-gray-500">{label}</span>{value ? <CheckCircle2 className="h-4 w-4 text-success-600"/> : <Clock3 className="h-4 w-4 text-warning-500"/>}</div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-2.5 dark:border-brand-800"><span className="text-xs text-gray-500">{label}</span><span className="max-w-[65%] truncate text-right text-xs font-semibold text-gray-900 dark:text-gray-200">{value}</span></div>; }
