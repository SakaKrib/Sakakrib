import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import {
  createRealEstatePMSPaymentMethod,
  deleteRealEstatePMSPaymentMethod,
  getRealEstatePMSPaymentMethods,
  updateRealEstatePMSPaymentMethod,
  type RealEstateMpesaMethod,
  type RealEstatePaymentMethod,
  type RealEstatePaymentProvider,
} from '@/lib/RealEstateTs/RealEstatePMSPaymentSettingsService';

function methodLabel(method: RealEstatePaymentMethod) {
  if (method.provider === 'PAYPAL') return `PayPal — ${method.paypal_email}`;
  if (method.provider === 'BANK') { const n = method.bank_account_number || ''; return `${method.bank_name || 'Bank'} — ••••${n.slice(-4)}${method.bank_account_name ? ` (${method.bank_account_name})` : ''}`; }
  if (method.mpesa_method === 'PAYBILL') return `M-Pesa PayBill — ${method.paybill_number} (${method.paybill_account})`;
  return `M-Pesa Till — ${method.till_number}`;
}

function AddForm({ onAdded, onCancel, editing }: { onAdded: () => Promise<void>; onCancel: () => void; editing?: RealEstatePaymentMethod | null }) {
  const [provider, setProvider] = useState<RealEstatePaymentProvider>(editing?.provider ?? 'MPESA');
  const [mpesaMethod, setMpesaMethod] = useState<RealEstateMpesaMethod>(editing?.mpesa_method ?? 'PAYBILL');
  const [displayName, setDisplayName] = useState(editing?.display_name ?? '');
  const [paybillNumber, setPaybillNumber] = useState(editing?.paybill_number ?? '');
  const [paybillAccount, setPaybillAccount] = useState(editing?.paybill_account ?? '');
  const [tillNumber, setTillNumber] = useState(editing?.till_number ?? '');
  const [paypalEmail, setPaypalEmail] = useState(editing?.paypal_email ?? '');
  const [bankName, setBankName] = useState(editing?.bank_name ?? '');
  const [bankHolder, setBankHolder] = useState(editing?.bank_account_name ?? '');
  const [bankNumber, setBankNumber] = useState(editing?.bank_account_number ?? '');
  const [bankBranch, setBankBranch] = useState(editing?.bank_branch ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const write = (payload: Record<string, unknown>) => (editing ? updateRealEstatePMSPaymentMethod(editing.id, payload) : createRealEstatePMSPaymentMethod(payload as never));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (provider === 'BANK') {
        if (!bankName.trim() || !bankHolder.trim() || !bankNumber.trim()) throw new Error('Bank name, account name and account number are required.');
        await write({ provider: 'BANK', display_name: displayName.trim() || null, bank_name: bankName.trim(), bank_account_name: bankHolder.trim(), bank_account_number: bankNumber.trim(), bank_branch: bankBranch.trim() || null });
      } else if (provider === 'PAYPAL') {
        if (!paypalEmail.trim()) throw new Error('PayPal email is required.');
        await write({ provider: 'PAYPAL', display_name: displayName.trim() || null, paypal_email: paypalEmail.trim() });
      } else if (mpesaMethod === 'PAYBILL') {
        if (!paybillNumber.trim() || !paybillAccount.trim()) throw new Error('PayBill number and account are required.');
        await write({ provider: 'MPESA', mpesa_method: 'PAYBILL', display_name: displayName.trim() || null, paybill_number: paybillNumber.trim(), paybill_account: paybillAccount.trim() });
      } else {
        if (!tillNumber.trim()) throw new Error('Till number is required.');
        await write({ provider: 'MPESA', mpesa_method: 'TILL', display_name: displayName.trim() || null, till_number: tillNumber.trim() });
      }
      await onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save payment destination.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <h3 className="font-semibold text-gray-900 dark:text-white">Add payment destination</h3>
      <div className="mt-4 space-y-4">
        <div className="flex gap-2">
          {(['MPESA', 'PAYPAL', 'BANK'] as const).map((item) => (
            <button key={item} type="button" onClick={() => setProvider(item)} className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold ${provider === item ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700'}`}>
              {item === 'MPESA' ? 'M-Pesa' : item === 'PAYPAL' ? 'PayPal' : 'Bank'}
            </button>
          ))}
        </div>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Label (optional), e.g. Main account" className="input-field" />
        {provider === 'BANK' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <input value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Bank name" className="input-field" />
            <input value={bankHolder} onChange={(event) => setBankHolder(event.target.value)} placeholder="Account holder name" className="input-field" />
            <input value={bankNumber} onChange={(event) => setBankNumber(event.target.value)} placeholder="Bank account number" inputMode="numeric" className="input-field" />
            <input value={bankBranch} onChange={(event) => setBankBranch(event.target.value)} placeholder="Branch (optional)" className="input-field" />
            <p className="text-xs text-gray-500 dark:text-gray-400 sm:col-span-2">Only enter what a renter needs to pay you. Never enter PINs, card numbers or online banking passwords.</p>
          </div>
        ) : provider === 'MPESA' ? (
          <>
            <div className="flex gap-2">
              {(['PAYBILL', 'TILL'] as const).map((item) => (
                <button key={item} type="button" onClick={() => setMpesaMethod(item)} className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold ${mpesaMethod === item ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700'}`}>
                  {item === 'PAYBILL' ? 'PayBill' : 'Till'}
                </button>
              ))}
            </div>
            {mpesaMethod === 'PAYBILL' ? <div className="grid gap-4 sm:grid-cols-2"><input value={paybillNumber} onChange={(event) => setPaybillNumber(event.target.value)} placeholder="PayBill number" className="input-field" /><input value={paybillAccount} onChange={(event) => setPaybillAccount(event.target.value)} placeholder="Account number" className="input-field" /></div> : <input value={tillNumber} onChange={(event) => setTillNumber(event.target.value)} placeholder="Till number" className="input-field" />}
          </>
        ) : <input type="email" value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} placeholder="PayPal email" className="input-field" />}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        <div className="flex gap-3"><button type="button" onClick={onCancel} disabled={saving} className="btn-secondary flex-1">Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="btn-primary flex-1 inline-flex items-center justify-center gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></div>
      </div>
    </div>
  );
}

