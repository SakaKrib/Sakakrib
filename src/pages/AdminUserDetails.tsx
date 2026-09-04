import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  ShieldCheck,
  User,
  UserCheck,
  Building2,
  FileText,
  Eye,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Car,
  CalendarDays,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import openKycDocument from '@/Dashboards/openPrivateDocsHelper';

import {
  LandlordForm,
  RealEstateForm,
  LandlordPropertiesPanel,
  RealEstatePropertiesPanel,
  LandlordSubscriptionPanel,
  RealEstateSubscriptionPanel,
  KycPanel,
  Info,
  StatusRow,
  DocumentRow,
  formatValue,
  formatDate,
} from './AdminApplicationReview';

import type {
  Profile,
  Mover,
  Subscription,
  Listing,
  ListingMedia,
} from '@/types/domain';

import {
  protectedGet,
  protectedPatch,
} from '@/lib/djangoLegacyApi';

import { cn } from '@/lib/utils';

/* ==================================================
TYPES
================================================== */

type ReviewSection =
  | 'overview'
  | 'landlord-kyc'
  | 'landlord-form'
  | 'landlord-properties'
  | 'landlord-subscription'
  | 'real-estate-kyc'
  | 'real-estate-form'
  | 'real-estate-properties'
  | 'real-estate-subscription'
  | 'mover-kyc'
  | 'mover-form';

type ReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

interface UserData extends Profile {
  subscription?: Subscription | null;
}

interface MoverWithProfile extends Mover {
  profile?: Profile | null;

  /*
   * This flag means the row is only a UI representation of a
   * MoverApplication. It is NOT a canonical Mover record.
   *
   * Never use its id as a Mover.id.
   */
  is_application?: boolean;
}

type ApplicationStatus =
  | 'not_requested'
  | 'pending'
  | 'approved'
  | 'rejected'
  | null
  | string;

interface LandlordApplication {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  phone: string | null;
  national_id: string | null;
  city: string | null;
  county: string | null;
  is_agency: boolean | null;
  id_document_url: string | null;
  id_document_type: string | null;
  landlord_application_status: string | null;
  real_estate_application_status: string | null;
  verification_status: string | null;
  kyc_completed: boolean | null;
  admin_review_note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

type LandlordProperty = Listing & {
  media?: ListingMedia[];
};

interface MoverApplication {
  id: string;
  applicant_id?: string | null;
  applicant_email?: string | null;
  applicant_name?: string | null;
  application_type?: string | null;

  driver_full_name?: string | null;
  national_id?: string | null;
  dl_number?: string | null;
  dl_photo_url?: string | null;

  vehicle_type?: string | null;
  number_plate?: string | null;
  capacity_details?: string | null;

  operating_city?: string | null;
  operating_county?: string | null;
  phone?: string | null;

  base_rate_kes?: number | null;
  rate_per_km_kes?: number | null;

  payment_channel?: string | null;
  payment_account?: string | null;

  insurance_policy_details?: string | null;
  vehicle_inspection_expiry?: string | null;

  liability_accepted?: boolean;
  terms_accepted?: boolean;

  reference_contacts?: unknown[];

  working_days?: unknown[];
  start_time?: string | null;
  end_time?: string | null;

  latitude?: number | null;
  longitude?: number | null;
  location?: string | null;

  status?: 'pending' | 'approved' | 'rejected' | string | null;

  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;

  submitted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AdminUserDetailsProps {
  userId: string;
  onBack?: () => void;
}

/* ==================================================
PROFILE SELECT
================================================== */

const PROFILE_SELECT = `  id,
  email,
  full_name,
  first_name,
  last_name,
  middle_name,
  role,
  kyc_completed,
  verification_status,
  landlord_application_status,
  real_estate_application_status,
  mover_application_status,
  admin_review_note,
  national_id,
  phone,
  profile_photo_url,
  id_photo_url,
  selfie_url,
  id_document_url,
  id_document_type,
  city,
  county,
  is_agency,
  free_listings_used,
  created_at,
  updated_at`;

/* ==================================================
MOVER SELECT
================================================== */

const MOVER_SELECT = `  id,
  user_id,
  driver_full_name,
  business_name,
  national_id,
  dl_number,
  dl_photo_url,
  vehicle_type,
  number_plate,
  operating_city,
  operating_county,
  phone,
  profile_photo_url,
  base_rate_kes,
  capacity_details,
  is_available,
  approval_status,
  working_days,
  start_time,
  end_time,
  payment_channel,
  payment_account,
  liability_accepted,
  reference_contacts,
  created_at,
  updated_at`;

const LISTING_SELECT = `  id,
  user_id,
  title,
  description,
  city,
  county,
  price_kes,
  listing_type,
  deposit_required,
  deposit_structure,
  deposit_amount,
  size,
  beds,
  baths,
  contact_phone,
  contact_email,
  status,
  approval_status,
  is_approved,
  is_published,
  admin_reviewed_at,
  admin_review_note,
  is_property_management,
  property_name,
  property_type,
  location_search,
  latitude,
  longitude,
  booking_enabled,
  payment_enabled,
  ai_caption,
  ai_caption_generated_at,
  created_at,
  updated_at`;

/* ==================================================
MAIN COMPONENT
================================================== */

export default function AdminUserDetails({
  userId,
  onBack,
}: AdminUserDetailsProps) {
  const [user, setUser] = useState<UserData | null>(null);

  const [movers, setMovers] = useState<MoverWithProfile[]>([]);

  const [selectedMover, setSelectedMover] =
    useState<MoverWithProfile | null>(null);

  const [moverApplication, setMoverApplication] =
    useState<MoverApplication | null>(null);

  const [landlordApplication, setLandlordApplication] =
    useState<LandlordApplication | null>(null);

  const [properties, setProperties] =
    useState<LandlordProperty[]>([]);

  const [loadingProperties, setLoadingProperties] =
    useState(false);

  const [
    loadingLandlordApplication,
    setLoadingLandlordApplication,
  ] = useState(false);

  const [section, setSection] =
    useState<ReviewSection>('overview');

  const normalizedRole =
    user ? String(user.role || '').toLowerCase() : '';

  /*
   * Application status is intentionally checked separately from role.
   *
   * The canonical Django application-status service resets pending and
   * rejected applicants to the renter role. Therefore role alone cannot
   * be used to determine whether an application exists.
   */
  const isApplicationStatus = (status: unknown) =>
    ['pending', 'approved', 'rejected'].includes(
      String(status ?? '').toLowerCase()
    );

  const landlordApplicationStatus =
    String(
      user?.landlord_application_status ?? ''
    ).toLowerCase();

  const realEstateApplicationStatus =
    String(
      user?.real_estate_application_status ?? ''
    ).toLowerCase();

  const moverApplicationStatus =
    String(
      user?.mover_application_status ?? ''
    ).toLowerCase();

  const hasLandlordApplication =
    normalizedRole === 'landlord' ||
    isApplicationStatus(landlordApplicationStatus);

  const hasRealEstateApplication =
    normalizedRole === 'real_estate' ||
    Boolean(user?.is_agency) ||
    isApplicationStatus(realEstateApplicationStatus);

  const hasMoverApplication =
    normalizedRole === 'mover' ||
    isApplicationStatus(moverApplicationStatus);

  const [loading, setLoading] =
    useState(true);

  const [loadingMovers, setLoadingMovers] =
    useState(false);

  const [updating, setUpdating] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  /*
   * This is administrator input only.
   *
   * The note is sent to Django as part of the review action.
   * Django is responsible for persisting it.
   */
  const [adminReviewNote, setAdminReviewNote] =
    useState('');

/* ==================================================
BACK HANDLER
================================================== */

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    window.history.back();
  };

/* ==================================================
LOAD USER
================================================== */

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setError('No user ID was provided.');
      return;
    }

