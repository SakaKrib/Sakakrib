import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  LayoutDashboard,
  Chrome as Home,
  Building2,
  Clock,
  CircleCheck as CheckCircle2,
  Circle as XCircle,
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
  CircleAlert as AlertCircle,
  ArrowRight,
  Settings,
  Plus,
  X,
  Check,
  Camera,
  Mail,
  Phone,
  BadgeCheck,
  Crown,
  ChartBar as BarChart3,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';

import {
  protectedGet,
  protectedPost,
  protectedPatch,
} from '@/lib/djangoLegacyApi';

import type {
  Listing,
  Subscription,
  Profile,
} from '@/types/domain';
import {cn} from "@/lib/utils"

import {
  fetchListingEntitlement,
  type ListingEntitlement,
} from '@/lib/ListingEntitlement';
/* =========================================================
   TYPES
========================================================= */

type DashboardPage =
  | 'overview'
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'profile'
  | 'all'
  | 'subscription';

type ListingStatus =
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'unknown';

interface ListingMediaRow {
  id: string;
  listing_id: string;
  user_id: string;
  url: string;
  label?: string | null;
  media_type?: string | null;
  position?: number | null;
  created_at?: string | null;
  unit_id?: string | null;
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
  navigate?: (page: string, id?: string) => void;
  onBack?: () => void;
}

interface ProfileForm {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  county: string;
  profile_photo_url: string | null;
}

/* =========================================================
   HELPERS
========================================================= */

const normalizeStatus = (
  value: string | null | undefined
): string => {
  return (value || '').trim().toLowerCase();
};

const formatKES = (
  value: number | null | undefined
): string => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
};

const formatDate = (
  value: string | null | undefined
): string => {
  if (!value) {
    return '—';
  }

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
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const diff = Date.now() - date.getTime();

  /*
   * Protect against future timestamps.
   */
  if (diff < 0) {
    return formatDate(value);
  }

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
  profile: Profile | null
): string => {
  if (!profile) {
    return 'Landlord';
  }

  if (profile.full_name?.trim()) {
    return profile.full_name.trim();
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
  profile: Profile | null
): string => {
  const name = getDisplayName(profile);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part.charAt(0).toUpperCase()
    )
    .join('');

  return initials || 'L';
};

const getListingStatus = (
  listing: Listing
): ListingStatus => {
  const approvalStatus = normalizeStatus(
    listing.approval_status
  );

  switch (approvalStatus) {
    case 'approved':
      return 'approved';

    case 'pending':
    case 'pending_review':
    case 'pending-review':
      return 'pending';

    case 'rejected':
      return 'rejected';

    default: {
      const status = normalizeStatus(
        listing.status
      );

      if (status === 'approved') {
        return 'approved';
      }

      if (
        status === 'pending' ||
        status === 'pending_review' ||
        status === 'pending-review'
      ) {
        return 'pending';
      }

      if (status === 'rejected') {
        return 'rejected';
      }

      /*
       * is_approved is retained as backward compatibility
       * for existing records.
       */
      if (listing.is_approved === true) {
        return 'approved';
      }

      return 'unknown';
    }
  }
};



const getListingLocation = (
  listing: Listing
): string => {
  return [
    listing.location_search,
    listing.city,
    listing.county,
  ]
    .filter(Boolean)
    .join(', ') || 'Location not provided';
};


