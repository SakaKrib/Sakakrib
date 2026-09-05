import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, MessageCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { cn } from '@/lib/utils';
import { protectedGet } from '@/lib/djangoApi';
import { renterApi, type RenterDashboardResponse } from '@/lib/Renter/renterApi';
import RenterWelcome from '@/pages/Renters/RenterWelcome';
import RenterHomeCard from '@/pages/Renters/RenterHomeCard';
import RenterRentCard from '@/pages/Renters/RenterRentCard';
import RenterMovingCard from '@/pages/Renters/RenterMovingCard';
import RenterQuickActions, { type RenterQuickAction } from '@/pages/Renters/RenterQuickActions';
import RenterDashboardTabs from '@/pages/Renters/RenterDashboardTabs';

const EMPTY_DASHBOARD: RenterDashboardResponse = { association: null, unit: null, property: null, invoices: [], bookings: [] };
type Notification = { id: string; title: string; message: string; read_at?: string | null; created_at: string };
const isUnpaidInvoice = (status?: string | null) => !['paid', 'completed', 'settled', 'cancelled', 'canceled'].includes(status?.trim().toLowerCase() ?? '');
const isActiveBooking = (status?: string | null) => ['pending', 'confirmed', 'accepted', 'in_progress', 'in-progress', 'ongoing'].includes(status?.trim().toLowerCase() ?? '');

export default function RenterDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const { navigate } = useNav();
  const [data, setData] = useState<RenterDashboardResponse>(EMPTY_DASHBOARD);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (authLoading) return; if (!profile) navigate('home'); else if (profile.role !== 'renter') navigate('home'); }, [authLoading, profile, navigate]);

  const loadDashboard = useCallback(async () => {
    if (!profile?.id || profile.role !== 'renter') return;
    setLoading(true); setError(null);
    try {
      const [response, notificationResponse] = await Promise.all([
        renterApi.getDashboard(profile.id),
        protectedGet<{ notifications?: Notification[] }>('/api/core/notifications/?limit=50'),
      ]);
      setData({ association: response?.association ?? null, unit: response?.unit ?? null, property: response?.property ?? null, invoices: Array.isArray(response?.invoices) ? response.invoices : [], bookings: Array.isArray(response?.bookings) ? response.bookings : [] });
      setNotifications(Array.isArray(notificationResponse?.notifications) ? notificationResponse.notifications : []);
    } catch (err) {
      console.error('Failed to load renter dashboard:', err);
      setData(EMPTY_DASHBOARD);
      setError(err instanceof Error ? err.message : 'Unable to load your renter dashboard.');
    } finally { setLoading(false); }
  }, [profile?.id, profile?.role]);

  useEffect(() => { if (!authLoading && profile?.role === 'renter' && profile.id) void loadDashboard(); }, [authLoading, profile?.role, profile?.id, loadDashboard]);

  const currentInvoice = useMemo(() => data.invoices.find(invoice => isUnpaidInvoice(invoice.status)) ?? null, [data.invoices]);
  const activeBooking = useMemo(() => data.bookings.find(booking => isActiveBooking(booking.status)) ?? null, [data.bookings]);
  const monthlyRent = data.association?.rent_amount ?? data.unit?.rent ?? null;
  const unreadCount = notifications.filter(notification => !notification.read_at).length;

  const handleQuickAction = useCallback((action: RenterQuickAction) => {
    switch (action) { case 'invoices': navigate('renter-invoices'); break; case 'payment': navigate('renter-payment'); break; case 'find-mover': navigate('movers'); break; case 'track-move': activeBooking ? navigate('mover-tracking', activeBooking.id) : navigate('movers'); break; case 'moving-history': navigate('renter-moving-history'); break; case 'calendar': navigate('renter-calendar'); break; }
  }, [activeBooking, navigate]);
  const handleRentPaymentSubmission = useCallback(async (invoiceId: string, transactionId: string) => { await renterApi.submitRentPayment(invoiceId, transactionId); await loadDashboard(); }, [loadDashboard]);

  if (authLoading || loading) return <div className="mx-auto flex min-h-[400px] max-w-7xl items-center justify-center px-2 py-8 sm:px-6 lg:px-8"><div className="text-center"><RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-500" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading your renter dashboard...</p></div></div>;
  if (!profile || profile.role !== 'renter') return null;

  return <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-brand-600 dark:text-brand-400">Renter Dashboard</p><h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">Your rental home at a glance</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your home, rent, invoices, and moving services from one place.</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => navigate('notifications')} aria-label="Notifications" title="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-brand-800 dark:bg-brand-900/40 dark:text-gray-300"><Bell className="h-5 w-5" />{unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button><button type="button" onClick={() => navigate('chat')} aria-label="Messages" title="Messages" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-brand-800 dark:bg-brand-900/40 dark:text-gray-300"><MessageCircle className="h-5 w-5" /></button><button type="button" onClick={() => void loadDashboard()} disabled={loading} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /><span className="hidden sm:inline">Refresh</span></button></div></div>
    {error && <div className="mb-6 flex items-start justify-between gap-3 rounded-xl bg-error-50 px-2 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Unable to load dashboard</p><p className="mt-0.5 break-words">{error}</p></div></div><button type="button" onClick={() => setError(null)} className="shrink-0 rounded-lg p-1" aria-label="Dismiss error">×</button></div>}
    <RenterWelcome profile={profile} />
    <section className="mb-6"><RenterHomeCard home={{ property: data.property ? { id: data.property.id, title: data.property.title, city: data.property.city, county: data.property.county, address: data.property.address, cover_image_url: data.property.cover_image_url } : null, unit: data.unit ?? null, association: data.association ?? null }} onViewProperty={propertyId => navigate('listing-detail', propertyId)} /></section>
    <RenterDashboardTabs />
    <section className="mb-6"><RenterQuickActions onAction={handleQuickAction} hasActiveMove={Boolean(activeBooking)} hasRentalHome={Boolean(data.association || data.unit)} /></section>
    <div className="grid gap-6 lg:grid-cols-2"><RenterRentCard invoice={currentInvoice} monthlyRent={monthlyRent} onViewInvoices={() => navigate('renter-invoices')} onSubmitPayment={handleRentPaymentSubmission} /><RenterMovingCard booking={activeBooking} onTrack={bookingId => navigate('mover-tracking', bookingId)} onFindMover={() => navigate('movers')} /></div>
  </div>;
}
