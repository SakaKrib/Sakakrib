import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Settings as SettingsIcon, ShieldAlert } from 'lucide-react';
import {
  getRealEstatePMSSettings,
  updateRealEstatePMSSettings,
  type RealEstatePMSSettings,
} from '@/lib/RealEstateTs/Realestatepmssettings';

interface Props {
  subscription: {
    plan_name: string;
    billing_cycle: string;
    subscription_status: string;
    current_period_start: string;
    current_period_end: string;
  } | null;
  isAdmin: boolean;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(date);
}

export default function RealEstatePMSSettingsPanel({ subscription, isAdmin }: Props) {
  const [settings, setSettings] = useState<RealEstatePMSSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let active = true;
    void getRealEstatePMSSettings()
      .then((value) => { if (active) setSettings(value); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Unable to load PMS settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 dark:border-brand-700 dark:bg-brand-900/40">
        <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" /><div><p className="font-semibold text-gray-800 dark:text-gray-200">Administrator settings</p><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Only the PMS administrator can view or change property-management settings.</p></div></div>
      </div>
    );
  }

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await updateRealEstatePMSSettings({
        default_rent_due_day: settings.default_rent_due_day,
        default_payment_tracking_enabled: settings.default_payment_tracking_enabled,
      });
      setSettings(saved);
      setMessage('Settings saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save PMS settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-white p-6 dark:border-brand-700 dark:bg-brand-900">
        <div className="flex items-center gap-3"><SettingsIcon className="h-5 w-5 text-brand-600" /><div><h3 className="font-semibold text-gray-900 dark:text-white">Property management settings</h3><p className="text-sm text-gray-500 dark:text-gray-400">Defaults used when managing units in this PMS account.</p></div></div>
        {loading ? <div className="flex items-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Loading settings...</div> : error && !settings ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">{error}</div> : settings && <div className="mt-6 space-y-5">
          <label className="block"><span className="text-sm font-medium text-gray-700 dark:text-gray-200">Default rent due day</span><span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">New units will use this day unless a different due day is entered.</span><input type="number" min={1} max={31} value={settings.default_rent_due_day} onChange={(event) => setSettings({ ...settings, default_rent_due_day: Math.min(31, Math.max(1, Number(event.target.value) || 1)) })} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-brand-700 dark:bg-brand-950 dark:text-white dark:focus:ring-brand-900" /></label>
          <label className="flex items-start justify-between gap-4 rounded-lg border p-4 dark:border-brand-700"><div><span className="text-sm font-medium text-gray-700 dark:text-gray-200">Enable payment tracking by default</span><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">New units will have payment tracking enabled unless explicitly changed.</p></div><input type="checkbox" checked={settings.default_payment_tracking_enabled} onChange={(event) => setSettings({ ...settings, default_payment_tracking_enabled: event.target.checked })} className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" /></label>
          <div className="flex items-center justify-between gap-4"><div>{message && <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400"><CheckCircle2 className="h-4 w-4" />{message}</p>}{error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}</div><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save settings</button></div>
        </div>}
      </div>
      <div className="rounded-xl border bg-white p-6 dark:border-brand-700 dark:bg-brand-900"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Current subscription</p>{subscription ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-gray-500 dark:text-gray-400">Plan</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{subscription.plan_name}</p></div><div><p className="text-xs text-gray-500 dark:text-gray-400">Billing cycle</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{subscription.billing_cycle}</p></div><div><p className="text-xs text-gray-500 dark:text-gray-400">Status</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{subscription.subscription_status}</p></div><div><p className="text-xs text-gray-500 dark:text-gray-400">Current period</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{formatDate(subscription.current_period_start)} — {formatDate(subscription.current_period_end)}</p></div></div> : <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No current subscription.</p>}</div>
    </div>
  );
}