    void loadUser();
  }, [userId]);

/* ==================================================
LOAD MOVER WHEN MOVER SECTION IS OPENED
================================================== */

  useEffect(() => {
    if (
      section !== 'mover-kyc' &&
      section !== 'mover-form'
    ) {
      return;
    }

    if (selectedMover) {
      return;
    }

    if (!userId) {
      return;
    }

    void loadMovers();
  }, [section, selectedMover, userId]);

/* ==================================================
LOAD LANDLORD / REAL ESTATE APPLICATION DATA
================================================== */

  useEffect(() => {
    if (!userId) {
      return;
    }

    if (
      (section === 'landlord-form' ||
        section === 'real-estate-form') &&
      (hasLandlordApplication ||
        hasRealEstateApplication)
    ) {
      void loadLandlordApplication();
    }

    if (
      (section === 'landlord-properties' ||
        section === 'real-estate-properties') &&
      (hasLandlordApplication ||
        hasRealEstateApplication)
    ) {
      void loadLandlordProperties();
    }
  }, [
    section,
    userId,
    hasLandlordApplication,
    hasRealEstateApplication,
  ]);

/* ==================================================
LOAD USER
================================================== */

  const loadUser = async () => {
    if (!userId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const respAny = await protectedGet<any>(
        `/api/accounts/admin/users/?id=eq.${encodeURIComponent(
          String(userId)
        )}&is_admin=eq.true`
      );

      let data: Profile | null = null;

      if (respAny == null) {
        data = null;
      } else if (Array.isArray(respAny.items)) {
        const item =
          respAny.items.find(
            (it: any) =>
              String(
                it?.profile?.id || it?.id
              ) === String(userId)
          ) ??
          respAny.items[0] ??
          null;

        data =
          (item?.profile ?? item) as Profile | null;
      } else if (respAny.profile) {
        data = respAny.profile as Profile;
      } else if (respAny.id) {
        data = respAny as Profile;
      }

      if (!data) {
        throw new Error(
          'User profile was not found.'
        );
      }

      /* ==================================================
         LOAD LATEST SUBSCRIPTION
      ================================================== */

      let subscription: Subscription | null = null;

      /*
       * Subscription access remains role-based because subscriptions
       * belong to the active landlord / real-estate account role.
       */
      if (data.role === 'landlord') {
        const subscriptionRows =
          await protectedGet<Subscription[]>(
            `/rest/v1/landlord_subscriptions?select=id,landlord_id,plan_id,billing_cycle,status,current_period_start,current_period_end,grace_period_end,auto_renew,created_at,updated_at,paypal_subscription_id,paypal_plan_id,paypal_status,next_billing_at,cancel_at_period_end,cancelled_at,billing_amount_kes,billing_amount_usd,billing_exchange_rate,billing_exchange_rate_timestamp,plan:subscription_plans(id,name,audience,max_listings,max_units_per_listing,monthly_price_kes,annual_price_kes)&landlord_id=eq.${encodeURIComponent(
              String(userId)
            )}&order=created_at.desc&limit=1`
          );

        subscription =
          subscriptionRows?.[0] ?? null;
      }

      if (data.role === 'real_estate') {
        const subscriptionRows =
          await protectedGet<Subscription[]>(
            `/rest/v1/real_estate_subscriptions?select=id,real_estate_id,plan_id,billing_cycle,status,current_period_start,current_period_end,grace_period_end,auto_renew,created_at,updated_at,paypal_subscription_id,paypal_plan_id,paypal_status,next_billing_at,cancel_at_period_end,cancelled_at,billing_amount_kes,billing_amount_usd,billing_exchange_rate,billing_exchange_rate_timestamp,plan:subscription_plans(id,name,audience,max_listings,max_units_per_listing,monthly_price_kes,annual_price_kes)&real_estate_id=eq.${encodeURIComponent(
              String(userId)
            )}&order=created_at.desc&limit=1`
          );

        subscription =
          subscriptionRows?.[0] ?? null;
      }

      setUser({
        ...data,
        subscription,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load user.'
      );

      setUser(null);
    } finally {
      setLoading(false);
    }
  };

/* ==================================================
LOAD LANDLORD APPLICATION
================================================== */

  const loadLandlordApplication = async () => {
    /*
     * Do not gate this by role.
     *
     * Pending/rejected applications are intentionally assigned the
     * renter role by the canonical Django status service.
     */
    if (!userId) {
      return;
    }

    setLoadingLandlordApplication(true);
    setError(null);

    try {
      const respAny = await protectedGet<any>(
        `/api/accounts/admin/users/?id=eq.${encodeURIComponent(
          String(userId)
        )}&is_admin=eq.true`
      );

      let data: Profile | null = null;

      if (respAny == null) {
        data = null;
      } else if (Array.isArray(respAny.items)) {
        const item =
          respAny.items.find(
            (it: any) =>
              String(
                it?.profile?.id || it?.id
              ) === String(userId)
          ) ??
          respAny.items[0] ??
          null;

        data =
          (item?.profile ?? item) as Profile | null;
      } else if (respAny.profile) {
        data = respAny.profile as Profile;
      } else if (respAny.id) {
        data = respAny as Profile;
      }

      if (!data) {
        setLandlordApplication(null);
        return;
      }

      setLandlordApplication({
        id: data.id,
        user_id: data.id,
        email: data.email ?? null,
        full_name: data.full_name ?? null,
        first_name: data.first_name ?? null,
        middle_name: data.middle_name ?? null,
        last_name: data.last_name ?? null,
        phone: data.phone ?? null,
        national_id: data.national_id ?? null,
        city: data.city ?? null,
        county: data.county ?? null,
        is_agency: data.is_agency ?? null,
        id_document_url:
          data.id_document_url ?? null,
        id_document_type:
          data.id_document_type ?? null,
        landlord_application_status:
          data.landlord_application_status ?? null,
        real_estate_application_status:
          data.real_estate_application_status ?? null,
        verification_status:
          data.verification_status ?? null,
        kyc_completed:
          data.kyc_completed ?? null,
        admin_review_note:
          data.admin_review_note ?? null,
        created_at:
          data.created_at ?? null,
        updated_at:
          data.updated_at ?? null,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load landlord application.'
      );

      setLandlordApplication(null);
    } finally {
      setLoadingLandlordApplication(false);
    }
  };

/* ==================================================
UPDATE LANDLORD / REAL ESTATE APPLICATION STATUS
================================================== */

  const updateLandlordApplicationStatus = async (
    status: ReviewStatus,
    reviewNote?: string
  ) => {
    if (!userId || !landlordApplication) {
      return;
    }

    setUpdating(true);
    setError(null);

    const note =
      reviewNote?.trim() || null;

    try {
      /*
       * Determine the application being reviewed.
       *
       * This does NOT update the profile locally.
       * Django owns the resulting role, KYC, verification and
       * application state.
       */
      const applicationType =
        landlordApplication.is_agency === true
          ? 'real_estate'
          : 'landlord';

      /*
       * Canonical Django application-status endpoint.
       *
       * The frontend sends only the review action and optional
       * administrator note.
       *
       * Django is responsible for:
       * - application status
       * - role transition
       * - KYC state
       * - verification state
       * - review metadata
       * - notification email
       */
      await protectedPatch(
        `/api/accounts/admin/users/${encodeURIComponent(
          String(userId)
        )}/application-status/`,
        {
          application_type: applicationType,
          status,
          admin_review_note: note,
        }
      );

      /*
       * The backend has now saved the canonical state.
       *
       * Do not manufacture a new local Profile or KYC state.
       * Reload the authoritative backend representation.
       */
      setAdminReviewNote(note || '');

      await loadUser();
      await loadLandlordApplication();
    } catch (err) {
      console.error(
        'Failed to update landlord/real-estate application:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update application status.'
      );
    } finally {
      setUpdating(false);
    }
  };

/* ==================================================
LOAD LANDLORD PROPERTIES
================================================== */

  const loadLandlordProperties = async () => {
    /*
     * Do not gate property loading by role.
     * A pending/rejected applicant may still retain application context.
     */
    if (!userId) {
      return;
    }

    setLoadingProperties(true);
    setError(null);

    try {
      const rows = await protectedGet<Listing[]>(
        `/rest/v1/listings?select=${LISTING_SELECT}&user_id=eq.${encodeURIComponent(
          String(userId)
        )}&order=updated_at.desc`
      );

      const listingRows = rows || [];

      const listingIds = listingRows.map(
        (listing) => String(listing.id)
      );

      let mediaRows: ListingMedia[] = [];

      if (listingIds.length > 0) {
        const mediaResponse =
          await protectedGet<ListingMedia[]>(
            `/rest/v1/listing_media?select=id,listing_id,user_id,url,label,media_type,position,created_at&listing_id=in.(${listingIds.join(
              ','
            )})&order=position.asc.nullsfirst=false&order=created_at.asc`
          );

        mediaRows = mediaResponse || [];
      }

      const mediaByListingId =
        new Map<string, ListingMedia[]>();

      for (const media of mediaRows) {
        const lid = String(media.listing_id);

        if (!mediaByListingId.has(lid)) {
          mediaByListingId.set(lid, []);
        }

        mediaByListingId
          .get(lid)!
          .push(media);
      }

      setProperties(
        listingRows.map((listing) => ({
          ...listing,
          media:
            mediaByListingId.get(
              String(listing.id)
            ) || [],
        }))
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load landlord properties.'
      );

      setProperties([]);
    } finally {
      setLoadingProperties(false);
    }
  };

/* ==================================================
HYDRATE MOVER APPLICATION
================================================== */

  const hydrateMoverApplication = (
    mover: MoverWithProfile | null,
    profile: Profile | null = null
  ): MoverApplication | null => {
    if (!mover) {
      return null;
    }

    const fallbackProfile =
      mover.profile ?? profile;

    const rawMover =
      mover as MoverWithProfile & {
        rate_per_km_kes?: number | null;
        insurance_policy_details?: string | null;
        vehicle_inspection_expiry?: string | null;
        terms_accepted?: boolean;
        latitude?: number | null;
        longitude?: number | null;
        location?: string | null;
        reviewed_by?: string | null;
        reviewed_at?: string | null;
        submitted_at?: string | null;
      };

    const status =
      String(
        (
          mover as MoverWithProfile & {
            approval_status?: string;
          }
        ).approval_status || 'pending'
      ).toLowerCase();

    return {
      id: mover.id,
      applicant_id: mover.user_id,
      applicant_email:
        fallbackProfile?.email ?? null,
      applicant_name: String(
        fallbackProfile?.full_name ||
          mover.driver_full_name ||
          'Applicant'
      ),
      application_type: 'mover',

      driver_full_name:
        mover.driver_full_name || '',

      national_id:
        mover.national_id || '',

      dl_number:
        mover.dl_number || '',

      dl_photo_url:
        mover.dl_photo_url || null,

      vehicle_type:
        mover.vehicle_type || '',

      number_plate:
        mover.number_plate || '',

      capacity_details:
        mover.capacity_details || '',

      operating_city:
        mover.operating_city || '',

      operating_county:
        mover.operating_county || '',

      phone:
        mover.phone || '',

      base_rate_kes:
        typeof mover.base_rate_kes === 'number'
          ? mover.base_rate_kes
          : null,

      rate_per_km_kes:
        typeof rawMover.rate_per_km_kes === 'number'
          ? rawMover.rate_per_km_kes
          : null,

      payment_channel:
        mover.payment_channel || '',

      payment_account:
        mover.payment_account || '',

      insurance_policy_details:
        rawMover.insurance_policy_details || '',

      vehicle_inspection_expiry:
        rawMover.vehicle_inspection_expiry ?? null,

      liability_accepted:
        Boolean(mover.liability_accepted),

      terms_accepted:
        Boolean(rawMover.terms_accepted),

      reference_contacts:
        Array.isArray(
          mover.reference_contacts
        )
          ? mover.reference_contacts
          : [],

      latitude:
        rawMover.latitude ?? null,

      longitude:
        rawMover.longitude ?? null,

      location:
        rawMover.location ?? null,

      status:
        status === 'approved'
          ? 'approved'
          : status === 'rejected'
            ? 'rejected'
            : 'pending',

      reviewed_by:
        rawMover.reviewed_by ?? null,

      reviewed_at:
        rawMover.reviewed_at ?? null,

      review_notes:
        fallbackProfile?.admin_review_note ??
        null,

      submitted_at:
        rawMover.submitted_at ??
        mover.created_at ??
        new Date().toISOString(),

      created_at:
        mover.created_at ??
        new Date().toISOString(),

      updated_at:
        mover.updated_at ??
        new Date().toISOString(),
    };
  };

/* ==================================================
BUILD APPLICATION-ONLY MOVER ROW
================================================== */

  const buildMoverApplicationRow = (
    application: any
  ): MoverWithProfile => {
    return {
      /*
       * IMPORTANT:
       * This is the application ID, NOT a Mover.id.
       *
       * is_application prevents this ID from ever being passed
       * to the canonical Mover endpoint.
       */
      id: application.id,
      user_id: userId,

      driver_full_name:
        application.driver_full_name ||
        application.applicant_name ||
        '',

      business_name:
        application.applicant_name ||
        application.applicant_email ||
        '',

      national_id:
        application.national_id || '',

      dl_number:
        application.dl_number || '',

      dl_photo_url:
        application.dl_photo_url || null,

      vehicle_type:
        application.vehicle_type || '',

      number_plate:
        application.number_plate || '',

      operating_city:
        application.operating_city || '',

      operating_county:
        application.operating_county || '',

      phone:
        application.phone || '',

      profile_photo_url: null,

      base_rate_kes:
        application.base_rate_kes ?? null,

      capacity_details:
        application.capacity_details || '',

      is_available: false,

      approval_status:
        application.status === 'pending'
          ? 'pending_review'
          : application.status,

      working_days:
        Array.isArray(application.working_days)
          ? application.working_days
          : [],

      start_time:
        application.start_time ?? null,

      end_time:
        application.end_time ?? null,

      payment_channel:
        application.payment_channel || '',

      payment_account:
        application.payment_account || '',

      liability_accepted:
        Boolean(
          application.liability_accepted
        ),

      reference_contacts:
        Array.isArray(
          application.reference_contacts
        )
          ? application.reference_contacts
          : [],

      created_at:
        application.submitted_at ??
        new Date().toISOString(),

      updated_at:
        application.submitted_at ??
        new Date().toISOString(),

      is_application: true,
    } as unknown as MoverWithProfile;
  };

/* ==================================================
LOAD MOVERS FOR CURRENT USER
================================================== */

  const loadMovers = async () => {
    if (!userId) {
      return;
    }

    setLoadingMovers(true);
    setError(null);

    try {
      /*
       * First look for the canonical Mover record.
       */
      const moverRows =
        await protectedGet<Mover[]>(
          `/rest/v1/movers?select=${MOVER_SELECT}&user_id=eq.${encodeURIComponent(
            String(userId)
          )}&order=created_at.desc`
        );

      let rows: MoverWithProfile[] =
        (moverRows || []).map(
          (mover) => ({
            ...mover,
            is_application: false,
          })
        );

      /*
       * If there is no canonical Mover record, look for the
       * MoverApplication through the Django admin endpoint.
       *
       * This is only for displaying an application before the
       * backend materializes the canonical Mover.
       */
      if (rows.length === 0) {
        try {
          const adminApp =
            await protectedGet<{
              application?: any;
            }>(
              `/api/accounts/admin/users/${encodeURIComponent(
                String(userId)
              )}/mover-application/`
            );

          const application =
            adminApp?.application ?? null;

          if (application) {
            rows = [
              buildMoverApplicationRow(
                application
              ),
            ];
          }
        } catch (appErr) {
          console.debug(
            'Failed to fetch mover application fallback',
            appErr
          );
        }
      }

      if (rows.length === 0) {
        setMovers([]);
        setSelectedMover(null);
        setMoverApplication(null);
        return;
      }

      /*
       * Load the Profile associated with the user.
       */
      const userIds = [
        ...new Set(
          rows
            .map((mover) => mover.user_id)
            .filter(Boolean)
        ),
      ];

      let profiles: Profile[] = [];

      if (userIds.length > 0) {
        const profileRows =
          await protectedGet<Profile[]>(
            `/rest/v1/profiles?select=${PROFILE_SELECT}&id=in.(${userIds
              .map((id) =>
                encodeURIComponent(
                  String(id)
                )
              )
              .join(',')})`
          );

        profiles = profileRows || [];
      }

      const combined: MoverWithProfile[] =
        rows.map((mover) => ({
          ...mover,
          profile:
            profiles.find(
              (profile) =>
                profile.id ===
                mover.user_id
            ) || null,
        }));

      setMovers(combined);

      if (combined.length === 1) {
        const firstMover =
          combined[0];

        setSelectedMover(firstMover);

        setMoverApplication(
          hydrateMoverApplication(
            firstMover,
            firstMover.profile
          )
        );

        setAdminReviewNote(
          firstMover.profile
            ?.admin_review_note || ''
        );
      } else {
        setMoverApplication(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load mover registration.'
      );

      setMovers([]);
    } finally {
      setLoadingMovers(false);
    }
  };

/* ==================================================
GET CANONICAL MOVER BY USER
================================================== */

  const getMoverByUserId = async (
    targetUserId: string
  ): Promise<MoverWithProfile | null> => {
    try {
      /*
       * IMPORTANT:
       * We deliberately query by user_id rather than using the
       * MoverApplication.id.
       *
       * After approval Django materializes the canonical Mover
       * using this user's ID.
       */
      const moverRows =
        await protectedGet<Mover[]>(
          `/rest/v1/movers?select=${MOVER_SELECT}&user_id=eq.${encodeURIComponent(
            String(targetUserId)
          )}&order=created_at.desc&limit=1`
        );

      const mover =
        moverRows?.[0] ?? null;

      if (!mover) {
        return null;
      }

      let profile: Profile | null =
        null;

      if (mover.user_id) {
        const profileRows =
          await protectedGet<Profile[]>(
            `/rest/v1/profiles?select=${PROFILE_SELECT}&id=eq.${encodeURIComponent(
              String(mover.user_id)
            )}&limit=1`
          );

        profile =
          profileRows?.[0] ?? null;
      }

      return {
        ...mover,
        profile,
        is_application: false,
      };
    } catch (err) {
      console.error(
        'Unexpected error loading canonical mover:',
        err
      );

      return null;
    }
  };

/* ==================================================
GET SINGLE CANONICAL MOVER
================================================== */

  const getMover = async (
    moverId: string
  ): Promise<MoverWithProfile | null> => {
    try {
      /*
       * This function is ONLY for canonical Mover IDs.
       *
       * Application IDs must never reach this function.
       */
      const moverRows =
        await protectedGet<Mover[]>(
          `/rest/v1/movers?select=${MOVER_SELECT}&id=eq.${encodeURIComponent(
            moverId
          )}&limit=1`
        );

      const mover =
        moverRows?.[0] ?? null;

      if (!mover) {
        return null;
      }

      let profile: Profile | null =
        null;

      if (mover.user_id) {
        const profileRows =
          await protectedGet<Profile[]>(
            `/rest/v1/profiles?select=${PROFILE_SELECT}&id=eq.${encodeURIComponent(
              mover.user_id
            )}&limit=1`
          );

        profile =
          profileRows?.[0] ?? null;
      }

      const refreshedMover: MoverWithProfile = {
        ...mover,
        profile,
        is_application: false,
      };

      setMoverApplication(
        hydrateMoverApplication(
          refreshedMover,
          profile
        )
      );

      return refreshedMover;
    } catch (err) {
      console.error(
        'Unexpected error loading mover:',
        err
      );

      return null;
    }
  };

/* ==================================================
UPDATE MOVER STATUS
================================================== */

  const updateMoverStatus = async (
    mover: MoverWithProfile,
    status: ReviewStatus,
    reviewNote?: string
  ) => {
    if (!mover.user_id) {
      setError(
        'Cannot update application: missing user id.'
      );
      return;
    }

    setUpdating(true);
    setError(null);

    const note =
      reviewNote?.trim() || null;

    try {
      /*
       * ==================================================
       * CANONICAL DJANGO STATUS UPDATE
       * ==================================================
       *
       * The frontend does NOT create/update a Mover.
       * The frontend does NOT update Profile/KYC.
       * The frontend does NOT set availability.
       *
       * Django owns all of those transitions.
       */
      await protectedPatch(
        `/api/accounts/admin/users/${encodeURIComponent(
          String(mover.user_id)
        )}/application-status/`,
        {
          application_type: 'mover',
          status,
          admin_review_note: note,
        }
      );

      /*
       * ==================================================
       * REFRESH AUTHORITATIVE BACKEND STATE
       * ==================================================
       *
       * Approval is special:
       *
       * Django materializes the canonical Mover from the
       * MoverApplication.
       *
       * Therefore we MUST NOT use:
       *
       *     mover.id
       *
       * when the current row came from MoverApplication.
       *
       * Instead, find the canonical Mover by user_id.
       */
      const canonicalMover =
        await getMoverByUserId(
          String(mover.user_id)
        );

      if (canonicalMover) {
        /*
         * Django has now produced the canonical Mover.
         */
        setSelectedMover(
          canonicalMover
        );

        setMovers((current) => {
          /*
           * Replace any application-only row with
           * the canonical Mover.
           */
          const withoutApplicationRow =
            current.filter(
              (item) =>
                !(
                  item.is_application &&
                  item.user_id ===
                    canonicalMover.user_id
                )
            );

          const existingIndex =
            withoutApplicationRow.findIndex(
              (item) =>
                item.id ===
                canonicalMover.id
            );

          if (existingIndex >= 0) {
            return withoutApplicationRow.map(
              (item, index) =>
                index === existingIndex
                  ? canonicalMover
                  : item
            );
          }

          return [
            ...withoutApplicationRow,
            canonicalMover,
          ];
        });

        setMoverApplication(
          hydrateMoverApplication(
            canonicalMover,
            canonicalMover.profile
          )
        );

        setAdminReviewNote(
          canonicalMover.profile
            ?.admin_review_note ||
            note ||
            ''
        );
      } else {
        /*
         * No canonical Mover exists.
         *
         * This is valid for an application that is still pending
         * or rejected.
         *
         * Reload the application representation rather than
         * pretending the application ID is a Mover ID.
         */
        const adminApp =
          await protectedGet<{
            application?: any;
          }>(
            `/api/accounts/admin/users/${encodeURIComponent(
              String(mover.user_id)
            )}/mover-application/`
          );

        const application =
          adminApp?.application ?? null;

        if (application) {
          const applicationMover =
            buildMoverApplicationRow(
              application
            );

          let profile: Profile | null =
            null;

          try {
            const profileRows =
              await protectedGet<Profile[]>(
                `/rest/v1/profiles?select=${PROFILE_SELECT}&id=eq.${encodeURIComponent(
                  String(mover.user_id)
                )}&limit=1`
              );

            profile =
              profileRows?.[0] ?? null;
          } catch {
            profile = mover.profile ?? null;
          }

          const refreshedApplicationMover: MoverWithProfile =
            {
              ...applicationMover,
              profile,
            };

          setSelectedMover(
            refreshedApplicationMover
          );

          setMovers((current) => {
            const filtered =
              current.filter(
                (item) =>
                  !(
                    item.user_id ===
                      mover.user_id &&
                    item.is_application
                  )
              );

            return [
              ...filtered,
              refreshedApplicationMover,
            ];
          });

          setMoverApplication(
            hydrateMoverApplication(
              refreshedApplicationMover,
              profile
            )
          );

          setAdminReviewNote(
            application.review_notes ||
              profile?.admin_review_note ||
              note ||
              ''
          );
        } else {
          /*
           * Backend no longer has an application or mover.
           * Refresh the list so the UI reflects reality.
           */
          setSelectedMover(null);
          setMoverApplication(null);
          await loadMovers();
        }
      }

      /*
       * Reload the parent Profile from Django.
       *
       * No frontend state machine is applied here.
       */
      if (
        userId &&
        mover.user_id === userId
      ) {
        await loadUser();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update mover status.'
      );
    } finally {
      setUpdating(false);
    }
  };

/* ==================================================
OPEN MOVER REVIEW
================================================== */

  const openMoverReview = (
    mover: MoverWithProfile
  ) => {
    setSelectedMover(mover);

    setMoverApplication(
      hydrateMoverApplication(
        mover,
        mover.profile
      )
    );

    setAdminReviewNote(
      mover.profile
        ?.admin_review_note || ''
    );

    setSection('mover-kyc');
    setError(null);
  };

/* ==================================================
GET NORMALIZED STATUS
================================================== */

  const getStatus = (
    mover: Mover
  ): ReviewStatus => {
    const status =
      String(
        mover.approval_status || ''
      ).toLowerCase();

    if (
      status === 'approved' ||
      status === 'rejected'
    ) {
      return status;
    }

    return 'pending';
  };

/* ==================================================
STATUS BADGE
================================================== */

  const statusBadge = (
    status: ReviewStatus
  ) => {
    if (status === 'approved') {
      return (
        <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
          <CheckCircle2 className="h-3 w-3" />
          Approved
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
      <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    );
  };

/* ==================================================
DISPLAY NAME
================================================== */

  const displayName = (
    profile?: Profile | null
  ) =>
    profile?.full_name ||
    [
      profile?.first_name,
      profile?.middle_name,
      profile?.last_name,
    ]
      .filter(Boolean)
      .join(' ') ||
    'Unnamed User';

/* ==================================================
LOADING
================================================== */

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[500px] max-w-7xl items-center justify-center px-2">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-600" />

          <p className="mt-3 text-sm text-gray-500">
            Loading user...
          </p>
        </div>
      </div>
    );
  }

/* ==================================================
USER NOT FOUND
================================================== */

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-2 py-8">
        <button
          type="button"
          onClick={handleBack}
          className="btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="card mt-6 p-8 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-error-500" />

          <p className="mt-3 font-semibold">
            User not found.
          </p>

          {(() => {
            const displayError =
              error ===
              'User profile was not found.'
                ? 'The requested user does not exist.'
                : error;

            return displayError ? (
              <p className="mt-2 text-sm text-error-600">
                {displayError}
              </p>
            ) : null;
          })()}
        </div>
      </div>
    );
  }

