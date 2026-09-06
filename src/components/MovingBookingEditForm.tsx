import { useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, Loader2, MapPin, X } from 'lucide-react';
import { protectedPatch } from '@/lib/djangoApi';
import { formatKES } from '@/lib/utils';

type Booking = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  moving_date: string | null;
  payment_method?: string | null;
  total_amount: number | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
};

interface Props {
  booking: Booking;
  onSaved: (updated: Booking) => void;
  onClose: () => void;
}

const nairobiParts = (value: string | null) => {
  if (!value) return { date: '', time: '' };
  const parsed = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(parsed);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
};

export default function MovingBookingEditForm({ booking, onSaved, onClose }: Props) {
  const start = useMemo(() => nairobiParts(booking.scheduled_start_at), [booking.scheduled_start_at]);
  const end = useMemo(() => nairobiParts(booking.scheduled_end_at), [booking.scheduled_end_at]);
  const [pickup, setPickup] = useState(booking.pickup_address ?? '');
  const [dropoff, setDropoff] = useState(booking.dropoff_address ?? '');
  const [date, setDate] = useState(booking.moving_date ?? start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  const [paymentMethod, setPaymentMethod] = useState(booking.payment_method ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    setError(null);
    if (!pickup.trim() || !dropoff.trim()) { setError('Pickup and destination are required.'); return; }
    if (!date || !startTime || !endTime) { setError('Date, start time and end time are required.'); return; }
    if (endTime <= startTime) { setError('End time must be after start time.'); return; }
    setSaving(true);
    try {
      const updated = await protectedPatch<Booking>(`/api/core/bookings/${booking.id}/edit/`, {
        pickup_address: pickup.trim(),
        dropoff_address: dropoff.trim(),
        moving_date: date,
        moving_time: startTime,
        moving_end_time: endTime,
        payment_method: paymentMethod || null,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the moving booking.');
    } finally { setSaving(false); }
  };

  return <div className="rounded-2xl border border-brand-200 bg-background p-4 shadow-sm dark:border-brand-800">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Edit booking</p><h3 className="mt-1 text-lg font-bold">Update your moving details</h3><p className="mt-1 text-xs text-muted-foreground">Your current booking information is already filled in. Change only what you need.</p></div>
      <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></button>
    </div>
    <div className="mt-4 grid gap-3">
      <label className="text-sm font-medium"><span className="mb-1 flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-600" />Pickup location</span><input value={pickup} onChange={(e) => setPickup(e.target.value)} className="input w-full" /></label>
      <label className="text-sm font-medium"><span className="mb-1 flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-600" />Destination</span><input value={dropoff} onChange={(e) => setDropoff(e.target.value)} className="input w-full" /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium"><span className="mb-1 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-600" />Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-full" /></label>
        <label className="text-sm font-medium"><span className="mb-1 flex items-center gap-2"><Clock3 className="h-4 w-4 text-brand-600" />Start</span><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input w-full" /></label>
        <label className="text-sm font-medium"><span className="mb-1 flex items-center gap-2"><Clock3 className="h-4 w-4 text-brand-600" />End</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input w-full" /></label>
      </div>
      <label className="text-sm font-medium"><span className="mb-1 block">Payment method</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input w-full"><option value="">Keep existing payment method</option><option value="mpesa">M-Pesa</option><option value="paypal">PayPal</option></select></label>
      <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">Current quoted amount: <span className="font-semibold text-foreground">{formatKES(Number(booking.total_amount ?? 0))}</span>. This edit does not create a new booking.</div>
    </div>
    {error && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    <div className="mt-4 flex gap-2"><button type="button" onClick={onClose} disabled={saving} className="btn-secondary flex-1">Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="btn-primary flex-1 inline-flex items-center justify-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save changes</button></div>
  </div>;
}
