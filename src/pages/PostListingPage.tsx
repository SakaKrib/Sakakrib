import { useEffect, useState } from 'react';
import {
  FileText,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import PropertyListingForm from './PropertyListingForm';

import { supabase } from '@/lib/supabase';

import {
  KENYAN_CITIES,
  KENYAN_COUNTIES,
  HOUSE_SIZES,
  formatKES,
  validatePhone,
  validateEmail,
  FREE_LISTING_LIMIT,
 
} from '@/lib/utils';


// ============================================================
// TYPES
// ============================================================

type UnitAvailability =
  | 'available'
  | 'occupied'
  | 'reserved';

type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'expired'
  | 'none';

type ListingPaymentRequirement =
  | 'not_required'
  | 'required';

interface MediaItem {
  file?: File;
  url: string;
  label: string;
  type: 'photo' | 'video';
}

interface PropertyUnit {
  id: string;
  unitNumber: string;
  unitType: string;
  rent: string;
  depositAmount: string;
  size: string;
  beds: string;
  baths: string;
  availability: UnitAvailability;
  description: string;
  photos: MediaItem[];
}

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id?: string | number;
  type?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

interface SocialLink {
  platform: string;
  url: string;
}

interface ListingEntitlement {
  can_create: boolean;

  free_limit: number;
  landlord_id: string;

  subscription_id: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_limit: number | null;

  free_listings_used: number;
  free_listings_remaining: number;

  individual_paid_listings: number;

  subscription_listings_used: number;
  subscription_listings_remaining: number | null;

  requires_subscription: boolean;
  requires_individual_payment: boolean;

  individual_listing_price_kes: number;
}




// ============================================================
// DATABASE RPC RESULT
// ============================================================

interface CreatedListingResult {
  id?: string;
  listing_id?: string;

  [key: string]: unknown;
}


// ============================================================
// COMPONENT
// ============================================================

export default function PostListingPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();

  // ==========================================================
  // AI CAPTION
  // ==========================================================

  const [aiCaption, setAiCaption] = useState('');

  


  // ==========================================================
  // UI STATE
  // ==========================================================

  const [termsAccepted, setTermsAccepted] =
    useState(false);

  const [step, setStep] =
    useState(0);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState(false);


  // ==========================================================
  // LISTING ENTITLEMENT
  //
  // IMPORTANT:
  //
  // This information is used ONLY to render the UI.
  //
  // It does NOT authorize listing creation.
  //
  // PostgreSQL remains authoritative.
  // ==========================================================

  const [
  listingEntitlement,
  setListingEntitlement,
] = useState<ListingEntitlement | null>(null);

// ==========================================================
// DATABASE-DERIVED LISTING VALUES
// ==========================================================

  const  LISTING_FEE_KES =
    listingEntitlement?.individual_listing_price_kes ?? 0;

  const remainingFreeListings =
    listingEntitlement?.free_listings_remaining ?? 0;

  const hasFreeListing =
    remainingFreeListings > 0;



  const [
    entitlementLoading,
    setEntitlementLoading,
  ] = useState(true);

  const [
    subscriptionStatus,
    setSubscriptionStatus,
  ] = useState<SubscriptionStatus>('none');

  const [
    listingPaymentRequirement,
    setListingPaymentRequirement,
  ] = useState<ListingPaymentRequirement>(
    'not_required'
  );

  const [
    paymentLoading,
    setPaymentLoading,
  ] = useState(false);


  // ==========================================================
  // PAYMENT METHOD
  // ==========================================================
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
  useState<'MPESA' | 'PAYPAL' | null>(null);


  // ==========================================================
  // PROPERTY MANAGEMENT
  // ==========================================================

  const [propertyName, setPropertyName] =
    useState('');

  const [propertyType, setPropertyType] =
    useState('');

  const [units, setUnits] =
    useState<PropertyUnit[]>([]);

  const [bookingEnabled, setBookingEnabled] =
    useState(false);

  const [paymentEnabled, setPaymentEnabled] =
    useState(false);


  // ==========================================================
  // REVIEW
  // ==========================================================

  const [reviewConfirmed, setReviewConfirmed] =
    useState(false);


  // ==========================================================
  // LOCATION
  // ==========================================================

  const [city, setCity] =
    useState('');

  const [customCity, setCustomCity] =
    useState('');

  const [county, setCounty] =
    useState('');

  const [latitude, setLatitude] =
    useState<number | null>(null);

  const [longitude, setLongitude] =
    useState<number | null>(null);

  const [locationSearch, setLocationSearch] =
    useState('');

  const [locationSuggestions, setLocationSuggestions] =
    useState<LocationSuggestion[]>([]);

  const [usingGPS, setUsingGPS] =
    useState(false);


  // ==========================================================
  // FINANCIAL
  // ==========================================================

  const [price, setPrice] =
    useState('');

  const [listingType, setListingType] =
    useState<'rent' | 'sale'>('rent');

  const [depositRequired, setDepositRequired] =
    useState(false);

  const [depositStructure, setDepositStructure] =
    useState<'fixed' | 'installments'>('fixed');

  const [depositAmount, setDepositAmount] =
    useState('');


  // ==========================================================
  // CONTACT
  // ==========================================================

  const [phone, setPhone] =
    useState(profile?.phone ?? '');

  const [email, setEmail] =
    useState(profile?.email ?? '');

  const [socialLinks, setSocialLinks] =
    useState<SocialLink[]>([]);


  // ==========================================================
  // MEDIA
  // ==========================================================

  const [photos, setPhotos] =
    useState<MediaItem[]>([]);

  const [video, setVideo] =
    useState<MediaItem | null>(null);


  // ==========================================================
  // DETAILS
  // ==========================================================

  const [title, setTitle] =
    useState('');

  const [description, setDescription] =
    useState('');

  const [size, setSize] =
    useState('');

  const [customSize, setCustomSize] =
    useState('');

  const [beds, setBeds] =
    useState('1');

  const [baths, setBaths] =
    useState('1');


  // ==========================================================
  // SOCIAL PLATFORMS
  // ==========================================================

  const SOCIAL_PLATFORMS = [
    'WhatsApp',
    'Instagram',
    'Facebook',
    'Website',
    'TikTok',
  ];


  // ==========================================================
  // DERIVED FORM VALUES
  // ==========================================================

  const finalCity =
    city === 'custom'
      ? customCity.trim()
      : city.trim();

  const finalSize =
    size === 'Custom Size'
      ? customSize.trim()
      : size.trim();


  // ==========================================================
  // LOAD ENTITLEMENT
  //
  // IMPORTANT:
  //
  // This is UI information only.
  //
  // It MUST NOT be treated as authorization.
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    const loadListingEntitlement = async () => {
      console.log('==================================================');
      console.log('🔎 STARTING LISTING ENTITLEMENT DEBUG');
      console.log('==================================================');

      console.log('Profile:', profile);
      console.log('Profile ID:', profile?.id);
      console.log('Profile role:', profile?.role);

      // ======================================================
      // 1. VALIDATE PROFILE
      // ======================================================

      if (!profile?.id || profile.role !== 'landlord') {
        console.warn('⚠️ Entitlement check skipped:', {
          hasProfile: Boolean(profile),
          profileId: profile?.id,
          role: profile?.role,
        });

        if (!cancelled) {
          setListingEntitlement(null);
          setSubscriptionStatus('none');
          setListingPaymentRequirement('not_required');
          setEntitlementLoading(false);
        }

        return;
      }

      setEntitlementLoading(true);

      try {
        // ======================================================
        // 2. CHECK SUPABASE AUTH
        // ======================================================

        console.log('==================================================');
        console.log('🔐 SUPABASE AUTH DEBUG');
        console.log('==================================================');

        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        const authenticatedUser = authData?.user;

        console.log(
          'Supabase authenticated user:',
          authenticatedUser
        );

        console.log(
          'Supabase authenticated user ID:',
          authenticatedUser?.id
        );

        console.log(
          'Supabase auth error:',
          authError
        );

        console.log(
          'Profile ID:',
          profile.id
        );

        console.log(
          'IDs match:',
          authenticatedUser?.id === profile.id
        );

        if (authError) {
          throw authError;
        }

        if (!authenticatedUser) {
          throw new Error(
            'No authenticated Supabase user found.'
          );
        }

        // ======================================================
        // 3. VERIFY USER ID
        // ======================================================

        if (authenticatedUser.id !== profile.id) {
          throw new Error(
            'Authenticated Supabase user does not match the landlord profile.'
          );
        }

        console.log(
          '✅ Authenticated user matches landlord profile.'
        );

        // ======================================================
        // 4. CALL DATABASE ENTITLEMENT RPC
        // ======================================================

        console.log('==================================================');
        console.log(
          '📡 CALLING get_landlord_listing_entitlement'
        );
        console.log('==================================================');

        const rpcParameters = {
          p_landlord_id: profile.id,
        };

        console.log(
          'RPC function:',
          'get_landlord_listing_entitlement'
        );

        console.log(
          'RPC parameters:',
          rpcParameters
        );

        const {
          data: entitlementData,
          error: entitlementError,
        } = await supabase.rpc(
          'get_landlord_listing_entitlement',
          rpcParameters
        );

        // ======================================================
        // 5. RAW RPC RESPONSE
        // ======================================================

        console.log('==================================================');
        console.log('📥 RAW ENTITLEMENT RPC RESPONSE');
        console.log('==================================================');

        console.log(
          'RPC data:',
          entitlementData
        );

        console.log(
          'RPC error:',
          entitlementError
        );

        console.log(
          'RPC data type:',
          typeof entitlementData
        );

        console.log(
          'Is array:',
          Array.isArray(entitlementData)
        );

        if (entitlementError) {
          console.error(
            '❌ Entitlement RPC failed:',
            entitlementError
          );

          console.error(
            'RPC error code:',
            entitlementError.code
          );

          console.error(
            'RPC error message:',
            entitlementError.message
          );

          console.error(
            'RPC error details:',
            entitlementError.details
          );

          console.error(
            'RPC error hint:',
            entitlementError.hint
          );

          throw entitlementError;
        }

        if (!entitlementData) {
          throw new Error(
            'Entitlement RPC returned no data.'
          );
        }

        // ======================================================
        // 6. NORMALIZE RPC RESULT
        // ======================================================

        const rawEntitlement = Array.isArray(
          entitlementData
        )
          ? entitlementData[0]
          : entitlementData;

        if (!rawEntitlement) {
          throw new Error(
            'Unable to determine listing entitlement.'
          );
        }

        console.log('==================================================');
        console.log('🏛️ RAW ENTITLEMENT OBJECT');
        console.log('==================================================');

        console.log(
          rawEntitlement
        );

        console.log(
          'JSON:',
          JSON.stringify(
            rawEntitlement,
            null,
            2
          )
        );

        // ======================================================
        // 7. NORMALIZE DATABASE VALUES
        //
        // PostgreSQL jsonb values can arrive as numbers,
        // strings, null, etc.
        //
        // We normalize numeric fields here so React receives
        // predictable values.
        // ======================================================

        const normalizedEntitlement: ListingEntitlement = {
          can_create:
            Boolean(
              rawEntitlement.can_create
            ),

          free_limit:
            Number(
              rawEntitlement.free_limit ?? 0
            ),

          landlord_id:
            String(
              rawEntitlement.landlord_id
            ),

          subscription_id:
            rawEntitlement.subscription_id ?? null,

          subscription_plan:
            rawEntitlement.subscription_plan ?? null,

          subscription_status:
            rawEntitlement.subscription_status ?? null,

          subscription_limit:
            rawEntitlement.subscription_limit === null ||
            rawEntitlement.subscription_limit === undefined
              ? null
              : Number(
                  rawEntitlement.subscription_limit
                ),

          free_listings_used:
            Number(
              rawEntitlement.free_listings_used ?? 0
            ),

          free_listings_remaining:
            Number(
              rawEntitlement.free_listings_remaining ?? 0
            ),

          individual_paid_listings:
            Number(
              rawEntitlement.individual_paid_listings ?? 0
            ),

          subscription_listings_used:
            Number(
              rawEntitlement.subscription_listings_used ?? 0
            ),

          subscription_listings_remaining:
            rawEntitlement.subscription_listings_remaining ===
              null ||
            rawEntitlement.subscription_listings_remaining ===
              undefined
              ? null
              : Number(
                  rawEntitlement.subscription_listings_remaining
                ),

          requires_subscription:
            Boolean(
              rawEntitlement.requires_subscription
            ),

          requires_individual_payment:
            Boolean(
              rawEntitlement.requires_individual_payment
            ),

          individual_listing_price_kes:
            Number(
              rawEntitlement.individual_listing_price_kes ?? 0
            ),
        };

        // ======================================================
        // 8. VALIDATE NORMALIZED ENTITLEMENT
        // ======================================================

        console.log('==================================================');
        console.log('🏛️ NORMALIZED ENTITLEMENT');
        console.log('==================================================');

        console.log(
          normalizedEntitlement
        );

        console.log(
          'JSON:',
          JSON.stringify(
            normalizedEntitlement,
            null,
            2
          )
        );

        // ======================================================
        // 9. FIELD DEBUG
        // ======================================================

        console.log('==================================================');
        console.log('📊 ENTITLEMENT FIELD DEBUG');
        console.log('==================================================');

        console.log(
          'can_create:',
          normalizedEntitlement.can_create,
          '| type:',
          typeof normalizedEntitlement.can_create
        );

        console.log(
          'free_limit:',
          normalizedEntitlement.free_limit,
          '| type:',
          typeof normalizedEntitlement.free_limit
        );

        console.log(
          'free_listings_used:',
          normalizedEntitlement.free_listings_used,
          '| type:',
          typeof normalizedEntitlement.free_listings_used
        );

        console.log(
          'free_listings_remaining:',
          normalizedEntitlement.free_listings_remaining,
          '| type:',
          typeof normalizedEntitlement.free_listings_remaining
        );

        console.log(
          'subscription_id:',
          normalizedEntitlement.subscription_id
        );

        console.log(
          'subscription_plan:',
          normalizedEntitlement.subscription_plan
        );

        console.log(
          'subscription_status:',
          normalizedEntitlement.subscription_status
        );

        console.log(
          'subscription_limit:',
          normalizedEntitlement.subscription_limit
        );

        console.log(
          'subscription_listings_used:',
          normalizedEntitlement.subscription_listings_used
        );

        console.log(
          'subscription_listings_remaining:',
          normalizedEntitlement.subscription_listings_remaining
        );

        console.log(
          'individual_paid_listings:',
          normalizedEntitlement.individual_paid_listings
        );

        console.log(
          'requires_subscription:',
          normalizedEntitlement.requires_subscription
        );

        console.log(
          'requires_individual_payment:',
          normalizedEntitlement.requires_individual_payment
        );

        console.log(
          'individual_listing_price_kes:',
          normalizedEntitlement.individual_listing_price_kes
        );

        // ======================================================
        // 10. LISTING FEE DEBUG
        //
        // IMPORTANT:
        // This comes directly from PostgreSQL.
        //
        // No LISTING_FEE_KES frontend constant is used.
        // ======================================================

        const listingFeeKES =
          normalizedEntitlement.individual_listing_price_kes;

        console.log('==================================================');
        console.log('💰 DATABASE LISTING FEE');
        console.log('==================================================');

        console.log(
          'Database listing fee:',
          listingFeeKES
        );

        console.log(
          'Database listing fee type:',
          typeof listingFeeKES
        );

        console.log(
          'Finite:',
          Number.isFinite(
            listingFeeKES
          )
        );

        console.log('==================================================');

        if (
          !Number.isFinite(
            listingFeeKES
          )
        ) {
          throw new Error(
            'Database returned an invalid listing fee.'
          );
        }

        // ======================================================
        // 11. SUBSCRIPTION STATUS
        //
        // Normalize DB values to the frontend union.
        // ======================================================

        const rawSubscriptionStatus =
          normalizedEntitlement.subscription_status
            ?.toLowerCase();

        const normalizedSubscriptionStatus: SubscriptionStatus =
          rawSubscriptionStatus === 'active'
            ? 'active'
            : rawSubscriptionStatus === 'trial'
              ? 'trial'
              : rawSubscriptionStatus === 'expired'
                ? 'expired'
                : 'none';

        console.log(
          'Normalized subscription status:',
          normalizedSubscriptionStatus
        );

        // ======================================================
        // 12. PAYMENT REQUIREMENT
        //
        // IMPORTANT:
        //
        // We DO NOT calculate this from the listing fee.
        //
        // PostgreSQL already decided this.
        // ======================================================

        const requiresIndividualPayment =
          normalizedEntitlement.requires_individual_payment;

        console.log(
          'Database says payment required:',
          requiresIndividualPayment
        );

        // ======================================================
        // 13. CANCELLED CHECK
        // ======================================================

        if (cancelled) {
          console.log(
            '⚠️ Entitlement request cancelled before state update.'
          );

          return;
        }

        // ======================================================
        // 14. SAVE ENTITLEMENT
        // ======================================================

        setListingEntitlement(
          normalizedEntitlement
        );

        setSubscriptionStatus(
          normalizedSubscriptionStatus
        );

        setListingPaymentRequirement(
          requiresIndividualPayment
            ? 'required'
            : 'not_required'
        );

        // ======================================================
        // 15. FINAL SUCCESS SUMMARY
        // ======================================================

        console.log('==================================================');
        console.log('✅ ENTITLEMENT LOADED SUCCESSFULLY');
        console.log('==================================================');

        console.table({
          landlordId:
            normalizedEntitlement.landlord_id,

          canCreate:
            normalizedEntitlement.can_create,

          freeLimit:
            normalizedEntitlement.free_limit,

          freeListingsUsed:
            normalizedEntitlement.free_listings_used,

          freeListingsRemaining:
            normalizedEntitlement.free_listings_remaining,

          subscriptionPlan:
            normalizedEntitlement.subscription_plan,

          subscriptionStatus:
            normalizedSubscriptionStatus,

          subscriptionLimit:
            normalizedEntitlement.subscription_limit,

          subscriptionListingsUsed:
            normalizedEntitlement.subscription_listings_used,

          subscriptionListingsRemaining:
            normalizedEntitlement.subscription_listings_remaining,

          individualPaidListings:
            normalizedEntitlement.individual_paid_listings,

          listingFeeKES:
            listingFeeKES,

          requiresSubscription:
            normalizedEntitlement.requires_subscription,

          requiresIndividualPayment:
            requiresIndividualPayment,
        });

        console.log('==================================================');

      } catch (err) {
        console.error(
          '❌ FAILED TO LOAD LISTING ENTITLEMENT:',
          err
        );

        if (!cancelled) {
          setListingEntitlement(null);

          setSubscriptionStatus(
            'none'
          );

          setListingPaymentRequirement(
            'not_required'
          );

          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load listing information.'
          );
        }

      } finally {
        if (!cancelled) {
          setEntitlementLoading(false);
        }
      }
    };

    loadListingEntitlement();

    return () => {
      cancelled = true;
    };
  }, [
    profile?.id,
    profile?.role,
  ]);


  // ==========================================================
  // PROPERTY MANAGEMENT UI
  //
  // IMPORTANT:
  //
  // This controls presentation only.
  //
  // PostgreSQL must independently validate
  // p_is_property_management.
  // ==========================================================

  const isPropertyManagementListing =
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'trial';


  // ==========================================================
  // STEPS
  // ==========================================================

  const BASE_STEPS =
    isPropertyManagementListing
      ? [
          'Property',
          'Units',
          'Financial',
          'Contact',
          'Media',
          'Details',
          'Review',
        ]
      : [
          'Location',
          'Financial',
          'Contact',
          'Media',
          'Details',
          'Review',
        ];

  const STEPS =
    listingPaymentRequirement === 'required'
      ? [
          ...BASE_STEPS,
          'Payment',
        ]
      : BASE_STEPS;




  // ==========================================================
  // PAYMENT UI STATE
  // ==========================================================

  const paymentRequired =
    listingPaymentRequirement === 'required';

  const paymentDescription =
    paymentRequired
      ? `This listing requires a ${formatKES(
          LISTING_FEE_KES
        )} listing fee before publication.`
      : 'No listing payment is currently required.';

  const [paymentCompleted, setPaymentCompleted] =
    useState(false);

  const paymentStepIndex =
    paymentRequired
      ? STEPS.length - 1
      : -1;

  // IMPORTANT:
  // This is the number that the child uses to decide whether
  // the user has a free listing available.
  //
  // Never use FREE_LISTING_LIMIT directly here.
  // Use the authoritative entitlement returned by PostgreSQL.
  const freeListingsRemaining = Math.max(
    0,
    Number(
      listingEntitlement?.free_listings_remaining ?? 0
    )
  );
  
  

  useEffect(() => {
    // If payment is not required, there is nothing to pay.
    if (!paymentRequired) {
      setPaymentCompleted(true);
      setSelectedPaymentMethod(null);
      return;
    }

    // Payment is required, so a previous payment state must
    // not accidentally carry over to a new listing.
    setPaymentCompleted(false);
    setSelectedPaymentMethod(null);
  }, [paymentRequired]);


  // ==========================================================
  // GPS LOCATION
  // ==========================================================

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError(
        'Location services are not supported by this browser.'
      );
      return;
    }

    setUsingGPS(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat =
          position.coords.latitude;

        const lon =
          position.coords.longitude;

        try {
          setLatitude(lat);
          setLongitude(lon);

          const response =
            await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
                lat
              )}&lon=${encodeURIComponent(
                lon
              )}&addressdetails=1`,
              {
                headers: {
                  Accept:
                    'application/json',
                },
              }
            );

          if (!response.ok) {
            throw new Error(
              'Unable to determine the address from your GPS location.'
            );
          }

          const data =
            await response.json();

          const address =
            data?.address || {};

          const detectedCity =
            address.city ||
            address.town ||
            address.municipality ||
            address.village ||
            address.suburb ||
            '';

          const detectedCounty =
            address.county ||
            address.state_district ||
            address.state ||
            '';

          const detectedLocation =
            data?.display_name ||
            `${detectedCity}${
              detectedCounty
                ? `, ${detectedCounty}`
                : ''
            }`;

          setLocationSearch(
            detectedLocation
          );

          if (detectedCity) {
            const matchingCity =
              KENYAN_CITIES.find(
                (item) =>
                  item.toLowerCase() ===
                  detectedCity.toLowerCase()
              );

            if (matchingCity) {
              setCity(matchingCity);
            } else {
              setCustomCity(
                detectedCity
              );

              setCity('custom');
            }
          }

          if (detectedCounty) {
            const normalizedCounty =
              detectedCounty
                .replace(
                  / County$/i,
                  ''
                )
                .trim();

            const matchingCounty =
              KENYAN_COUNTIES.find(
                (item) =>
                  item.toLowerCase() ===
                  normalizedCounty.toLowerCase()
              );

            setCounty(
              matchingCounty ||
                normalizedCounty
            );
          }

          setLocationSuggestions([
            {
              display_name:
                detectedLocation,

              lat:
                String(lat),

              lon:
                String(lon),

              place_id:
                data?.place_id,

              type:
                data?.type,

              address,
            },
          ]);

        } catch (err) {
          console.error(
            'GPS reverse geocoding failed:',
            err
          );

          setError(
            'Your GPS coordinates were detected, but we could not determine the address. Please enter your location manually.'
          );

        } finally {
          setUsingGPS(false);
        }
      },

      (geoError) => {
        console.error(
          'Geolocation error:',
          geoError
        );

        setUsingGPS(false);

        switch (
          geoError.code
        ) {
          case geoError.PERMISSION_DENIED:
            setError(
              'Location permission was denied. Please allow location access and try again.'
            );
            break;

          case geoError.POSITION_UNAVAILABLE:
            setError(
              'Your current location could not be determined. Please try again or search manually.'
            );
            break;

          case geoError.TIMEOUT:
            setError(
              'Getting your location took too long. Please try again.'
            );
            break;

          default:
            setError(
              'Unable to get your current location.'
            );
        }
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };


  // ==========================================================
  // UNIT FUNCTIONS
  // ==========================================================

  const createUnit =
    (): PropertyUnit => ({
      id:
        crypto.randomUUID(),

      unitNumber: '',

      unitType: '',

      rent: '',

      depositAmount: '',

      size: '',

      beds: '1',

      baths: '1',

      availability:
        'available',

      description: '',

      photos: [],
    });


  const addUnit = () => {
    setUnits(
      (current) => [
        ...current,
        createUnit(),
      ]
    );
  };


  const updateUnit = (
    id: string,
    field: keyof PropertyUnit,
    value: unknown
  ) => {
    setUnits(
      (current) =>
        current.map(
          (unit) =>
            unit.id === id
              ? {
                  ...unit,
                  [field]:
                    value,
                }
              : unit
        )
    );
  };


  // ==========================================================
  // CONTACT VALIDATION
  //
  // UX VALIDATION ONLY.
  //
  // Backend remains authoritative.
  // ==========================================================

  const contactIsValid =
    phone.trim() !== '' &&
    validatePhone(phone) &&
    email.trim() !== '' &&
    validateEmail(email);


  // ==========================================================
  // FORM VALIDATION
  //
  // These checks only prevent obviously incomplete forms.
  //
  // They do NOT decide whether the user is authorized to list.
  // ==========================================================

  const canProceed = () => {
    // ========================================================
    // PROPERTY MANAGEMENT
    // ========================================================

    if (isPropertyManagementListing) {
      switch (step) {
        case 0:
          return (
            locationSearch.trim() !== '' &&
            propertyName.trim() !== '' &&
            propertyType.trim() !== '' &&
            finalCity !== '' &&
            county.trim() !== ''
          );

        case 1:
          return (
            units.length > 0 &&
            units.every((unit) => {
              const rent = Number(unit.rent);
              const bedsValue = Number(unit.beds);
              const bathsValue = Number(unit.baths);

              return (
                unit.unitNumber.trim() !== '' &&
                unit.unitType.trim() !== '' &&
                Number.isFinite(rent) &&
                rent > 0 &&
                Number.isInteger(bedsValue) &&
                bedsValue >= 0 &&
                Number.isInteger(bathsValue) &&
                bathsValue >= 0 &&
                unit.photos.length >= 3 &&
                unit.photos.length <= 7
              );
            })
          );

        case 2:
          return units.every((unit) => {
            const rent = Number(unit.rent);

            return (
              Number.isFinite(rent) &&
              rent > 0
            );
          });

        case 3:
          return contactIsValid;

        case 4:
          return (
            photos.length >= 3 &&
            photos.length <= 7
          );

        case 5:
          return (
            title.trim() !== '' &&
            description.trim() !== ''
          );

        case 6:
          return reviewConfirmed;

        default:
          // Payment step
          if (step === paymentStepIndex) {
            return paymentRequired
              ? paymentCompleted
              : true;
          }

          return false;
      }
    }

    // ========================================================
    // NORMAL LANDLORD LISTING
    // ========================================================

    switch (step) {
      case 0:
        return (
          finalCity !== '' &&
          county.trim() !== ''
        );

      case 1:
        return (
          price.trim() !== '' &&
          Number.isFinite(Number(price)) &&
          Number(price) > 0
        );

      case 2:
        return contactIsValid;

      case 3:
        return (
          photos.length >= 3 &&
          photos.length <= 7
        );

      case 4:
        return (
          title.trim() !== '' &&
          description.trim() !== '' &&
          finalSize !== ''
        );

      case 5:
        return reviewConfirmed;

      default:
        // Payment step
        if (step === paymentStepIndex) {
          return paymentRequired
            ? paymentCompleted
            : true;
        }

        return false;
    }
  };


  // ==========================================================
// WAIT FOR LISTING PAYMENT CONFIRMATION
// ==========================================================

const waitForListingPayment = async (
  paymentId: string
): Promise<boolean> => {
  const maxAttempts = 30;
  const interval = 3000;

  for (
    let attempt = 0;
    attempt < maxAttempts;
    attempt++
  ) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from('listing_payments')
        .select('status')
        .eq('id', paymentId)
        .single();

      if (error) {
        console.error(
          'Payment status check failed:',
          error
        );
      }

      if (
        data?.status === 'paid' ||
        data?.status === 'completed'
      ) {
        return true;
      }

      if (
        data?.status === 'failed' ||
        data?.status === 'cancelled' ||
        data?.status === 'expired'
      ) {
        return false;
      }

    } catch (error) {
      console.error(
        'Error checking listing payment:',
        error
      );
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          interval
        )
    );
  }

  return false;
};


  // ==========================================================
// HANDLE LISTING PAYMENT
// ==========================================================
//
// IMPORTANT:
//
// This function handles the payment required for an individual
// listing.
//
// The frontend must NEVER mark payment as completed merely
// because the user selected M-Pesa or Pesapal.
//
// paymentCompleted = true ONLY after the backend confirms
// the payment.
//
// The backend/payment provider remains authoritative.
// ==========================================================

const handleListingPayment = async (): Promise<boolean> => {
  if (!paymentRequired) {
    setPaymentCompleted(true);
    return true;
  }

  if (!selectedPaymentMethod) {
    setError(
      'Please select a payment method before continuing.'
    );

    return false;
  }

  setPaymentLoading(true);
  setError(null);

  try {
    // ========================================================
    // M-PESA
    // ========================================================

    if (selectedPaymentMethod === 'MPESA') {
      /*
       * IMPORTANT:
       *
       * Replace this RPC with your actual listing-payment
       * M-Pesa RPC/Edge Function.
       *
       * The backend should:
       *
       * 1. Authenticate auth.uid()
       * 2. Verify landlord role
       * 3. Verify KYC
       * 4. Verify listing fee
       * 5. Create a payment transaction
       * 6. Initiate STK Push
       * 7. Return the payment/checkout identifier
       *
       * DO NOT trust the amount sent from the frontend.
       */

      const {
        data,
        error: mpesaError,
      } = await supabase.functions.invoke(
        'initiate-listing-payment',
        {
          body: {
            payment_method: 'MPESA',
          },
        }
      );

      if (mpesaError) {
        throw mpesaError;
      }

      if (!data) {
        throw new Error(
          'The payment service did not return a response.'
        );
      }

      console.log(
        '📲 Listing M-Pesa payment initiated:',
        data
      );

      /*
       * If your backend returns something like:
       *
       * {
       *   payment_id: "...",
       *   checkout_request_id: "..."
       * }
       *
       * DO NOT immediately set paymentCompleted(true).
       *
       * The STK callback must confirm the payment first.
       */

      const paymentId =
        data.payment_id ||
        data.paymentId;

      if (!paymentId) {
        throw new Error(
          'Payment was initiated but no payment ID was returned.'
        );
      }

      // ------------------------------------------------------
      // Wait for backend confirmation
      // ------------------------------------------------------

      const confirmed =
        await waitForListingPayment(
          paymentId
        );

      if (!confirmed) {
        throw new Error(
          'The listing payment was not confirmed.'
        );
      }

      setPaymentCompleted(true);

      return true;
    }


    // ========================================================
    // PAYPAL
    // ========================================================
    //
    // The Edge Function remains authoritative for:
    // - amount
    // - currency
    // - order creation
    // - PayPal configuration
    // - payment verification
    //
    // The frontend must never calculate or trust the payment
    // amount.
    //
    // Expected response:
    //
    // {
    //   payment_id: "...",
    //   approval_url: "https://www.paypal.com/..."
    // }
    //
    // The user is redirected to PayPal to approve the payment.
    // The PayPal webhook/callback must mark the payment as paid.
    // ========================================================

    if (selectedPaymentMethod === 'PAYPAL') {
      const {
        data,
        error: paypalError,
      } = await supabase.functions.invoke(
        'initiate-listing-payment',
        {
          body: {
            payment_method: 'PAYPAL',
          },
        }
      );

      if (paypalError) {
        throw paypalError;
      }

      if (!data) {
        throw new Error(
          'The PayPal payment service did not return a response.'
        );
      }

      console.log(
        '💳 PayPal listing payment initiated:',
        data
      );

      const approvalUrl =
        data.approval_url ||
        data.approvalUrl ||
        data.redirect_url ||
        data.redirectUrl;

      if (!approvalUrl) {
        throw new Error(
          'PayPal did not return an approval URL.'
        );
      }

      // Do NOT mark payment as completed here.
      //
      // PayPal must confirm the payment through the backend
      // before paymentCompleted can become true.

      window.location.assign(approvalUrl);

      return false;
    }


    throw new Error(
      'Unsupported listing payment method.'
    );

  } catch (err) {
    console.error(
      '❌ Listing payment failed:',
      err
    );

    setError(
      err instanceof Error
        ? err.message
        : 'Unable to process the listing payment.'
    );

    setPaymentCompleted(false);

    return false;

  } finally {
    setPaymentLoading(false);
  }
};


// ==========================================================
// UPLOAD LIMITS
// ==========================================================

// Maximum number of property photos
const MAX_PHOTOS = 7;

// Maximum individual photo size
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB

// Maximum walkthrough video size
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB


// ==========================================================
// PHOTO UPLOAD
// ==========================================================

const handlePhotoUpload = (files: FileList | null) => {
  if (!files || files.length === 0) {
    return;
  }

  const remaining = MAX_PHOTOS - photos.length;

  if (remaining <= 0) {
    setError(
      `You can upload a maximum of ${MAX_PHOTOS} photos.`
    );
    return;
  }

  const selectedFiles = Array.from(files).slice(
    0,
    remaining
  );

  const validFiles: File[] = [];

  for (const file of selectedFiles) {
    // Validate image type
    if (!file.type.startsWith('image/')) {
      setError(
        `${file.name} is not a valid image file.`
      );
      continue;
    }

    // Validate image size
    if (file.size > MAX_PHOTO_SIZE) {
      setError(
        `${file.name} is too large. Each photo must be 10 MB or smaller.`
      );
      continue;
    }

    validFiles.push(file);
  }

  if (validFiles.length === 0) {
    return;
  }

  const newPhotos = validFiles.map(
    (file, index) => ({
      file,

      url: URL.createObjectURL(file),

      label: `Photo ${
        photos.length + index + 1
      }`,

      type: 'photo' as const,
    })
  );

  setPhotos((current) => [
    ...current,
    ...newPhotos,
  ]);

  setError('');
};


// ==========================================================
// VIDEO UPLOAD
// ==========================================================

const handleVideoUpload = (file: File | null) => {
  if (!file) {
    return;
  }

  // Validate video type
  if (!file.type.startsWith('video/')) {
    setError(
      'Please select a valid video file.'
    );
    return;
  }

  // Validate video size
  if (file.size > MAX_VIDEO_SIZE) {
    setError(
      'Video is too large. Maximum allowed size is 100 MB.'
    );
    return;
  }

  // Remove/revoke previous video preview
  if (
    video?.url &&
    video.url.startsWith('blob:')
  ) {
    URL.revokeObjectURL(video.url);
  }

  const previewUrl =
    URL.createObjectURL(file);

  setVideo({
    file,

    url: previewUrl,

    label: 'Walkthrough Video',

    type: 'video',
  });

  setError('');
};


// ==========================================================
// PHOTO LABEL
// ==========================================================

const updatePhotoLabel = (
  index: number,
  label: string
) => {
  setPhotos((current) =>
    current.map((photo, i) =>
      i === index
        ? {
            ...photo,
            label,
          }
        : photo
    )
  );
};


// ==========================================================
// REMOVE PHOTO
// ==========================================================

const removePhoto = (index: number) => {
  setPhotos((current) => {
    const photo = current[index];

    // Revoke browser object URL
    if (
      photo?.url &&
      photo.url.startsWith('blob:')
    ) {
      URL.revokeObjectURL(photo.url);
    }

    return current.filter(
      (_, i) => i !== index
    );
  });
};


// ==========================================================
// REMOVE VIDEO
// ==========================================================

const removeVideo = () => {
  if (
    video?.url &&
    video.url.startsWith('blob:')
  ) {
    URL.revokeObjectURL(video.url);
  }

  setVideo(null);
};


// ==========================================================
// CLEAN UP BLOB URLS WHEN COMPONENT UNMOUNTS
// ==========================================================

useEffect(() => {
  return () => {
    // ------------------------------------------------------
    // Clean up photo previews
    // ------------------------------------------------------

    photos.forEach((photo) => {
      if (
        photo.url &&
        photo.url.startsWith('blob:')
      ) {
        URL.revokeObjectURL(photo.url);
      }
    });

    // ------------------------------------------------------
    // Clean up video preview
    // ------------------------------------------------------

    if (
      video?.url &&
      video.url.startsWith('blob:')
    ) {
      URL.revokeObjectURL(video.url);
    }
  };
}, []);

  // ==========================================================
  // SOCIAL LINKS
  // ==========================================================

  const addSocialLink = () => {
    setSocialLinks(
      (current) => [
        ...current,
        {
          platform:
            'WhatsApp',
          url: '',
        },
      ]
    );
  };


  const updateSocialLink = (
    index: number,
    field:
      | 'platform'
      | 'url',
    value: string
  ) => {
    setSocialLinks(
      (current) =>
        current.map(
          (link, i) =>
            i === index
              ? {
                  ...link,
                  [field]:
                    value,
                }
              : link
        )
    );
  };


  const removeSocialLink = (
    index: number
  ) => {
    setSocialLinks(
      (current) =>
        current.filter(
          (_, i) =>
            i !== index
        )
    );
  };


  // ==========================================================
  // DATABASE LISTING CREATION
  // ==========================================================
  //
  // EXACT BACKEND FUNCTION:
  //
  // create_landlord_listing(
  //   p_title,
  //   p_description,
  //   p_city,
  //   p_county,
  //   p_location_search,
  //   p_latitude,
  //   p_longitude,
  //   p_property_name,
  //   p_property_type,
  //   p_price_kes,
  //   p_listing_type,
  //   p_deposit_required,
  //   p_deposit_structure,
  //   p_deposit_amount,
  //   p_size,
  //   p_beds,
  //   p_baths,
  //   p_contact_phone,
  //   p_contact_email,
  //   p_social_links,
  //   p_booking_enabled,
  //   p_payment_enabled,
  //   p_is_property_management
  // )
  //
  // IMPORTANT:
  //
  // No user_id is supplied.
  //
  // PostgreSQL must determine the authenticated user
  // using auth.uid().
  // ==========================================================

  const createLandlordListing = async (
    payload: {
      p_title: string;
      p_description: string;
      p_city: string;
      p_county: string;

      p_location_search?:
        | string
        | null;

      p_latitude?:
        | number
        | null;

      p_longitude?:
        | number
        | null;

      p_property_name?:
        | string
        | null;

      p_property_type?:
        | string
        | null;

      p_price_kes?:
        | number
        | null;

      p_listing_type?:
        string;

      p_deposit_required?:
        boolean;

      p_deposit_structure?:
        | string
        | null;

      p_deposit_amount?:
        number;

      p_size?:
        | string
        | null;

      p_beds?:
        number;

      p_baths?:
        number;

      p_contact_phone?:
        | string
        | null;

      p_contact_email?:
        | string
        | null;

      p_social_links?:
        SocialLink[];

      p_booking_enabled?:
        boolean;

      p_payment_enabled?:
        boolean;

      p_is_property_management?:
        boolean;
    }
  ): Promise<CreatedListingResult> => {
    const {
      data,
      error: rpcError,
    } =
      await supabase.rpc(
        'create_landlord_listing',
        payload
      );

    if (rpcError) {
      console.error(
        '❌ create_landlord_listing failed:',
        rpcError
      );

      throw new Error(
        rpcError.message ||
          'The database rejected the listing.'
      );
    }

    if (!data) {
      throw new Error(
        'The listing function completed but did not return listing information.'
      );
    }

    console.log(
      '✅ create_landlord_listing response:',
      data
    );

    return (
      Array.isArray(data)
        ? data[0]
        : data
    ) as CreatedListingResult;
  };


  // ==========================================================
  // AUTHENTICATION GATE
  // ==========================================================

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Please sign in to post a listing.
        </p>
      </div>
    );
  }


  // ==========================================================
  // KYC UI GATE
  //
  // IMPORTANT:
  //
  // This is NOT the security boundary.
  //
  // The database must independently enforce verification.
  // ==========================================================

  if (
    profile.verification_status !==
      'verified' &&
    (
      profile.role ===
        'landlord' ||
      profile.role ===
        'real_estate'
    )
  ) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="card p-8">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning-100 dark:bg-warning-900/30">
            <FileText className="h-8 w-8 text-warning-600" />
          </div>

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Verification Required
          </h2>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            You must complete KYC verification before posting listings.
          </p>

          <button
            type="button"
            onClick={() =>
              navigate('kyc-verify')
            }
            className="btn-primary mt-6"
          >
            Verify Now
          </button>

        </div>
      </div>
    );
  }


  // ==========================================================
  // ENTITLEMENT LOADING
  // ==========================================================

  if (entitlementLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">

        <div className="flex items-center gap-2 text-gray-500">

          <Loader2 className="h-5 w-5 animate-spin" />

          Checking account status...

        </div>

      </div>
    );
  }


  // ==========================================================
  // SUBMIT LISTING
  // ==========================================================

  const handleSubmit = async () => {
  setError(null);
  setSubmitting(true);
  setAiCaption('');

  let createdListingId: string | null = null;

  try {
    // ========================================================
    // 0. VERIFY SUPABASE SESSION
    // ========================================================
    //
    // Authentication only.
    //
    // We do NOT determine:
    // - role
    // - verification
    // - subscription
    // - free listing entitlement
    // - payment requirement
    // - approval
    // - publication
    //
    // PostgreSQL/RPC owns those decisions.
    // ========================================================

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error(
        'Supabase authentication check failed:',
        authError
      );

      throw new Error(
        'Unable to verify your login session.'
      );
    }

    if (!user) {
      throw new Error(
        'Your login session has expired. Please sign in again.'
      );
    }

    console.log(
      '🔐 Authenticated Supabase user:',
      user.id
    );

     

    // ========================================================
    // 1. CLIENT-SIDE FORM VALIDATION ONLY
    // ========================================================
    //
    // These checks exist only to prevent obviously malformed
    // submissions and improve UX.
    //
    // They are NOT security or entitlement checks.
    // ========================================================

    if (!title?.trim() && !propertyName?.trim()) {
      throw new Error(
        'A listing title is required.'
      );
    }

    if (!description?.trim()) {
      throw new Error(
        'A listing description is required.'
      );
    }

    if (!finalCity?.trim()) {
      throw new Error(
        'A city is required.'
      );
    }

    if (!county?.trim()) {
      throw new Error(
        'A county is required.'
      );
    }

    if (!phone?.trim()) {
      throw new Error(
        'A contact phone number is required.'
      );
    }

    if (!email?.trim()) {
      throw new Error(
        'A contact email is required.'
      );
    }

    // ========================================================
    // 2. NORMALIZE LISTING VALUES
    // ========================================================

    const normalizedTitle = (
      isPropertyManagementListing
        ? propertyName
        : title
    )?.trim() || '';

    if (!normalizedTitle) {
      throw new Error(
        'A listing title is required.'
      );
    }

    const normalizedDescription =
      description.trim();

    const normalizedCity =
      finalCity.trim();

    const normalizedCounty =
      county.trim();

    const normalizedLocationSearch =
      locationSearch?.trim() || null;

    const normalizedPropertyName =
      propertyName?.trim() || null;

    const normalizedPropertyType =
      propertyType?.trim() || null;

    const normalizedPhone =
      phone.trim();

    const normalizedEmail =
      email.trim();

    // ========================================================
    // 3. NORMALIZE NUMERIC VALUES
    // ========================================================

    const normalizedLatitude =
      latitude !== null &&
      Number.isFinite(latitude)
        ? latitude
        : null;

    const normalizedLongitude =
      longitude !== null &&
      Number.isFinite(longitude)
        ? longitude
        : null;

    const normalizedPrice =
      price !== null &&
      price !== undefined &&
      price !== ''
        ? Number(price)
        : null;

    const normalizedDepositAmount =
      depositAmount !== null &&
      depositAmount !== undefined &&
      depositAmount !== ''
        ? Number(depositAmount)
        : 0;

    const normalizedBeds =
      beds !== null &&
      beds !== undefined &&
      beds !== ''
        ? Number(beds)
        : 0;

    const normalizedBaths =
      baths !== null &&
      baths !== undefined &&
      baths !== ''
        ? Number(baths)
        : 0;

    // ========================================================
    // 4. BASIC CLIENT-SIDE NUMERIC VALIDATION
    // ========================================================
    //
    // Again:
    // These checks are UX validation only.
    //
    // The database remains authoritative.
    // ========================================================

    if (
      normalizedLatitude !== null &&
      !Number.isFinite(normalizedLatitude)
    ) {
      throw new Error(
        'Please enter a valid latitude.'
      );
    }

    if (
      normalizedLongitude !== null &&
      !Number.isFinite(normalizedLongitude)
    ) {
      throw new Error(
        'Please enter a valid longitude.'
      );
    }

    if (
      normalizedPrice !== null &&
      (
        !Number.isFinite(normalizedPrice) ||
        normalizedPrice < 0
      )
    ) {
      throw new Error(
        'Please enter a valid listing price.'
      );
    }

    if (
      !Number.isFinite(normalizedDepositAmount) ||
      normalizedDepositAmount < 0
    ) {
      throw new Error(
        'Please enter a valid deposit amount.'
      );
    }

    if (
      !Number.isInteger(normalizedBeds) ||
      normalizedBeds < 0
    ) {
      throw new Error(
        'Please enter a valid number of bedrooms.'
      );
    }

    if (
      !Number.isInteger(normalizedBaths) ||
      normalizedBaths < 0
    ) {
      throw new Error(
        'Please enter a valid number of bathrooms.'
      );
    }

    // ========================================================
    // 5. NORMALIZE SOCIAL LINKS
    // ========================================================

    const normalizedSocialLinks =
      Array.isArray(socialLinks)
        ? socialLinks
            .filter(
              (item) =>
                item &&
                typeof item.url === 'string' &&
                item.url.trim()
            )
            .map(
              (item) => ({
                platform:
                  typeof item.platform === 'string'
                    ? item.platform.trim()
                    : '',

                url:
                  item.url.trim(),
              })
            )
        : [];

    // ========================================================
    // 6. PROPERTY MANAGEMENT UX VALIDATION
    // ========================================================
    //
    // This validates the data the landlord entered.
    //
    // It does NOT grant permission to create units.
    //
    // Unit creation remains a separate backend operation after
    // the listing has been successfully created.
    // ========================================================

    if (
      isPropertyManagementListing
    ) {
      if (
        !Array.isArray(units) ||
        units.length === 0
      ) {
        throw new Error(
          'At least one property unit is required.'
        );
      }

      for (
        let i = 0;
        i < units.length;
        i++
      ) {
        const unit = units[i];

        if (
          !unit?.unitNumber?.trim()
        ) {
          throw new Error(
            `Unit ${i + 1} must have a unit number.`
          );
        }

        if (
          !unit?.unitType?.trim()
        ) {
          throw new Error(
            `Unit ${i + 1} must have a unit type.`
          );
        }

        const unitRent =
          Number(unit.rent);

        if (
          !Number.isFinite(unitRent) ||
          unitRent < 0
        ) {
          throw new Error(
            `Unit ${i + 1} has an invalid rent amount.`
          );
        }

        const unitDeposit =
          unit.depositAmount !== null &&
          unit.depositAmount !== undefined &&
          unit.depositAmount !== ''
            ? Number(unit.depositAmount)
            : 0;

        if (
          !Number.isFinite(unitDeposit) ||
          unitDeposit < 0
        ) {
          throw new Error(
            `Unit ${i + 1} has an invalid deposit amount.`
          );
        }

        const unitBeds =
          Number(unit.beds);

        const unitBaths =
          Number(unit.baths);

        if (
          !Number.isInteger(unitBeds) ||
          unitBeds < 0
        ) {
          throw new Error(
            `Unit ${i + 1} has an invalid bedroom count.`
          );
        }

        if (
          !Number.isInteger(unitBaths) ||
          unitBaths < 0
        ) {
          throw new Error(
            `Unit ${i + 1} has an invalid bathroom count.`
          );
        }
      }
    }

    // ========================================================
    // 7. BUILD RPC PAYLOAD
    // ========================================================
    //
    // ONLY parameters accepted by:
    //
    // create_landlord_listing(...)
    //
    // are sent.
    //
    // DO NOT add:
    //
    // user_id
    // is_paid
    // is_published
    // approval_status
    // is_approved
    // payment_required
    // subscription information
    // ========================================================

    const listingPayload = {
      p_title:
        normalizedTitle,

      p_description:
        normalizedDescription,

      p_city:
        normalizedCity,

      p_county:
        normalizedCounty,

      p_location_search:
        normalizedLocationSearch,

      p_latitude:
        normalizedLatitude,

      p_longitude:
        normalizedLongitude,

      p_property_name:
        normalizedPropertyName,

      p_property_type:
        normalizedPropertyType,

      p_price_kes:
        normalizedPrice,

      p_listing_type:
        listingType?.trim() || 'rent',

      p_deposit_required:
        Boolean(depositRequired),

      p_deposit_structure:
        depositStructure?.trim() || null,

      p_deposit_amount:
        normalizedDepositAmount,

      p_size:
        finalSize?.trim() || null,

      p_beds:
        normalizedBeds,

      p_baths:
        normalizedBaths,

      p_contact_phone:
        normalizedPhone,

      p_contact_email:
        normalizedEmail,

      p_social_links:
        normalizedSocialLinks,

      p_booking_enabled:
        Boolean(bookingEnabled),

      p_payment_enabled:
        Boolean(paymentEnabled),

      p_is_property_management:
        Boolean(isPropertyManagementListing),
    };

    console.log(
      '📤 create_landlord_listing payload:',
      listingPayload
    );

    // ========================================================
    // 8. PROCESS LISTING PAYMENT IF REQUIRED
    // ========================================================

    if (paymentRequired) {
      const paymentConfirmed =
        await handleListingPayment();

      if (!paymentConfirmed) {
        return;
      }

      console.log(
        '✅ Listing payment confirmed.'
      );
    }


    // ========================================================
    // 9. CREATE LISTING THROUGH AUTHORITATIVE RPC
    // ========================================================

    const listingResult =
      await createLandlordListing(
        listingPayload
      );

    console.log(
      '📥 CREATE LISTING RESULT:',
      JSON.stringify(
        listingResult,
        null,
        2
      )
    );

    // ========================================================
    // 9. EXTRACT BACKEND-GENERATED LISTING ID
    // ========================================================

    const returnedListingId =
      listingResult?.listing_id ||
      listingResult?.id;

    if (
      typeof returnedListingId !== 'string' ||
      !returnedListingId.trim()
    ) {
      console.error(
        'Invalid RPC result:',
        listingResult
      );

      throw new Error(
        'The listing was created but the database did not return a valid listing ID.'
      );
    }

    createdListingId =
      returnedListingId;

    console.log(
      '✅ Backend created listing:',
      createdListingId
    );

    // ========================================================
    // 10. READ BACKEND WORKFLOW RESULT
    // ========================================================
    //
    // IMPORTANT:
    //
    // We do NOT calculate these values ourselves.
    //
    // The RPC is authoritative.
    // ========================================================

    const backendResult = {
      listingId:
        listingResult.listing_id,

      landlordId:
        listingResult.landlord_id,

      subscriptionId:
        listingResult.subscription_id ?? null,

      subscriptionPlan:
        listingResult.subscription_plan ?? null,

      subscriptionStatus:
        listingResult.subscription_status ?? null,

      subscriptionLimit:
        listingResult.subscription_limit ?? null,

      subscriptionListingsUsed:
        listingResult.subscription_listings_used ?? null,

      subscriptionListingsRemaining:
        listingResult.subscription_listings_remaining ?? null,

      freeLimit:
        listingResult.free_limit ?? null,

      freeListingsUsed:
        listingResult.free_listings_used ?? null,

      listingPaymentRequired:
        listingResult.listing_payment_required ?? null,

      approvalStatus:
        listingResult.approval_status ?? null,

      isApproved:
        listingResult.is_approved ?? null,

      isPublished:
        listingResult.is_published ?? null,
    };

    console.log(
      '🏛️ Backend listing state:',
      backendResult
    );

    // ========================================================
    // 11. DO NOT CREATE UNITS YET
    // ========================================================
    //
    // property_units has its own schema and RLS.
    //
    // We need its authoritative creation RPC / operation before
    // inserting units here.
    //
    // The important thing is that we now have:
    //
    // createdListingId
    //
    // which is the correct listing relationship.
    // ========================================================

    // ========================================================
    // 12. AI CAPTION — BEST EFFORT ONLY
    // ========================================================
    //
    // AI failure MUST NOT cause the listing creation to fail.
    //
    // AI also does NOT determine:
    // - payment
    // - approval
    // - publication
    // - ownership
    // ========================================================

    try {
      const response =
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-caption`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              Authorization:
                `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },

            body: JSON.stringify({
              listing: {
                id:
                  createdListingId,

                title:
                  normalizedTitle,

                description:
                  normalizedDescription,

                city:
                  normalizedCity,

                county:
                  normalizedCounty,

                price_kes:
                  normalizedPrice,

                listing_type:
                  listingType?.trim() || 'rent',

                size:
                  finalSize?.trim() || null,

                beds:
                  normalizedBeds,

                baths:
                  normalizedBaths,

                deposit_required:
                  Boolean(depositRequired),

                property_name:
                  normalizedPropertyName,

                property_type:
                  normalizedPropertyType,

                units:
                  isPropertyManagementListing &&
                  Array.isArray(units)
                    ? units.map(
                        (unit) => ({
                          unit_number:
                            unit.unitNumber.trim(),

                          unit_type:
                            unit.unitType.trim(),

                          rent:
                            Number(unit.rent),

                          deposit_amount:
                            unit.depositAmount !==
                              null &&
                            unit.depositAmount !==
                              undefined &&
                            unit.depositAmount !== ''
                              ? Number(
                                  unit.depositAmount
                                )
                              : 0,

                          size:
                            unit.size?.trim() ||
                            null,

                          beds:
                            Number(unit.beds),

                          baths:
                            Number(unit.baths),

                          availability:
                            unit.availability ||
                            'available',

                          description:
                            unit.description?.trim() ||
                            null,
                        })
                      )
                    : [],
              },
            }),
          }
        );

      if (!response.ok) {
        console.warn(
          'Gemini caption generation failed:',
          response.status,
          response.statusText
        );
      } else {
        const captionData =
          await response.json();

        const generatedCaption =
          typeof captionData?.caption === 'string'
            ? captionData.caption.trim()
            : '';

        if (generatedCaption) {
          setAiCaption(
            generatedCaption
          );

          // ----------------------------------------------------
          // SAVE ONLY AI FIELDS
          // ----------------------------------------------------
          //
          // We do not touch:
          // ownership
          // payment
          // approval
          // publication
          // ----------------------------------------------------

          const {
            error: captionError,
          } = await supabase
            .from('listings')
            .update({
              ai_caption:
                generatedCaption,

              ai_caption_generated_at:
                new Date().toISOString(),
            })
            .eq(
              'id',
              createdListingId
            );

          if (captionError) {
            console.warn(
              'AI caption generated but could not be saved:',
              captionError
            );
          }
        }
      }

    } catch (aiError) {
      console.warn(
        'AI caption generation failed. Listing remains created:',
        aiError
      );
    }

    // ========================================================
    // 13. SUCCESS
    // ========================================================
    //
    // The listing was accepted by the authoritative backend.
    //
    // Do NOT say:
    //
    // "Your listing is live"
    //
    // because the RPC explicitly creates it as:
    //
    // approval_status = pending_review
    // is_approved     = false
    // is_published    = false
    // is_paid         = false
    //
    // ========================================================

    setSuccess(true);

  } catch (err) {
    console.error(
      '❌ Failed to submit listing:',
      err
    );

    const message =
      err instanceof Error
        ? err.message
        : 'Failed to post listing. Please try again.';

    setError(message);

  } finally {
    setSubmitting(false);
  }
};


  // ==========================================================
  // SUCCESS SCREEN
  // ==========================================================

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">

        <div className="card p-8 text-center animate-scale-in">

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">

            <CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" />

          </div>

          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
            Listing Submitted for Review
          </h2>

          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Your property has been successfully submitted and is now awaiting
            approval. Once approved, it will be published and made visible
            to renters and buyers.
          </p>

          <div className="mt-4 rounded-lg bg-success-50 px-4 py-3 dark:bg-success-900/20">

            <p className="text-sm font-medium text-success-700 dark:text-success-400">
              Your listing has been submitted successfully.
            </p>

          </div>

          <div className="mt-3 rounded-lg bg-brand-50 px-4 py-3 dark:bg-brand-900/20">

            <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
              Approval Status: Pending Review
            </p>

            <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">
              Our team will review your listing before it becomes publicly available.
            </p>

          </div>

          {aiCaption && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left dark:border-brand-800 dark:bg-brand-800/30">

              <div className="mb-2 flex items-center justify-between gap-3">

                <p className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                  AI-Generated Community Caption
                </p>

                <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-[11px] font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  Pending Approval
                </span>

              </div>

              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                This caption has been saved to your listing. It will be used
                for your community post once the listing is approved.
              </p>

              <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
                {aiCaption}
              </p>

            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">

            <button
              onClick={() =>
                navigate('listings')
              }
              className="btn-primary"
            >
              View My Listings
            </button>

            <button
              onClick={() =>
                navigate('community')
              }
              className="btn-secondary"
            >
              See Community
            </button>

          </div>

        </div>

      </div>
    );
  }


  // ==========================================================
  // FORM
  // ==========================================================

  return (
    <PropertyListingForm
      step={step}
      STEPS={STEPS}
      error={error}
      submitting={submitting}
      setStep={setStep}
      canProceed={canProceed}
      handleSubmit={handleSubmit}

      reviewConfirmed={
        reviewConfirmed
      }

      selectedPaymentMethod={
        selectedPaymentMethod
      }

      setSelectedPaymentMethod={
        setSelectedPaymentMethod
      }

      setReviewConfirmed={
        setReviewConfirmed
      }

      termsAccepted={
        termsAccepted
      }

      setTermsAccepted={
        setTermsAccepted
      }

      subscriptionStatus={
        subscriptionStatus
      }

      freeListingsRemaining={
        freeListingsRemaining
      }

      isPropertyManagementListing={
        isPropertyManagementListing
      }

      listingPaymentRequirement={
        listingPaymentRequirement
      }

      paymentLoading={
        paymentLoading
      }

      paymentRequired={
        paymentRequired
      }

      handleListingPayment={
        handleListingPayment
      }

      paymentDescription={
        paymentDescription
      }

      LISTING_FEE_KES={
        LISTING_FEE_KES
      }

      FREE_LISTING_LIMIT={
        FREE_LISTING_LIMIT
      }

      paymentCompleted={
        paymentCompleted
      }

      setPaymentCompleted={
        setPaymentCompleted
      }


      formatKES={
        formatKES
      }

      city={city}
      setCity={setCity}

      customCity={
        customCity
      }

      setCustomCity={
        setCustomCity
      }

      county={county}
      setCounty={setCounty}

      locationSearch={
        locationSearch
      }

      setLocationSearch={
        setLocationSearch
      }

      locationSuggestions={
        locationSuggestions
      }

      setLocationSuggestions={
        setLocationSuggestions
      }

      latitude={latitude}
      setLatitude={
        setLatitude
      }

      longitude={longitude}
      setLongitude={
        setLongitude
      }

      usingGPS={
        usingGPS
      }

      setUsingGPS={
        setUsingGPS
      }

      handleUseCurrentLocation={
        handleUseCurrentLocation
      }

      KENYAN_CITIES={
        KENYAN_CITIES
      }

      KENYAN_COUNTIES={
        KENYAN_COUNTIES
      }

      propertyName={
        propertyName
      }

      setPropertyName={
        setPropertyName
      }

      propertyType={
        propertyType
      }

      setPropertyType={
        setPropertyType
      }

      bookingEnabled={
        bookingEnabled
      }

      setBookingEnabled={
        setBookingEnabled
      }

      paymentEnabled={
        paymentEnabled
      }

      setPaymentEnabled={
        setPaymentEnabled
      }

      listingType={
        listingType
      }

      setListingType={
        setListingType
      }

      price={price}
      setPrice={setPrice}

      depositRequired={
        depositRequired
      }

      setDepositRequired={
        setDepositRequired
      }

      depositStructure={
        depositStructure
      }

      setDepositStructure={
        setDepositStructure
      }

      depositAmount={
        depositAmount
      }

      setDepositAmount={
        setDepositAmount
      }

      units={units}
      setUnits={setUnits}

      addUnit={addUnit}

      updateUnit={
        updateUnit
      }

      phone={phone}
      setPhone={setPhone}

      email={email}
      setEmail={setEmail}

      socialLinks={
        socialLinks
      }

      setSocialLinks={
        setSocialLinks
      }

      addSocialLink={
        addSocialLink
      }

      updateSocialLink={
        updateSocialLink
      }

      removeSocialLink={
        removeSocialLink
      }

      SOCIAL_PLATFORMS={
        SOCIAL_PLATFORMS
      }

      photos={photos}
      setPhotos={
        setPhotos
      }

      removePhoto={
        removePhoto
      }

      updatePhotoLabel={
        updatePhotoLabel
      }

      handlePhotoUpload={
        handlePhotoUpload
      }

      video={video}
      removeVideo={
        removeVideo
      }

      handleVideoUpload={
        handleVideoUpload
      }

      title={title}
      setTitle={
        setTitle
      }

      description={
        description
      }

      setDescription={
        setDescription
      }

      size={size}
      setSize={
        setSize
      }

      customSize={
        customSize
      }


      setCustomSize={
        setCustomSize
      }

      beds={beds}
      setBeds={
        setBeds
      }

      baths={baths}
      setBaths={
        setBaths
      }

      HOUSE_SIZES={
        HOUSE_SIZES
      }
    />
  );
}