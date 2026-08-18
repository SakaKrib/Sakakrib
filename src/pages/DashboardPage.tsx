import { useState, useEffect } from 'react';
import {
  Home, Building2, Truck, Users, Eye, LayoutDashboard,
  ShieldCheck, Clock, FileText, Calendar, DollarSign, TrendingUp,
  CheckCircle2, X, Star
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';
import { formatKES, cn, COMMISSION_RATE, FREE_LISTING_LIMIT } from '@/lib/utils';
import type { UserRole, Listing, Mover, Booking, Review } from '@/lib/supabase';
import AdminDashboard from '@/pages/AdminDashboard';
import LandlordDashboard from '@/pages/LanndlordDashboard';

type SimRole = UserRole | 'role-selection';

export default function DashboardPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate, simulatorRole, setSimulatorRole, setRoleModalOpen } = useNav();
  const [listings, setListings] = useState<Listing[]>([]);
  const [moverProfile, setMoverProfile] = useState<Mover | null>(null);
  const [bookings, setBookings] = useState<(Booking & { mover?: Mover })[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const isAdmin = profile?.is_admin === true || profile?.role === 'admin';


  useEffect(() => {
    if (!profile) return;
    const fetchData = async () => {
      const { data: listingData } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      if (listingData) setListings(listingData as Listing[]);

      const { data: moverData } = await supabase
        .from('movers')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (moverData) setMoverProfile(moverData as Mover);

      const { data: bookingData } = await supabase
        .from('bookings')
        .select('*, mover:movers(*)')
        .eq('renter_id', profile.id)
        .order('created_at', { ascending: false });
      if (bookingData) setBookings(bookingData as (Booking & { mover: Mover })[]);

      const { data: reviewData } = await supabase
        .from('reviews')
        .select('*')
        .eq('reviewer_id', profile.id)
        .order('created_at', { ascending: false });
      if (reviewData) setReviews(reviewData as Review[]);
    };
    fetchData();
  }, [profile]);

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please sign in to access your dashboard.</p>
      </div>
    );
  }

  /*
  * ------------------------------------------------------
  * KYC CHECK
  * ------------------------------------------------------
  *
  * KYC completion is separate from admin approval.
  *
  * kyc_completed === false
  *   → user must complete KYC.
  *
  * kyc_completed === true
  *   → KYC is already submitted, so do NOT redirect
  *     them back to the KYC page.
  *
  * verification_status is handled separately because
  * it represents the review/approval status.
  */

  if (!profile.kyc_completed && !isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="card p-8 text-center">

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-900/30">
            <ShieldCheck className="h-7 w-7 text-warning-600 dark:text-warning-400" />
          </div>

          <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">
            Complete your KYC verification
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Please complete your identity verification before
            continuing with your account registration.
          </p>

          <button
            type="button"
            onClick={() => navigate('kyc-verify')}
            className="btn-primary mt-6"
          >
            <ShieldCheck className="h-4 w-4" />
            Complete KYC
          </button>

        </div>
      </div>
    );
  }

  /*
 * ------------------------------------------------------
 * LANDLORD APPLICATION PENDING
 * ------------------------------------------------------
 *
 * A pending landlord application always takes priority
 * over normal dashboard access.
 *
 * The user's role may still be null or renter while
 * the application is being reviewed.
 */

  if (
    profile.landlord_application_status === 'pending'
  ) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="card p-8 text-center">

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-900/30">
            <Clock className="h-7 w-7 text-warning-600 dark:text-warning-400" />
          </div>

          <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">
            Landlord application under review
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Your landlord application has been submitted and
            is currently being reviewed by our administration
            team.
          </p>

          <div className="mt-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-left dark:border-warning-800 dark:bg-warning-900/20">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning-600 dark:text-warning-400" />

              <div>
                <p className="font-semibold text-warning-900 dark:text-warning-200">
                  Verification pending
                </p>

                <p className="mt-1 text-sm leading-6 text-warning-800 dark:text-warning-300">
                  You will receive an update once your identity
                  and landlord application have been reviewed.
                  Landlord dashboard features will become
                  available after approval.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('profile')}
            className="btn-secondary mt-6"
          >
            View Profile
          </button>

        </div>
      </div>
    );
  }


  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Please sign in to access your dashboard.
        </p>
      </div>
    );
  }

  // const isAdmin = profile.is_admin === true || profile.role === 'admin';

  // if (isAdmin) {
  //   return <AdminDashboard />;
  // }

  // const activeRole = simulatorRole || profile.role;


  // Admins can use the simulator.
  // Non-admin users always use their actual role.
  const activeRole = isAdmin
    ? (simulatorRole || profile.role)
    : profile.role;

    if (isAdmin) {
    return <AdminDashboard />;
  }

  // for landlords
  

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <LayoutDashboard className="h-6 w-6 text-brand-600" /> Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your listings, bookings, and profile.
        </p>
      </div>

      {/* {profile.is_admin === true || profile.role === 'admin' ? <div className="card mb-6 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-4 py-2.5 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
            <Eye className="h-4 w-4" /> Simulator Dashboard — Preview Different Roles
          </p>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {[
            { role: 'renter' as SimRole, label: 'Renter View', icon: Home, color: 'from-brand-500 to-brand-700' },
            { role: 'landlord' as SimRole, label: 'Verified Landlord', icon: Building2, color: 'from-success-500 to-success-700' },
            { role: 'mover' as SimRole, label: 'Verified Mover', icon: Truck, color: 'from-accent-500 to-accent-700' },
            { role: 'role-selection' as SimRole, label: 'Role Selection Modal', icon: Users, color: 'from-gray-500 to-gray-700' },
          ].map((opt) => (
            <button
              key={opt.role}
              onClick={() => {
                if (opt.role === 'role-selection') {
                  setRoleModalOpen(true);
                } else {
                  setSimulatorRole(opt.role as UserRole);
                }
              }}
              className={cn(
                'flex items-center gap-2 rounded-full border-2 px-4 py-2.5 text-sm font-semibold transition-all',
                activeRole === opt.role
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-brand-700 dark:text-gray-400'
              )}
            >
              <opt.icon className="h-4 w-4" /> {opt.label}
            </button>
          ))}
          {simulatorRole && (
            <button
              onClick={() => setSimulatorRole(null)}
              className="flex items-center gap-1 rounded-full px-3 py-2.5 text-sm font-medium text-gray-500 hover:text-error-600"
            >
              <X className="h-4 w-4" /> Reset
            </button>
          )}
        </div>
      </div> : null} */}

      {/* Profile Summary */}
      {/* <div className="card mb-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              {profile.full_name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{profile.full_name || 'User'}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="badge bg-brand-50 text-brand-700 capitalize dark:bg-brand-800 dark:text-brand-200">
                  {activeRole}
                </span>
                {profile.verification_status === 'verified' ? (
                  <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                    <ShieldCheck className="h-3 w-3" /> Verified
                  </span>
                ) : profile.verification_status === 'pending_verification' ? (
                  <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                    <Clock className="h-3 w-3" /> Pending
                  </span>
                ) : (
                  <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-400">
                    Unverified
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {profile.verification_status !== 'verified' && (
              <button onClick={() => navigate('kyc-verify')} className="btn-secondary text-sm">
                <ShieldCheck className="h-4 w-4" /> Verify Account
              </button>
            )}
            <button onClick={() => navigate('profile')} className="btn-secondary text-sm">
              Edit Profile
            </button>
          </div>
        </div>
      </div> */}

      {/* Stats Grid */}
      {/* <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Home} label="My Listings" value={listings.length} onClick={() => navigate('my-listings')} />
        <StatCard icon={Calendar} label="My Bookings" value={bookings.length} onClick={() => navigate('my-bookings')} />
        <StatCard icon={Star} label="Reviews Given" value={reviews.length} />
        <StatCard
          icon={FileText}
          label="Free Listings Left"
          value={Math.max(0, FREE_LISTING_LIMIT - (profile.free_listings_used || 0))}
        />
      </div>  */}

      {/* Role-specific content */}
      {/* {(activeRole === 'landlord' || activeRole === 'real_estate') && (
        <div className="card mb-6 p-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Home className="h-5 w-5 text-brand-600" /> My Listings
            </h3>
            <button onClick={() => navigate('post-listing')} className="btn-primary text-sm">
              <FileText className="h-4 w-4" /> Post New
            </button>
          </div>
          {listings.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No listings yet. Post your first property!</p>
          ) : (
            <div className="mt-4 space-y-3">
              {listings.map((listing) => (
                <div key={listing.id} className="flex items-center justify-between rounded-full border border-gray-200 p-3 dark:border-brand-800">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{listing.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{listing.city}, {listing.county}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">{formatKES(Number(listing.price_kes ?? 0))}</span>
                    <button onClick={() => navigate('listing-detail', listing.id)} className="btn-ghost text-xs">View</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )} */}

      {(activeRole === 'landlord' || activeRole === 'real_estate') && (
        <LandlordDashboard/>
      )}

      {activeRole === 'mover' && (
        <div className="card mb-6 p-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Truck className="h-5 w-5 text-accent-600" /> Mover Profile
            </h3>
            {!moverProfile && (
              <button onClick={() => navigate('register-mover')} className="btn-primary text-sm">
                Register as Mover
              </button>
            )}
          </div>
          {moverProfile ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-full bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-400">Vehicle</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {moverProfile.vehicle_type === 'pickup' ? 'Pickup Truck' : moverProfile.vehicle_type === 'lorry' ? 'Lorry / Canter' : 'Trailer'}
                </p>
              </div>
              <div className="rounded-full bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-400">Number Plate</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{moverProfile.number_plate}</p>
              </div>
              <div className="rounded-full bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-400">Operating Area</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{moverProfile.operating_city}, {moverProfile.operating_county}</p>
              </div>
              <div className="rounded-full bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-400">Base Rate</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {moverProfile.base_rate_kes > 0 ? formatKES(moverProfile.base_rate_kes) : 'On request'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              You haven't registered as a mover yet. Complete registration to start accepting jobs.
            </p>
          )}
        </div>
      )}

      {activeRole === 'renter' && (
        <div className="card mb-6 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <Calendar className="h-5 w-5 text-brand-600" /> My Bookings
          </h3>
          {bookings.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No bookings yet. Browse movers to book a move!</p>
          ) : (
            <div className="mt-4 space-y-3">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-full border border-gray-200 p-4 dark:border-brand-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {booking.mover?.driver_full_name || 'Mover'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {booking.pickup_address} → {booking.dropoff_address}
                      </p>
                      <p className="text-xs text-gray-400">Date: {booking.moving_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{formatKES(booking.total_amount)}</p>
                      <span className={cn(
                        'badge mt-1',
                        booking.status === 'completed' ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400' :
                        booking.status === 'pending' ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' :
                        booking.status === 'confirmed' ? 'bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' :
                        'bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400'
                      )}>
                        {booking.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Commission Info */}
      <div className="card p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <TrendingUp className="h-5 w-5 text-brand-600" /> Platform Fees & Commission
        </h3>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-full bg-gray-50 p-3 dark:bg-brand-800/30">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Landlord listing fee (after {FREE_LISTING_LIMIT} free)</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">KES 1,000 / listing</span>
          </div>
          <div className="flex items-center justify-between rounded-full bg-gray-50 p-3 dark:bg-brand-800/30">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Real Estate Agency commission</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">15% per listing</span>
          </div>
          <div className="flex items-center justify-between rounded-full bg-gray-50 p-3 dark:bg-brand-800/30">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Mover booking commission</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{COMMISSION_RATE * 100}% per booking</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, onClick }: { icon: typeof Home; label: string; value: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn('card p-4 text-left transition-all', onClick && 'hover:shadow-md cursor-pointer')}
    >
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-gray-400" />
        {onClick && <TrendingUp className="h-3 w-3 text-gray-300" />}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </button>
  );
}