export default function RealEstatePMSPaymentSettings({ isAdmin }: { isAdmin: boolean }) {
  const [methods, setMethods] = useState<RealEstatePaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<RealEstatePaymentMethod | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMethods(await getRealEstatePMSPaymentMethods());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payment destinations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) void load(); else setLoading(false); }, [isAdmin, load]);

  const setDefault = async (id: string) => {
    setProcessingId(id);
    setError(null);
    try { await updateRealEstatePMSPaymentMethod(id, { is_default: true }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to set the default destination.'); }
    finally { setProcessingId(null); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this payment destination?')) return;
    setProcessingId(id);
    setError(null);
    try { await deleteRealEstatePMSPaymentMethod(id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to remove the payment destination.'); }
    finally { setProcessingId(null); }
  };

  if (!isAdmin) return null;

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3"><CreditCard className="h-5 w-5 text-brand-600 dark:text-brand-300" /><div><h2 className="text-xl font-bold text-gray-900 dark:text-white">Payment settings</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Configure where renters should send rent payments. These destinations are used on rent invoices.</p></div></div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
      {loading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />Loading payment settings...</div> : <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-brand-800 dark:bg-brand-950">{methods.length === 0 ? <div className="p-8 text-center"><CreditCard className="mx-auto h-10 w-10 text-gray-300" /><p className="mt-3 font-medium text-gray-700 dark:text-gray-300">No payment destinations yet</p></div> : <div className="divide-y dark:divide-brand-800">{methods.map((method) => <div key={method.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-medium text-gray-900 dark:text-white">{method.display_name || methodLabel(method)}</p>{method.is_default && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-800 dark:text-brand-300">Default</span>}</div>{method.display_name && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{methodLabel(method)}</p>}</div><div className="flex items-center gap-2"><button type="button" onClick={() => { setShowAdd(false); setEditing(method); }} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium dark:border-brand-700"><Pencil className="h-3.5 w-3.5" />Edit</button>{!method.is_default && <button type="button" disabled={processingId === method.id} onClick={() => void setDefault(method.id)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium dark:border-brand-700"><Star className="h-3.5 w-3.5" />Set default</button>}<button type="button" disabled={processingId === method.id} onClick={() => void remove(method.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 dark:border-red-900/50"><Trash2 className="h-3.5 w-3.5" /></button></div></div>)}</div>}</div>}
      {showAdd || editing ? <AddForm key={editing?.id ?? 'new'} editing={editing} onAdded={async () => { setShowAdd(false); setEditing(null); await load(); }} onCancel={() => { setShowAdd(false); setEditing(null); }} /> : <button type="button" onClick={() => setShowAdd(true)} className="btn-secondary inline-flex items-center gap-2"><Plus className="h-4 w-4" />Add payment destination</button>}
    </section>
  );
}
