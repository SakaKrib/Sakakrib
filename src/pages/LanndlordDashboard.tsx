import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Home,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  CreditCard,
  User,
  Pencil,
  Eye,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  MapPin,
  CalendarDays,
  Activity,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Settings,
  Plus,
  X,
  Mail,
  Phone,
  BadgeCheck,
  Crown,
  BarChart3,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type DashboardPage =
  | 'overview'
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'profile'
  | 'subscription';

type ListingStatus =
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'unknown';

interface LandlordProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city: string | null;
  county: string | null;
  profile_photo_url: string | null;
  role: string | null;
  verification_status: string | null;
  landlord_application_status: string | null;
  kyc_completed: boolean | null;
  created_at: string;
  updated_at: string;
}

interface Listing {
  id: string;
  title: string | null;
  description: string | null;
  city: string | null;
  county: string | null;
  location: string | null;
  price_kes: number | null;
  status: string | null;
  approval_status: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  image_url: string | null;
  images: string[] | null;
}

interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ActivityItem {
  id: string;
  type: 'listing' | 'subscription' | 'profile';
  title: string;
  description: string;
  date: string;
  icon: typeof Home;
  tone: 'brand' | 'success' | 'warning' | 'error';
}

interface LandlordDashboardProps {
  /**
   * Use the same navigation function already used by your
   * parent dashboard.
   *
   * Examples:
   * navigate('post-listing')
   * navigate('listing-detail', listingId)
   * navigate('pms-dashboard')
   * navigate('subscription-plans')
   */
  navigate?: (page: string, id?: string) => void;

  /**
   * Optional callback if you want the dashboard to be
   * completely removed/closed by its parent.
   */
  onBack?: () => void;
}

/* =========================================================
   HELPERS
========================================================= */

const normalizeStatus = (
  value: string | null | undefined
): string => {
  return (value || '').trim().toLowerCase();
};

const formatKES = (value: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value || 0);
};

