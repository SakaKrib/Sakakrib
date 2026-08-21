import { useEffect, useState } from 'react';
import {
  FileText,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import PropertyListingForm from './PropertyListingForm';
import ListingPaymentModal from '@/modal/ListingPaymentModal';

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

import {
  fetchListingEntitlement,
  createRoleAwareListing,
  createListingPaymentIntent,
  waitForListingPaymentIntent,
  findRecentlyPaidListing,
  type ListingEntitlement,
  type ListingFormPayload,
  type ListingRole,
} from '@/lib/ListingEntitlement';


// ============================================================
// TYPES
// ============================================================

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
  availability: 'available' | 'occupied' | 'reserved';
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

  const [createdListingId, setCreatedListingId] =
    useState<string | null>(null);


  // ==========================================================
  // LISTING ENTITLEMENT
  //
  // IMPORTANT:
  //
  // This information is used ONLY to render the UI.
  //
  // It does NOT authorize listing creation. The authoritative
  // checks live in create_role_aware_listing and
  // create_listing_payment_intent (both server-side, re-run
  // again at submit time — this loaded entitlement can go
  // stale between page load and submit).
  // ==========================================================

  const [
    listingEntitlement,
    setListingEntitlement,
  ] = useState<ListingEntitlement | null>(null);

  const LISTING_FEE_KES =
    listingEntitlement?.individualListingPriceKes ?? 1000;

  const [
    entitlementLoading,
    setEntitlementLoading,
  ] = useState(true);

  const [
    subscriptionStatus,
    setSubscriptionStatus,
  ] = useState<'trial' | 'active' | 'expired' | 'none'>('none');

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
  //
  // NOTE: PayPal is intentionally not offered for the individual
  // KES 1,000 listing fee yet — there is no PayPal Edge Function
  // wired to listing_payment_intents (paypal-create-order only
  // handles subscriptions). Only M-Pesa is available here until
  // that is built.
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

  // Role-aware: only landlord and real_estate accounts go through
  // this page at all (see AUTHENTICATION / ROLE GATE below), so this
  // narrows profile.role to the two values the entitlement service
  // understands.
  const listingRole: ListingRole | null =
    profile?.role === 'landlord' || profile?.role === 'real_estate'
      ? profile.role
      : null;


  // ==========================================================
  // LOAD ENTITLEMENT
  //
  // Role-aware: landlords use get_landlord_listing_entitlement,
  // Real Estate accounts use get_real_estate_listing_entitlement.
  // Never call one RPC for the other role.
  //
  // IMPORTANT:
  //
  // This is UI information only. It MUST NOT be treated as
  // authorization.
  // ==========================================================

  useEffect(() => {
    let cancelled = false;

    const loadListingEntitlement = async () => {
      if (!profile?.id || !listingRole) {
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
        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        const authenticatedUser = authData?.user;

        if (!authenticatedUser) {
          throw new Error(
            'No authenticated Supabase user found.'
          );
        }

        if (authenticatedUser.id !== profile.id) {
          throw new Error(
            'Authenticated Supabase user does not match this profile.'
          );
        }

        const entitlement = await fetchListingEntitlement(
          listingRole,
          profile.id
        );

        if (cancelled) {
          return;
        }

        setListingEntitlement(entitlement);
        setSubscriptionStatus(entitlement.subscriptionStatus);

        setListingPaymentRequirement(
          entitlement.requiresIndividualPayment
            ? 'required'
            : 'not_required'
        );

      } catch (err) {
        console.error(
          'Failed to load listing entitlement:',
          err
        );

        if (!cancelled) {
          setListingEntitlement(null);
          setSubscriptionStatus('none');
          setListingPaymentRequirement('not_required');

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
    listingRole,
  ]);


  // ==========================================================
  // PROPERTY MANAGEMENT UI
  //
  // IMPORTANT:
  //
  // This controls presentation only. PostgreSQL independently
  // validates p_is_property_management and rejects it outright
  // for non-landlord roles / accounts without an active
  // subscription (see create_role_aware_listing).
  //
  // PMS is landlord-only — Real Estate accounts can never reach
  // this branch, matching the DB-side restriction.
  // ==========================================================

  const isPropertyManagementListing =
    listingRole === 'landlord' &&
    (subscriptionStatus === 'active' ||
      subscriptionStatus === 'trial');


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

  // Set once handleListingPayment() successfully creates a payment
  // intent and confirms payment. Kept separate from paymentCompleted
  // so the child can't be tricked into treating "intent created" as
  // "paid" — see handleListingPayment.
  const [paymentIntentId, setPaymentIntentId] =
    useState<string | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] =
    useState(false);

  const paymentStepIndex =
    paymentRequired
      ? STEPS.length - 1
      : -1;

  // IMPORTANT:
  // Never use FREE_LISTING_LIMIT directly here. Use the authoritative
  // entitlement returned by PostgreSQL.
  const freeListingsRemaining = Math.max(
    0,
    Number(
      listingEntitlement?.freeListingsRemaining ?? 0
    )
  );



  useEffect(() => {
    // If payment is not required, there is nothing to pay.
    if (!paymentRequired) {
      setPaymentCompleted(true);
      setSelectedPaymentMethod(null);
      setPaymentIntentId(null);
      setPaymentModalOpen(false);
      return;
    }

    // Payment is required, so a previous payment state must
    // not accidentally carry over to a new listing.
    setPaymentCompleted(false);
    setSelectedPaymentMethod(null);
    setPaymentIntentId(null);
  }, [paymentRequired]);

  // Open the payment/subscribe modal automatically whenever the
  // user reaches the Payment step and hasn't paid yet. They can
  // reopen it manually (see the "Open Payment Options" button in
  // PropertyListingForm) if they close it.
  useEffect(() => {
    if (
      paymentRequired &&
      step === paymentStepIndex &&
      !paymentCompleted
    ) {
      setPaymentModalOpen(true);
    }
  }, [paymentRequired, step, paymentStepIndex, paymentCompleted]);

  // Hands off to the existing subscription page with the chosen
  // plan/cycle as a hint — this modal does not start checkout
  // itself. Adjust the route name below if 'subscription' isn't
  // what useNav expects in this app.
  const handleContinueToSubscription = (
    plan: { id: string; name: string },
    billingCycle: 'monthly' | 'annual'
  ) => {
    try {
      sessionStorage.setItem(
        'pendingSubscriptionSelection',
        JSON.stringify({ planId: plan.id, planName: plan.name, billingCycle })
      );
    } catch {
      // sessionStorage may be unavailable (e.g. private browsing) —
      // non-fatal, the subscription page can still be browsed manually.
    }

    setPaymentModalOpen(false);
    navigate('subscription');
  };


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
  // UX VALIDATION ONLY. Backend remains authoritative.
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
  // They do NOT decide whether the user is authorized to list.
  // ==========================================================

  const canProceed = () => {
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
          if (step === paymentStepIndex) {
            return paymentRequired
              ? paymentCompleted
              : true;
          }

          return false;
      }
    }

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
        if (step === paymentStepIndex) {
          return paymentRequired
            ? paymentCompleted
            : true;
        }

        return false;
    }
  };


  // ==========================================================
  // BUILD LISTING PAYLOAD
  //
  // Shared shape for both create_role_aware_listing (FREE /
  // SUBSCRIPTION) and create_listing_payment_intent (payment
  // required). Keep in one place so the two paths can never
  // drift apart.
  // ==========================================================

  const buildListingPayload = (): ListingFormPayload => {
    const normalizedTitle =
      (isPropertyManagementListing ? propertyName : title)?.trim() || '';

    return {
      title: normalizedTitle,
      description: description.trim(),
      city: finalCity.trim(),
      county: county.trim(),

      location_search: locationSearch?.trim() || null,

      latitude:
        latitude !== null && Number.isFinite(latitude)
          ? latitude
          : null,

      longitude:
        longitude !== null && Number.isFinite(longitude)
          ? longitude
          : null,

      property_name: propertyName?.trim() || null,
      property_type: propertyType?.trim() || null,

      price_kes:
        price !== null && price !== undefined && price !== ''
          ? Number(price)
          : null,

      listing_type: listingType?.trim() || 'rent',

      deposit_required: Boolean(depositRequired),
      deposit_structure: depositStructure?.trim() || null,

      deposit_amount:
        depositAmount !== null &&
        depositAmount !== undefined &&
        depositAmount !== ''
          ? Number(depositAmount)
          : 0,

      size: finalSize?.trim() || null,

      beds:
        beds !== null && beds !== undefined && beds !== ''
          ? Number(beds)
          : 0,

      baths:
        baths !== null && baths !== undefined && baths !== ''
          ? Number(baths)
          : 0,

      contact_phone: phone.trim(),
      contact_email: email.trim(),

      social_links: Array.isArray(socialLinks)
        ? socialLinks
            .filter(
              (item) =>
                item &&
                typeof item.url === 'string' &&
                item.url.trim()
            )
            .map((item) => ({
              platform:
                typeof item.platform === 'string'
                  ? item.platform.trim()
                  : '',
              url: item.url.trim(),
            }))
        : [],

      booking_enabled: Boolean(bookingEnabled),
      payment_enabled: Boolean(paymentEnabled),
      is_property_management: Boolean(isPropertyManagementListing),
    };
  };


  // ==========================================================
  // HANDLE LISTING PAYMENT
  //
  // IMPORTANT:
  //
  // This creates a server-controlled payment intent
  // (create_listing_payment_intent), then initiates M-Pesa
  // against that intent (listing-payment-stk), then polls the
  // intent until the listing-payment-callback webhook has
  // confirmed payment server-side via process_listing_payment.
  //
  // The frontend never marks payment as completed on its own —
  // paymentCompleted only becomes true after the intent's status
  // is independently observed as PAID.
  //
  // PayPal is not yet wired to the individual listing fee on the
  // backend (only subscriptions have a PayPal Edge Function) —
  // selecting PAYPAL here surfaces a clear error instead of
  // silently failing.
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

    if (selectedPaymentMethod === 'PAYPAL') {
      setError(
        'PayPal is not yet available for the individual listing fee. Please use M-Pesa, or subscribe instead.'
      );

      return false;
    }

    setPaymentLoading(true);
    setError(null);

    try {
      // ========================================================
      // 1. CREATE A SERVER-CONTROLLED PAYMENT INTENT
      // ========================================================

      let intentId = paymentIntentId;

      if (!intentId) {
        const intent = await createListingPaymentIntent(
          buildListingPayload()
        );

        intentId = intent.paymentIntentId;

        setPaymentIntentId(intentId);
      }

      // ========================================================
      // 2. INITIATE M-PESA STK PUSH AGAINST THE INTENT
      // ========================================================

      const {
        data,
        error: mpesaError,
      } = await supabase.functions.invoke(
        'listing-payment-stk',
        {
          body: {
            payment_intent_id: intentId,
          },
        }
      );

      if (mpesaError) {
        throw mpesaError;
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            'The M-Pesa payment request could not be started.'
        );
      }

      // ========================================================
      // 3. WAIT FOR THE listing-payment-callback WEBHOOK TO
      //    CONFIRM PAYMENT SERVER-SIDE
      // ========================================================

      const confirmed = await waitForListingPaymentIntent(intentId);

      if (!confirmed) {
        throw new Error(
          'The listing payment was not confirmed. If you completed the M-Pesa prompt, please wait a moment and try again.'
        );
      }

      setPaymentCompleted(true);

      return true;

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

  const MAX_PHOTOS = 7;
  const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB
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
      if (!file.type.startsWith('image/')) {
        setError(
          `${file.name} is not a valid image file.`
        );
        continue;
      }

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
        label: `Photo ${photos.length + index + 1}`,
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

    if (!file.type.startsWith('video/')) {
      setError(
        'Please select a valid video file.'
      );
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      setError(
        'Video is too large. Maximum allowed size is 100 MB.'
      );
      return;
    }

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
          ? { ...photo, label }
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
      photos.forEach((photo) => {
        if (
          photo.url &&
          photo.url.startsWith('blob:')
        ) {
          URL.revokeObjectURL(photo.url);
        }
      });

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
          platform: 'WhatsApp',
          url: '',
        },
      ]
    );
  };


  const updateSocialLink = (
    index: number,
    field: 'platform' | 'url',
    value: string
  ) => {
    setSocialLinks(
      (current) =>
        current.map(
          (link, i) =>
            i === index
              ? { ...link, [field]: value }
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
          (_, i) => i !== index
        )
    );
  };


  // ==========================================================
  // AUTHENTICATION / ROLE GATE
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

  if (!listingRole) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Only landlord and real estate accounts can post listings.
        </p>
      </div>
    );
  }


  // ==========================================================
  // KYC UI GATE
  //
  // IMPORTANT:
  //
  // This is NOT the security boundary. The database
  // independently enforces verification (and, for landlords,
  // application approval) in every listing/payment RPC.
  // ==========================================================

  if (profile.verification_status !== 'verified') {
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
  //
  // Flow:
  //
  // 1. Client-side form validation only (UX, not security).
  // 2. If payment is required and hasn't completed yet, run the
  //    payment flow (creates the intent, pays via M-Pesa, waits
  //    for server-side confirmation). Once confirmed, the
  //    listing has ALREADY been created by process_listing_payment
  //    — we look it up and finish, we do NOT call
  //    create_role_aware_listing afterward (that would attempt a
  //    second listing).
  // 3. Otherwise (free / subscription entitlement), call
  //    create_role_aware_listing directly. If it reports payment
  //    is required after all (entitlement changed since page
  //    load), fall through to the same payment flow instead of
  //    erroring out.
  // ==========================================================

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    setAiCaption('');

    let listingId: string | null = null;

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw new Error(
          'Unable to verify your login session.'
        );
      }

      if (!user) {
        throw new Error(
          'Your login session has expired. Please sign in again.'
        );
      }

      // ========================================================
      // CLIENT-SIDE FORM VALIDATION ONLY
      // ========================================================

      if (!title?.trim() && !propertyName?.trim()) {
        throw new Error('A listing title is required.');
      }

      if (!description?.trim()) {
        throw new Error('A listing description is required.');
      }

      if (!finalCity?.trim()) {
        throw new Error('A city is required.');
      }

      if (!county?.trim()) {
        throw new Error('A county is required.');
      }

      if (!phone?.trim()) {
        throw new Error('A contact phone number is required.');
      }

      if (!email?.trim()) {
        throw new Error('A contact email is required.');
      }

      if (
        isPropertyManagementListing &&
        (!Array.isArray(units) || units.length === 0)
      ) {
        throw new Error('At least one property unit is required.');
      }

      // ========================================================
      // PAYMENT-REQUIRED PATH
      //
      // If we already know payment is required (from the loaded
      // entitlement), or the payment step was reached, the payment
      // must have already been confirmed via handleListingPayment
      // before this button is reachable (see canProceed()).
      // ========================================================

      if (paymentRequired) {
        if (!paymentCompleted || !paymentIntentId) {
          throw new Error(
            'Please complete the listing payment before publishing.'
          );
        }

        const foundListingId = await findRecentlyPaidListing(user.id);

        if (!foundListingId) {
          throw new Error(
            'Payment was confirmed, but the listing could not be located. Please contact support.'
          );
        }

        listingId = foundListingId;

      } else {
        // ======================================================
        // FREE / SUBSCRIPTION PATH
        // ======================================================

        const result = await createRoleAwareListing(
          buildListingPayload()
        );

        if (result.listing_created && result.listing_id) {
          listingId = result.listing_id;

        } else if (result.requires_individual_payment) {
          // Entitlement changed since page load (e.g. free listings
          // were used up in another tab). Re-run the payment flow
          // instead of silently failing.
          setListingPaymentRequirement('required');

          throw new Error(
            'Your free/subscription listing entitlement is no longer available. Please complete the listing payment shown on the Payment step to continue.'
          );

        } else {
          throw new Error(
            'The listing could not be created. Please try again.'
          );
        }
      }

      if (!listingId) {
        throw new Error(
          'The listing was processed but no listing ID was returned.'
        );
      }

      // ========================================================
      // AI CAPTION — BEST EFFORT ONLY
      //
      // AI failure MUST NOT cause the listing creation to fail,
      // and does NOT determine payment, approval, publication, or
      // ownership.
      // ========================================================

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-caption`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              listing: {
                id: listingId,
                title: (isPropertyManagementListing ? propertyName : title)?.trim(),
                description: description.trim(),
                city: finalCity,
                county,
                price_kes: price ? Number(price) : null,
                listing_type: listingType?.trim() || 'rent',
                size: finalSize?.trim() || null,
                beds: Number(beds) || 0,
                baths: Number(baths) || 0,
                deposit_required: Boolean(depositRequired),
                property_name: propertyName?.trim() || null,
                property_type: propertyType?.trim() || null,
                units:
                  isPropertyManagementListing && Array.isArray(units)
                    ? units.map((unit) => ({
                        unit_number: unit.unitNumber.trim(),
                        unit_type: unit.unitType.trim(),
                        rent: Number(unit.rent),
                        deposit_amount: unit.depositAmount
                          ? Number(unit.depositAmount)
                          : 0,
                        size: unit.size?.trim() || null,
                        beds: Number(unit.beds),
                        baths: Number(unit.baths),
                        availability: unit.availability || 'available',
                        description: unit.description?.trim() || null,
                      }))
                    : [],
              },
            }),
          }
        );

        if (response.ok) {
          const captionData = await response.json();

          const generatedCaption =
            typeof captionData?.caption === 'string'
              ? captionData.caption.trim()
              : '';

          if (generatedCaption) {
            setAiCaption(generatedCaption);

            const { error: captionError } = await supabase
              .from('listings')
              .update({
                ai_caption: generatedCaption,
                ai_caption_generated_at: new Date().toISOString(),
              })
              .eq('id', listingId);

            if (captionError) {
              console.warn(
                'AI caption generated but could not be saved:',
                captionError
              );
            }
          }
        } else {
          console.warn(
            'Gemini caption generation failed:',
            response.status,
            response.statusText
          );
        }

      } catch (aiError) {
        console.warn(
          'AI caption generation failed. Listing remains created:',
          aiError
        );
      }

      // ========================================================
      // SUCCESS
      //
      // Do NOT say "Your listing is live" — the listing is created
      // as approval_status = pending_review, is_approved = false,
      // is_published = false.
      // ========================================================

      setCreatedListingId(listingId);
      setSuccess(true);

    } catch (err) {
      console.error(
        '❌ Failed to submit listing:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to post listing. Please try again.'
      );

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
              onClick={() => navigate('listings')}
              className="btn-primary"
            >
              View My Listings
            </button>
            <button
              onClick={() => navigate('community')}
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
    <>
      <PropertyListingForm
        step={step}
        STEPS={STEPS}
        error={error}
        submitting={submitting}
        setStep={setStep}
        canProceed={canProceed}
        handleSubmit={handleSubmit}

        reviewConfirmed={reviewConfirmed}
        setReviewConfirmed={setReviewConfirmed}

        selectedPaymentMethod={selectedPaymentMethod}
        setSelectedPaymentMethod={setSelectedPaymentMethod}

        termsAccepted={termsAccepted}
        setTermsAccepted={setTermsAccepted}

        subscriptionStatus={subscriptionStatus}
        freeListingsRemaining={freeListingsRemaining}
        isPropertyManagementListing={isPropertyManagementListing}

        listingPaymentRequirement={listingPaymentRequirement}
        paymentLoading={paymentLoading}
        paymentRequired={paymentRequired}
        handleListingPayment={handleListingPayment}
        paymentDescription={paymentDescription}
        LISTING_FEE_KES={LISTING_FEE_KES}
        FREE_LISTING_LIMIT={FREE_LISTING_LIMIT}
        paymentCompleted={paymentCompleted}
        setPaymentCompleted={setPaymentCompleted}
        onOpenPaymentModal={() => setPaymentModalOpen(true)}

        formatKES={formatKES}

        city={city}
        setCity={setCity}
        customCity={customCity}
        setCustomCity={setCustomCity}
        county={county}
        setCounty={setCounty}

        locationSearch={locationSearch}
        setLocationSearch={setLocationSearch}
        locationSuggestions={locationSuggestions}
        setLocationSuggestions={setLocationSuggestions}

        latitude={latitude}
        setLatitude={setLatitude}
        longitude={longitude}
        setLongitude={setLongitude}

        usingGPS={usingGPS}
        setUsingGPS={setUsingGPS}
        handleUseCurrentLocation={handleUseCurrentLocation}

        KENYAN_CITIES={KENYAN_CITIES}
        KENYAN_COUNTIES={KENYAN_COUNTIES}

        propertyName={propertyName}
        setPropertyName={setPropertyName}
        propertyType={propertyType}
        setPropertyType={setPropertyType}

        bookingEnabled={bookingEnabled}
        setBookingEnabled={setBookingEnabled}
        paymentEnabled={paymentEnabled}
        setPaymentEnabled={setPaymentEnabled}

        listingType={listingType}
        setListingType={setListingType}

        price={price}
        setPrice={setPrice}

        depositRequired={depositRequired}
        setDepositRequired={setDepositRequired}
        depositStructure={depositStructure}
        setDepositStructure={setDepositStructure}
        depositAmount={depositAmount}
        setDepositAmount={setDepositAmount}

        units={units}
        setUnits={setUnits}
        addUnit={addUnit}
        updateUnit={updateUnit}

        phone={phone}
        setPhone={setPhone}
        email={email}
        setEmail={setEmail}

        socialLinks={socialLinks}
        setSocialLinks={setSocialLinks}
        addSocialLink={addSocialLink}
        updateSocialLink={updateSocialLink}
        removeSocialLink={removeSocialLink}
        SOCIAL_PLATFORMS={SOCIAL_PLATFORMS}

        photos={photos}
        setPhotos={setPhotos}
        removePhoto={removePhoto}
        updatePhotoLabel={updatePhotoLabel}
        handlePhotoUpload={handlePhotoUpload}

        video={video}
        removeVideo={removeVideo}
        handleVideoUpload={handleVideoUpload}

        title={title}
        setTitle={setTitle}
        description={description}
        setDescription={setDescription}

        size={size}
        setSize={setSize}
        customSize={customSize}
        setCustomSize={setCustomSize}

        beds={beds}
        setBeds={setBeds}
        baths={baths}
        setBaths={setBaths}

        HOUSE_SIZES={HOUSE_SIZES}
      />

      <ListingPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        role={listingRole}
        amountKes={LISTING_FEE_KES}
        paymentLoading={paymentLoading}
        paymentCompleted={paymentCompleted}
        selectedPaymentMethod={selectedPaymentMethod}
        onSelectPaymentMethod={setSelectedPaymentMethod}
        onPayNow={handleListingPayment}
        onContinueToSubscription={handleContinueToSubscription}
        error={error}
      />
    </>
  );
}