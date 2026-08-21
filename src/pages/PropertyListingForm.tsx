import { useState, useEffect } from 'react';
import {
  MapPin,
  DollarSign,
  Phone,
  Mail,
  Image,
  Video,
  FileText,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Upload,
  CheckCircle2,
  Loader2,
  Home,
} from 'lucide-react';

import {
  KENYAN_CITIES,
  KENYAN_COUNTIES,
  cn,
} from '@/lib/utils';

import TermsGate from '@/components/TermsGate';

type UnitAvailability =
  | 'available'
  | 'occupied'
  | 'reserved';

interface MediaItem {
  file?: File;
  url: string;
  label: string;
  type: 'photo' | 'video';
}

interface SocialLink {
  platform: string;
  url: string;
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
  lat: string | number;
  lon: string | number;
}

export default function PropertyListingForm({
  isPropertyManagementListing,
  subscriptionStatus,
  freeListingsRemaining,
  paymentRequired,
  paymentVerified,

  formatKES,
  LISTING_FEE_KES,

  step,
  setStep,
  STEPS,

  reviewConfirmed,
  setReviewConfirmed,

  city,
  setCity,
  customCity,
  setCustomCity,
  county,
  setCounty,

  locationSearch,
  setLocationSearch,
  locationSuggestions,
  setLocationSuggestions,
  setLatitude,
  setLongitude,
  handleUseCurrentLocation,
  usingGPS,

  propertyName,
  setPropertyName,
  propertyType,
  setPropertyType,

  units,
  addUnit,
  updateUnit,
  setUnits,

  bookingEnabled,
  setBookingEnabled,
  paymentEnabled,
  setPaymentEnabled,

  listingType,
  setListingType,
  price,
  setPrice,

  depositRequired,
  setDepositRequired,
  depositStructure,
  setDepositStructure,
  depositAmount,
  setDepositAmount,

  phone,
  setPhone,
  email,
  setEmail,

  socialLinks,
  addSocialLink,
  updateSocialLink,
  removeSocialLink,
  SOCIAL_PLATFORMS,

  photos,
  removePhoto,
  updatePhotoLabel,
  handlePhotoUpload,

  video,
  handleVideoUpload,

  title,
  setTitle,
  size,
  setSize,
  customSize,
  setCustomSize,
  HOUSE_SIZES,

  beds,
  setBeds,
  baths,
  setBaths,
  description,
  setDescription,

  error,
  canProceed,
  handleSubmit,
  submitting,

  removeVideo,
  paymentLoading,

  selectedPaymentMethod,
  setSelectedPaymentMethod,
  paymentCompleted,

  termsAccepted,
  setTermsAccepted,
}: any) {

  /*
   * =========================================================
   * DERIVED VALUES
   * =========================================================
   */

  const finalCity =
    city === 'custom'
      ? customCity?.trim() || ''
      : city?.trim() || '';

  const finalSize =
    size === 'Custom Size'
      ? customSize?.trim() || ''
      : size?.trim() || '';

  /*
   * =========================================================
   * SAFE STEP HELPERS
   * =========================================================
   */

  const propertyUnitsStep = 1;
  const financialStep = isPropertyManagementListing ? 2 : 1;
  const contactStep = isPropertyManagementListing ? 3 : 2;
  const mediaStep = isPropertyManagementListing ? 4 : 3;
  const detailsStep = isPropertyManagementListing ? 5 : 4;
  



  /*
   * =========================================================
   * CONTACT VALIDATION
   *
   * We keep the parent's canProceed() authoritative.
   * This local helper is only used for displaying contact
   * status where needed.
   * =========================================================
   */

  const normalizedPhone = String(phone || '').replace(/\s+/g, '');

  const contactLooksValid =
    normalizedPhone !== '' || String(email || '').trim() !== '';

  /*
   * =========================================================
   * UNIT PHOTO DELETE
   * =========================================================
   */

  const removeUnitPhoto = (
    unit: PropertyUnit,
    photoIndex: number
  ) => {
    const updatedPhotos = unit.photos.filter(
      (_photo, index) => index !== photoIndex
    );

    updateUnit(
      unit.id,
      'photos',
      updatedPhotos
    );
  };

  /*
   * =========================================================
   * UNIT PHOTO UPLOAD
   * =========================================================
   */

  const handleUnitPhotoUpload = (
    unit: PropertyUnit,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) {
      return;
    }

    const remainingSlots = Math.max(
      0,
      7 - unit.photos.length
    );

    if (remainingSlots === 0) {
      return;
    }

    const filesToAdd = Array.from(files)
      .filter((file) =>
        file.type.startsWith('image/')
      )
      .slice(0, remainingSlots);

    const newPhotos: MediaItem[] =
      filesToAdd.map(
        (file, photoIndex) => ({
          file,
          url: URL.createObjectURL(file),
          label: `Unit Photo ${
            unit.photos.length +
            photoIndex +
            1
          }`,
          type: 'photo',
        })
      );

    updateUnit(
      unit.id,
      'photos',
      [
        ...unit.photos,
        ...newPhotos,
      ]
    );
  };

  /*
   * =========================================================
   * MAIN PHOTO UPLOAD WRAPPER
   *
   * Prevents the user from exceeding 7 images even if the
   * parent handler does not perform the limit.
   * =========================================================
   */

  const handleMainPhotoUpload = (
    files: FileList | null
  ) => {
    if (!files || files.length === 0) {
      return;
    }

    if (photos.length >= 7) {
      return;
    }

    const remainingSlots = 7 - photos.length;

    const selectedFiles = Array.from(files)
      .filter((file) =>
        file.type.startsWith('image/')
      )
      .slice(0, remainingSlots);

    if (selectedFiles.length === 0) {
      return;
    }

    /*
     * The existing parent handler owns the actual
     * MediaItem state creation, so pass a new FileList-like
     * collection only when possible.
     *
     * Most implementations of handlePhotoUpload accept
     * FileList directly. To preserve compatibility, we
     * use the original FileList when it already fits.
     */

    if (
      selectedFiles.length === files.length
    ) {
      handlePhotoUpload(files);
      return;
    }

    /*
     * Create a DataTransfer object when we need to limit
     * the selected files.
     */
    const dataTransfer =
      new DataTransfer();

    selectedFiles.forEach((file) => {
      dataTransfer.items.add(file);
    });

    handlePhotoUpload(
      dataTransfer.files
    );
  };

  /*
   * =========================================================
   * NAVIGATION
   * =========================================================
   */

  const goBack = () => {
    setStep(
      Math.max(0, step - 1)
    );
  };

  const goNext = () => {
    if (!canProceed()) {
      return;
    }

    setStep(
      Math.min(
        STEPS.length - 1,
        step + 1
      )
    );
  };

    /*
    * =========================================================
    * PAYMENT SUMMARY
    * =========================================================
    *
    * IMPORTANT:
    * The parent already determines whether payment is required
    * from the authoritative PostgreSQL entitlement RPC.
    *
    * The child should NOT recalculate payment entitlement from:
    * - subscription status
    * - free listings
    * - trial status
    *
    * `paymentRequired` is therefore the source of truth for UI.
    * =========================================================
    */

    const isSubscriptionActive =
    subscriptionStatus === 'active';

    const isTrial =
    subscriptionStatus === 'trial';

    const remainingFreeListings =
    Math.max(
        0,
        Number(freeListingsRemaining ?? 0)
    );

    const hasFreeListing =
    remainingFreeListings > 0;

    /*
    * PostgreSQL/parent entitlement decision.
    */
    const listingRequiresPayment =
    Boolean(paymentRequired);

    /*
    * Payment step:
    *
    * Property management:
    *   0 Property
    *   1 Units
    *   2 Financial
    *   3 Contact
    *   4 Media
    *   5 Details
    *   6 Review
    *   7 Payment
    *
    * Normal listing:
    *   0 Location
    *   1 Financial
    *   2 Contact
    *   3 Media
    *   4 Details
    *   5 Review
    *   6 Payment
    */
    const paymentStep =
    listingRequiresPayment
        ? isPropertyManagementListing
        ? 7
        : 6
        : -1;

     /*
   * =========================================================
   * search location dropdown
   * =========================================================
   */


    const searchPropertyLocation = async (query: string) => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 3) {
        setLocationSuggestions([]);
        return;
    }

    try {
        const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ke&q=${encodeURIComponent(
            trimmedQuery
        )}`,
        {
            headers: {
            Accept: 'application/json',
            },
        }
        );

        if (!response.ok) {
        throw new Error(
            `Location search failed: ${response.status}`
        );
        }

        const data = await response.json();

        setLocationSuggestions(
        data.map((item: any) => ({
            display_name: item.display_name,
            lat: item.lat,
            lon: item.lon,
        }))
        );
    } catch (error) {
        console.error(
        '❌ Property location search failed:',
        error
        );

        setLocationSuggestions([]);
    }
    };

    /*
    * =========================================================
    * location dropdown useeffect
    * =========================================================
    */

    useEffect(() => {
    const query = locationSearch.trim();

    if (query.length < 3) {
        setLocationSuggestions([]);
        return;
    }

    const timeout = setTimeout(() => {
        searchPropertyLocation(query);
    }, 400);

    return () => clearTimeout(timeout);
    }, [locationSearch]);


  /*
   * =========================================================
   * RENDER
   * =========================================================
   */


  console.log('========== LISTING PAYMENT DEBUG ==========');
console.log('isPropertyManagementListing:', isPropertyManagementListing);
console.log('step:', step);
console.log('subscriptionStatus:', subscriptionStatus);
console.log('freeListingsRemaining:', freeListingsRemaining);
console.log('LISTING_FEE_KES:', LISTING_FEE_KES);

console.log('Active subscription condition:', 
  subscriptionStatus === 'active'
);

console.log('Free listing condition:', 
  subscriptionStatus !== 'active' &&
  freeListingsRemaining > 0
);

console.log('Payment required condition:', 
  subscriptionStatus !== 'active' &&
  freeListingsRemaining <= 0
);

console.log('============================================');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* =====================================================
            PAGE HEADER
        ====================================================== */}

        <div className="mb-8">
          <div className="flex items-start gap-3">

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-800/50">
              <Home className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            </div>

            <div className="min-w-0 flex-1">

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {isPropertyManagementListing
                    ? 'Post a Property'
                    : 'Post a House Listing'}
                </h1>

                {isPropertyManagementListing && (
                  <span className="inline-flex w-fit items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-800/50 dark:text-brand-300">
                    Property Management
                  </span>
                )}

              </div>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {isPropertyManagementListing
                  ? 'Create a property listing and manage its individual units.'
                  : 'Create a listing for one house or rental unit.'}
              </p>

              {/* Subscription status */}

              <div className="mt-2">

                {subscriptionStatus === 'active' ? (
                  <p className="text-sm text-success-600 dark:text-success-400">
                    Active subscription — listings are free while your
                    subscription is active.
                  </p>
                ) : subscriptionStatus === 'trial' ? (
                  <p className="text-sm text-brand-600 dark:text-brand-400">
                    Free trial — {freeListingsRemaining} free listing
                    {freeListingsRemaining === 1 ? '' : 's'} remaining.
                  </p>
                ) : subscriptionStatus === 'expired' ? (
                  <p className="text-sm text-warning-600 dark:text-warning-400">
                    Your subscription has expired. New listings cost{' '}
                    {formatKES(LISTING_FEE_KES)} each.
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {freeListingsRemaining > 0
                      ? `${freeListingsRemaining} free listing${
                          freeListingsRemaining === 1
                            ? ''
                            : 's'
                        } remaining.`
                      : `Your free listings are finished. Each new listing costs ${formatKES(
                          LISTING_FEE_KES
                        )}.`}
                  </p>
                )}

              </div>
            </div>
          </div>
        </div>

        {/* =====================================================
            TERMS GATE
        ====================================================== */}

        <TermsGate
          context="listing"
          onAccept={() =>
            setTermsAccepted(true)
          }
        >

          <div className="space-y-6">

            {/* =================================================
                STEP INDICATOR
            ================================================== */}

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-brand-700 dark:bg-brand-900 sm:p-5">

              <div className="overflow-x-auto pb-2">

                <div className="flex min-w-max items-start justify-between gap-2 sm:w-full sm:min-w-0">

                  {STEPS.map(
                    (
                      label: string,
                      i: number
                    ) => (

                      <div
                        key={`${label}-${i}`}
                        className="flex flex-1 flex-col items-center"
                      >

                        <div
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                            i < step
                              ? 'bg-success-500 text-white'
                              : i === step
                              ? 'bg-brand-600 text-white'
                              : 'bg-gray-200 text-gray-400 dark:bg-brand-800 dark:text-gray-500'
                          )}
                        >

                          {i < step ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            i + 1
                          )}

                        </div>

                        <span
                          className={cn(
                            'mt-1 hidden text-xs font-medium sm:block',
                            i === step
                              ? 'text-brand-600 dark:text-brand-400'
                              : 'text-gray-400'
                          )}
                        >
                          {label}
                        </span>

                      </div>
                    )
                  )}

                </div>
              </div>

              <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-brand-800">

                <div
                  className="h-full rounded-full bg-brand-600 transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      ((step + 1) /
                        STEPS.length) *
                        100
                    )}%`,
                  }}
                />

              </div>
            </div>

            {/* =================================================
                STEP CONTENT
            ================================================== */}

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-brand-700 dark:bg-brand-900">

              <div className="p-4 sm:p-6">

                {/* =================================================
                    STEP 0 — LOCATION
                ================================================== */}

                {step === 0 && (
                  <div className="space-y-5 animate-fade-in">

                    <div>
                      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">

                        <MapPin className="h-5 w-5 text-brand-600" />

                        Location Details

                      </h3>

                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Tell potential tenants where this property is located.
                      </p>
                    </div>

                    {/* City */}

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        City
                      </label>

                      <select
                        value={city}
                        onChange={(e) =>
                          setCity(e.target.value)
                        }
                        className="input-field"
                      >
                        <option value="">
                          Select a city...
                        </option>

                        {KENYAN_CITIES.map(
                          (c: string) => (
                            <option
                              key={c}
                              value={c}
                            >
                              {c}
                            </option>
                          )
                        )}

                        <option value="custom">
                          Other (custom)...
                        </option>
                      </select>
                    </div>

                    {/* Custom City */}

                    {city === 'custom' && (
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Custom City
                        </label>

                        <input
                          type="text"
                          value={customCity}
                          onChange={(e) =>
                            setCustomCity(
                              e.target.value
                            )
                          }
                          placeholder="Enter city name"
                          className="input-field"
                        />
                      </div>
                    )}

                    {/* County */}

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        County
                      </label>

                      <select
                        value={county}
                        onChange={(e) =>
                          setCounty(
                            e.target.value
                          )
                        }
                        className="input-field"
                      >
                        <option value="">
                          Select a county...
                        </option>

                        {KENYAN_COUNTIES.map(
                          (c: string) => (
                            <option
                              key={c}
                              value={c}
                            >
                              {c}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {/* Location Search */}

                    <div className="relative">

                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Search Property Location
                      </label>

                      <div className="relative">

                        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                        <input
                        type="text"
                        value={locationSearch}
                        onChange={(e) => {
                            setLocationSearch(e.target.value);

                            // Clear old coordinates because the user
                            // has started entering a new location.
                            setLatitude(null);
                            setLongitude(null);
                        }}
                        placeholder="Start typing an area, road, building or landmark..."
                        className="input-field pl-10"
                        autoComplete="off"
                        />

                      </div>

                      {locationSuggestions.length >
                        0 && (

                        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-brand-700 dark:bg-brand-900">

                          {locationSuggestions.map(
                            (
                              location: LocationSuggestion,
                              index: number
                            ) => (

                              <button
                                key={`${location.display_name}-${index}`}
                                type="button"
                                onClick={() => {
                                  setLocationSearch(
                                    location.display_name
                                  );

                                  setLatitude(
                                    Number(
                                      location.lat
                                    )
                                  );

                                  setLongitude(
                                    Number(
                                      location.lon
                                    )
                                  );

                                  setLocationSuggestions(
                                    []
                                  );
                                }}
                                className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-brand-800"
                              >

                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />

                                <span>
                                  {
                                    location.display_name
                                  }
                                </span>

                              </button>
                            )
                          )}

                        </div>
                      )}

                    </div>

                    {/* GPS */}

                    <button
                      type="button"
                      onClick={
                        handleUseCurrentLocation
                      }
                      disabled={usingGPS}
                      className="btn-secondary w-full"
                    >
                      {usingGPS ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Getting your location...
                        </>
                      ) : (
                        <>
                          <MapPin className="h-4 w-4" />
                          Use My Current Location
                        </>
                      )}
                    </button>

                    {/* Property Management */}

                    {isPropertyManagementListing && (
                      <div className="mt-6 grid gap-5 border-t border-gray-200 pt-5 dark:border-brand-700 sm:grid-cols-2">

                        <div className="sm:col-span-2">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            Property Information
                          </h4>

                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            These details identify the property containing
                            your units.
                          </p>
                        </div>

                        {/* Property Name */}

                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Property / Apartment Name
                          </label>

                          <input
                            type="text"
                            value={propertyName}
                            onChange={(e) =>
                              setPropertyName(
                                e.target.value
                              )
                            }
                            placeholder="e.g. Green View Apartments"
                            className="input-field"
                          />
                        </div>

                        {/* Property Type */}

                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Property Type
                          </label>

                          <select
                            value={propertyType}
                            onChange={(e) =>
                              setPropertyType(
                                e.target.value
                              )
                            }
                            className="input-field"
                          >
                            <option value="">
                              Select property type...
                            </option>

                            <option value="apartment">
                              Apartment
                            </option>

                            <option value="flats">
                              Flats
                            </option>

                            <option value="townhouse">
                              Townhouse
                            </option>

                            <option value="maisonette">
                              Maisonette
                            </option>

                            <option value="residential_building">
                              Residential Building
                            </option>

                            <option value="other">
                              Other
                            </option>
                          </select>
                        </div>

                      </div>
                    )}

                  </div>
                )}

                {/* =================================================
                    PROPERTY MANAGEMENT — UNITS
                ================================================== */}

                {isPropertyManagementListing &&
                  step === propertyUnitsStep && (

                    <div className="space-y-5 animate-fade-in">

                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

                        <div>
                          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                            <Home className="h-5 w-5 text-brand-600" />
                            Property Units
                          </h3>

                          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                            Add the individual units available in this
                            property. Each unit can have its own rent,
                            availability and details.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={addUnit}
                          className="btn-primary w-full sm:w-auto sm:shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                          Add Unit
                        </button>

                      </div>

                      {/* Empty */}

                      {units.length === 0 && (
                        <div className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center dark:border-brand-700">

                          <Home className="mx-auto h-10 w-10 text-gray-400" />

                          <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
                            No units added yet
                          </p>

                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Add at least one unit to continue.
                          </p>

                          <button
                            type="button"
                            onClick={addUnit}
                            className="btn-secondary mt-4"
                          >
                            <Plus className="h-4 w-4" />
                            Add First Unit
                          </button>

                        </div>
                      )}

                      {/* Units */}

                      <div className="space-y-4">

                        {units.map(
                          (
                            unit: PropertyUnit,
                            index: number
                          ) => (

                            <div
                              key={unit.id}
                              className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 dark:border-brand-700 dark:bg-brand-900/40"
                            >

                              {/* Unit Header */}

                              <div className="mb-5 flex items-center justify-between">

                                <div>
                                  <h4 className="font-semibold text-gray-900 dark:text-white">
                                    Unit {index + 1}
                                  </h4>

                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Unit-specific information
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setUnits(
                                      (
                                        current: PropertyUnit[]
                                      ) =>
                                        current.filter(
                                          (
                                            item
                                          ) =>
                                            item.id !==
                                            unit.id
                                        )
                                    )
                                  }
                                  className="rounded-lg p-2 text-gray-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/20"
                                  aria-label={`Remove unit ${
                                    index + 1
                                  }`}
                                >
                                  <X className="h-4 w-4" />
                                </button>

                              </div>

                              {/* Unit Fields */}

                              <div className="grid gap-4 sm:grid-cols-2">

                                {/* Unit Number */}

                                <div>
                                  <label className="mb-1.5 block text-sm font-medium">
                                    Unit Number / Name
                                  </label>

                                  <input
                                    value={
                                      unit.unitNumber
                                    }
                                    onChange={(e) =>
                                      updateUnit(
                                        unit.id,
                                        'unitNumber',
                                        e.target.value
                                      )
                                    }
                                    placeholder="e.g. A101"
                                    className="input-field"
                                  />
                                </div>

                                {/* Unit Type */}

                                <div>
                                  <label className="mb-1.5 block text-sm font-medium">
                                    Unit Type
                                  </label>

                                  <select
                                    value={
                                      unit.unitType
                                    }
                                    onChange={(e) =>
                                      updateUnit(
                                        unit.id,
                                        'unitType',
                                        e.target.value
                                      )
                                    }
                                    className="input-field"
                                  >
                                    <option value="">
                                      Select type...
                                    </option>

                                    <option value="studio">
                                      Studio
                                    </option>

                                    <option value="1_bedroom">
                                      1 Bedroom
                                    </option>

                                    <option value="2_bedroom">
                                      2 Bedroom
                                    </option>

                                    <option value="3_bedroom">
                                      3 Bedroom
                                    </option>

                                    <option value="4_bedroom">
                                      4+ Bedroom
                                    </option>

                                    <option value="shop">
                                      Shop
                                    </option>

                                    <option value="office">
                                      Office
                                    </option>

                                    <option value="other">
                                      Other
                                    </option>
                                  </select>
                                </div>

                                {/* Rent */}

                                <div>
                                  <label className="mb-1.5 block text-sm font-medium">
                                    Monthly Rent (KES)
                                  </label>

                                  <input
                                    type="number"
                                    value={
                                      unit.rent
                                    }
                                    onChange={(e) =>
                                      updateUnit(
                                        unit.id,
                                        'rent',
                                        e.target.value
                                      )
                                    }
                                    placeholder="e.g. 35000"
                                    className="input-field"
                                    min={0}
                                  />
                                </div>

                                {/* Deposit */}

                                <div>
                                  <label className="mb-1.5 block text-sm font-medium">
                                    Deposit (KES)
                                  </label>

                                  <input
                                    type="number"
                                    value={
                                      unit.depositAmount
                                    }
                                    onChange={(e) =>
                                      updateUnit(
                                        unit.id,
                                        'depositAmount',
                                        e.target.value
                                      )
                                    }
                                    placeholder="e.g. 35000"
                                    className="input-field"
                                    min={0}
                                  />
                                </div>

                                {/* Availability */}

                                <div>
                                  <label className="mb-1.5 block text-sm font-medium">
                                    Availability
                                  </label>

                                  <select
                                    value={
                                      unit.availability
                                    }
                                    onChange={(e) =>
                                      updateUnit(
                                        unit.id,
                                        'availability',
                                        e.target
                                          .value as UnitAvailability
                                      )
                                    }
                                    className="input-field"
                                  >
                                    <option value="available">
                                      Available
                                    </option>

                                    <option value="occupied">
                                      Occupied
                                    </option>

                                    <option value="reserved">
                                      Reserved
                                    </option>
                                  </select>
                                </div>

                                {/* Size */}

                                <div>
                                  <label className="mb-1.5 block text-sm font-medium">
                                    Size
                                  </label>

                                  <input
                                    value={
                                      unit.size
                                    }
                                    onChange={(e) =>
                                      updateUnit(
                                        unit.id,
                                        'size',
                                        e.target.value
                                      )
                                    }
                                    placeholder="e.g. 850 sq ft"
                                    className="input-field"
                                  />
                                </div>

                                {/* Beds */}

                                <div>
                                  <label className="mb-1.5 block text-sm font-medium">
                                    Bedrooms
                                  </label>

                                  <select
                                    value={
                                      unit.beds
                                    }
                                    onChange={(e) =>
                                      updateUnit(
                                        unit.id,
                                        'beds',
                                        e.target.value
                                      )
                                    }
                                    className="input-field"
                                  >
                                    {[0, 1, 2, 3, 4, 5, 6].map(
                                      (n) => (
                                        <option
                                          key={n}
                                          value={n}
                                        >
                                          {n === 0
                                            ? 'Studio'
                                            : n === 6
                                            ? '6+'
                                            : n}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>

                                {/* Baths */}

                                <div>
                                  <label className="mb-1.5 block text-sm font-medium">
                                    Bathrooms
                                  </label>

                                  <select
                                    value={
                                      unit.baths
                                    }
                                    onChange={(e) =>
                                      updateUnit(
                                        unit.id,
                                        'baths',
                                        e.target.value
                                      )
                                    }
                                    className="input-field"
                                  >
                                    {[1, 2, 3, 4, 5].map(
                                      (n) => (
                                        <option
                                          key={n}
                                          value={n}
                                        >
                                          {n === 5
                                            ? '5+'
                                            : n}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>

                              </div>

                              {/* Unit Description */}

                              <div className="mt-4">

                                <label className="mb-1.5 block text-sm font-medium">
                                  Unit Description
                                </label>

                                <textarea
                                  value={
                                    unit.description
                                  }
                                  onChange={(e) =>
                                    updateUnit(
                                      unit.id,
                                      'description',
                                      e.target.value
                                    )
                                  }
                                  rows={3}
                                  placeholder="Describe this particular unit..."
                                  className="input-field resize-none"
                                />

                              </div>

                              {/* Unit Photos */}

                              <div className="mt-6 border-t border-gray-200 pt-5 dark:border-brand-700">

                                <div className="flex items-center justify-between">

                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                      Unit Photos{' '}
                                      <span className="text-error-500">
                                        *
                                      </span>
                                    </label>

                                    <p className="mt-1 text-xs text-gray-400">
                                      Add 3–7 photos showing this
                                      specific unit.
                                    </p>
                                  </div>

                                  <span className="text-xs text-gray-400">
                                    {unit.photos.length}/7
                                  </span>

                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">

                                  {unit.photos.map(
                                    (
                                      photo: MediaItem,
                                      photoIndex: number
                                    ) => (

                                      <div
                                        key={`${unit.id}-photo-${photoIndex}`}
                                        className="group relative"
                                      >

                                        <img
                                          src={
                                            photo.url
                                          }
                                          alt={
                                            photo.label ||
                                            `Unit photo ${
                                              photoIndex +
                                              1
                                            }`
                                          }
                                          className="h-28 w-full rounded-lg object-cover"
                                        />

                                        {/* FIXED DELETE BUTTON */}

                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeUnitPhoto(
                                              unit,
                                              photoIndex
                                            )
                                          }
                                          className="absolute right-1 top-1 rounded-full bg-error-600 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                          aria-label={`Remove unit photo ${
                                            photoIndex +
                                            1
                                          }`}
                                        >
                                          <X className="h-3 w-3" />
                                        </button>

                                        <input
                                          type="text"
                                          value={
                                            photo.label
                                          }
                                          onChange={(e) => {

                                            const updatedPhotos =
                                              [
                                                ...unit.photos,
                                              ];

                                            updatedPhotos[
                                              photoIndex
                                            ] = {
                                              ...updatedPhotos[
                                                photoIndex
                                              ],
                                              label:
                                                e.target
                                                  .value,
                                            };

                                            updateUnit(
                                              unit.id,
                                              'photos',
                                              updatedPhotos
                                            );
                                          }}
                                          placeholder="e.g. Living Room"
                                          className="input-field mt-1 text-xs"
                                        />

                                      </div>
                                    )
                                  )}

                                  {/* Add Unit Photo */}

                                  {unit.photos.length <
                                    7 && (

                                    <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500">

                                      <Upload className="h-6 w-6 text-gray-400" />

                                      <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Add Unit Photo
                                      </span>

                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {

                                          handleUnitPhotoUpload(
                                            unit,
                                            e.target.files
                                          );

                                          e.target.value =
                                            '';
                                        }}
                                      />

                                    </label>
                                  )}

                                </div>

                                {unit.photos.length <
                                  3 && (
                                  <p className="mt-2 text-xs text-error-500">
                                    Please add at least 3 photos for
                                    this unit.
                                  </p>
                                )}

                              </div>

                            </div>
                          )
                        )}

                      </div>

                      {/* Tenant Actions */}

                      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/20">

                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          Tenant Actions
                        </h4>

                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          Allow interested tenants to take action
                          directly from your published listing.
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">

                          {/* Booking */}

                          <button
                            type="button"
                            onClick={() =>
                              setBookingEnabled(
                                !bookingEnabled
                              )
                            }
                            className={cn(
                              'rounded-lg border-2 p-4 text-left transition-colors',
                              bookingEnabled
                                ? 'border-brand-500 bg-white dark:bg-brand-800'
                                : 'border-gray-200 dark:border-brand-700'
                            )}
                          >

                            <div className="font-semibold text-gray-900 dark:text-white">
                              Allow Booking
                            </div>

                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Tenants can request/book a unit.
                            </div>

                          </button>

                          {/* Payment */}

                          <button
                            type="button"
                            onClick={() =>
                              setPaymentEnabled(
                                !paymentEnabled
                              )
                            }
                            className={cn(
                              'rounded-lg border-2 p-4 text-left transition-colors',
                              paymentEnabled
                                ? 'border-brand-500 bg-white dark:bg-brand-800'
                                : 'border-gray-200 dark:border-brand-700'
                            )}
                          >

                            <div className="font-semibold text-gray-900 dark:text-white">
                              Allow Online Payment
                            </div>

                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Tenants can pay through the listing.
                            </div>

                          </button>

                        </div>
                      </div>

                    </div>
                  )}

                {/* =================================================
                    FINANCIAL DETAILS — NORMAL LISTING
                ================================================== */}

                {!isPropertyManagementListing &&
                  step === financialStep && (

                    <div className="space-y-5 animate-fade-in">

                      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                        <DollarSign className="h-5 w-5 text-brand-600" />
                        Financial Details
                      </h3>

                      {/* Listing Type */}

                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Listing Type
                        </label>

                        <div className="flex gap-3">

                          {(
                            [
                              'rent',
                              'sale',
                            ] as const
                          ).map((t) => (

                            <button
                              key={t}
                              type="button"
                              onClick={() =>
                                setListingType(t)
                              }
                              className={cn(
                                'flex-1 rounded-lg border-2 py-3 text-sm font-semibold capitalize transition-colors',
                                listingType === t
                                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                                  : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400'
                              )}
                            >
                              {t === 'rent'
                                ? 'For Rent'
                                : 'For Sale'}
                            </button>

                          ))}

                        </div>
                      </div>

                      {/* Price */}

                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Price (KES){' '}
                          {listingType === 'rent' &&
                            '/ month'}
                        </label>

                        <input
                          type="number"
                          value={price}
                          onChange={(e) =>
                            setPrice(
                              e.target.value
                            )
                          }
                          placeholder="e.g. 25000"
                          className="input-field"
                          min={0}
                        />

                        {price &&
                          Number(price) > 0 && (
                            <p className="mt-1 text-xs text-gray-400">
                              ≈{' '}
                              {formatKES(
                                Number(price)
                              )}
                              {listingType === 'rent'
                                ? '/month'
                                : ''}
                            </p>
                          )}
                      </div>

                      {/* Deposit */}

                      <div>

                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Deposit
                        </label>

                        <div className="flex gap-3">

                          <button
                            type="button"
                            onClick={() =>
                              setDepositRequired(
                                false
                              )
                            }
                            className={cn(
                              'flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors',
                              !depositRequired
                                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                                : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400'
                            )}
                          >
                            Optional
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setDepositRequired(
                                true
                              )
                            }
                            className={cn(
                              'flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors',
                              depositRequired
                                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                                : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400'
                            )}
                          >
                            Required
                          </button>

                        </div>
                      </div>

                      {/* Deposit Details */}

                      {depositRequired && (

                        <div className="space-y-4 rounded-lg bg-gray-50 p-4 dark:bg-brand-800/30">

                          <div>

                            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Deposit Payment Structure
                            </label>

                            <div className="flex gap-3">

                              <button
                                type="button"
                                onClick={() =>
                                  setDepositStructure(
                                    'fixed'
                                  )
                                }
                                className={cn(
                                  'flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                                  depositStructure ===
                                    'fixed'
                                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                                    : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400'
                                )}
                              >
                                Fixed
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setDepositStructure(
                                    'installments'
                                  )
                                }
                                className={cn(
                                  'flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                                  depositStructure ===
                                    'installments'
                                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                                    : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400'
                                )}
                              >
                                Installments Accepted
                              </button>

                            </div>
                          </div>

                          <div>

                            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Deposit Amount (KES)
                            </label>

                            <input
                              type="number"
                              value={
                                depositAmount
                              }
                              onChange={(e) =>
                                setDepositAmount(
                                  e.target.value
                                )
                              }
                              placeholder="e.g. 50000"
                              className="input-field"
                              min={0}
                            />

                          </div>

                        </div>
                      )}

                    </div>
                  )}

                {/* =================================================
                    FINANCIAL SUMMARY — PROPERTY MANAGEMENT
                ================================================== */}

                {isPropertyManagementListing &&
                  step === financialStep && (

                    <div className="space-y-5 animate-fade-in">

                      <div>

                        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                          <DollarSign className="h-5 w-5 text-brand-600" />
                          Unit Financial Summary
                        </h3>

                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          Financial information for property-management
                          listings is stored against each individual unit.
                        </p>

                      </div>

                      {units.length === 0 ? (

                        <div className="rounded-xl border border-error-200 bg-error-50 p-5 dark:border-error-900/40 dark:bg-error-900/20">

                          <p className="font-medium text-error-700 dark:text-error-400">
                            No units have been added.
                          </p>

                          <p className="mt-1 text-sm text-error-600 dark:text-error-400">
                            Go back to the Units step and add at least
                            one unit before continuing.
                          </p>

                        </div>

                      ) : (

                        <div className="space-y-3">

                          {units.map(
                            (
                              unit: PropertyUnit,
                              index: number
                            ) => (

                              <div
                                key={unit.id}
                                className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-700 dark:bg-brand-800/40"
                              >

                                <div className="flex items-start justify-between gap-4">

                                  <div>

                                    <p className="font-semibold text-gray-900 dark:text-white">
                                      Unit{' '}
                                      {unit.unitNumber ||
                                        index + 1}
                                    </p>

                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                      {unit.unitType ||
                                        'Unit type not selected'}
                                    </p>

                                  </div>

                                  <span
                                    className={cn(
                                      'rounded-full px-2.5 py-1 text-xs font-medium',
                                      unit.availability ===
                                        'available'
                                        ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                                        : unit.availability ===
                                          'reserved'
                                        ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
                                        : 'bg-gray-200 text-gray-600 dark:bg-brand-700 dark:text-gray-300'
                                    )}
                                  >
                                    {unit.availability}
                                  </span>

                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">

                                  <div>
                                    <p className="text-xs text-gray-400">
                                      Rent
                                    </p>

                                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                                      {unit.rent
                                        ? formatKES(
                                            Number(
                                              unit.rent
                                            )
                                          )
                                        : 'Not set'}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-xs text-gray-400">
                                      Deposit
                                    </p>

                                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                                      {unit.depositAmount
                                        ? formatKES(
                                            Number(
                                              unit.depositAmount
                                            )
                                          )
                                        : 'Not set'}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-xs text-gray-400">
                                      Bedrooms
                                    </p>

                                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                                      {unit.beds || '0'}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-xs text-gray-400">
                                      Bathrooms
                                    </p>

                                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                                      {unit.baths || '0'}
                                    </p>
                                  </div>

                                </div>

                              </div>
                            )
                          )}

                        </div>
                      )}

                    </div>
                  )}

                {/* =================================================
                    CONTACT
                ================================================== */}

                {step === contactStep && (

                  <div className="space-y-5 animate-fade-in">

                    <div>

                      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                        <Phone className="h-5 w-5 text-brand-600" />
                        Contact Details
                      </h3>

                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Multiple contact options allowed. Renters
                        will see these on your listing.
                      </p>

                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">

                      {/* Phone */}

                      <div>

                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Phone Number
                        </label>

                        <div className="relative">

                          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) =>
                              setPhone(
                                e.target.value
                              )
                            }
                            placeholder="0712345678"
                            className="input-field pl-10"
                          />

                        </div>

                      </div>

                      {/* Email */}

                      <div>

                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Email Address
                        </label>

                        <div className="relative">

                          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                          <input
                            type="email"
                            value={email}
                            onChange={(e) =>
                              setEmail(
                                e.target.value
                              )
                            }
                            placeholder="you@example.com"
                            className="input-field pl-10"
                          />

                        </div>

                      </div>

                    </div>

                    {/* Contact hint */}

                    {!contactLooksValid && (
                      <p className="text-xs text-error-500">
                        Please provide at least a phone number
                        or email address.
                      </p>
                    )}

                    {/* Social Links */}

                    <div>

                      <div className="flex items-center justify-between">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Social / Direct Links
                        </label>

                        <button
                          type="button"
                          onClick={
                            addSocialLink
                          }
                          className="btn-ghost text-xs"
                        >
                          <Plus className="h-4 w-4" />
                          Add Link
                        </button>

                      </div>

                      <div className="mt-2 space-y-2">

                        {socialLinks.map(
                          (
                            link: SocialLink,
                            index: number
                          ) => (

                            <div
                              key={`social-${index}`}
                              className="flex flex-col gap-2 sm:flex-row"
                            >

                              <select
                                value={
                                  link.platform
                                }
                                onChange={(e) =>
                                  updateSocialLink(
                                    index,
                                    'platform',
                                    e.target.value
                                  )
                                }
                                className="input-field w-full sm:w-36"
                              >

                                {SOCIAL_PLATFORMS.map(
                                  (
                                    platform: string
                                  ) => (

                                    <option
                                      key={platform}
                                      value={platform}
                                    >
                                      {platform}
                                    </option>
                                  )
                                )}

                              </select>

                              <input
                                type="url"
                                value={link.url}
                                onChange={(e) =>
                                  updateSocialLink(
                                    index,
                                    'url',
                                    e.target.value
                                  )
                                }
                                placeholder="https://..."
                                className="input-field flex-1"
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  removeSocialLink(
                                    index
                                  )
                                }
                                className="self-end rounded-lg p-2 text-gray-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/20 sm:self-auto"
                              >
                                <X className="h-4 w-4" />
                              </button>

                            </div>
                          )
                        )}

                      </div>

                    </div>

                  </div>
                )}

                {/* =================================================
                    MEDIA
                ================================================== */}

                {step === mediaStep && (

                  <div className="space-y-5 animate-fade-in">

                    <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                      <Image className="h-5 w-5 text-brand-600" />
                      Media Uploads
                    </h3>

                    {/* Photos */}

                    <div>

                      <div className="flex items-center justify-between">

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">

                          Photos{' '}

                          <span className="text-error-500">
                            *
                          </span>{' '}

                          ({photos.length}/7)

                        </label>

                        <p className="text-xs text-gray-400">
                          Min 3, Max 7
                        </p>

                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">

                        {photos.map(
                          (
                            photo: MediaItem,
                            index: number
                          ) => (

                            <div
                              key={`main-photo-${index}`}
                              className="group relative"
                            >

                              <img
                                src={
                                  photo.url
                                }
                                alt={
                                  photo.label ||
                                  `Property photo ${
                                    index + 1
                                  }`
                                }
                                className="h-28 w-full rounded-lg object-cover"
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  removePhoto(
                                    index
                                  )
                                }
                                className="absolute right-1 top-1 rounded-full bg-error-600 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                aria-label={`Remove photo ${
                                  index + 1
                                }`}
                              >
                                <X className="h-3 w-3" />
                              </button>

                              <input
                                type="text"
                                value={
                                  photo.label
                                }
                                onChange={(e) =>
                                  updatePhotoLabel(
                                    index,
                                    e.target.value
                                  )
                                }
                                placeholder="e.g. Kitchen"
                                className="input-field mt-1 text-xs"
                              />

                            </div>
                          )
                        )}

                        {photos.length < 7 && (

                          <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500">

                            <Upload className="h-6 w-6 text-gray-400" />

                            <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Add Photo
                            </span>

                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => {

                                handleMainPhotoUpload(
                                  e.target.files
                                );

                                e.target.value =
                                  '';
                              }}
                            />

                          </label>
                        )}

                      </div>

                      {photos.length < 3 && (
                        <p className="mt-2 text-xs text-error-500">
                          Please add at least 3 property photos.
                        </p>
                      )}

                    </div>

                    {/* Video */}

                    <div>

                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Walkthrough Video{' '}
                        <span className="text-gray-400">
                          (optional, up to 30 min)
                        </span>
                      </label>

                      {video ? (

                        <div className="relative">

                          <video
                            src={video.url}
                            className="h-40 w-full rounded-lg object-cover"
                            controls
                          />

                          <button
                            type="button"
                            onClick={removeVideo}
                            className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white"
                            aria-label="Remove walkthrough video"
                          >
                            <X className="h-4 w-4" />
                          </button>

                        </div>

                      ) : (

                        <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500">

                          <Video className="h-6 w-6 text-gray-400" />

                          <span className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Upload Video
                          </span>

                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];

                                if (file) {
                                handleVideoUpload(file);
                                }

                                e.target.value = '';
                            }}
                            />
                          

                        </label>
                      )}

                    </div>

                  </div>
                )}

                {/* =================================================
                    HOUSE DETAILS
                ================================================== */}

                {step === detailsStep && (

                  <div className="space-y-5 animate-fade-in">

                    <div>

                      <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                        <FileText className="h-5 w-5 text-brand-600" />
                        House Details & Description
                      </h3>

                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Add the information tenants will see on the
                        public listing.
                      </p>

                    </div>

                    {/* Title */}

                    <div>

                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Listing Title
                      </label>

                      <input
                        type="text"
                        value={title}
                        onChange={(e) =>
                          setTitle(
                            e.target.value
                          )
                        }
                        placeholder="e.g. Spacious 2BR Apartment in Westlands"
                        className="input-field"
                      />

                    </div>

                    {/* Size */}

                    <div>

                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        House Size
                      </label>

                      <select
                        value={size}
                        onChange={(e) =>
                          setSize(
                            e.target.value
                          )
                        }
                        className="input-field"
                      >

                        <option value="">
                          Select size...
                        </option>

                        {HOUSE_SIZES.map(
                          (item: string) => (
                            <option
                              key={item}
                              value={item}
                            >
                              {item}
                            </option>
                          )
                        )}

                      </select>

                      {size ===
                        'Custom Size' && (

                        <input
                          type="text"
                          value={
                            customSize
                          }
                          onChange={(e) =>
                            setCustomSize(
                              e.target.value
                            )
                          }
                          placeholder="e.g. 1,200 sq ft"
                          className="input-field mt-2"
                        />
                      )}

                    </div>

                    {/* Beds/Baths */}

                    <div className="grid grid-cols-2 gap-4">

                      <div>

                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Bedrooms
                        </label>

                        <select
                          value={beds}
                          onChange={(e) =>
                            setBeds(
                              e.target.value
                            )
                          }
                          className="input-field"
                        >

                          {[0, 1, 2, 3, 4, 5, 6].map(
                            (n) => (

                              <option
                                key={n}
                                value={n}
                              >
                                {n === 0
                                  ? 'Studio'
                                  : n === 6
                                  ? '6+'
                                  : n}
                              </option>
                            )
                          )}

                        </select>

                      </div>

                      <div>

                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Bathrooms
                        </label>

                        <select
                          value={baths}
                          onChange={(e) =>
                            setBaths(
                              e.target.value
                            )
                          }
                          className="input-field"
                        >

                          {[1, 2, 3, 4, 5].map(
                            (n) => (

                              <option
                                key={n}
                                value={n}
                              >
                                {n === 5
                                  ? '5+'
                                  : n}
                              </option>
                            )
                          )}

                        </select>

                      </div>

                    </div>

                    {/* Description */}

                    <div>

                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Description
                      </label>

                      <textarea
                        value={
                          description
                        }
                        onChange={(e) =>
                          setDescription(
                            e.target.value
                          )
                        }
                        rows={6}
                        placeholder="Describe the property, amenities, neighborhood, nearby landmarks..."
                        className="input-field resize-none p-10"
                      />

                    </div>

                  </div>
                )}


                
                {/* =====================================================
                    REVIEW
                ===================================================== */}
                {step === (isPropertyManagementListing ? 6 : 5) && (
                <div className="space-y-6 animate-fade-in">

                    {/* Header */}
                    <div>
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                        <CheckCircle2 className="h-5 w-5 text-brand-600" />
                        Review Your Listing
                    </h3>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Please review everything you have entered before continuing to payment.
                        You can go back and edit any section if something is incorrect.
                    </p>
                    </div>

                    {/* =====================================================
                        LOCATION & PROPERTY
                    ====================================================== */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-950">

                    <div className="mb-4 flex items-center justify-between">
                        <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                            Location & Property
                        </h4>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Property location and identification
                        </p>
                        </div>

                        <MapPin className="h-5 w-5 text-brand-600" />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">

                        <div>
                        <p className="text-xs text-gray-400">Location</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {locationSearch || 'Not provided'}
                        </p>
                        </div>

                        <div>
                        <p className="text-xs text-gray-400">City</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {finalCity || 'Not provided'}
                        </p>
                        </div>

                        <div>
                        <p className="text-xs text-gray-400">County</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {county || 'Not provided'}
                        </p>
                        </div>

                        {isPropertyManagementListing && (
                        <>
                            <div>
                            <p className="text-xs text-gray-400">Property Name</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-white">
                                {propertyName || 'Not provided'}
                            </p>
                            </div>

                            <div>
                            <p className="text-xs text-gray-400">Property Type</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-white">
                                {propertyType || 'Not provided'}
                            </p>
                            </div>
                        </>
                        )}

                    </div>
                    </div>


                    {/* =====================================================
                        LISTING INFORMATION
                    ====================================================== */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-950">

                    <div className="mb-4 flex items-center justify-between">
                        <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                            Listing Information
                        </h4>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Basic information about your property
                        </p>
                        </div>

                        <Home className="h-5 w-5 text-brand-600" />
                    </div>

                    <div className="space-y-4">

                        <div>
                        <p className="text-xs text-gray-400">Title</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {title || 'Not provided'}
                        </p>
                        </div>

                        <div>
                        <p className="text-xs text-gray-400">Description</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                            {description || 'Not provided'}
                        </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                        <div>
                            <p className="text-xs text-gray-400">Listing Type</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {listingType || 'Not provided'}
                            </p>
                        </div>

                        {!isPropertyManagementListing && (
                            <div>
                            <p className="text-xs text-gray-400">Price / Rent</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-white">
                                {price
                                ? formatKES(Number(price))
                                : 'Not provided'}
                            </p>
                            </div>
                        )}

                        <div>
                            <p className="text-xs text-gray-400">Size</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {finalSize || 'Not provided'}
                            </p>
                        </div>

                        {!isPropertyManagementListing && (
                            <>
                            <div>
                                <p className="text-xs text-gray-400">Bedrooms</p>
                                <p className="mt-1 font-medium text-gray-900 dark:text-white">
                                {beds || '0'}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs text-gray-400">Bathrooms</p>
                                <p className="mt-1 font-medium text-gray-900 dark:text-white">
                                {baths || '0'}
                                </p>
                            </div>
                            </>
                        )}

                        </div>

                    </div>
                    </div>


                    {/* =====================================================
                        FINANCIAL INFORMATION
                    ====================================================== */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-950">

                    <div className="mb-4 flex items-center justify-between">
                        <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                            Financial Information
                        </h4>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Rent and deposit information
                        </p>
                        </div>

                        <DollarSign className="h-5 w-5 text-brand-600" />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">

                        {!isPropertyManagementListing && (
                        <div>
                            <p className="text-xs text-gray-400">Monthly Rent</p>
                            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                            {price
                                ? formatKES(Number(price))
                                : 'Not provided'}
                            </p>
                        </div>
                        )}

                        <div>
                        <p className="text-xs text-gray-400">Deposit Required</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {depositRequired ? 'Yes' : 'No'}
                        </p>
                        </div>

                        {depositRequired && (
                        <>
                            <div>
                            <p className="text-xs text-gray-400">Deposit Structure</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-white">
                                {depositStructure || 'Not provided'}
                            </p>
                            </div>

                            <div>
                            <p className="text-xs text-gray-400">Deposit Amount</p>
                            <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                                {depositAmount
                                ? formatKES(Number(depositAmount))
                                : 'Not provided'}
                            </p>
                            </div>
                        </>
                        )}

                    </div>
                    </div>


                    {/* =====================================================
                        PROPERTY MANAGEMENT UNITS
                    ====================================================== */}
                    {isPropertyManagementListing && (
                    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-700 dark:bg-brand-900/20">

                        <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h4 className="font-semibold text-gray-900 dark:text-white">
                            Property Units
                            </h4>

                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {units.length} unit{units.length === 1 ? '' : 's'} added
                            </p>
                        </div>

                        <Home className="h-5 w-5 text-brand-600" />
                        </div>

                        <div className="space-y-3">

                        {units.map(
                            (unit: PropertyUnit, index: number) => (
                            <div
                                key={unit.id}
                                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-brand-700 dark:bg-brand-800"
                            >

                                <div className="flex items-start justify-between">

                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-white">
                                    {unit.unitNumber ||
                                        `Unit ${index + 1}`}
                                    </p>

                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {unit.unitType || 'Unit'}
                                    </p>
                                </div>

                                <p className="font-semibold text-brand-600">
                                    {unit.rent
                                    ? formatKES(Number(unit.rent))
                                    : 'No rent'}
                                </p>

                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-3">

                                <div>
                                    <p className="text-xs text-gray-400">
                                    Bedrooms
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {unit.beds ?? 0}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-400">
                                    Bathrooms
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {unit.baths ?? 0}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-400">
                                    Photos
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                                    {unit.photos?.length || 0}
                                    </p>
                                </div>

                                </div>

                            </div>
                            )
                        )}

                        </div>
                    </div>
                    )}


                    {/* =====================================================
                        CONTACT
                    ====================================================== */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-950">

                    <div className="mb-4">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                        Contact Information
                        </h4>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        How prospective tenants can contact you
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">

                        <div>
                        <p className="text-xs text-gray-400">Phone</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {phone || 'Not provided'}
                        </p>
                        </div>

                        <div>
                        <p className="text-xs text-gray-400">Email</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {email || 'Not provided'}
                        </p>
                        </div>

                    </div>

                    {socialLinks?.length > 0 && (
                        <div className="mt-4">
                        <p className="text-xs text-gray-400">
                            Social Links
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                            {socialLinks.map(
                            (link: any, index: number) => (
                                <span
                                key={index}
                                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-brand-800 dark:text-gray-300"
                                >
                                {link.platform}: {link.url}
                                </span>
                            )
                            )}
                        </div>
                        </div>
                    )}

                    </div>


                    {/* =====================================================
                        MEDIA
                    ====================================================== */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-700 dark:bg-brand-950">

                    <div className="mb-4">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                        Media
                        </h4>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Photos and video attached to this listing
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">

                        <div>
                        <p className="text-xs text-gray-400">
                            Photos
                        </p>

                        <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                            {photos.length} / 7
                        </p>
                        </div>

                        <div>
                        <p className="text-xs text-gray-400">
                            Video
                        </p>

                        <p className="mt-1 font-medium text-gray-900 dark:text-white">
                            {video ? 'Video added' : 'No video added'}
                        </p>
                        </div>

                    </div>
                    </div>


                    {/* =====================================================
                        TENANT OPTIONS — PMS ONLY
                    ====================================================== */}
                    {isPropertyManagementListing && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-brand-700 dark:bg-brand-800/30">

                        <div className="mb-4">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                            Tenant Options
                        </h4>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Services enabled for prospective tenants
                        </p>
                        </div>

                        <div className="flex flex-wrap gap-3">

                        <span
                            className={cn(
                            'rounded-full px-4 py-2 text-xs font-medium',
                            bookingEnabled
                                ? 'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-300'
                                : 'bg-gray-200 text-gray-500 dark:bg-brand-700 dark:text-gray-400'
                            )}
                        >
                            Booking: {bookingEnabled ? 'Enabled' : 'Disabled'}
                        </span>

                        <span
                            className={cn(
                            'rounded-full px-4 py-2 text-xs font-medium',
                            paymentEnabled
                                ? 'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-300'
                                : 'bg-gray-200 text-gray-500 dark:bg-brand-700 dark:text-gray-400'
                            )}
                        >
                            Online Payment: {paymentEnabled ? 'Enabled' : 'Disabled'}
                        </span>

                        </div>
                    </div>
                    )}


                    {/* =====================================================
                        CONFIRMATION
                    ====================================================== */}
                    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-700 dark:bg-brand-900/20">

                    <label className="flex cursor-pointer items-start gap-3">

                        <input
                        type="checkbox"
                        checked={reviewConfirmed}
                        onChange={(e) => setReviewConfirmed(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />

                        <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                            I confirm that everything I've entered is correct
                        </p>

                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            I have reviewed my listing information and confirm that
                            the details, contact information, property information,
                            photos, and other details are accurate.
                        </p>
                        </div>

                    </label>

                    </div>

                </div>
                )}
                


                
                
        {/* =====================================================
            PAYMENT
        ===================================================== */}

        {step === paymentStep &&
        paymentStep !== -1 && (
            <div className="space-y-6 animate-fade-in">

            {/* Header */}
            <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                <DollarSign className="h-5 w-5 text-brand-600" />

                Listing Payment
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Complete the listing payment if required before publishing.
                </p>
            </div>


            {/* =====================================================
                ACTIVE SUBSCRIPTION
            ====================================================== */}

            {isSubscriptionActive && (
                <div className="rounded-2xl border border-success-200 bg-success-50 p-6 dark:border-success-800 dark:bg-success-900/20">

                <div className="flex items-start gap-4">

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/40">
                    <CheckCircle2 className="h-5 w-5 text-success-600" />
                    </div>

                    <div className="flex-1">

                    <h4 className="font-semibold text-success-800 dark:text-success-300">
                        Your subscription covers this listing
                    </h4>

                    <p className="mt-1 text-sm text-success-700 dark:text-success-400">
                        You have an active landlord subscription, so no
                        additional listing payment is required.
                    </p>

                    <div className="mt-4 flex items-center justify-between border-t border-success-200 pt-4 dark:border-success-800">

                        <span className="text-sm text-success-700 dark:text-success-400">
                        Amount due
                        </span>

                        <span className="text-xl font-bold text-success-700 dark:text-success-300">
                        KES 0
                        </span>

                    </div>

                    </div>

                </div>

                </div>
            )}


            {/* =====================================================
                TRIAL
            ====================================================== */}

            {isTrial && (
                <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 dark:border-brand-700 dark:bg-brand-900/20">

                <div className="flex items-start gap-4">

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-800">
                    <CheckCircle2 className="h-5 w-5 text-brand-600" />
                    </div>

                    <div className="flex-1">

                    <h4 className="font-semibold text-brand-800 dark:text-brand-300">
                        Your trial covers this listing
                    </h4>

                    <p className="mt-1 text-sm text-brand-700 dark:text-brand-400">
                        Your current landlord trial allows you to submit
                        this listing without an additional listing fee.
                    </p>

                    <div className="mt-4 flex items-center justify-between border-t border-brand-200 pt-4 dark:border-brand-700">

                        <span className="text-sm text-brand-700 dark:text-brand-400">
                        Amount due
                        </span>

                        <span className="text-xl font-bold text-brand-700 dark:text-brand-300">
                        KES 0
                        </span>

                    </div>

                    </div>

                </div>

                </div>
            )}


            {/* =====================================================
                FREE LISTING
            ====================================================== */}

            {!isSubscriptionActive &&
                !isTrial &&
                hasFreeListing &&
                !listingRequiresPayment && (

                <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 dark:border-brand-700 dark:bg-brand-900/20">

                    <div className="flex items-start gap-4">

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-800">
                        <CheckCircle2 className="h-5 w-5 text-brand-600" />
                    </div>

                    <div className="flex-1">

                        <h4 className="font-semibold text-brand-800 dark:text-brand-300">
                        Free listing available
                        </h4>

                        <p className="mt-1 text-sm text-brand-700 dark:text-brand-400">
                        You can use one of your remaining free listings
                        for this property.
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">

                        <div className="rounded-xl bg-white p-4 dark:bg-brand-800">

                            <p className="text-xs text-gray-400">
                            Free listings remaining
                            </p>

                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                            {remainingFreeListings}
                            </p>

                        </div>

                        <div className="rounded-xl bg-white p-4 dark:bg-brand-800">

                            <p className="text-xs text-gray-400">
                            Amount due
                            </p>

                            <p className="mt-1 text-xl font-bold text-brand-600">
                            KES 0
                            </p>

                        </div>

                        </div>

                    </div>

                    </div>

                </div>
                )}


            {/* =====================================================
                PAYMENT REQUIRED
            ====================================================== */}

            {listingRequiresPayment && (

                <div className="space-y-5">

                {/* Amount */}
                <div className="rounded-2xl border border-warning-200 bg-warning-50 p-6 dark:border-warning-800 dark:bg-warning-900/20">

                    <div className="flex items-start justify-between gap-4">

                    <div>

                        <h4 className="font-semibold text-warning-800 dark:text-warning-300">
                        Payment required
                        </h4>

                        <p className="mt-1 text-sm text-warning-700 dark:text-warning-400">
                        Your current listing entitlement requires a
                        listing fee before this listing can proceed.
                        </p>

                    </div>

                    <div className="text-right">

                        <p className="text-xs text-warning-600 dark:text-warning-400">
                        Amount due
                        </p>

                        <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                        {formatKES(LISTING_FEE_KES)}
                        </p>

                    </div>

                    </div>

                </div>


                {/* =================================================
                    PAYMENT METHODS
                ================================================== */}

                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-950">

                    <div className="mb-4">

                    <h4 className="font-semibold text-gray-900 dark:text-white">
                        Choose a payment method
                    </h4>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Select how you would like to pay the listing fee.
                    </p>

                    </div>


                    <div className="grid gap-4 sm:grid-cols-2">

                    {/* M-Pesa */}
                    <button
                        type="button"
                        disabled={paymentLoading}
                        onClick={() =>
                        setSelectedPaymentMethod('MPESA')
                        }
                        className={cn(
                        'rounded-xl border-2 p-4 text-left transition',
                        selectedPaymentMethod === 'MPESA'
                            ? 'border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/20'
                            : 'border-gray-200 hover:border-brand-400 dark:border-brand-700',
                        paymentLoading &&
                            'cursor-not-allowed opacity-60'
                        )}
                    >

                        <div className="flex items-center justify-between">

                        <div>

                            <p className="font-semibold text-gray-900 dark:text-white">
                            M-Pesa
                            </p>

                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Pay directly using M-Pesa.
                            </p>

                        </div>

                        {selectedPaymentMethod === 'MPESA' && (
                            <CheckCircle2 className="h-5 w-5 text-brand-600" />
                        )}

                        </div>

                    </button>


                    
                    {/* PayPal */}
                    <button
                      type="button"
                      disabled={paymentLoading}
                      onClick={() =>
                        setSelectedPaymentMethod('PAYPAL')
                      }
                      className={cn(
                        'rounded-xl border-2 p-4 text-left transition',
                        selectedPaymentMethod === 'PAYPAL'
                          ? 'border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/20'
                          : 'border-gray-200 hover:border-brand-400 dark:border-brand-700',
                        paymentLoading &&
                          'cursor-not-allowed opacity-60'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            PayPal
                          </p>

                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Pay securely with PayPal.
                          </p>
                        </div>

                        {selectedPaymentMethod === 'PAYPAL' && (
                          <CheckCircle2 className="h-5 w-5 text-brand-600" />
                        )}
                      </div>
                    </button>

                    </div>

                </div>


                {/* =================================================
                    TOTAL
                ================================================== */}

                <div className="rounded-2xl bg-gray-50 p-5 dark:bg-brand-800/30">

                    <div className="flex items-center justify-between">

                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        Listing fee
                    </span>

                    <span className="font-semibold text-gray-900 dark:text-white">
                        {formatKES(LISTING_FEE_KES)}
                    </span>

                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-brand-700">

                    <span className="font-semibold text-gray-900 dark:text-white">
                        Total
                    </span>

                    <span className="text-xl font-bold text-brand-600">
                        {formatKES(LISTING_FEE_KES)}
                    </span>

                    </div>

                </div>

                </div>
            )}

            </div>
        )}



                {/* =================================================
                    ERROR
                ================================================== */}

                {error && (

                  <div className="mt-6 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
                    {error}
                  </div>

                )}

                {/* =================================================
                    NAVIGATION
                ================================================== */}

                <div className="mt-8 flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 dark:border-brand-700 sm:flex-row sm:items-center sm:justify-between">

                  {/* Back */}

                  <button
                    type="button"
                    onClick={goBack}
                    disabled={step === 0 || submitting}
                    className="btn-secondary w-full sm:w-auto"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>

                  {/* Next */}

                  {step <
                  STEPS.length - 1 ? (

                    <button
                      type="button"
                      onClick={goNext}
                      disabled={
                        !canProceed() ||
                        submitting
                      }
                      className="btn-primary w-full sm:w-auto"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>

                  ) : (

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={
                            !canProceed() ||
                            submitting ||
                            (paymentRequired && !paymentVerified)
                        }
                        className={cn(
                            "btn-primary w-full sm:w-auto",
                            (!canProceed() ||
                            submitting ||
                            (paymentRequired && !paymentVerified)) &&
                            "cursor-not-allowed opacity-50"
                        )}
                        >
                        {submitting ? (
                            <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Publishing...
                            </>
                        ) : paymentRequired && !paymentVerified ? (
                            <>
                            <DollarSign className="h-4 w-4" />
                            Payment Required
                            </>
                        ) : (
                            <>
                            <CheckCircle2 className="h-4 w-4" />
                            Publish Listing
                            </>
                        )}
                        </button>
                  )}

                </div>

              </div>
            </div>

          </div>

        </TermsGate>

        {/* =====================================================
            FOOTER
        ====================================================== */}

        <p className="mt-8 pb-4 text-center text-xs text-gray-400">
          © Copyright Saka Krib. All Rights Reserved.
        </p>

      </div>
    </div>
  );
}