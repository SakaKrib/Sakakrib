import { AlertCircle, Bell, MessageCircle, RefreshCw, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking, type MoverInvoice, type MoverNotification, type MoverPayout, type MoverRecord, type MoverScheduleEvent } from '@/lib/Movers';
import MoverBookingRequests from '@/pages/Movers/MoverBookingRequests';
import MoverCustomersCard from '@/pages/Movers/MoverCustomersCard';
import MoverFinanceOverview from '@/pages/Movers/MoverFinanceOverview';
import MoverNotificationsCard from '@/pages/Movers/MoverNotificationsCard';
import MoverScheduleOverview from '@/pages/Movers/MoverScheduleOverview';
import MoverStatsCards from '@/pages/Movers/MoverStatsCards';

const emptyBookings: MoverBooking[] = [];
const emptySchedule: MoverScheduleEvent[] = [];
const emptyInvoices: MoverInvoice[] = [];
const emptyPayouts: MoverPayout[] = [];
const emptyNotifications: MoverNotification[] = [];

export default function MoverDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const { navigate } = useNav();
  const [mover, setMover] = useState<MoverRecord | null>(null);
  const [bookings, setBookings] = useState(emptyBookings);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [invoices, setInvoices] = useState(emptyInvoices);
  const [payouts, setPayouts] = useState(emptyPayouts);
  const [notifications, setNotifications] = useState(emptyNotifications);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      navigate('home');
      return;
    }
    if (profile.role !== 'mover') navigate('home');
  }, [authLoading, profile, navigate]);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!profile?.id || profile.role !== 'mover') return;
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);

    const results = await Promise.allSettled([
      moverApi.getMover(profile.id),
      moverApi.getBookings(),
      moverApi.getSchedule(),
      moverApi.getInvoices(),
      moverApi.getPayouts(),
      moverApi.getNotifications(20),
    ]);

    const [moverResult, bookingsResult, scheduleResult, invoicesResult, payoutsResult, notificationsResult] = results;
    if (moverResult.status === 'fulfilled') setMover(moverResult.value);
    if (bookingsResult.status === 'fulfilled') setBookings(bookingsResult.value ?? []);
    if (scheduleResult.status === 'fulfilled') setSchedule(scheduleResult.value ?? []);
    if (invoicesResult.status === 'fulfilled') setInvoices(invoicesResult.value ?? []);
    if (payoutsResult.status === 'fulfilled') setPayouts(payoutsResult.value ?? []);
    if (notificationsResult.status === 'fulfilled') setNotifications(notificationsResult.value?.notifications ?? []);

    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length === results.length) {
      setError('Unable to load mover dashboard data. Please try again.');
    } else if (failed.length > 0) {
      setError('Some mover dashboard sections could not be refreshed.');
    }

    setLoading(false);
    setRefreshing(false);
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (!authLoading && profile?.role === 'mover' && profile.id) void loadDashboard();
  }, [authLoading, profile?.id, profile?.role, loadDashboard]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto flex min-h-[500px] max-w-7xl items-center justify-center px-4">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-500" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading your mover dashboard...</p>
        </div>
      </div>
    );
  }

  if (!profile || profile.role !== 'mover') return null;

  const displayName = mover?.driver_full_name || mover?.business_name || profile.full_name || 'Mover';
  const unread = notifications.filter((notification) => !notification.read_at).length;

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600 dark:text-brand-400">Mover Dashboard</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Welcome back, {displayName}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage requests, jobs, customers, schedules and mover finances from one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => navigate('notifications')} className="relative btn-secondary inline-flex items-center gap-2 text-sm"><Bell className="h-4 w-4" />Notifications{unread > 0 && <span className="rounded-full bg-error-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}</button>
          <button type="button" onClick={() => navigate('chat')} className="btn-secondary inline-flex items-center gap-2 text-sm"><MessageCircle className="h-4 w-4" />Messages</button>
          <button type="button" onClick={() => navigate('profile')} className="btn-secondary inline-flex items-center gap-2 text-sm"><UserRound className="h-4 w-4" />Profile</button>
          <button type="button" onClick={() => void loadDashboard(true)} disabled={refreshing} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Refresh</button>
        </div>
      </header>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:bg-warning-900/20 dark:text-warning-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-6">
        <MoverStatsCards bookings={bookings} payouts={payouts} />

        <div className="grid gap-6 lg:grid-cols-2">
          <MoverBookingRequests bookings={bookings} onOpen={(bookingId) => navigate('mover-booking-detail', bookingId)} />
          <MoverScheduleOverview bookings={bookings} schedule={schedule} onOpen={(bookingId) => navigate('mover-booking-detail', bookingId)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <MoverFinanceOverview invoices={invoices} payouts={payouts} />
          <MoverNotificationsCard
            notifications={notifications}
            onRead={async (notificationId) => {
              await moverApi.markNotificationRead(notificationId);
              setNotifications((current) => current.map((notification) => notification.id === notificationId ? { ...notification, read_at: new Date().toISOString() } : notification));
            }}
            onOpen={(notification) => {
              const bookingId = typeof notification.data?.booking_id === 'string' ? notification.data.booking_id : null;
              if (bookingId) navigate('mover-booking-detail', bookingId);
              else navigate('notifications');
            }}
          />
        </div>

        <MoverCustomersCard bookings={bookings} onOpenBooking={(bookingId) => navigate('mover-booking-detail', bookingId)} />
      </div>
    </div>
  );
}
