import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Banknote, Loader2, Trash2 } from 'lucide-react';

import Select from '@/components/ui/Select';
import { protectedDelete, protectedGet, protectedPost } from '@/lib/djangoApi';

interface SaleUnit { unit_id: string; listing_id: string; unit_number: string; sale_price: number | null; installment_total_price: number | null }
interface SalePayment { id: string; unit_id: string; unit_number: string | null; listing_title: string; buyer_name: string; buyer_phone: string; amount_kes: number; payment_method: string; transaction_reference: string; payment_date: string; note: string }

const kes = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-950 dark:text-white';

/**
 * Units that are for sale never go through renter invoices: the owner simply records the
 * payments received from a buyer (deposit, instalment, full payment).
 */
export default function SalePaymentsPanel() {
  const [units, setUnits] = useState<SaleUnit[]>([]);
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ unit_id: '', buyer_name: '', buyer_phone: '', amount_kes: '', payment_method: 'M-Pesa', transaction_reference: '', payment_date: new Date().toISOString().slice(0, 10), note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await protectedGet<{ payments: SalePayment[]; sale_units: SaleUnit[] }>('/api/core/pms/sale-payments/');
      setUnits(data.sale_units ?? []);
      setPayments(data.payments ?? []);
      setForm((current) => ({ ...current, unit_id: current.unit_id || data.sale_units?.[0]?.unit_id || '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load sale payments.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await protectedPost('/api/core/pms/sale-payments/', { ...form, amount_kes: Number(form.amount_kes) });
      setForm((current) => ({ ...current, buyer_name: '', buyer_phone: '', amount_kes: '', transaction_reference: '', note: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record the payment.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (payment: SalePayment) => {
    if (!window.confirm('Delete this payment record?')) return;
    try { await protectedDelete(`/api/core/pms/sale-payments/${payment.id}/`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to delete the record.'); }
  };

  if (loading) return <div className="flex justify-center py-8 text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading sale payments...</div>;
  if (units.length === 0 && payments.length === 0) return null;
  const totalFor = (unitId: string) => payments.filter((p) => p.unit_id === unitId).reduce((sum, p) => sum + Number(p.amount_kes), 0);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex items-center gap-2"><Banknote className="h-5 w-5 text-brand-600" /><div><h2 className="text-base font-bold text-gray-900 dark:text-white">Property sale payments</h2><p className="text-xs text-gray-500 dark:text-gray-400">Record payments received from buyers for units that are for sale.</p></div></div>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
      {units.length > 0 && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} className={inputClass}>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>Unit {u.unit_number}{u.sale_price ? ` · ${kes(u.sale_price)}` : ''}</option>)}</Select>
          <input required value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} placeholder="Buyer name *" className={inputClass} />
          <input value={form.buyer_phone} onChange={(e) => setForm({ ...form, buyer_phone: e.target.value })} placeholder="Buyer phone" className={inputClass} />
          <input required type="number" min="1" value={form.amount_kes} onChange={(e) => setForm({ ...form, amount_kes: e.target.value })} placeholder="Amount received (KES) *" className={inputClass} />
          <Select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className={inputClass}>{['M-Pesa', 'Bank transfer', 'Cheque', 'Cash', 'Other'].map((m) => <option key={m} value={m}>{m}</option>)}</Select>
          <input required value={form.transaction_reference} onChange={(e) => setForm({ ...form, transaction_reference: e.target.value })} placeholder="Transaction ID / receipt no. *" className={inputClass} />
          <input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} className={inputClass} />
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (e.g. deposit, instalment 2)" className={`${inputClass} sm:col-span-2 lg:col-span-1`} />
          <button disabled={saving} className="btn-primary inline-flex items-center justify-center gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Record payment</button>
        </form>
      )}
      <div className="mt-5 divide-y rounded-xl border dark:divide-brand-800 dark:border-brand-700">
        {payments.length === 0 ? <p className="p-5 text-sm text-gray-500 dark:text-gray-400">No sale payments recorded yet.</p> : payments.map((payment) => (
          <div key={payment.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-semibold text-gray-900 dark:text-white">{payment.buyer_name} · Unit {payment.unit_number ?? '—'}</p><p className="truncate text-xs text-gray-500 dark:text-gray-400">{payment.listing_title} · {payment.payment_method || 'Payment'} · Ref {payment.transaction_reference} · {payment.payment_date}</p>{payment.note && <p className="mt-1 text-xs text-gray-500">{payment.note}</p>}<p className="mt-1 text-[11px] text-gray-400">Total received for this unit: {kes(totalFor(payment.unit_id))}</p></div>
            <div className="flex items-center gap-2"><p className="font-bold text-gray-900 dark:text-white">{kes(payment.amount_kes)}</p><button type="button" onClick={() => void remove(payment)} className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Delete payment record"><Trash2 className="h-4 w-4" /></button></div>
          </div>
        ))}
      </div>
    </section>
  );
}
