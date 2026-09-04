import { CheckCircle2, Loader2, MapPin, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { moverApi, type MoverBooking } from '@/lib/Movers';

interface Props {
  booking: MoverBooking;
  onChanged: () => Promise<void> | void;
  onTracking: () => void;
}

const normalize = (value: string | null | undefined) => value?.toLowerCase().replace(/-/g, '_').trim() ?? '';

export default function MoverJourneyControls({ booking, onChanged, onTracking }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = normalize(booking.status);
  const paymentPaid = normalize(booking.payment_status) === 'paid';

  const start = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await moverApi.startJourney(booking.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start the moving journey.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'completed') {
    return <div className="rounded-2xl border border-success-200 bg-success-50 p-5 dark:border-success-800 dark:bg-success-900/20"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-400" /><div><p className="font-semibold text-success-800 dark:text-success-300">Journey completed</p><p className="mt-1 text-sm text-success-700 dark:text-success-400">Delivery status can be confirmed below.</p></div></div></div>;
  }

  if (status === 'in_progress') {
    return <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-800 dark:bg-brand-900/20"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 text-brand-600 dark:text-brand-400" /><div><p className="font-semibold text-brand-800 dark:text-brand-300">Journey in progress</p><p className="mt-1 text-sm text-brand-700 dark:text-brand-400">Your location can now be shared with the renter through live tracking.</p>{booking.tracking_number && <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-400">Tracking: {booking.tracking_number}</p>}</div></div><button type="button" onClick={onTracking} className="btn-primary inline-flex items-center justify-center gap-2 text-sm"><MapPin className="h-4 w-4" />Open live tracking</button></div></div>;
  }

  if (status !== 'confirmed' || !paymentPaid) return null;

  return <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-900/20"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><PlayCircle className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" /><div><p className="font-semibold text-blue-800 dark:text-blue-300">Ready to start the journey</p><p className="mt-1 text-sm text-blue-700 dark:text-blue-400">Payment is confirmed and this booking is ready for the mover to begin.</p></div></div><button type="button" onClick={() => void start()} disabled={loading} className="btn-primary inline-flex items-center justify-center gap-2 text-sm">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}Start journey</button></div>{error && <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>}</div>;
}
