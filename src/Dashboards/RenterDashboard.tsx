import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Home,
  MapPin,
  MessageCircle,
  RefreshCw,
  WalletCards,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet, protectedPost } from '@/lib/protectedApi';
import { cn } from '@/lib/utils';

interface RenterAssociation {
  assoc_id: string;
  unit_id: string;
  listing_id: string;
  unit_number: string;
  renter_name: string;
  renter_phone: string | null;
  renter_email: string | null;
  rent_amount: number | string;
  unit_rent: number | string;
  payment_tracking_enabled: boolean;
  rent_due_day: number;
  lease_start: string | null;
  lease_end: string | null;
  status: string;
  created_at: string;
}

interface PropertyUnit {
  id: string;
  listing_id: string;
  unit_number: string;
  unit_type: string;
  rent: number | string;
  deposit_amount: number | string;
  size: string | null;
  beds: number;
  baths: number;
  availability: string;
}

interface Listing {
  id: string;
  title: string;
  property_name: string | null;
  property_type: string | null;
  city: string;
  county: string;
  location_search: string | null;
  is_published: boolean;
  is_approved: boolean;
}

interface RentInvoice {
  id: string;
  invoice_number: string;
  renter_user_id: string;
  renter_assoc_id: string;
  listing_id: string;
  unit_id: string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  amount_kes: number | string;
  currency: string;
  status: string;
  paid_at: string | null;
}

interface Booking {
  id: string;
  renter_id: string;
  mover_id: string;
  pickup_address: string;
  dropoff_address: string;
  moving_date: string;
  total_amount: number | string;
  status: string;
  payment_status: string;
  tracking_number: string | null;
  last_known_latitude: number | null;
  last_known_longitude: number | null;
  last_location_at: string | null;
}

interface RentSummary {
  association_id: string;
  unit_id: string;
  listing_id: string;
  unit_number: string;
  rent: number | string;
  rent_due_day: number;
  payment_tracking_enabled: boolean;
  property_name: string | null;
  listing_title: string | null;
  landlord_id: string;
  paid_through: string | null;
  next_payment_period: string;
  landlord_name: string | null;
}

const money = (value: number | string | null | undefined) =>
  `KES ${Number(value ?? 0).toLocaleString('en-KE')}`;

const dateLabel = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const statusLabel = (value: string | null | undefined) =>
  (value ?? 'unknown').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const isPaid = (status: string | null | undefined) =>
  ['paid', 'completed', 'settled'].includes((status ?? '').toLowerCase());

const isActiveBooking = (booking: Booking) =>
  ['pending', 'confirmed', 'accepted', 'in_progress', 'in-progress', 'ongoing', 'started'].includes(
    booking.status.toLowerCase(),
  );

