import { useEffect, useState } from 'react';
import {
  CreditCard,
  Loader2,
  Plus,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';

import {
  createLandlordPaymentMethod,
  deleteLandlordPaymentMethod,
  getMyLandlordPaymentMethods,
  setLandlordPaymentMethodDefault,
  type LandlordPaymentMethod,
  type MpesaMethod,
  type PaymentMethodProvider,
} from '@/lib/Landlordpaymentmethods';


function methodLabel(method: LandlordPaymentMethod): string {
  if (method.provider === 'PAYPAL') {
    return `PayPal \u2014 ${method.paypal_email}`;
  }

  if (method.mpesa_method === 'PAYBILL') {
    return `M-Pesa PayBill \u2014 ${method.paybill_number} (${method.paybill_account})`;
  }

  return `M-Pesa Till \u2014 ${method.till_number}`;
}


// ============================================================
// ADD METHOD FORM
// ============================================================

function AddPaymentMethodForm({
  onAdded,
  onCancel,
}: {
  onAdded: () => Promise<void>;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState<PaymentMethodProvider>('MPESA');
  const [mpesaMethod, setMpesaMethod] = useState<MpesaMethod>('PAYBILL');
  const [displayName, setDisplayName] = useState('');
  const [paybillNumber, setPaybillNumber] = useState('');
  const [paybillAccount, setPaybillAccount] = useState('');
  const [tillNumber, setTillNumber] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    try {
      setSaving(true);

      if (provider === 'PAYPAL') {
        if (!paypalEmail.trim()) {
          throw new Error('PayPal email is required.');
        }

        await createLandlordPaymentMethod({
          provider: 'PAYPAL',
          display_name: displayName.trim() || null,
          paypal_email: paypalEmail.trim(),
        });
      } else if (mpesaMethod === 'PAYBILL') {
        if (!paybillNumber.trim() || !paybillAccount.trim()) {
          throw new Error('PayBill number and account are required.');
        }

        await createLandlordPaymentMethod({
          provider: 'MPESA',
          mpesa_method: 'PAYBILL',
          display_name: displayName.trim() || null,
          paybill_number: paybillNumber.trim(),
          paybill_account: paybillAccount.trim(),
        });
      } else {
        if (!tillNumber.trim()) {
          throw new Error('Till number is required.');
        }

        await createLandlordPaymentMethod({
          provider: 'MPESA',
          mpesa_method: 'TILL',
          display_name: displayName.trim() || null,
          till_number: tillNumber.trim(),
        });
      }

      await onAdded();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to add payment method.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
      <h3 className="font-semibold text-gray-900 dark:text-white">
        Add payment destination
      </h3>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Provider
          </label>
          <div className="flex gap-2">
            {(['MPESA', 'PAYPAL'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors ${
                  provider === p
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                    : 'border-gray-200 text-gray-500 dark:border-brand-700'
                }`}
              >
                {p === 'MPESA' ? 'M-Pesa' : 'PayPal'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Label (optional)
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Main account"
            className="input-field"
          />
        </div>

        {provider === 'MPESA' && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                M-Pesa type
              </label>
              <div className="flex gap-2">
                {(['PAYBILL', 'TILL'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMpesaMethod(m)}
                    className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors ${
                      mpesaMethod === m
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                        : 'border-gray-200 text-gray-500 dark:border-brand-700'
                    }`}
                  >
                    {m === 'PAYBILL' ? 'PayBill' : 'Till'}
                  </button>
                ))}
              </div>
            </div>

            {mpesaMethod === 'PAYBILL' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    PayBill number
                  </label>
                  <input
                    type="text"
                    value={paybillNumber}
                    onChange={(e) => setPaybillNumber(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Account number
                  </label>
                  <input
                    type="text"
                    value={paybillAccount}
                    onChange={(e) => setPaybillAccount(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Till number
                </label>
                <input
                  type="text"
                  value={tillNumber}
                  onChange={(e) => setTillNumber(e.target.value)}
                  className="input-field"
                />
              </div>
            )}
          </>
        )}

        {provider === 'PAYPAL' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              PayPal email
            </label>
            <input
              type="email"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              className="input-field"
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// SETTINGS PAGE
// ============================================================

export default function LandlordPMSSettings() {
  const [methods, setMethods] = useState<LandlordPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await getMyLandlordPaymentMethods();
      setMethods(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load payment methods.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSetDefault = async (id: string) => {
    setProcessingId(id);
    try {
      await setLandlordPaymentMethodDefault(id);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to set default.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Remove this payment destination?');
    if (!confirmed) return;

    setProcessingId(id);
    try {
      await deleteLandlordPaymentMethod(id);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to remove payment method.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Payment Destinations
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Where rent payments should be sent. These are external
          payment instructions shown on invoices — SakaCrib does not
          process rent payments directly yet.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">
          {methods.length === 0 ? (
            <div className="p-8 text-center">
              <CreditCard className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
                No payment destinations yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-brand-800">
              {methods.map((method) => (
                <div
                  key={method.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {method.display_name || methodLabel(method)}
                      </p>
                      {method.is_default && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-800 dark:text-brand-300">
                          Default
                        </span>
                      )}
                    </div>
                    {method.display_name && (
                      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {methodLabel(method)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!method.is_default && (
                      <button
                        type="button"
                        disabled={processingId === method.id}
                        onClick={() => handleSetDefault(method.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-brand-700 dark:text-gray-300 dark:hover:bg-brand-800"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={processingId === method.id}
                      onClick={() => handleDelete(method.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 dark:border-brand-700 dark:hover:bg-error-900/20"
                    >
                      {processingId === method.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddForm ? (
        <AddPaymentMethodForm
          onAdded={async () => {
            setShowAddForm(false);
            await load();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="btn-secondary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add payment destination
        </button>
      )}
    </div>
  );
}