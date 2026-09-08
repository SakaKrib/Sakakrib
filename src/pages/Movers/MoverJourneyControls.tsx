import { CheckCircle2, Loader2, MapPin, Navigation, PackageCheck, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { moverApi, type MoverBooking, type MoverJourneyPhaseResponse } from '@/lib/Movers';

interface Props { booking: MoverBooking; onChanged: () => Promise<void> | void; onTracking: () => void; }
const normalize = (value: string | null | undefined) => value?.toLowerCase().replace(/-/g, '_').trim() ?? '';

export default function MoverJourneyControls({ booking, onChanged, onTracking }: Props) {
  const [loading, setLoading] = useState(false);
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [confirmingPickup, setConfirmingPickup] = useState(false);
  const [phase, setPhase] = useState<MoverJourneyPhaseResponse['phase']>(null);
  const [error, setError] = useState<string | null>(null);
  const status = normalize(booking.status);
  const paymentPaid = normalize(booking.payment_status) === 'paid';

  useEffect(() => {
    let cancelled = false;
    if (status !== 'in_progress') {
      setPhase(null);
      return;
    }
    setPhaseLoading(true);
    void moverApi.getJourneyPhase(booking.id)
      .then(result => { if (!cancelled) setPhase(result.phase); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to read journey status.'); })
      .finally(() => { if (!cancelled) setPhaseLoading(false); });
    return () => { cancelled = true; };
  }, [booking.id, status]);

  const start = async () => {
    if (loading) return;
    setLoading(true); setError(null);
    window.dispatchEvent(new Event('sakakrib:request-mover-gps'));
    try {
      await moverApi.startJourney(booking.id, 'CHROME');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start the moving journey.');
    } finally { setLoading(false); }
  };

  const confirmPickup = async () => {
    if (loading || confirmingPickup) return;
    setConfirmingPickup(true); setError(null);
    try {
      const result = await moverApi.confirmPickup(booking.id);
      setPhase(result.phase as MoverJourneyPhaseResponse['phase']);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm pickup.');
    } finally { setConfirmingPickup(false); }
  };

  if (status === 'completed') return <div className="rounded-2xl border border-success-200 bg-success-50 p-5 dark:border-success-800 dark:bg-success-900/20"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-400" /><div><p className="font-semibold text-success-800 dark:text-success-300">Journey completed</p><p className="mt-1 text-sm text-success-700 dark:text-success-400">Delivery status can be confirmed below.</p></div></div></div>;

  if (status === 'in_progress') return <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-800 dark:bg-brand-900/20">
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {phase === 'IN_TRANSIT' ? <PackageCheck className="mt-0.5 h-5 w-5 text-success-600 dark:text-success-400" /> : <Navigation className="mt-0.5 h-5 w-5 text-brand-600 dark:text-brand-400" />}
          <div>
            <p className="font-semibold text-brand-900 dark:text-brand-100">{phase === 'IN_TRANSIT' ? 'Items collected — journey to destination' : 'On the way to pickup'}</p>
            <p className="mt-1 text-sm text-brand-700 dark:text-brand-300">
              {phase === 'IN_TRANSIT' ? 'Pickup has been confirmed. Your live location is being shared while you travel to the destination.' : 'Your live location is being shared while you travel to the pickup location.'}
            </p>
            {booking.tracking_number && <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-400">Tracking: {booking.tracking_number}</p>}
          </div>
        </div>
        <button type="button" onClick={onTracking} className="btn-primary inline-flex items-center justify-center gap-2 text-sm"><MapPin className="h-4 w-4" />Open live tracking</button>
      </div>

      {!phaseLoading && phase === 'HEADING_TO_PICKUP' && <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-800 dark:bg-gray-900/40">
        {!confirmingPickup ? <>
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="font-semibold text-gray-900 dark:text-white">Have you collected the renter's items?</p><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Only confirm after the items have actually been handed over to you. This changes the renter's tracking status to <strong>Items collected</strong>.</p></div></div>
          <button type="button" onClick={() => setConfirmingPickup(true)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700"> <PackageCheck className="h-4 w-4" />Confirm pickup</button>
        </> : <>
          <p className="font-semibold text-gray-900 dark:text-white">Confirm that the renter's items are now with you.</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">This is an official journey update and will be visible to the renter.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => void confirmPickup()} disabled={confirmingPickup} className="btn-primary inline-flex flex-1 items-center justify-center gap-2">{confirmingPickup ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}Confirm pickup & continue</button><button type="button" onClick={() => setConfirmingPickup(false)} disabled={confirmingPickup} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Not yet</button></div>
        </>}
      </div>}
      {phaseLoading && <p className="text-xs text-brand-700 dark:text-brand-300">Checking the current journey phase…</p>}
      {error && <p className="text-sm text-error-600 dark:text-error-400">{error}</p>}
    </div>
  </div>;

  if (status !== 'confirmed' || !paymentPaid) return null;
  return <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-900/20"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Navigation className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" /><div><p className="font-semibold text-blue-800 dark:text-blue-300">Ready to head to pickup</p><p className="mt-1 text-sm text-blue-700 dark:text-blue-400">Start the journey when you are ready to travel to the pickup location. Your live GPS will be shared with the renter.</p></div></div><button type="button" onClick={() => void start()} disabled={loading} className="btn-primary inline-flex items-center justify-center gap-2 text-sm">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}Start journey to pickup</button></div>{error && <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>}</div>;
}