export default function RenterDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const { navigate } = useNav();

  const [associations, setAssociations] = useState<RenterAssociation[]>([]);
  const [unit, setUnit] = useState<PropertyUnit | null>(null);
  const [property, setProperty] = useState<Listing | null>(null);
  const [summary, setSummary] = useState<RentSummary | null>(null);
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!profile || profile.role !== 'renter') return;

    setLoading(true);
    setError(null);

    try {
      // All protected reads go through protected-api. The browser does not
      // supply or read the user's access/refresh tokens.
      const associationRows = await protectedPost<RenterAssociation[]>(
        '/rest/v1/rpc/get_my_renter_associations',
        {},
      );

      const activeAssociations = Array.isArray(associationRows)
        ? associationRows.filter((row) => row.status === 'ACTIVE')
        : [];

      setAssociations(activeAssociations);

      const primary = activeAssociations[0] ?? null;

      if (!primary) {
        setUnit(null);
        setProperty(null);
        setSummary(null);
        setInvoices([]);
        setBookings([]);
        setUnreadNotifications(0);
        return;
      }

      const [unitRows, propertyRows, rentSummary, invoiceRows, bookingRows, notificationRows] =
        await Promise.all([
          protectedGet<PropertyUnit[]>(
            `/rest/v1/property_units?id=eq.${encodeURIComponent(primary.unit_id)}&select=id,listing_id,unit_number,unit_type,rent,deposit_amount,size,beds,baths,availability`,
          ),
          protectedGet<Listing[]>(
            `/rest/v1/listings?id=eq.${encodeURIComponent(primary.listing_id)}&select=id,title,property_name,property_type,city,county,location_search,is_published,is_approved`,
          ),
          protectedPost<RentSummary>(
            '/rest/v1/rpc/get_renter_rent_summary',
            { p_renter_assoc_id: primary.assoc_id },
          ),
          protectedGet<RentInvoice[]>(
            `/rest/v1/rent_invoices?renter_assoc_id=eq.${encodeURIComponent(primary.assoc_id)}&select=id,invoice_number,renter_user_id,renter_assoc_id,listing_id,unit_id,billing_period_start,billing_period_end,due_date,amount_kes,currency,status,paid_at&order=due_date.desc&limit=12`,
          ),
          protectedGet<Booking[]>(
            '/rest/v1/bookings?select=id,renter_id,mover_id,pickup_address,dropoff_address,moving_date,total_amount,status,payment_status,tracking_number,last_known_latitude,last_known_longitude,last_location_at&order=moving_date.asc&limit=12',
          ),
          protectedGet<Array<{ id: string }>>(
            '/rest/v1/renter_notifications?read_at=is.null&select=id&limit=100',
          ),
        ]);

      setUnit(Array.isArray(unitRows) ? unitRows[0] ?? null : null);
      setProperty(Array.isArray(propertyRows) ? propertyRows[0] ?? null : null);
      setSummary(rentSummary ?? null);
      setInvoices(Array.isArray(invoiceRows) ? invoiceRows : []);
      setBookings(Array.isArray(bookingRows) ? bookingRows : []);
      setUnreadNotifications(Array.isArray(notificationRows) ? notificationRows.length : 0);
    } catch (err) {
      console.error('Failed to load renter dashboard:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your renter dashboard. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!authLoading && profile?.role === 'renter') {
      void loadDashboard();
    }
  }, [authLoading, profile?.role, loadDashboard]);

  const currentInvoice = useMemo(() => {
    return invoices.find((invoice) => !isPaid(invoice.status)) ?? null;
  }, [invoices]);

  const activeBooking = useMemo(() => {
    return bookings.find(isActiveBooking) ?? null;
  }, [bookings]);

  const recentInvoices = useMemo(() => invoices.slice(0, 5), [invoices]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto flex min-h-[420px] max-w-7xl items-center justify-center px-4 py-10">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-500" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Loading your renter dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (!profile || profile.role !== 'renter') return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">Renter Dashboard</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            Welcome back{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your home, rent, payments and moving services in one place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('notifications')}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-brand-800 dark:bg-brand-900/40 dark:text-gray-300"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-5 text-white">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate('chat')}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-brand-800 dark:bg-brand-900/40 dark:text-gray-300"
            aria-label="Messages"
          >
            <MessageCircle className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Dashboard data could not be loaded</p>
              <p className="mt-0.5 break-words">{error}</p>
            </div>
          </div>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
        </div>
      )}

      {associations.length === 0 ? (
        <section className="card overflow-hidden">
          <div className="p-8 text-center sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-300">
              <Home className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">No active rental yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
              Your renter account is ready, but there is no active property association yet. Once a landlord links your account to a unit, your home and rent information will appear here.
            </p>
            <button type="button" onClick={() => navigate('listings')} className="btn-primary mt-5">
              Browse properties
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Monthly rent</span>
                <WalletCards className="h-5 w-5 text-brand-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                {money(summary?.rent ?? associations[0]?.rent_amount)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Due on day {summary?.rent_due_day ?? associations[0]?.rent_due_day}
              </p>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Current invoice</span>
                <CalendarDays className="h-5 w-5 text-brand-500" />
              </div>
              <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                {currentInvoice ? money(currentInvoice.amount_kes) : 'No balance due'}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {currentInvoice ? `Due ${dateLabel(currentInvoice.due_date)}` : 'Your rent payments are up to date'}
              </p>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Lease</span>
                <CheckCircle2 className="h-5 w-5 text-brand-500" />
              </div>
              <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                {statusLabel(associations[0]?.status)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {dateLabel(associations[0]?.lease_start)} — {dateLabel(associations[0]?.lease_end)}
              </p>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Moving</span>
                <MapPin className="h-5 w-5 text-brand-500" />
              </div>
              <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                {activeBooking ? statusLabel(activeBooking.status) : 'No active move'}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {activeBooking ? dateLabel(activeBooking.moving_date) : 'Book a mover when you need one'}
              </p>
            </div>
          </div>

          <section className="card mt-6 overflow-hidden">
            <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
              <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                <Home className="h-5 w-5 text-brand-600 dark:text-brand-300" />
                My Home
              </h2>
            </div>
            <div className="p-5">
              <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {property?.property_name || property?.title || 'Rental property'}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Unit {unit?.unit_number || associations[0]?.unit_number}
                    {unit?.unit_type ? ` • ${unit.unit_type}` : ''}
                  </p>
                  <p className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {property?.location_search || [property?.city, property?.county].filter(Boolean).join(', ') || 'Location unavailable'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {unit?.beds !== undefined && <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-brand-800">{unit.beds} beds</span>}
                    {unit?.baths !== undefined && <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-brand-800">{unit.baths} baths</span>}
                    {unit?.size && <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-brand-800">{unit.size}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => property && navigate('listing-detail', property.id)}
                  disabled={!property}
                  className="btn-secondary"
                >
                  View property
                </button>
              </div>
            </div>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-brand-800">
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">Rent & invoices</h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Your latest rent billing activity.</p>
                </div>
                <button type="button" onClick={() => navigate('renter-invoices')} className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  View all
                </button>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-brand-800">
                {recentInvoices.length === 0 ? (
                  <p className="p-5 text-sm text-gray-500 dark:text-gray-400">No rent invoices found.</p>
                ) : recentInvoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{invoice.invoice_number}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Due {dateLabel(invoice.due_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{money(invoice.amount_kes)}</p>
                      <span className={cn('text-xs font-medium', isPaid(invoice.status) ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400')}>
                        {statusLabel(invoice.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {currentInvoice && (
                <div className="border-t border-gray-200 p-5 dark:border-brand-800">
                  <button type="button" onClick={() => navigate('renter-payment')} className="btn-primary w-full">
                    Pay current rent
                  </button>
                </div>
              )}
            </section>

            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-brand-800">
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">Moving service</h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Track your current move or find a mover.</p>
                </div>
                <button type="button" onClick={() => navigate('movers')} className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  Find a mover
                </button>
              </div>
              <div className="p-5">
                {activeBooking ? (
                  <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-900/50">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{statusLabel(activeBooking.status)}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Moving {dateLabel(activeBooking.moving_date)}</p>
                      </div>
                      <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-300">
                        {statusLabel(activeBooking.payment_status)}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                      <p><span className="font-semibold">From:</span> {activeBooking.pickup_address}</p>
                      <p><span className="font-semibold">To:</span> {activeBooking.dropoff_address}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => navigate('mover-booking-detail', activeBooking.id)} className="btn-secondary text-sm">Booking details</button>
                      <button type="button" onClick={() => navigate('mover-tracking', activeBooking.id)} className="btn-primary text-sm">Track move</button>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <MapPin className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">No active moving booking</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">When you are ready to move, find a verified mover.</p>
                    <button type="button" onClick={() => navigate('movers')} className="btn-primary mt-4">Browse movers</button>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button type="button" onClick={() => navigate('renter-invoices')} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
              <CalendarDays className="h-5 w-5 text-brand-500" />
              <p className="mt-2 font-semibold text-gray-900 dark:text-white">Invoices</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Review rent history</p>
            </button>
            <button type="button" onClick={() => navigate('renter-payment')} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
              <WalletCards className="h-5 w-5 text-brand-500" />
              <p className="mt-2 font-semibold text-gray-900 dark:text-white">Make a payment</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Pay your rent</p>
            </button>
            <button type="button" onClick={() => navigate('renter-calendar')} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
              <CalendarDays className="h-5 w-5 text-brand-500" />
              <p className="mt-2 font-semibold text-gray-900 dark:text-white">Calendar</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">View your schedule</p>
            </button>
            <button type="button" onClick={() => navigate('chat')} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md">
              <MessageCircle className="h-5 w-5 text-brand-500" />
              <p className="mt-2 font-semibold text-gray-900 dark:text-white">Messages</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Contact your service providers</p>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