const formatDate = (
  value: string | null | undefined
): string => {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatRelativeDate = (
  value: string | null | undefined
): string => {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const diff =
    Date.now() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return 'Just now';
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  if (hours < 24) {
    return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  }

  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return formatDate(value);
};

const getDisplayName = (
  profile: LandlordProfile | null
) => {
  if (!profile) return 'Landlord';

  if (profile.full_name?.trim()) {
    return profile.full_name;
  }

  return [
    profile.first_name,
    profile.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Landlord';
};

const getInitials = (
  profile: LandlordProfile | null
) => {
  const name = getDisplayName(profile);

  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part.charAt(0).toUpperCase()
    )
    .join('');
};

const getListingStatus = (
  listing: Listing
): ListingStatus => {
  const status = normalizeStatus(
    listing.approval_status || listing.status
  );

  if (
    status === 'approved' ||
    status === 'active' ||
    status === 'published' ||
    status === 'verified'
  ) {
    return 'approved';
  }

  if (
    status === 'pending' ||
    status === 'pending_review' ||
    status === 'pending_verification' ||
    status === 'submitted'
  ) {
    return 'pending';
  }

  if (
    status === 'rejected' ||
    status === 'declined'
  ) {
    return 'rejected';
  }

  return 'unknown';
};

const getListingLocation = (
  listing: Listing
) => {
  return [
    listing.location,
    listing.city,
    listing.county,
  ]
    .filter(Boolean)
    .join(', ') || 'Location not provided';
};

const getListingImage = (
  listing: Listing
) => {
  if (listing.image_url) {
    return listing.image_url;
  }

  if (
    Array.isArray(listing.images) &&
    listing.images.length > 0
  ) {
    return listing.images[0];
  }

  return null;
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function LandlordDashboard({
  navigate,
  onBack,
}: LandlordDashboardProps) {
  const { profile } = useAuth();

  const [landlord, setLandlord] =
    useState<LandlordProfile | null>(null);

  const [listings, setListings] =
    useState<Listing[]>([]);

  const [subscriptions, setSubscriptions] =
    useState<Subscription[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [page, setPage] =
    useState<DashboardPage>('overview');

  const [savingProfile, setSavingProfile] =
    useState(false);

  const [profileForm, setProfileForm] =
    useState({
      full_name: '',
      email: '',
      phone: '',
      city: '',
      county: '',
    });

  /* =========================================================
     NAVIGATION
  ========================================================= */

  const goTo = useCallback(
    (nextPage: DashboardPage) => {
      setPage(nextPage);
    },
    []
  );

  const goBack = useCallback(() => {
    if (page === 'overview') {
      if (onBack) {
        onBack();
      }

      return;
    }

    setPage('overview');
  }, [page, onBack]);

  const navigateExternal = useCallback(
    (destination: string, id?: string) => {
      if (navigate) {
        navigate(destination, id);
        return;
      }

      /*
       * Fallback navigation.
       *
       * Your parent dashboard already has a `navigate()`
       * function, so normally this branch will not be used.
       */
      if (destination === 'post-listing') {
        window.location.hash = '#post-listing';
      }

      if (destination === 'listing-detail' && id) {
        window.location.hash = `#listing-detail/${id}`;
      }

      if (destination === 'pms-dashboard') {
        window.location.hash = '#pms-dashboard';
      }

      if (destination === 'subscription-plans') {
        window.location.hash = '#subscription-plans';
      }
    },
    [navigate]
  );

  /* =========================================================
     LOAD DASHBOARD
  ========================================================= */

  const loadDashboard = useCallback(
    async (showLoader = true) => {
      if (!profile?.id) {
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      setError(null);

      try {
        /*
         * -----------------------------------------------------
         * PROFILE
         * -----------------------------------------------------
         */

        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select(`
            id,
            email,
            full_name,
            first_name,
            last_name,
            phone,
            city,
            county,
            profile_photo_url,
            role,
            verification_status,
            landlord_application_status,
            kyc_completed,
            created_at,
            updated_at
          `)
          .eq('id', profile.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        /*
         * -----------------------------------------------------
         * LISTINGS
         *
         * This uses landlord_id because this is the ownership
         * relationship expected for landlord listings.
         * -----------------------------------------------------
         */

        const {
          data: listingsData,
          error: listingsError,
        } = await supabase
          .from('listings')
          .select(`
            id,
            title,
            description,
            city,
            county,
            location,
            price_kes,
            status,
            approval_status,
            rejection_reason,
            created_at,
            updated_at,
            property_type,
            bedrooms,
            bathrooms,
            image_url,
            images
          `)
          .eq('landlord_id', profile.id)
          .order('updated_at', {
            ascending: false,
          });

        if (listingsError) {
          throw listingsError;
        }

        /*
         * -----------------------------------------------------
         * SUBSCRIPTIONS
         * -----------------------------------------------------
         */

        const {
          data: subscriptionData,
          error: subscriptionError,
        } = await supabase
          .from('subscriptions')
          .select(`
            id,
            user_id,
            plan,
            status,
            starts_at,
            expires_at,
            created_at,
            updated_at
          `)
          .eq('user_id', profile.id)
          .order('created_at', {
            ascending: false,
          });

        if (subscriptionError) {
          throw subscriptionError;
        }

        const loadedProfile =
          (profileData || null) as LandlordProfile | null;

        setLandlord(loadedProfile);

        setListings(
          (listingsData || []) as Listing[]
        );

        setSubscriptions(
          (subscriptionData || []) as Subscription[]
        );

        if (loadedProfile) {
          setProfileForm({
            full_name:
              loadedProfile.full_name || '',
            email:
              loadedProfile.email || '',
            phone:
              loadedProfile.phone || '',
            city:
              loadedProfile.city || '',
            county:
              loadedProfile.county || '',
          });
        }
      } catch (err) {
        console.error(
          'Landlord dashboard load error:',
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load landlord dashboard.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [profile?.id]
  );

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    loadDashboard();
  }, [profile?.id, loadDashboard]);

  /* =========================================================
     REFRESH
  ========================================================= */

  const refreshDashboard = async () => {
    setRefreshing(true);

    await loadDashboard(false);
  };

  /* =========================================================
     LISTING FILTERS
  ========================================================= */

  const approvedListings = useMemo(
    () =>
      listings.filter(
        (listing) =>
          getListingStatus(listing) ===
          'approved'
      ),
    [listings]
  );

  const pendingListings = useMemo(
    () =>
      listings.filter(
        (listing) =>
          getListingStatus(listing) ===
          'pending'
      ),
    [listings]
  );

  const rejectedListings = useMemo(
    () =>
      listings.filter(
        (listing) =>
          getListingStatus(listing) ===
          'rejected'
      ),
    [listings]
  );

  /* =========================================================
     SUBSCRIPTION
  ========================================================= */

  const activeSubscription = useMemo(() => {
    const now = Date.now();

    return (
      subscriptions.find((subscription) => {
        const status =
          normalizeStatus(
            subscription.status
          );

        if (
          status !== 'active' &&
          status !== 'current' &&
          status !== 'subscribed'
        ) {
          return false;
        }

        if (
          subscription.expires_at &&
          new Date(
            subscription.expires_at
          ).getTime() < now
        ) {
          return false;
        }

        return true;
      }) || null
    );
  }, [subscriptions]);

  const hasActiveSubscription =
    Boolean(activeSubscription);

  /* =========================================================
     PROFILE SAVE
  ========================================================= */

  const saveProfile = async () => {
    if (!landlord?.id) {
      return;
    }

    setSavingProfile(true);
    setError(null);

    try {
      const {
        error: updateError,
      } = await supabase
        .from('profiles')
        .update({
          full_name:
            profileForm.full_name.trim() ||
            null,
          phone:
            profileForm.phone.trim() ||
            null,
          city:
            profileForm.city.trim() ||
            null,
          county:
            profileForm.county.trim() ||
            null,
          updated_at:
            new Date().toISOString(),
        })
        .eq('id', landlord.id);

      if (updateError) {
        throw updateError;
      }

      await loadDashboard(false);

      setPage('overview');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update your profile.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  /* =========================================================
     ACTIVITY FEED
  ========================================================= */

  const activities = useMemo<ActivityItem[]>(
    () => {
      const activityList: ActivityItem[] = [];

      listings.forEach((listing) => {
        const status =
          getListingStatus(listing);

        if (status === 'approved') {
          activityList.push({
            id: `approved-${listing.id}`,
            type: 'listing',
            title: 'Listing approved',
            description:
              listing.title ||
              'Your property listing was approved.',
            date:
              listing.updated_at ||
              listing.created_at,
            icon: CheckCircle2,
            tone: 'success',
          });
        }

        if (status === 'pending') {
          activityList.push({
            id: `pending-${listing.id}`,
            type: 'listing',
            title: 'Listing submitted',
            description:
              listing.title ||
              'Your property listing is awaiting review.',
            date:
              listing.updated_at ||
              listing.created_at,
            icon: Clock,
            tone: 'warning',
          });
        }

        if (status === 'rejected') {
          activityList.push({
            id: `rejected-${listing.id}`,
            type: 'listing',
            title: 'Listing rejected',
            description:
              listing.title ||
              'Your property listing was rejected.',
            date:
              listing.updated_at ||
              listing.created_at,
            icon: XCircle,
            tone: 'error',
          });
        }
      });

      subscriptions.forEach(
        (subscription) => {
          activityList.push({
            id: `subscription-${subscription.id}`,
            type: 'subscription',
            title: 'Subscription updated',
            description: subscription.plan
              ? `${subscription.plan} subscription`
              : 'Subscription activity',
            date:
              subscription.updated_at ||
              subscription.created_at,
            icon: CreditCard,
            tone: 'brand',
          });
        }
      );

      if (landlord?.updated_at) {
        activityList.push({
          id: `profile-${landlord.id}`,
          type: 'profile',
          title: 'Profile updated',
          description:
            'Your landlord profile was updated.',
          date: landlord.updated_at,
          icon: User,
          tone: 'brand',
        });
      }

      return activityList
        .sort(
          (a, b) =>
            new Date(b.date).getTime() -
            new Date(a.date).getTime()
        )
        .slice(0, 8);
    },
    [listings, subscriptions, landlord]
  );

  /* =========================================================
     STATS
  ========================================================= */

  const stats = [
    {
      label: 'Approved Listings',
      value: approvedListings.length,
      icon: CheckCircle2,
      page: 'approved' as DashboardPage,
      description:
        'Properties currently approved.',
      iconClass:
        'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    },
    {
      label: 'Pending Listings',
      value: pendingListings.length,
      icon: Clock,
      page: 'pending' as DashboardPage,
      description:
        'Properties waiting for review.',
      iconClass:
        'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    },
    {
      label: 'Rejected Listings',
      value: rejectedListings.length,
      icon: XCircle,
      page: 'rejected' as DashboardPage,
      description:
        'Properties requiring attention.',
      iconClass:
        'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    },
    {
      label: 'Total Listings',
      value: listings.length,
      icon: Home,
      page: 'approved' as DashboardPage,
      description:
        'All properties on your account.',
      iconClass:
        'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200',
    },
  ];

  /* =========================================================
     PROFILE STATUS
  ========================================================= */

  const profileVerificationStatus =
    normalizeStatus(
      landlord?.verification_status ||
        landlord?.landlord_application_status
    );

  const isVerified =
    profileVerificationStatus ===
      'verified' ||
    profileVerificationStatus ===
      'approved';

  /* =========================================================
     STATUS BADGE
  ========================================================= */

  const listingStatusBadge = (
    listing: Listing
  ) => {
    const status =
      getListingStatus(listing);

    if (status === 'approved') {
      return (
        <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </span>
      );
    }

    if (status === 'pending') {
      return (
        <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    }

    if (status === 'rejected') {
      return (
        <span className="badge bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    }

    return (
      <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-400">
        Unknown
      </span>
    );
  };

  /* =========================================================
     ACTIVITY COLOR
  ========================================================= */

  const activityClass = (
    tone: ActivityItem['tone']
  ) => {
    switch (tone) {
      case 'success':
        return 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400';

      case 'warning':
        return 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400';

      case 'error':
        return 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400';

      default:
        return 'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200';
    }
  };

  /* =========================================================
     ACCESS CHECK
  ========================================================= */

  if (!profile) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8  text-center">
        <div className="card p-8">
          <User className="mx-auto h-12 w-12 text-gray-300" />

          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Please sign in to continue.
          </p>
        </div>
      </div>
    );
  }

  const isLandlord =
    profile.role === 'landlord' ||
    profile.role === 'real_estate';

  if (!isLandlord) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 py-20">
        <div className="card p-8 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-error-500" />

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Landlord Access Required
          </h2>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This dashboard is only available to
            landlords and real estate users.
          </p>
        </div>
      </div>
    );
  }

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="card flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-600" />

            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Loading your landlord dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     PAGE HEADER
  ========================================================= */

  const pageTitles: Record<
    DashboardPage,
    string
  > = {
    overview: 'Landlord Dashboard',
    approved: 'Approved Listings',
    pending: 'Pending Listings',
    rejected: 'Rejected Listings',
    profile: 'Edit Profile',
    subscription: 'Subscription',
  };

  const pageDescriptions: Record<
    DashboardPage,
    string
  > = {
    overview:
      'Manage your properties, profile, and property management access.',
    approved:
      'View and manage your approved properties.',
    pending:
      'Properties currently waiting for review.',
    rejected:
      'Properties that require your attention.',
    profile:
      'Update your landlord account information.',
    subscription:
      'Manage your property management subscription.',
  };

  /* =========================================================
     LISTING PAGE
  ========================================================= */

  const renderListingsPage = (
    title: string,
    pageListings: Listing[],
    emptyTitle: string,
    emptyDescription: string
  ) => {
    return (
      <div className="card overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-4 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <button
                type="button"
                onClick={goBack}
                className="mb-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Dashboard
              </button>

              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {title}
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {pageListings.length}{' '}
                {pageListings.length === 1
                  ? 'listing'
                  : 'listings'}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigateExternal(
                  'post-listing'
                )
              }
              className="btn-primary text-sm"
            >
              <Plus className="h-4 w-4" />
              Post New Listing
            </button>
          </div>
        </div>

        <div className="p-5">
          {pageListings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-brand-800">
              <Home className="mx-auto h-12 w-12 text-gray-300 dark:text-brand-700" />

              <h3 className="mt-4 font-semibold text-gray-800 dark:text-gray-200">
                {emptyTitle}
              </h3>

              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                {emptyDescription}
              </p>

              {page === 'approved' && (
                <button
                  type="button"
                  onClick={() =>
                    navigateExternal(
                      'post-listing'
                    )
                  }
                  className="btn-primary mt-5"
                >
                  <Plus className="h-4 w-4" />
                  Post Your First Listing
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {pageListings.map(
                (listing) => {
                  const image =
                    getListingImage(
                      listing
                    );

                  return (
                    <div
                      key={listing.id}
                      className="rounded-2xl border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-brand-800 dark:hover:bg-brand-900/30"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 gap-4">
                          <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-brand-100 dark:bg-brand-800">
                            {image ? (
                              <img
                                src={image}
                                alt={
                                  listing.title ||
                                  'Property'
                                }
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Home className="h-8 w-8 text-brand-400" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                                {listing.title ||
                                  'Untitled Listing'}
                              </h3>

                              {listingStatusBadge(
                                listing
                              )}
                            </div>

                            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <MapPin className="h-3.5 w-3.5" />
                              {getListingLocation(
                                listing
                              )}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                              {listing.property_type && (
                                <span className="capitalize">
                                  {
                                    listing.property_type
                                  }
                                </span>
                              )}

                              {listing.bedrooms !==
                                null &&
                                listing.bedrooms !==
                                  undefined && (
                                  <span>
                                    {
                                      listing.bedrooms
                                    }{' '}
                                    bedroom
                                    {listing.bedrooms ===
                                    1
                                      ? ''
                                      : 's'}
                                  </span>
                                )}

                              <span>
                                Updated{' '}
                                {formatRelativeDate(
                                  listing.updated_at
                                )}
                              </span>
                            </div>

                            {listing.rejection_reason &&
                              getListingStatus(
                                listing
                              ) ===
                                'rejected' && (
                                <div className="mt-2 flex items-start gap-2 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-400">
                                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />

                                  <span>
                                    {
                                      listing.rejection_reason
                                    }
                                  </span>
                                </div>
                              )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                          <div className="text-right">
                            <p className="text-sm font-bold text-brand-600 dark:text-brand-400">
                              {formatKES(
                                Number(
                                  listing.price_kes ||
                                    0
                                )
                              )}
                            </p>

                            <p className="mt-1 text-xs text-gray-400">
                              {formatDate(
                                listing.created_at
                              )}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                navigateExternal(
                                  'listing-detail',
                                  listing.id
                                )
                              }
                              className="btn-secondary px-3 py-2 text-xs"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                navigateExternal(
                                  'listing-manage',
                                  listing.id
                                )
                              }
                              className="btn-primary px-3 py-2 text-xs"
                            >
                              <Settings className="h-3.5 w-3.5" />
                              Manage
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* =========================================================
     PROFILE PAGE
  ========================================================= */

  const renderProfilePage = () => {
    return (
      <div className="card overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <button
            type="button"
            onClick={goBack}
            className="mb-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Dashboard
          </button>

          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Edit Profile
          </h2>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Keep your landlord information up to date.
          </p>
        </div>

        <div className="space-y-6 p-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:flex-row sm:items-center dark:border-brand-800 dark:bg-brand-900/30">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              {landlord?.profile_photo_url ? (
                <img
                  src={
                    landlord.profile_photo_url
                  }
                  alt={getDisplayName(landlord)}
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitials(landlord)
              )}
            </div>

            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                {getDisplayName(landlord)}
              </h3>

              <p className="text-sm text-gray-500 dark:text-gray-400">
                {landlord?.email}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <span className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                  {profile.role ===
                  'real_estate'
                    ? 'Real Estate'
                    : 'Landlord'}
                </span>

                {isVerified ? (
                  <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                    <BadgeCheck className="h-3 w-3" />
                    Verified
                  </span>
                ) : (
                  <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                    <Clock className="h-3 w-3" />
                    Verification Pending
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Full Name
              </label>

              <input
                value={
                  profileForm.full_name
                }
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    full_name:
                      event.target.value,
                  })
                }
                className="input-field"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>

              <input
                type="email"
                value={
                  profileForm.email
                }
                disabled
                className="input-field cursor-not-allowed opacity-70"
              />

              <p className="mt-1 text-xs text-gray-400">
                Email is managed by your account
                authentication.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Phone
              </label>

              <input
                value={
                  profileForm.phone
                }
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    phone:
                      event.target.value,
                  })
                }
                className="input-field"
                placeholder="+254..."
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                City
              </label>

              <input
                value={
                  profileForm.city
                }
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    city:
                      event.target.value,
                  })
                }
                className="input-field"
                placeholder="Nairobi"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                County
              </label>

              <input
                value={
                  profileForm.county
                }
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    county:
                      event.target.value,
                  })
                }
                className="input-field"
                placeholder="Nairobi"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end dark:border-brand-800">
            <button
              type="button"
              onClick={goBack}
              className="btn-secondary"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile}
              className="btn-primary"
            >
              {savingProfile ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}

              {savingProfile
                ? 'Saving...'
                : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* =========================================================
     SUBSCRIPTION PAGE
  ========================================================= */

  const renderSubscriptionPage = () => {
    if (hasActiveSubscription) {
      return (
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="border-b border-gray-200 bg-gradient-to-r from-success-50 to-brand-50 px-5 py-4 dark:border-brand-800 dark:from-success-900/20 dark:to-brand-900/30">
              <button
                type="button"
                onClick={goBack}
                className="mb-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Dashboard
              </button>

              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Property Management
              </h2>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Your property management subscription is
                active.
              </p>
            </div>

            <div className="p-5">
              <div className="rounded-2xl border border-success-200 bg-success-50 p-5 dark:border-success-900/40 dark:bg-success-900/10">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                      <Crown className="h-6 w-6" />
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-success-700 dark:text-success-400">
                        Active Subscription
                      </p>

                      <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                        {activeSubscription?.plan ||
                          'Property Management Plan'}
                      </h3>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigateExternal(
                        'pms-dashboard'
                      )
                    }
                    className="btn-primary"
                  >
                    <Building2 className="h-4 w-4" />
                    Open PMS Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 grid gap-4 border-t border-success-200 pt-5 sm:grid-cols-3 dark:border-success-900/40">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Plan
                    </p>

                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {activeSubscription?.plan ||
                        '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Started
                    </p>

                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {formatDate(
                        activeSubscription?.starts_at
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Expires
                    </p>

                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {activeSubscription?.expires_at
                        ? formatDate(
                            activeSubscription.expires_at
                          )
                        : 'No expiry'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-brand-600" />

              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">
                  Property Management Access
                </h3>

                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Manage your properties from the dedicated
                  PMS dashboard.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                navigateExternal(
                  'pms-dashboard'
                )
              }
              className="btn-secondary mt-4"
            >
              Go to PMS Dashboard
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="card overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <button
            type="button"
            onClick={goBack}
            className="mb-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Dashboard
          </button>

          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Property Management
          </h2>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Unlock the dedicated property management
            workspace.
          </p>
        </div>

        <div className="p-5">
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center dark:border-brand-800 dark:bg-brand-900/30">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              <Crown className="h-7 w-7" />
            </div>

            <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
              Upgrade to Property Management
            </h3>

            <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
              You currently do not have an active property
              management subscription. Choose a plan to
              unlock the dedicated PMS dashboard.
            </p>

            <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-brand-800 dark:bg-brand-950">
                <Building2 className="h-5 w-5 text-brand-600" />

                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  Property Management
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Manage your rental properties.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-brand-800 dark:bg-brand-950">
                <BarChart3 className="h-5 w-5 text-brand-600" />

                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  Property Insights
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Track your property activity.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-brand-800 dark:bg-brand-950">
                <Settings className="h-5 w-5 text-brand-600" />

                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  Management Tools
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Access dedicated management tools.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                navigateExternal(
                  'subscription-plans'
                )
              }
              className="btn-primary mt-6"
            >
              <CreditCard className="h-4 w-4" />
              View Subscription Plans
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* =========================================================
     MAIN OVERVIEW
  ========================================================= */

  const renderOverview = () => {
    return (
      <>
        {/* =====================================================
            PROFILE CARD
        ===================================================== */}
        <div className="card mb-6 overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-4 py-2.5 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <Home className="h-4 w-4" />
              Landlord Profile
            </p>
          </div>

          <div className="p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                  {landlord?.profile_photo_url ? (
                    <img
                      src={
                        landlord.profile_photo_url
                      }
                      alt={getDisplayName(
                        landlord
                      )}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials(landlord)
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    {getDisplayName(
                      landlord
                    )}
                  </h2>

                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {landlord?.email ||
                      'No email available'}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                      {profile.role ===
                      'real_estate'
                        ? 'Real Estate'
                        : 'Landlord'}
                    </span>

                    {isVerified ? (
                      <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                        <ShieldCheck className="h-3 w-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                        <Clock className="h-3 w-3" />
                        Verification Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  goTo('profile')
                }
                className="btn-secondary text-sm"
              >
                <Pencil className="h-4 w-4" />
                Edit Profile
              </button>
            </div>
          </div>
        </div>

        {/* =====================================================
            STATISTICS
        ===================================================== */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <button
              key={stat.label}
              type="button"
              onClick={() =>
                goTo(stat.page)
              }
              className="card group p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </p>

                  <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </p>
                </div>

                <div
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl',
                    stat.iconClass
                  )}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>

              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {stat.description}
              </p>

              <div className="mt-4 flex items-center text-xs font-semibold text-brand-600 dark:text-brand-400">
                Manage
                <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>

        {/* =====================================================
            ACTIVITY + PMS
        ===================================================== */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Activity */}
          <div className="card overflow-hidden">
            <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                    <Activity className="h-5 w-5 text-brand-600" />
                    Recent Activity
                  </h3>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Recent activity from your account.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5">
              {activities.length === 0 ? (
                <div className="py-8 text-center">
                  <Activity className="mx-auto h-10 w-10 text-gray-300 dark:text-brand-700" />

                  <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    No recent activity
                  </p>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Your listing and account activity will
                    appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map(
                    (activity) => (
                      <div
                        key={activity.id}
                        className="flex gap-3"
                      >
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                            activityClass(
                              activity.tone
                            )
                          )}
                        >
                          <activity.icon className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {
                                activity.title
                              }
                            </p>

                            <span className="text-[11px] text-gray-400">
                              {formatRelativeDate(
                                activity.date
                              )}
                            </span>
                          </div>

                          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                            {
                              activity.description
                            }
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          {/* PMS */}
          <div className="card overflow-hidden">
            <div className="border-b border-gray-200 bg-gradient-to-r from-success-50 to-brand-50 px-5 py-4 dark:border-brand-800 dark:from-success-900/20 dark:to-brand-900/30">
              <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                <Building2 className="h-5 w-5 text-success-600" />
                Property Management
              </h3>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Access your dedicated property management
                workspace.
              </p>
            </div>

            <div className="p-5">
              {hasActiveSubscription ? (
                <div className="rounded-2xl border border-success-200 bg-success-50 p-5 dark:border-success-900/40 dark:bg-success-900/10">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                      <Crown className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-success-700 dark:text-success-400">
                        Active
                      </p>

                      <h4 className="mt-1 font-bold text-gray-900 dark:text-white">
                        {activeSubscription?.plan ||
                          'Property Management Plan'}
                      </h4>

                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {activeSubscription?.expires_at
                          ? `Expires ${formatDate(
                              activeSubscription.expires_at
                            )}`
                          : 'Active subscription'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigateExternal(
                        'pms-dashboard'
                      )
                    }
                    className="btn-primary mt-5 w-full"
                  >
                    <Building2 className="h-4 w-4" />
                    Open PMS Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-800 dark:bg-brand-900/30">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                      <CreditCard className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">
                        PMS Subscription Required
                      </p>

                      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                        Subscribe to a property management
                        plan to access the dedicated PMS
                        dashboard.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      goTo(
                        'subscription'
                      )
                    }
                    className="btn-primary mt-5 w-full"
                  >
                    <CreditCard className="h-4 w-4" />
                    View Subscription Plans
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =====================================================
            LISTINGS
        ===================================================== */}
        <div className="card mt-6 overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                  <Home className="h-5 w-5 text-brand-600" />
                  My Listings
                </h3>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Manage your latest properties.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigateExternal(
                    'post-listing'
                  )
                }
                className="btn-primary text-sm"
              >
                <Plus className="h-4 w-4" />
                Post New
              </button>
            </div>
          </div>

          <div className="p-5">
            {listings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center dark:border-brand-800">
                <Home className="mx-auto h-10 w-10 text-gray-300 dark:text-brand-700" />

                <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
                  No listings yet
                </p>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Post your first property to start
                  receiving inquiries.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    navigateExternal(
                      'post-listing'
                    )
                  }
                  className="btn-primary mt-4"
                >
                  <Plus className="h-4 w-4" />
                  Post Listing
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {listings
                  .slice(0, 5)
                  .map((listing) => {
                    const image =
                      getListingImage(
                        listing
                      );

                    return (
                      <div
                        key={listing.id}
                        className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-3 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between dark:border-brand-800 dark:hover:bg-brand-900/30"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="h-14 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-100 dark:bg-brand-800">
                            {image ? (
                              <img
                                src={image}
                                alt={
                                  listing.title ||
                                  'Property'
                                }
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Home className="h-6 w-6 text-brand-400" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                              {listing.title ||
                                'Untitled Listing'}
                            </p>

                            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <MapPin className="h-3 w-3" />
                              {getListingLocation(
                                listing
                              )}
                            </p>

                            <div className="mt-1.5">
                              {listingStatusBadge(
                                listing
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <span className="text-sm font-bold text-brand-600 dark:text-brand-400">
                            {formatKES(
                              Number(
                                listing.price_kes ||
                                  0
                              )
                            )}
                          </span>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                navigateExternal(
                                  'listing-detail',
                                  listing.id
                                )
                              }
                              className="btn-ghost px-3 py-2 text-xs"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                navigateExternal(
                                  'listing-manage',
                                  listing.id
                                )
                              }
                              className="btn-primary px-3 py-2 text-xs"
                            >
                              <Settings className="h-3.5 w-3.5" />
                              Manage
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {listings.length > 5 && (
              <div className="mt-4 border-t border-gray-200 pt-4 dark:border-brand-800">
                <button
                  type="button"
                  onClick={() =>
                    goTo('approved')
                  }
                  className="flex w-full items-center justify-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  View All Listings
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* =====================================================
            ACCOUNT SUMMARY
        ===================================================== */}
        <div className="card mt-6 p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Account Summary
          </h3>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Mail className="h-4 w-4" />
                Email
              </div>

              <p className="mt-2 truncate text-sm font-semibold text-gray-900 dark:text-white">
                {landlord?.email || '—'}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Phone className="h-4 w-4" />
                Phone
              </div>

              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {landlord?.phone || 'Not provided'}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <MapPin className="h-4 w-4" />
                Location
              </div>

              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {[
                  landlord?.city,
                  landlord?.county,
                ]
                  .filter(Boolean)
                  .join(', ') ||
                  'Not provided'}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <CalendarDays className="h-4 w-4" />
                Member Since
              </div>

              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {formatDate(
                  landlord?.created_at
                )}
              </p>
            </div>
          </div>
        </div>
      </>
    );
  };

  /* =========================================================
     PAGE CONTENT
  ========================================================= */

  let pageContent: React.ReactNode;

  switch (page) {
    case 'approved':
      pageContent = renderListingsPage(
        'Approved Listings',
        approvedListings,
        'No approved listings',
        'Approved properties will appear here once they have passed review.'
      );
      break;

    case 'pending':
      pageContent = renderListingsPage(
        'Pending Listings',
        pendingListings,
        'No pending listings',
        'You currently have no properties waiting for approval.'
      );
      break;

    case 'rejected':
      pageContent = renderListingsPage(
        'Rejected Listings',
        rejectedListings,
        'No rejected listings',
        'Properties requiring corrections or review will appear here.'
      );
      break;

    case 'profile':
      pageContent =
        renderProfilePage();
      break;

    case 'subscription':
      pageContent =
        renderSubscriptionPage();
      break;

    default:
      pageContent =
        renderOverview();
      break;
  }

  /* =========================================================
     FINAL RENDER
  ========================================================= */

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* =====================================================
          HEADER
      ===================================================== */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {page !== 'overview' && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-brand-800 dark:hover:text-white"
                title="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
              <LayoutDashboard className="h-6 w-6 text-brand-600" />
              {pageTitles[page]}
            </h1>
          </div>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {pageDescriptions[page]}
          </p>
        </div>

        <div className="flex gap-2">
          {page !== 'overview' && (
            <button
              type="button"
              onClick={goBack}
              className="btn-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}

          <button
            type="button"
            onClick={refreshDashboard}
            disabled={refreshing}
            className="btn-secondary"
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                refreshing &&
                  'animate-spin'
              )}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}
      {error && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>

          <button
            type="button"
            onClick={() =>
              setError(null)
            }
            className="shrink-0 rounded-lg p-1 hover:bg-error-100 dark:hover:bg-error-900/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* =====================================================
          PAGE
      ===================================================== */}
      {pageContent}
    </div>
  );
}