/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function LandlordDashboard({
  navigate,
  onBack,
}: LandlordDashboardProps) {
  const { profile, refreshProfile } = useAuth();

  const [landlord, setLandlord] =
    useState<Profile | null>(null);

  const [listings, setListings] =
    useState<Listing[]>([]);

  const [subscriptions, setSubscriptions] =
    useState<Subscription[]>([]);


    // profile
  const [profileImageFile, setProfileImageFile] =
  useState<File | null>(null);

  const [profileImagePreview, setProfileImagePreview] =
    useState<string | null>(null);  

  const [success, setSuccess] =
    useState(false);  
  


  /* =========================================================
     Listin Entitlement
  ========================================================= */
  const [listingEntitlement, setListingEntitlement] =
  useState<ListingEntitlement | null>(null);

  /*
   * Listing images are stored in listing_media,
   * not listings.images.
   */
  const [listingMedia, setListingMedia] =
    useState<ListingMediaRow[]>([]);

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
  useState<ProfileForm>({
    full_name: '',
    email: '',
    phone: '',
    city: '',
    county: '',
    profile_photo_url: null,
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
      onBack?.();
      return;
    }

    setPage('overview');
  }, [page, onBack]);

  const navigateExternal = useCallback(
    (
      destination: string,
      id?: string
    ) => {
      if (navigate) {
        navigate(destination, id);
        return;
      }

      /*
       * Existing fallback navigation.
       */
      switch (destination) {
        case 'post-listing':
          window.location.hash = '#post-listing';
          break;

        case 'listing-detail':
          if (id) {
            window.location.hash =
              `#listing-detail/${id}`;
          }
          break;

        case 'listing-manage':
          if (id) {
            window.location.hash =
              `#listing-manage/${id}`;
          }
          break;

        case 'pms-dashboard':
          window.location.hash =
            '#pms-dashboard';
          break;

        case 'subscription-plans':
          window.location.hash =
            '#subscription-plans';
          break;

        default:
          break;
      }
    },
    [navigate]
  );


  /* =========================================================
     LISTING MEDIA LOOKUP
  ========================================================= */

  const mediaByListingId = useMemo(() => {
    const map = new Map<
      string,
      ListingMediaRow[]
    >();

    listingMedia.forEach((media) => {
      const existing =
        map.get(media.listing_id) || [];

      existing.push(media);

      map.set(
        media.listing_id,
        existing
      );
    });

    /*
     * Position media deterministically.
     */
    map.forEach((media, listingId) => {
      media.sort((a, b) => {
        const positionA =
          a.position ?? Number.MAX_SAFE_INTEGER;

        const positionB =
          b.position ?? Number.MAX_SAFE_INTEGER;

        if (positionA !== positionB) {
          return positionA - positionB;
        }

        return (
          new Date(
            a.created_at || 0
          ).getTime() -
          new Date(
            b.created_at || 0
          ).getTime()
        );
      });

      map.set(listingId, media);
    });

    return map;
  }, [listingMedia]);

  const getListingImage = useCallback(
    (listing: Listing): string | null => {
      const media =
        mediaByListingId.get(
          listing.id
        ) || [];

      /*
       * Prefer image media.
       */
      const image = media.find(
        (item) => {
          const type =
            normalizeStatus(
              item.media_type
            );

          return (
            type === 'image' ||
            type === 'photo' ||
            type === 'image/jpeg' ||
            type === 'image/png' ||
            type === 'image/webp' ||
            type === 'image/jpg'
          );
        }
      );

      if (image?.url) {
        return image.url;
      }

      /*
       * Fallback to first media URL.
       */
      return media[0]?.url || null;
    },
    [mediaByListingId]
  );



    /* =========================================================
     USEEFFECT INNITIALIZED IMAGE
    ========================================================= */
    useEffect(() => {
      if (profileImageFile) {
        return;
      }

      const photoUrl =
        landlord?.profile_photo_url?.trim() ||
        null;

      setProfileImagePreview(photoUrl);
    }, [
      landlord?.profile_photo_url,
      profileImageFile,
    ]);


  

  /* =========================================================
     LOAD DASHBOARD
  ========================================================= */
  

  const loadDashboard = useCallback(
    async (showLoader = true) => {
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      setError(null);

      try {
       const entitlement = await fetchListingEntitlement(
          'landlord',
          profile.id
        );

        setListingEntitlement(entitlement);

        const profileResponse = await protectedGet<Profile[]>(
          `/rest/v1/profiles?select=id,email,full_name,first_name,middle_name,last_name,phone,national_id,profile_photo_url,id_photo_url,selfie_url,id_document_url,id_document_type,city,county,role,verification_status,kyc_completed,landlord_application_status,is_agency,created_at,updated_at&id=eq.${profile.id}`
        );
        const profileData =
          Array.isArray(profileResponse)
            ? profileResponse[0] ?? null
            : profileResponse ?? null;

        if (!profileData) {
          throw new Error(
            'Unable to load your profile.'
          );
        }

        const listingsResponse = await protectedGet<Listing[]>(
          `/rest/v1/listings?select=id,user_id,title,description,city,county,price_kes,listing_type,deposit_required,deposit_structure,deposit_amount,size,beds,baths,contact_phone,contact_email,social_links,status,approval_status,is_approved,is_published,is_draft,admin_reviewed_at,admin_review_note,is_property_management,property_name,property_type,location_search,latitude,longitude,booking_enabled,payment_enabled,ai_caption,ai_caption_generated_at,created_at,updated_at&user_id=eq.${profile.id}&order=updated_at.desc`
        );

        const listingIds =
          (listingsResponse || []).map(
            (listing) => listing.id
          );

        let mediaData: ListingMediaRow[] = [];

        if (listingIds.length > 0) {
          const mediaResponse = await protectedGet<ListingMediaRow[]>(
            `/rest/v1/listing_media?select=id,listing_id,user_id,url,label,media_type,position,created_at,unit_id&listing_id=in.(${listingIds.join(',')})&order=position.asc.nullsfirst=false&order=created_at.asc`
          );
          mediaData = mediaResponse || [];
        }

        const subscriptionResponse = await protectedGet<any[]>(
          `/rest/v1/landlord_subscriptions?select=id,landlord_id,plan_id,billing_cycle,status,current_period_start,current_period_end,grace_period_end,auto_renew,created_at,updated_at,paypal_subscription_id,paypal_plan_id,paypal_status,next_billing_at,cancel_at_period_end,cancelled_at,billing_amount_kes,billing_amount_usd,billing_exchange_rate,billing_exchange_rate_timestamp,plan:subscription_plans(id,name,audience,max_listings,max_units_per_listing,monthly_price_kes,annual_price_kes)&landlord_id=eq.${profile.id}&order=created_at.desc`
        );

        const loadedProfile =
          (profileData || null) as Profile | null;

        const loadedListings =
          (listingsResponse || []) as Listing[];

        const normalizedSubscriptions: Subscription[] =
          (subscriptionResponse || []).map(
            (subscription) => {
              const rawPlan =
                subscription.plan;

              const plan =
                Array.isArray(rawPlan)
                  ? rawPlan[0] ?? null
                  : rawPlan ?? null;

              return {
                ...subscription,
                plan,
              } as Subscription;
            }
          );

        /* -----------------------------------------------------
           SET STATE
        ----------------------------------------------------- */

        setLandlord(
          loadedProfile
        );

        setListings(
          loadedListings
        );

        setListingMedia(
          mediaData
        );

        setSubscriptions(
          normalizedSubscriptions
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

          profile_photo_url:
            loadedProfile.profile_photo_url || null,
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

    void loadDashboard();
  }, [
    profile?.id,
    loadDashboard,
  ]);

  /* =========================================================
     REFRESH
  ========================================================= */

  const refreshDashboard =
    useCallback(async () => {
      if (!profile?.id) {
        return;
      }

      setRefreshing(true);

      await loadDashboard(false);
    }, [
      profile?.id,
      loadDashboard,
    ]);

  /* =========================================================
     LISTING FILTERS
  ========================================================= */

  const approvedListings =
    useMemo(
      () =>
        listings.filter(
          (listing) =>
            getListingStatus(
              listing
            ) === 'approved'
        ),
      [listings]
    );

  const pendingListings =
    useMemo(
      () =>
        listings.filter(
          (listing) =>
            getListingStatus(
              listing
            ) === 'pending'
        ),
      [listings]
    );

  const rejectedListings =
    useMemo(
      () =>
        listings.filter(
          (listing) =>
            getListingStatus(
              listing
            ) === 'rejected'
        ),
      [listings]
    );

  /* =========================================================
     ACTIVE SUBSCRIPTION
  ========================================================= */

  /* =========================================================
   ACTIVE SUBSCRIPTION
========================================================= */

const activeSubscription = useMemo(() => {
  const now = Date.now();

  return (
    subscriptions.find((subscription) => {
      const status = normalizeStatus(subscription.status);

      if (status !== 'active') {
        return false;
      }

      if (!subscription.current_period_end) {
        return true;
      }

      const periodEnd = new Date(
        subscription.current_period_end
      ).getTime();

      return (
        Number.isFinite(periodEnd) &&
        periodEnd >= now
      );
    }) ?? null
  );
}, [subscriptions]);

const hasActiveSubscription =
  Boolean(activeSubscription);

  const listingFeeKes =
  listingEntitlement?.individualListingPriceKes ?? null;

const freeListingLimit =
  listingEntitlement?.free_limit ?? null;

const freeListingsUsed =
  listingEntitlement?.free_listings_used ?? null;

const freeListingsRemaining =
  listingEntitlement?.free_listings_remaining ?? null;



  const openPMSOrSubscription = useCallback(() => {
    if (hasActiveSubscription) {
      navigateExternal('pms-dashboard');
      return;
    }

    navigateExternal('subscription-plans');
  }, [hasActiveSubscription, navigateExternal]);
/* =========================================================
   PMS BENEFITS
========================================================= */

const pmsBenefits = [
  'Manage your properties and rental units',
  'Add and manage renters and tenant records',
  'Track rent payments and outstanding balances',
  'Send rent reminders and notifications to renters',
  'Create and manage rental invoices',
  'Track occupied and vacant units',
  'Monitor your rental income and expenses',
  'Manage your rental accounting records',
  'View payment and rental performance reports',
  'Download monthly PDF and financial reports',
];


  /* =========================================================
    PROFILE SAVE
  ========================================================= */

  const saveProfile = async () => {
    setSavingProfile(true);
    setError(null);
    setSuccess(false);

    try {
      const currentUserId = profile?.id ?? landlord?.id;

      if (!currentUserId) {
        throw new Error(
          'Your session has expired. Please sign in again.'
        );
      }

      if (landlord?.id && landlord.id !== currentUserId) {
        throw new Error(
          'Your profile could not be verified. Please refresh the page and try again.'
        );
      }

      /* -------------------------------------------------------
        PROFILE PHOTO
      ------------------------------------------------------- */

      let profilePhotoUrl =
        landlord?.profile_photo_url ||
        null;

      if (profileImageFile) {
        throw new Error(
          'Profile photo upload must be handled by a protected server-side Storage endpoint. Browser uploads are not allowed under the HttpOnly-cookie architecture.'
        );
      }

      /* -------------------------------------------------------
        UPDATE PROFILE DATABASE ROW
      ------------------------------------------------------- */

      const savedProfile = await protectedPatch<Profile>(
        `/rest/v1/profiles?id=eq.${currentUserId}&select=id,email,full_name,first_name,middle_name,last_name,phone,national_id,profile_photo_url,id_photo_url,selfie_url,id_document_url,id_document_type,city,county,role,verification_status,kyc_completed,landlord_application_status,is_agency,created_at,updated_at`,
        {
          full_name: profileForm.full_name.trim(),
          phone: profileForm.phone.trim(),
          city: profileForm.city.trim(),
          county: profileForm.county.trim(),
          profile_photo_url: profilePhotoUrl,
          updated_at: new Date().toISOString(),
        }
      );

      if (!savedProfile) {
        throw new Error(
          'We could not save your profile.'
        );
      }

      /* -------------------------------------------------------
        UPDATE LOCAL STATE IMMEDIATELY
      ------------------------------------------------------- */

      setLandlord(savedProfile);

      setProfileForm({
        full_name:
          savedProfile.full_name || '',

        email:
          savedProfile.email || '',

        phone:
          savedProfile.phone || '',

        city:
          savedProfile.city || '',

        county:
          savedProfile.county || '',

        profile_photo_url:
          savedProfile.profile_photo_url ||
          null,
      });

      /*
      * The preview should now point to the real Supabase
      * Storage URL rather than the temporary blob URL.
      */
      setProfileImagePreview(
        savedProfile.profile_photo_url ||
          null
      );

      /*
      * Clear the pending File because it has now been
      * successfully uploaded.
      */
      setProfileImageFile(null);

      /* -------------------------------------------------------
        REFRESH AUTH CONTEXT
      ------------------------------------------------------- */

      try {
        await refreshProfile();
      } catch (refreshError) {
        /*
        * Do not report the entire save as failed if the
        * database/storage operation already succeeded.
        */
        console.warn(
          'Profile saved, but auth profile refresh failed:',
          refreshError
        );
      }

      /* -------------------------------------------------------
        SUCCESS
      ------------------------------------------------------- */

      setSuccess(true);

      window.setTimeout(() => {
        setSuccess(false);
      }, 3000);

    } catch (saveError) {
      console.error(
        'Saving profile failed:',
        saveError
      );

      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Something went wrong while saving your profile.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  /* =========================================================
     ACTIVITY FEED
  ========================================================= */

  const activities =
    useMemo<ActivityItem[]>(
      () => {
        const activityList: ActivityItem[] =
          [];

        listings.forEach(
          (listing) => {
            const status =
              getListingStatus(
                listing
              );

            if (
              status === 'approved'
            ) {
              activityList.push({
                id: `approved-${listing.id}`,
                type: 'listing',
                title:
                  'Listing approved',
                description:
                  listing.title ||
                  'Your property listing was approved.',
                date:
                  listing.updated_at ||
                  listing.created_at ||
                  '',
                icon:
                  CheckCircle2,
                tone:
                  'success',
              });
            }

            if (
              status === 'pending'
            ) {
              activityList.push({
                id: `pending-${listing.id}`,
                type: 'listing',
                title:
                  'Listing submitted',
                description:
                  listing.title ||
                  'Your property listing is awaiting review.',
                date:
                  listing.updated_at ||
                  listing.created_at ||
                  '',
                icon: Clock,
                tone:
                  'warning',
              });
            }

            if (
              status === 'rejected'
            ) {
              activityList.push({
                id: `rejected-${listing.id}`,
                type: 'listing',
                title:
                  'Listing rejected',
                description:
                  listing.title ||
                  'Your property listing was rejected.',
                date:
                  listing.updated_at ||
                  listing.created_at ||
                  '',
                icon: XCircle,
                tone:
                  'error',
              });
            }
          }
        );

        subscriptions.forEach(
          (subscription) => {
            const planName =
              subscription.plan
                ?.name ||
              'Property Management';

            activityList.push({
              id: `subscription-${subscription.id}`,
              type:
                'subscription',
              title:
                'Subscription updated',
              description:
                `${planName} subscription`,
              date:
                subscription.updated_at ||
                subscription.created_at ||
                '',
              icon:
                CreditCard,
              tone:
                'brand',
            });
          }
        );

        if (
          landlord?.updated_at
        ) {
          activityList.push({
            id: `profile-${landlord.id}`,
            type: 'profile',
            title:
              'Profile updated',
            description:
              'Your landlord profile was updated.',
            date:
              landlord.updated_at,
            icon: User,
            tone:
              'brand',
          });
        }

        return activityList
          .filter(
            (item) =>
              item.date &&
              !Number.isNaN(
                new Date(
                  item.date
                ).getTime()
              )
          )
          .sort(
            (a, b) =>
              new Date(
                b.date
              ).getTime() -
              new Date(
                a.date
              ).getTime()
          )
          .slice(0, 8);
      },
      [
        listings,
        subscriptions,
        landlord,
      ]
    );

  /* =========================================================
     STATS
  ========================================================= */

  const stats = useMemo(
    () => [
      {
        label:
          'Approved Listings',
        value:
          approvedListings.length,
        icon:
          CheckCircle2,
        page:
          'approved' as DashboardPage,
        description:
          'Properties currently approved.',
        iconClass:
          'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
      },

      {
        label:
          'Pending Listings',
        value:
          pendingListings.length,
        icon: Clock,
        page:
          'pending' as DashboardPage,
        description:
          'Properties waiting for review.',
        iconClass:
          'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
      },

      {
        label:
          'Rejected Listings',
        value:
          rejectedListings.length,
        icon: XCircle,
        page:
          'rejected' as DashboardPage,
        description:
          'Properties requiring attention.',
        iconClass:
          'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
      },

      {
        label:
          'Total Listings',
        value:
          listings.length,
        icon: Home,
        page:
          'all' as DashboardPage,
        description:
          'All properties on your account.',
        iconClass:
          'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200',
      },
    ],
    [
      approvedListings.length,
      pendingListings.length,
      rejectedListings.length,
      listings.length,
    ]
  );

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
     LISTING STATUS BADGE
  ========================================================= */

  const listingStatusBadge =
    useCallback(
      (listing: Listing) => {
        const status =
          getListingStatus(
            listing
          );

        if (
          status === 'approved'
        ) {
          return (
            <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
              <CheckCircle2 className="h-3 w-3" />
              Approved
            </span>
          );
        }

        if (
          status === 'pending'
        ) {
          return (
            <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
              <Clock className="h-3 w-3" />
              Pending
            </span>
          );
        }

        if (
          status === 'rejected'
        ) {
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
      },
      []
    );

  /* =========================================================
     ACTIVITY COLOR
  ========================================================= */

  const activityClass =
    useCallback(
      (
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
      },
      []
    );

  /* =========================================================
     ACCESS CHECK
  ========================================================= */

  if (!profile) {
    return (
      <div className="mx-auto max-w-7xl px-2 py-4 text-center sm:px-6 lg:px-8">
        <div className="card p-8">
          <User className="mx-auto h-12 w-12 text-gray-300" />

          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Please sign in to continue.
          </p>
        </div>
      </div>
    );
  }

  const profileRole =
    normalizeStatus(
      profile.role
    );

  const isLandlord =
    profileRole ===
      'landlord' 

  if (!isLandlord) {
    return (
      <div className="mx-auto max-w-7xl px-2 py-20 sm:px-6 lg:px-8">
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
      <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
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
     PAGE HEADER DATA
  ========================================================= */

  const pageTitles: Record<
    DashboardPage,
    string
  > = {
    overview:
      'Landlord Dashboard',
    approved:
      'Approved Listings',
    pending:
      'Pending Listings',
    rejected:
      'Rejected Listings',
    profile:
      'Edit Profile',
    subscription:
      'Subscription',
    all: 
      'All Listings',
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
    all:
      'View all properties on your account, including listings awaiting review.',  
  };

  /* =========================================================
     LISTING PAGE
  ========================================================= */

  const renderListingsPage =
    (
      title: string,
      pageListings: Listing[],
      emptyTitle: string,
      emptyDescription: string
    ) => (
      <div className="card overflow-hidden mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-2 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
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
                {pageListings.length ===
                1
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
          {pageListings.length ===
          0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-brand-800">
              <Home className="mx-auto h-12 w-12 text-gray-300 dark:text-brand-700" />

              <h3 className="mt-4 font-semibold text-gray-800 dark:text-gray-200">
                {emptyTitle}
              </h3>

              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
                {emptyDescription}
              </p>

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
                Post New Listing
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {pageListings.map(
                (listing) => {
                  const image =
                    getListingImage(
                      listing
                    );

                  const status =
                    getListingStatus(
                      listing
                    );

                  const isDraft =
                    listing.is_draft === true;

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
                                loading="lazy"
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

                              {isDraft ? (
                                <span className="badge bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300">
                                  <Pencil className="h-3 w-3" />
                                  Draft
                                </span>
                              ) : (
                                listingStatusBadge(
                                  listing
                                )
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

                              {listing.beds !==
                                null &&
                                listing.beds !==
                                  undefined && (
                                  <span>
                                    {
                                      listing.beds
                                    }{' '}
                                    bedroom
                                    {listing.beds ===
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

                            {status ===
                              'rejected' &&
                              listing.admin_review_note?.trim() && (
                                <div className="mt-2 flex items-start gap-2 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-400">
                                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />

                                  <div>
                                    <p className="font-semibold">
                                      Admin review note
                                    </p>

                                    <p className="mt-0.5">
                                      {
                                        listing.admin_review_note
                                      }
                                    </p>
                                  </div>
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
                            {isDraft ? (
                              <button
                                type="button"
                                onClick={() =>
                                  navigateExternal(
                                    'post-listing',
                                    listing.id
                                  )
                                }
                                className="btn-primary px-3 py-2 text-xs"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Continue Posting
                              </button>
                            ) : (
                              <>
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
                              </>
                            )}
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
