import { FormEvent, useEffect, useState } from 'react';
import { Check, CreditCard, Loader2, Plus, Trash2, Wallet } from 'lucide-react';
import { protectedDelete, protectedGet, protectedPatch, protectedPost } from '@/lib/djangoApi';

import Select from '@/components/ui/Select';
type PaymentMethod = {
  id: string;
  provider: 'MPESA' | 'PAYPAL' | string;
  mpesa_method?: 'PAYBILL' | 'TILL' | string | null;
  display_name?: string | null;
  paybill_number?: string | null;
  paybill_account?: string | null;
  till_number?: string | null;
  paypal_email?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_branch?: string | null;
  is_default?: boolean;
  is_active?: boolean;
};

type FormState = {
  provider: 'MPESA' | 'PAYPAL' | 'BANK';
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_branch: string;
  mpesa_method: 'PAYBILL' | 'TILL';
  display_name: string;
  paybill_number: string;
  paybill_account: string;
  till_number: string;
  paypal_email: string;
  is_default: boolean;
};

const emptyForm: FormState = {
  provider: 'MPESA',
  bank_name: '',
  bank_account_name: '',
  bank_account_number: '',
  bank_branch: '',
  mpesa_method: 'PAYBILL',
  display_name: '',
  paybill_number: '',
  paybill_account: '',
  till_number: '',
  paypal_email: '',
  is_default: false,
};

const inputClassName = 'mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-brand-700 dark:bg-brand-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/20 dark:disabled:bg-brand-950/70 dark:disabled:text-gray-500';
const labelClassName = 'text-sm font-semibold text-gray-700 dark:text-gray-200';

function label(method: PaymentMethod) {
  if (method.display_name) return method.display_name;
  if (method.provider === 'PAYPAL') return 'PayPal';
  if (method.provider === 'BANK') return method.bank_name || 'Bank account';
  return method.mpesa_method === 'TILL' ? 'M-Pesa Till' : 'M-Pesa PayBill';
}

function destination(method: PaymentMethod) {
  if (method.provider === 'PAYPAL') return method.paypal_email || 'PayPal email not set';
  if (method.provider === 'BANK') {
    const number = method.bank_account_number || '';
    return `${method.bank_name || 'Bank'} · Account ${number.length > 4 ? `••••${number.slice(-4)}` : number || '—'}${method.bank_account_name ? ` · ${method.bank_account_name}` : ''}`;
  }
  if (method.mpesa_method === 'TILL') return `Till ${method.till_number || '—'}`;
  return `PayBill ${method.paybill_number || '—'} · Account ${method.paybill_account || '—'}`;
}