/* ==================================================
MOVER REVIEW
================================================== */

  if (
    selectedMover &&
    (
      section === 'mover-kyc' ||
      section === 'mover-form'
    )
  ) {
    const moverProfile =
      selectedMover.profile;

    const moverStatus =
      getStatus(selectedMover);

    return (
      <div className="mx-auto max-w-[1600px] px-2 py-6 sm:px-6 lg:px-8">

        {/* Back */}
        <div className="mb-5">
          <button
            type="button"
            disabled={updating}
            onClick={() => {
              setSelectedMover(null);
              setSection('overview');
              setAdminReviewNote('');
              setError(null);
            }}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-brand-600 disabled:opacity-50 dark:text-gray-300 dark:hover:text-brand-400"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>
        </div>

        {/* Header */}
        <div className="card mb-5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-brand-100 font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                {selectedMover.profile_photo_url ? (
                  <img
                    src={
                      selectedMover.profile_photo_url
                    }
                    alt={
                      selectedMover.driver_full_name ||
                      'Mover'
                    }
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Truck className="h-6 w-6" />
                )}
              </div>

              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedMover.driver_full_name ||
                    'Unnamed Mover'}
                </h1>

                <p className="text-sm text-gray-500">
                  {selectedMover.business_name ||
                    'Mover Registration'}
                </p>
              </div>
            </div>

            {statusBadge(moverStatus)}
          </div>
        </div>

        {/* Split Screen */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* LEFT - KYC */}
          <div className="card overflow-hidden">
            <div className="border-b border-gray-200 bg-brand-50 px-5 py-4 dark:border-brand-800 dark:bg-brand-900/40">
              <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                <ShieldCheck className="h-5 w-5 text-brand-600" />
                Mover KYC
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Identity and verification information.
              </p>
            </div>

            <div className="space-y-5 p-5">

              <div className="grid gap-3 sm:grid-cols-2">
                <Info
                  label="Full Name"
                  value={
                    moverProfile?.full_name ||
                    selectedMover.driver_full_name
                  }
                  icon={User}
                />

                <Info
                  label="National ID"
                  value={
                    moverProfile?.national_id ||
                    selectedMover.national_id
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Driving Licence"
                  value={
                    moverProfile?.dl_number ||
                    selectedMover.dl_number
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Phone"
                  value={
                    moverProfile?.phone ||
                    selectedMover.phone
                  }
                  icon={Phone}
                />

                <Info
                  label="Email"
                  value={moverProfile?.email}
                  icon={Mail}
                />

                <Info
                  label="KYC Status"
                  value={
                    moverProfile?.kyc_completed
                      ? 'Completed'
                      : 'Not completed'
                  }
                  icon={ShieldCheck}
                />

                <Info
                  label="Verification"
                  value={
                    moverProfile?.verification_status
                  }
                  icon={ShieldCheck}
                />

                <Info
                  label="ID Document Type"
                  value={
                    moverProfile?.id_document_type
                  }
                  icon={FileText}
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-gray-900 dark:text-white">
                  KYC Documents
                </h3>

                <div className="space-y-2">

                  {moverProfile?.id_document_url && (
                    <DocumentRow
                      title="National ID Document"
                      description="Document uploaded"
                      url={
                        moverProfile.id_document_url
                      }
                      onOpen={async (path) => {
                        const message =
                          await openKycDocument(
                            path,
                            'id'
                          );

                        if (message) {
                          setError(message);
                        }
                      }}
                    />
                  )}

                  {moverProfile?.id_photo_url && (
                    <DocumentRow
                      title="ID Photo"
                      description="Document uploaded"
                      url={
                        moverProfile.id_photo_url
                      }
                      onOpen={async (path) => {
                        const message =
                          await openKycDocument(
                            path,
                            'id'
                          );

                        if (message) {
                          setError(message);
                        }
                      }}
                    />
                  )}

                  {moverProfile?.profile_photo_url && (
                    <DocumentRow
                      title="Profile Photo"
                      description="Photo uploaded"
                      url={
                        moverProfile.profile_photo_url
                      }
                      onOpen={async (path) => {
                        const message =
                          await openKycDocument(
                            path,
                            'id'
                          );

                        if (message) {
                          setError(message);
                        }
                      }}
                    />
                  )}

                  {moverProfile?.selfie_url && (
                    <DocumentRow
                      title="Selfie Photo"
                      description="Photo uploaded"
                      url={
                        moverProfile.selfie_url
                      }
                      onOpen={async (path) => {
                        const message =
                          await openKycDocument(
                            path,
                            'id'
                          );

                        if (message) {
                          setError(message);
                        }
                      }}
                    />
                  )}

                  {selectedMover.dl_photo_url && (
                    <DocumentRow
                      title="DL Photo"
                      description="Document uploaded"
                      url={
                        selectedMover.dl_photo_url
                      }
                      onOpen={async (path) => {
                        const message =
                          await openKycDocument(
                            path,
                            'id'
                          );

                        if (message) {
                          setError(message);
                        }
                      }}
                    />
                  )}

                  {!moverProfile?.id_document_url &&
                    !moverProfile?.id_photo_url &&
                    !moverProfile?.profile_photo_url &&
                    !moverProfile?.selfie_url &&
                    !selectedMover.dl_photo_url && (
                      <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-brand-900/40">
                        No KYC documents uploaded.
                      </div>
                    )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4 dark:border-brand-800">
                <p className="text-xs font-semibold uppercase text-gray-500">
                  Verification
                </p>

                <div className="mt-3">
                  {statusBadge(moverStatus)}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT - REGISTRATION */}
          <div className="card overflow-hidden">
            <div className="border-b border-gray-200 bg-success-50 px-5 py-4 dark:border-brand-800 dark:bg-success-900/10">
              <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                <FileText className="h-5 w-5 text-success-600" />
                Mover Registration
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Information submitted during mover registration.
              </p>
            </div>

            <div className="space-y-5 p-5">

              <div className="grid gap-3 sm:grid-cols-2">

                <Info
                  label="Driver Name"
                  value={
                    selectedMover.driver_full_name
                  }
                  icon={User}
                />

                <Info
                  label="Business"
                  value={
                    selectedMover.business_name
                  }
                  icon={Building2}
                />

                <Info
                  label="National ID"
                  value={
                    selectedMover.national_id
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Driving Licence"
                  value={
                    selectedMover.dl_number
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Vehicle"
                  value={
                    selectedMover.vehicle_type
                  }
                  icon={Car}
                />

                <Info
                  label="Number Plate"
                  value={
                    selectedMover.number_plate
                  }
                  icon={Truck}
                />

                <Info
                  label="Operating City"
                  value={
                    selectedMover.operating_city
                  }
                  icon={MapPin}
                />

                <Info
                  label="Operating County"
                  value={
                    selectedMover.operating_county
                  }
                  icon={MapPin}
                />

                <Info
                  label="Phone"
                  value={
                    selectedMover.phone
                  }
                  icon={Phone}
                />

                <Info
                  label="Base Rate"
                  value={
                    selectedMover.base_rate_kes != null
                      ? `KES ${Number(
                          selectedMover.base_rate_kes
                        ).toLocaleString('en-KE')}`
                      : null
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Availability"
                  value={
                    selectedMover.is_available
                      ? 'Available'
                      : 'Unavailable'
                  }
                  icon={CheckCircle2}
                />

                <Info
                  label="Start Time"
                  value={
                    selectedMover.start_time
                  }
                  icon={Clock}
                />

                <Info
                  label="End Time"
                  value={
                    selectedMover.end_time
                  }
                  icon={Clock}
                />

                <Info
                  label="Payment Channel"
                  value={
                    selectedMover.payment_channel
                  }
                  icon={CreditCard}
                />

                <Info
                  label="Payment Account"
                  value={
                    selectedMover.payment_account
                  }
                  icon={CreditCard}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Capacity
                </p>

                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-brand-900/40 dark:text-gray-300">
                  {formatValue(
                    selectedMover.capacity_details
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Working Days
                </p>

                <div className="flex flex-wrap gap-2">
                  {Array.isArray(
                    selectedMover.working_days
                  ) &&
                  selectedMover.working_days.length > 0 ? (
                    selectedMover.working_days.map(
                      (day) => (
                        <span
                          key={String(day)}
                          className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200"
                        >
                          {String(day)}
                        </span>
                      )
                    )
                  ) : (
                    <span className="text-sm text-gray-500">
                      —
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Liability Agreement
                </p>

                <span
                  className={cn(
                    'badge',
                    selectedMover.liability_accepted
                      ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                      : 'bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400'
                  )}
                >
                  {selectedMover.liability_accepted
                    ? 'Accepted'
                    : 'Not Accepted'}
                </span>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  References
                </p>

                <div className="space-y-2">
                  {Array.isArray(
                    selectedMover.reference_contacts
                  ) &&
                  selectedMover.reference_contacts.length > 0 ? (
                    selectedMover.reference_contacts.map(
                      (
                        reference: {
                          name?: string;
                          phone?: string;
                          relationship?: string;
                        },
                        index: number
                      ) => (
                        <div
                          key={`${reference.phone || 'reference'}-${index}`}
                          className="rounded-lg bg-gray-50 p-3 dark:bg-brand-900/40"
                        >
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {reference.name ||
                              'Unnamed Reference'}
                          </p>

                          <p className="text-xs text-gray-500">
                            {reference.phone ||
                              'No phone'}
                          </p>

                          <p className="text-xs capitalize text-gray-500">
                            {reference.relationship ||
                              'Relationship not provided'}
                          </p>
                        </div>
                      )
                    )
                  ) : (
                    <span className="text-sm text-gray-500">
                      No references provided.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Registration Date
                </p>

                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDate(
                    selectedMover.created_at
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================
            ADMIN REVIEW NOTE
        ================================================== */}

        <div className="card mt-5 p-5">
          <div className="mb-3">
            <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              <FileText className="h-5 w-5 text-brand-600" />
              Admin Review Note
              <span className="text-xs font-normal text-gray-500">
                (optional)
              </span>
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Add an optional message for the applicant.
              Django will save the note and include it in
              the status notification.
            </p>
          </div>

          <textarea
            value={adminReviewNote}
            onChange={(event) =>
              setAdminReviewNote(
                event.target.value
              )
            }
            disabled={updating}
            rows={4}
            maxLength={2000}
            placeholder="Optional reason, feedback, or review message..."
            className="w-full rounded-xl border border-gray-200 bg-white px-2 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-brand-800 dark:bg-brand-950 dark:text-white"
          />

          <div className="mt-2 flex justify-end">
            <span className="text-xs text-gray-400">
              {adminReviewNote.length}/2000
            </span>
          </div>
        </div>

        {/* ==================================================
            BOTTOM ACTIONS
        ================================================== */}

        <div className="card mt-5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <button
              type="button"
              disabled={updating}
              onClick={() => {
                setSelectedMover(null);
                setSection('overview');
                setAdminReviewNote('');
                setError(null);
              }}
              className="btn-secondary disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex flex-col gap-2 sm:flex-row">

              {/* REJECT */}
              <button
                type="button"
                disabled={updating}
                onClick={() =>
                  void updateMoverStatus(
                    selectedMover,
                    'rejected',
                    adminReviewNote
                  )
                }
                className="rounded-lg border border-error-200 bg-error-50 px-5 py-2.5 text-sm font-semibold text-error-700 hover:bg-error-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-400"
              >
                {updating ? (
                  <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 inline h-4 w-4" />
                )}

                {updating
                  ? 'Updating...'
                  : 'Reject'}
              </button>

              {/* PENDING */}
              <button
                type="button"
                disabled={updating}
                onClick={() =>
                  void updateMoverStatus(
                    selectedMover,
                    'pending',
                    adminReviewNote
                  )
                }
                className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updating ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Clock className="mr-2 h-4 w-4" />
                )}

                {updating
                  ? 'Updating...'
                  : 'Set Pending'}
              </button>

              {/* APPROVE */}
              <button
                type="button"
                disabled={updating}
                onClick={() =>
                  void updateMoverStatus(
                    selectedMover,
                    'approved',
                    adminReviewNote
                  )
                }
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updating ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}

                {updating
                  ? 'Updating...'
                  : 'Approve'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-error-50 px-2 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
            {error}
          </div>
        )}
      </div>
    );
  }

/* ==================================================
NORMAL USER DETAILS
================================================== */

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8">

      {/* Back */}
      <button
        type="button"
        onClick={handleBack}
        className="mb-5 inline-flex items-center gap-2 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-brand-800"
        title="Back"
      >
        <ArrowLeft className="h-6 w-6" />
      </button>

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-lg bg-error-50 px-2 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {/* User header */}
      <div className="card mb-5 overflow-hidden">

        <div className="bg-gradient-to-r from-brand-50 to-brand-100 p-6 dark:from-brand-900/40 dark:to-brand-950">

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">

            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-200 text-2xl font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">

              {user.profile_photo_url ? (
                <img
                  src={user.profile_photo_url}
                  alt={displayName(user)}
                  className="h-full w-full object-cover"
                />
              ) : (
                user.first_name?.charAt(0) ||
                user.full_name?.charAt(0) ||
                'U'
              )}

            </div>

            <div className="flex-1">

              <div className="flex flex-wrap items-center gap-2">

                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {displayName(user)}
                </h1>

                <span className="badge bg-brand-50 capitalize text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                  {formatValue(user.role)}
                </span>

              </div>

              <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">

                {user.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {user.email}
                  </span>
                )}

                {user.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {user.phone}
                  </span>
                )}

                {user.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {user.city}
                  </span>
                )}

              </div>
            </div>

            <div>
              {user.verification_status ===
              'verified' ? (
                <span className="badge bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Approved
                </span>
              ) : user.verification_status ===
                'rejected' ? (
                <span className="badge bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400">
                  <XCircle className="h-3 w-3" />
                  Rejected
                </span>
              ) : (
                <span className="badge bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                  <Clock className="h-3 w-3" />
                  Pending
                </span>
              )}
            </div>

          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap gap-2 border-t border-gray-200 p-4 dark:border-brand-800">

          <button
            type="button"
            onClick={() =>
              setSection('overview')
            }
            className={cn(
              'btn-secondary',
              section === 'overview' &&
                'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
            )}
          >
            <User className="h-4 w-4" />
            Overview
          </button>

          {hasLandlordApplication && (
            <>
              <button
                type="button"
                onClick={() =>
                  setSection('landlord-kyc')
                }
                className={cn(
                  'btn-secondary',
                  section === 'landlord-kyc' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                Landlord KYC
              </button>

              <button
                type="button"
                onClick={() =>
                  setSection('landlord-form')
                }
                className={cn(
                  'btn-secondary',
                  section === 'landlord-form' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <FileText className="h-4 w-4" />
                Landlord Registration
              </button>

              <button
                type="button"
                onClick={() =>
                  setSection('landlord-properties')
                }
                className={cn(
                  'btn-secondary',
                  section === 'landlord-properties' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <Building2 className="h-4 w-4" />
                Properties
              </button>

              <button
                type="button"
                onClick={() =>
                  setSection('landlord-subscription')
                }
                className={cn(
                  'btn-secondary',
                  section === 'landlord-subscription' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <CreditCard className="h-4 w-4" />
                Subscription
              </button>
            </>
          )}

          {hasRealEstateApplication && (
            <>
              <button
                type="button"
                onClick={() =>
                  setSection('real-estate-kyc')
                }
                className={cn(
                  'btn-secondary',
                  section === 'real-estate-kyc' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                Real Estate KYC
              </button>

              <button
                type="button"
                onClick={() =>
                  setSection('real-estate-form')
                }
                className={cn(
                  'btn-secondary',
                  section === 'real-estate-form' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <FileText className="h-4 w-4" />
                Real Estate Registration
              </button>

              <button
                type="button"
                onClick={() =>
                  setSection('real-estate-properties')
                }
                className={cn(
                  'btn-secondary',
                  section === 'real-estate-properties' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <Building2 className="h-4 w-4" />
                Properties
              </button>

              <button
                type="button"
                onClick={() =>
                  setSection('real-estate-subscription')
                }
                className={cn(
                  'btn-secondary',
                  section === 'real-estate-subscription' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <CreditCard className="h-4 w-4" />
                Subscription
              </button>
            </>
          )}

          {hasMoverApplication && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedMover(null);
                  setSection('mover-kyc');
                }}
                className={cn(
                  'btn-secondary',
                  section === 'mover-kyc' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                Mover KYC
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedMover(null);
                  setSection('mover-form');
                }}
                className={cn(
                  'btn-secondary',
                  section === 'mover-form' &&
                    'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                )}
              >
                <FileText className="h-4 w-4" />
                Mover Form
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              if (hasLandlordApplication) {
                setSection('landlord-kyc');
                return;
              }

              if (hasRealEstateApplication) {
                setSection('real-estate-kyc');
                return;
              }

              if (hasMoverApplication) {
                setSelectedMover(null);
                setSection('mover-kyc');
                return;
              }

              setSection('overview');
            }}
            className="btn-primary"
          >
            <Eye className="h-4 w-4" />
            Review
          </button>

        </div>
      </div>

      {/* ==================================================
          OVERVIEW
      ================================================== */}

      {section === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">

          <div className="card p-5 lg:col-span-2">

            <h2 className="mb-4 font-bold text-gray-900 dark:text-white">
              Account Information
            </h2>

            <div className="grid gap-3 sm:grid-cols-2">

              <Info
                label="First Name"
                value={user.first_name}
                icon={User}
              />

              <Info
                label="Middle Name"
                value={user.middle_name}
                icon={User}
              />

              <Info
                label="Last Name"
                value={user.last_name}
                icon={User}
              />

              <Info
                label="Email"
                value={user.email}
                icon={Mail}
              />

              <Info
                label="Phone"
                value={user.phone}
                icon={Phone}
              />

              <Info
                label="City"
                value={user.city}
                icon={MapPin}
              />

              <Info
                label="County"
                value={user.county}
                icon={MapPin}
              />

              <Info
                label="Role"
                value={user.role}
                icon={User}
              />

              <Info
                label="KYC"
                value={
                  user.kyc_completed
                    ? 'Completed'
                    : 'Not completed'
                }
                icon={ShieldCheck}
              />

              <Info
                label="Created"
                value={formatDate(
                  user.created_at
                )}
                icon={CalendarDays}
              />

            </div>
          </div>

          <div className="card p-5">

            <h2 className="mb-4 font-bold text-gray-900 dark:text-white">
              Application Status
            </h2>

            <div className="space-y-3">

              <StatusRow
                label="Verification"
                value={
                  user.verification_status
                }
              />

              <StatusRow
                label="Landlord Application"
                value={
                  user.landlord_application_status
                }
              />

              <StatusRow
                label="Mover Application"
                value={
                  user.mover_application_status
                }
              />

              <StatusRow
                label="Admin Review Note"
                value={
                  user.admin_review_note
                }
              />

            </div>

            {user.subscription && (
              <div className="mt-5 border-t border-gray-200 pt-5 dark:border-brand-800">

                <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
                  Subscription
                </h3>

                <div className="space-y-2">

                  <StatusRow
                    label="Plan"
                    value={
                      user.subscription.plan?.name ??
                      user.subscription.plan_id
                    }
                  />

                  <StatusRow
                    label="Status"
                    value={
                      user.subscription.status
                    }
                  />

                  <StatusRow
                    label="Billing Cycle"
                    value={
                      user.subscription.billing_cycle
                    }
                  />

                  <Info
                    label="Current Period Start"
                    value={formatDate(
                      user.subscription.current_period_start
                    )}
                    icon={CalendarDays}
                  />

                  <Info
                    label="Current Period End"
                    value={formatDate(
                      user.subscription.current_period_end
                    )}
                    icon={CalendarDays}
                  />

                  {user.subscription.grace_period_end && (
                    <Info
                      label="Grace Period Ends"
                      value={formatDate(
                        user.subscription.grace_period_end
                      )}
                      icon={Clock}
                    />
                  )}

                  <StatusRow
                    label="Auto Renew"
                    value={
                      user.subscription.auto_renew
                    }
                  />

                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ==================================================
          LANDLORD KYC
      ================================================== */}

      {section === 'landlord-kyc' &&
        hasLandlordApplication && (
          <KycPanel
            title="Landlord KYC"
            user={user}
          />
        )}

      {/* ==================================================
          LANDLORD FORM
      ================================================== */}

      {section === 'landlord-form' &&
        hasLandlordApplication && (
          <LandlordForm
            user={user}
            application={landlordApplication}
            updating={updating}
            adminReviewNote={adminReviewNote}
            onReviewNoteChange={
              setAdminReviewNote
            }
            onUpdateStatus={
              updateLandlordApplicationStatus
            }
          />
        )}

      {section === 'landlord-properties' &&
        hasLandlordApplication && (
          <LandlordPropertiesPanel
            listings={properties}
            loading={loadingProperties}
          />
        )}

      {section === 'landlord-subscription' &&
        normalizedRole === 'landlord' && (
          <LandlordSubscriptionPanel
            subscription={user.subscription}
          />
        )}

      {/* ==================================================
          REAL ESTATE KYC
      ================================================== */}

      {section === 'real-estate-kyc' &&
        hasRealEstateApplication && (
          <KycPanel
            title="Real Estate Profile KYC"
            user={user}
          />
        )}

      {/* ==================================================
          REAL ESTATE FORM
      ================================================== */}

      {section === 'real-estate-form' &&
        hasRealEstateApplication && (
          <RealEstateForm
            user={user}
            application={landlordApplication}
            updating={updating}
            adminReviewNote={adminReviewNote}
            onReviewNoteChange={
              setAdminReviewNote
            }
            onUpdateStatus={
              updateLandlordApplicationStatus
            }
          />
        )}

      {/* ==================================================
          REAL ESTATE PROPERTIES
      ================================================== */}

      {section === 'real-estate-properties' &&
        hasRealEstateApplication && (
          <RealEstatePropertiesPanel
            listings={properties}
            loading={loadingProperties}
          />
        )}

      {/* ==================================================
          REAL ESTATE SUBSCRIPTION
      ================================================== */}

      {section === 'real-estate-subscription' &&
        normalizedRole === 'real_estate' && (
          <RealEstateSubscriptionPanel
            subscription={user.subscription}
          />
        )}

      {/* ==================================================
          MOVER LOADING
      ================================================== */}

      {(section === 'mover-kyc' ||
        section === 'mover-form') &&
        !selectedMover &&
        loadingMovers && (
          <div className="card p-10 text-center">

            <RefreshCw className="mx-auto h-7 w-7 animate-spin text-brand-600" />

            <p className="mt-3 text-sm text-gray-500">
              Loading mover registration...
            </p>

          </div>
        )}

      {/* ==================================================
          MOVER LIST
      ================================================== */}

      {(section === 'mover-kyc' ||
        section === 'mover-form') &&
        !selectedMover &&
        !loadingMovers && (

          <div className="card overflow-hidden">

            <div className="border-b border-gray-200 p-5 dark:border-brand-800">

              <div className="flex items-center justify-between">

                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">
                    Mover Registration
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Review the mover registration and KYC submitted by this user.
                  </p>
                </div>

                <Truck className="h-6 w-6 text-brand-600" />

              </div>
            </div>

            {movers.length === 0 ? (

              <div className="p-10 text-center">

                <Truck className="mx-auto h-10 w-10 text-gray-300" />

                <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                  No mover registration found for this user.
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  The user may not have submitted the mover registration form yet.
                </p>

              </div>

            ) : (

              <div className="divide-y divide-gray-100 dark:divide-brand-800">

                {movers.map((mover) => (

                  <div
                    key={`${mover.is_application ? 'application' : 'mover'}-${mover.id}`}
                    className="flex flex-col gap-4 p-5 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-brand-900/30"
                  >

                    <div className="flex items-center gap-3">

                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-brand-100 font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">

                        {mover.profile_photo_url ? (
                          <img
                            src={
                              mover.profile_photo_url
                            }
                            alt={
                              mover.driver_full_name ||
                              'Mover'
                            }
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Truck className="h-5 w-5" />
                        )}

                      </div>

                      <div>

                        <p className="font-semibold text-gray-900 dark:text-white">
                          {mover.driver_full_name ||
                            'Unnamed Mover'}
                        </p>

                        <p className="text-xs text-gray-500">
                          {mover.business_name ||
                            mover.vehicle_type ||
                            'Mover'}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {mover.operating_city ||
                            '—'}

                          {mover.operating_county
                            ? `, ${mover.operating_county}`
                            : ''}
                        </p>

                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">

                      {statusBadge(
                        getStatus(mover)
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          openMoverReview(mover)
                        }
                        className="btn-primary"
                      >
                        <Eye className="h-4 w-4" />
                        View KYC & Registration
                      </button>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      {/* Bottom Back */}
      <div className="mt-6">

        <button
          type="button"
          onClick={handleBack}
          className="btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

      </div>
    </div>
  );
}