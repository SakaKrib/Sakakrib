import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Loader2, RefreshCw, WalletCards, XCircle } from 'lucide-react';

import Select from '@/components/ui/Select';
import SalePaymentsPanel from '@/components/PMS/SalePaymentsPanel';
import { protectedPost } from '@/lib/djangoApi';
import { getRealEstatePMSFinance, type RealEstatePMSFinanceData, createRealEstatePMSInvoice } from '@/lib/RealEstateTs/RealEstatePMSFinanceService';
import { getRealEstatePMSUnits, type RealEstatePMSUnit } from '@/lib/RealEstateTs/RealEstatePMSOperationsService';

interface Props {
  canCreateInvoices: boolean;
}

const kes = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-950 dark:text-white';
const statusClass = (status: string) => {
  const value = status.toUpperCase();
  if (value === 'PAID') return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300';
  if (value === 'SUBMITTED' || value === 'PENDING') return 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300';
  if (value === 'OVERDUE' || value === 'REJECTED') return 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300';
  return 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300';
};

export default function RealEstatePMSFinance({ canCreateInvoices }: Props) {
  const [data, setData] = useState<RealEstatePMSFinanceData | null>(null);
  const [units, setUnits] = useState<RealEstatePMSUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [paid, setPaid] = useState({ transaction_reference: '', payment_method: 'M-Pesa', payment_date: new Date().toISOString().slice(0, 10) });
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  // Rent invoices only apply to units that are for rent and have a renter attached.
  const rentUnits = useMemo(() => units.filter((unit) => (unit as RealEstatePMSUnit & { listing_type?: string }).listing_type !== 'sale'), [units]);
  const unitLabel = useCallback((unitId: string) => {
    const unit = units.find((item) => item.unit_id === unitId);
    return unit ? `${unit.listing_title ? `${unit.listing_title} · ` : ''}Unit ${unit.unit_number}` : 'Unit';
  }, [units]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [financeResult, unitsResult] = await Promise.all([getRealEstatePMSFinance(), getRealEstatePMSUnits()]);
      setData(financeResult.data ?? null);
      const nextUnits = unitsResult.data ?? [];
      setUnits(nextUnits);
      const firstRentUnit = nextUnits.find((unit) => (unit as RealEstatePMSUnit & { listing_type?: string }).listing_type !== 'sale' && unit.renter_assoc_id);
      setSelectedUnit((current) => current || firstRentUnit?.unit_id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load finance records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const issueInvoice = async () => {
    const unit = rentUnits.find((item) => item.unit_id === selectedUnit);
    if (!unit) return;
    if (alreadyPaid && !paid.transaction_reference.trim()) { setError('Enter the transaction ID of the payment you are recording.'); return; }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setSaving(true);
    setError(null);
    try {
      await createRealEstatePMSInvoice({
        unit_id: unit.unit_id,
        amount_kes: unit.rent,
        billing_period_start: start.toISOString().slice(0, 10),
        billing_period_end: end.toISOString().slice(0, 10),
        due_date: new Date(now.getFullYear(), now.getMonth(), Math.min(5, end.getDate())).toISOString().slice(0, 10),
        ...(alreadyPaid ? { transaction_reference: paid.transaction_reference.trim(), payment_method: paid.payment_method, payment_date: paid.payment_date } : {}),
      });
      setPaid((current) => ({ ...current, transaction_reference: '' }));
      setAlreadyPaid(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create invoice.');
    } finally {
      setSaving(false);
    }
  };

  const decide = async (submissionId: string, action: 'confirm' | 'reject') => {
    if (action === 'reject' && reason.trim().length < 3) { setError('A rejection reason is required so the renter knows what to fix.'); return; }
    setBusyId(submissionId);
    setError(null);
    try {
      await protectedPost(`/api/core/payment-submissions/${submissionId}/${action}/`, action === 'reject' ? { rejection_reason: reason.trim() } : {});
      setRejecting(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} the payment.`);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12 text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading finance...</div>;

  const pending = (data?.payment_submissions ?? []).filter((item) => item.status.toUpperCase() === 'PENDING');
  const invoiceNumber = (invoiceId: string) => data?.invoices.find((invoice) => invoice.id === invoiceId)?.invoice_number ?? 'Invoice';

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900"><p className="text-xs text-gray-500">Invoiced</p><p className="mt-1 text-xl font-bold">{kes(data?.summary.total_invoiced_kes ?? 0)}</p></div>
        <div className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900"><p className="text-xs text-gray-500">Paid</p><p className="mt-1 text-xl font-bold">{kes(data?.summary.total_paid_kes ?? 0)}</p></div>
        <div className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900"><p className="text-xs text-gray-500">Outstanding</p><p className="mt-1 text-xl font-bold">{kes(data?.summary.total_due_kes ?? 0)}</p></div>
        <div className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900"><p className="text-xs text-gray-500">Pending submissions</p><p className="mt-1 text-xl font-bold">{data?.summary.pending_submissions ?? 0}</p></div>
      </div>

      <section className="rounded-xl border bg-white dark:border-brand-700 dark:bg-brand-900">
        <div className="border-b p-5 dark:border-brand-800"><h2 className="font-bold">Payments awaiting confirmation</h2><p className="text-xs text-gray-500 dark:text-gray-400">Renters who paid outside the app submit the transaction ID here. Confirm it once you have received the money, or reject it with a reason.</p></div>
        <div className="divide-y dark:divide-brand-800">
          {pending.length === 0 ? <p className="p-6 text-sm text-gray-500">No payments are waiting for review.</p> : pending.map((submission) => (
            <div key={submission.id} className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="font-semibold">{invoiceNumber(submission.invoice_id)} · {unitLabel(submission.unit_id)}</p><p className="text-xs text-gray-500">Transaction ID <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{submission.transaction_reference}</span>{submission.payment_method ? ` · ${submission.payment_method}` : ''} · submitted {new Date(submission.submitted_at).toLocaleDateString('en-KE')}</p></div>
                {canCreateInvoices && <div className="flex gap-2">
                  <button type="button" disabled={busyId === submission.id} onClick={() => void decide(submission.id, 'confirm')} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busyId === submission.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirm</button>
                  <button type="button" disabled={busyId === submission.id} onClick={() => { setRejecting(rejecting === submission.id ? null : submission.id); setReason(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-error-200 px-3 py-2 text-xs font-semibold text-error-600 dark:border-error-800"><XCircle className="h-3.5 w-3.5" />Reject</button>
                </div>}
              </div>
              {rejecting === submission.id && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for rejecting (shown to the renter)" className={inputClass} /><button type="button" disabled={busyId === submission.id} onClick={() => void decide(submission.id, 'reject')} className="rounded-lg bg-error-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Send rejection</button></div>}
            </div>
          ))}
        </div>
      </section>

      {canCreateInvoices && rentUnits.length > 0 && (
        <section className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
          <div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-brand-600" /><h2 className="font-bold">Create rent invoice</h2></div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">For units that are for rent. Tick "already paid" to record a payment the renter made directly to you.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Select value={selectedUnit} onChange={(event) => setSelectedUnit(event.target.value)} className={inputClass}><option value="">Select a rented unit</option>{rentUnits.filter((unit) => unit.renter_assoc_id).map((unit) => <option key={unit.unit_id} value={unit.unit_id}>{unitLabel(unit.unit_id)} · {unit.renter_name ?? 'Renter'} · {kes(unit.rent)}</option>)}</Select>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200"><input type="checkbox" checked={alreadyPaid} onChange={(event) => setAlreadyPaid(event.target.checked)} className="h-4 w-4 rounded" />The renter has already paid (record the payment)</label>
            {alreadyPaid && <>
              <input value={paid.transaction_reference} onChange={(event) => setPaid({ ...paid, transaction_reference: event.target.value })} placeholder="Transaction ID *" className={inputClass} />
              <Select value={paid.payment_method} onChange={(event) => setPaid({ ...paid, payment_method: event.target.value })} className={inputClass}>{['M-Pesa', 'Bank transfer', 'Cash', 'Cheque', 'Other'].map((m) => <option key={m} value={m}>{m}</option>)}</Select>
              <input type="date" value={paid.payment_date} onChange={(event) => setPaid({ ...paid, payment_date: event.target.value })} className={inputClass} />
            </>}
          </div>
          <button type="button" disabled={saving || !selectedUnit} onClick={() => void issueInvoice()} className="btn-primary mt-4 inline-flex items-center gap-2 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{alreadyPaid ? 'Record payment' : 'Create & send invoice'}</button>
        </section>
      )}

      <SalePaymentsPanel />

      <section className="rounded-xl border bg-white dark:border-brand-700 dark:bg-brand-900">
        <div className="flex items-center justify-between border-b p-5 dark:border-brand-800"><div><h2 className="font-bold">Invoice history</h2><p className="text-xs text-gray-500 dark:text-gray-400">Recorded rent invoices for the PMS portfolio.</p></div><button type="button" onClick={() => void load()} className="rounded-lg border p-2 dark:border-brand-700" aria-label="Refresh finance"><RefreshCw className="h-4 w-4" /></button></div>
        <div className="divide-y dark:divide-brand-800">
          {(data?.invoices ?? []).length === 0 ? <p className="p-6 text-sm text-gray-500">No rent invoices recorded yet.</p> : (data?.invoices ?? []).map((invoice) => (
            <div key={invoice.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{invoice.invoice_number}</p><p className="text-xs text-gray-500">Due {invoice.due_date} · {unitLabel(invoice.unit_id)}</p>{invoice.transaction_reference && <p className="text-xs text-gray-500">Ref {invoice.transaction_reference}{invoice.payment_method ? ` · ${invoice.payment_method}` : ''}</p>}</div>
              <div className="text-left sm:text-right"><p className="font-bold">{kes(invoice.amount_kes)}</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${statusClass(invoice.status)}`}>{invoice.status}</span></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