export default function LandlordPMSSettings() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await protectedGet<PaymentMethod[]>('/api/core/payment-methods/');
      setMethods(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your payment settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(editingId ? `edit-${editingId}` : 'create');
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        await protectedPatch(`/api/core/payment-methods/${editingId}/`, form);
        setNotice('Payment account updated successfully.');
      } else {
        await protectedPost('/api/core/payment-methods/', form);
        setNotice('Payment account added successfully.');
      }
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your payment account.');
    } finally {
      setBusy(null);
    }
  };

  const makeDefault = async (id: string) => {
    setBusy(`default-${id}`);
    setError(null);
    try {
      await protectedPatch(`/api/core/payment-methods/${id}/`, { is_default: true });
      await load();
      setNotice('Default payment account updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change the default payment account.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(`delete-${id}`);
    setError(null);
    try {
      await protectedDelete(`/api/core/payment-methods/${id}/`);
      await load();
      setNotice('Payment account removed from active invoice destinations.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove the payment account.');
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (method: PaymentMethod) => {
    setEditingId(method.id);
    setForm({
      provider: method.provider === 'PAYPAL' ? 'PAYPAL' : method.provider === 'BANK' ? 'BANK' : 'MPESA',
      bank_name: method.bank_name || '',
      bank_account_name: method.bank_account_name || '',
      bank_account_number: method.bank_account_number || '',
      bank_branch: method.bank_branch || '',
      mpesa_method: method.mpesa_method === 'TILL' ? 'TILL' : 'PAYBILL',
      display_name: method.display_name || '',
      paybill_number: method.paybill_number || '',
      paybill_account: method.paybill_account || '',
      till_number: method.till_number || '',
      paypal_email: method.paypal_email || '',
      is_default: Boolean(method.is_default),
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-950">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-brand-700 dark:bg-brand-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">PMS settings</p>
            <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Payment accounts</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">Manage the payment accounts you use for rent collection and invoice payment instructions.</p>
          </div>
          <Wallet className="h-6 w-6 text-brand-600 dark:text-brand-400" />
        </div>
      </div>

      {(error || notice) && (
        <div className={`rounded-xl border p-3 text-sm ${error ? 'border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-950/50 dark:text-error-200' : 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-700 dark:bg-brand-950/50 dark:text-brand-200'}`}>
          {error || notice}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-950">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <h3 className="font-bold text-gray-900 dark:text-white">Active payment accounts</h3>
          </div>

          <div className="mt-4 space-y-3">
            {methods.map((method) => (
              <div key={method.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-700 dark:bg-brand-950/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-white">{label(method)}</p>
                      {method.is_default && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-300">
                          <Check className="h-3 w-3" />
                          Default
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">{destination(method)}</p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {!method.is_default && (
                      <button type="button" disabled={busy === `default-${method.id}`} onClick={() => void makeDefault(method.id)} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:text-brand-400 dark:hover:bg-brand-900">
                        Set as default
                      </button>
                    )}
                    <button type="button" onClick={() => startEdit(method)} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-brand-900">
                      Edit
                    </button>
                    <button type="button" disabled={busy === `delete-${method.id}`} onClick={() => void remove(method.id)} className="rounded-lg p-2 text-error-600 hover:bg-error-50 disabled:opacity-50 dark:text-error-400 dark:hover:bg-error-950/40" aria-label={`Remove ${label(method)}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!methods.length && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600 dark:border-brand-700 dark:bg-brand-950/50 dark:text-gray-300">
                No payment account has been added yet. Add one to provide payment instructions for your rent invoices.
              </div>
            )}
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">{editingId ? 'Edit payment account' : 'Add payment account'}</h3>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Enter the details exactly as customers should use them when making payments.</p>
            </div>
            {editingId && (
              <button type="button" onClick={reset} className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                Cancel
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>Payment provider</span>
              <Select value={form.provider} disabled={Boolean(editingId)} onChange={(e) => setForm((current) => ({ ...current, provider: e.target.value as FormState['provider'] }))} className={inputClassName}>
                <option value="MPESA">M-Pesa</option>
                <option value="PAYPAL">PayPal</option>
                <option value="BANK">Bank account</option>
              </Select>
            </label>

            <label className="block">
              <span className={labelClassName}>Account name</span>
              <input value={form.display_name} onChange={(e) => setForm((current) => ({ ...current, display_name: e.target.value }))} placeholder="e.g. Main rent account" className={inputClassName} />
            </label>
          </div>

          {form.provider === 'MPESA' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClassName}>M-Pesa payment method</span>
                <Select value={form.mpesa_method} onChange={(e) => setForm((current) => ({ ...current, mpesa_method: e.target.value as FormState['mpesa_method'] }))} className={inputClassName}>
                  <option value="PAYBILL">PayBill</option>
                  <option value="TILL">Till</option>
                </Select>
              </label>

              {form.mpesa_method === 'PAYBILL' ? (
                <>
                  <label className="block">
                    <span className={labelClassName}>PayBill number</span>
                    <input value={form.paybill_number} onChange={(e) => setForm((current) => ({ ...current, paybill_number: e.target.value }))} placeholder="Enter PayBill number" inputMode="numeric" className={inputClassName} required />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className={labelClassName}>PayBill account number</span>
                    <input value={form.paybill_account} onChange={(e) => setForm((current) => ({ ...current, paybill_account: e.target.value }))} placeholder="Enter the account customers should use" className={inputClassName} required />
                  </label>
                </>
              ) : (
                <label className="block">
                  <span className={labelClassName}>Till number</span>
                  <input value={form.till_number} onChange={(e) => setForm((current) => ({ ...current, till_number: e.target.value }))} placeholder="Enter Till number" inputMode="numeric" className={inputClassName} required />
                </label>
              )}
            </div>
          )}

          {form.provider === 'BANK' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClassName}>Bank name</span>
                <input value={form.bank_name} onChange={(e) => setForm((current) => ({ ...current, bank_name: e.target.value }))} placeholder="e.g. Equity Bank" className={inputClassName} required />
              </label>
              <label className="block">
                <span className={labelClassName}>Account holder name</span>
                <input value={form.bank_account_name} onChange={(e) => setForm((current) => ({ ...current, bank_account_name: e.target.value }))} placeholder="Name on the account" className={inputClassName} required />
              </label>
              <label className="block">
                <span className={labelClassName}>Bank account number</span>
                <input value={form.bank_account_number} onChange={(e) => setForm((current) => ({ ...current, bank_account_number: e.target.value }))} placeholder="Account number" inputMode="numeric" className={inputClassName} required />
              </label>
              <label className="block">
                <span className={labelClassName}>Branch (optional)</span>
                <input value={form.bank_branch} onChange={(e) => setForm((current) => ({ ...current, bank_branch: e.target.value }))} placeholder="e.g. Westlands" className={inputClassName} />
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 sm:col-span-2">Only the details a renter needs to pay you are stored. Never enter PINs, card numbers or online banking passwords.</p>
            </div>
          )}

          {form.provider === 'PAYPAL' && (
            <label className="mt-4 block">
              <span className={labelClassName}>PayPal email address</span>
              <input type="email" value={form.paypal_email} onChange={(e) => setForm((current) => ({ ...current, paypal_email: e.target.value }))} placeholder="name@example.com" className={inputClassName} required />
            </label>
          )}

          <label className="mt-4 flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((current) => ({ ...current, is_default: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-brand-700 dark:bg-brand-950" />
            <span>
              <span className="font-semibold">Set as default payment account</span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">Use this account as the default payment destination for new rent invoices.</span>
            </span>
          </label>

          <button type="submit" disabled={busy === 'create' || Boolean(editingId && busy === `edit-${editingId}`)} className="btn-primary mt-5 inline-flex w-full items-center justify-center gap-2">
            <Plus className="h-4 w-4" />
            {editingId ? 'Save changes' : 'Add payment account'}
          </button>
        </form>
      </div>
    </section>
  );
}
