import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { moverApi, type MoverBooking } from '@/lib/Movers';

interface Props {
  booking: MoverBooking;
  onChanged: () => Promise<void> | void;
}

const normalize = (value: string | null | undefined) => value?.toLowerCase().replace(/-/g, '_').trim() ?? '';
const reasons = ['DAMAGED_BELONGINGS', 'MISSING_BELONGINGS', 'DELIVERY_PROBLEM', 'SERVICE_PROBLEM', 'PAYMENT_PROBLEM', 'OTHER'];

export default function MoverDeliveryDisputePanel({ booking, onChanged }: Props) {
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDispute, setShowDispute] = useState(false);
  const [reasonCode, setReasonCode] = useState(reasons[0]);
  const [description, setDescription] = useState('');
  const status = normalize(booking.status);
  const eligible = ['in_progress', 'completed'].includes(status) && normalize(booking.payment_status) === 'paid';
  const moverConfirmed = Boolean(booking.mover_confirmed_delivery_at);
  const disputeOpen = normalize(booking.dispute_status) === 'open';

  if (!eligible) return null;

  const confirmDelivery = async () => {
    if (deliveryLoading) return;
    setDeliveryLoading(true);
    setError(null);
    try {
      await moverApi.confirmDelivery(booking.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm delivery.');
    } finally {
      setDeliveryLoading(false);
    }
  };

  const openDispute = async () => {
    if (disputeLoading || !description.trim()) {
      if (!description.trim()) setError('Please describe the issue before opening a dispute.');
      return;
    }
    setDisputeLoading(true);
    setError(null);
    try {
      await moverApi.openDispute(booking.id, reasonCode, description);
      setDescription('');
      setShowDispute(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open the dispute.');
    } finally {
      setDisputeLoading(false);
    }
  };

  return <section className="card p-6 sm:p-7"><div className="mb-5 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-400" /><h2 className="text-lg font-bold text-gray-900 dark:text-white">Delivery & protection</h2></div><div className="space-y-4"><div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-gray-900 dark:text-white">Delivery confirmation</p><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Confirm once the moving job has been delivered.</p></div>{moverConfirmed ? <span className="inline-flex items-center gap-2 text-sm font-semibold text-success-700 dark:text-success-400"><CheckCircle2 className="h-4 w-4" />You confirmed delivery</span> : <button type="button" onClick={() => void confirmDelivery()} disabled={deliveryLoading} className="btn-primary inline-flex items-center justify-center gap-2 text-sm">{deliveryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirm delivery</button>}</div>{!disputeOpen && <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 text-yellow-700 dark:text-yellow-400" /><div><p className="font-semibold text-yellow-900 dark:text-yellow-300">Something went wrong?</p><p className="mt-1 text-sm text-yellow-800 dark:text-yellow-400">Open a dispute so admin review can pause the payout process.</p></div></div><button type="button" onClick={() => setShowDispute(value => !value)} className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"><AlertTriangle className="h-4 w-4" />{showDispute ? 'Close' : 'Open dispute'}</button></div>{showDispute && <div className="mt-4 space-y-3"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reason<select value={reasonCode} onChange={event => setReasonCode(event.target.value)} className="input mt-1 w-full">{reasons.map(reason => <option key={reason} value={reason}>{reason.replace(/_/g, ' ')}</option>)}</select></label><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={5000} rows={4} className="input mt-1 w-full" placeholder="Describe the issue..." /></label><button type="button" onClick={() => void openDispute()} disabled={disputeLoading} className="btn-primary inline-flex items-center gap-2 text-sm">{disputeLoading && <Loader2 className="h-4 w-4 animate-spin" />}Submit dispute</button></div>}</div>}{disputeOpen && <div className="rounded-xl border border-error-200 bg-error-50 p-4 dark:border-error-800 dark:bg-error-900/20"><p className="font-semibold text-error-800 dark:text-error-300">Dispute open</p><p className="mt-1 text-sm text-error-700 dark:text-error-400">Admin review is required before the affected payout can proceed.</p></div>}{error && <p className="text-sm text-error-600 dark:text-error-400">{error}</p>}</div></section>;
}
