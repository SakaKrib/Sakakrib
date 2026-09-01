import { useEffect, useState } from 'react';
import {
  FileText,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';

import PropertyListingForm from './PropertyListingForm';
import ListingPaymentModal from '@/modals/Listingpaymentmodal';

import { supabase } from '@/lib/supabase';
import { protectedGet, protectedPatch, protectedPost } from '@/lib/protectedApi';

import {
  KENYAN_CITIES,
  KENYAN_COUNTIES,
  HOUSE_SIZES,
  formatKES,
  validatePhone,
  validateEmail,
} from '@/lib/utils';

import {
  fetchListingEntitlement,
  createRoleAwareListing,
  createListingPaymentIntent,
  waitForListingPaymentIntent,
  getListingIdFromPaymentIntent,
  type ListingEntitlement,
  type ListingFormPayload,
  type ListingRole,
  type SubscriptionPlan,
  type SubscriptionStatus,
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


  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptionPlansLoading, setSubscriptionPlansLoading] = useState(false);
  const [subscriptionPlansError, setSubscriptionPlansError] =
    useState<string | null>(null);
 

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

  const [subscriptionStatus, setSubscriptionStatus] =
  useState<SubscriptionStatus>('none');

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

  const listingRole: ListingRole | null =
    profile?.role === 'landlord' || profile?.role === 'real_estate'
      ? profile.role
      : null;


  // ==========================================================
  // LOAD ENTITLEMENT
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
        const entitlement = await fetchListingEntitlement(listingRole, profile.id);
        if (cancelled) return;

        setListingEntitlement(entitlement);
        setSubscriptionStatus(entitlement.subscriptionStatus);
        setListingPaymentRequirement(
          entitlement.requiresIndividualPayment ? 'required' : 'not_required'
        );
      } catch (err) {
        console.error('Failed to load listing entitlement:', err);
        if (!cancelled) {
          setListingEntitlement(null);
          setSubscriptionStatus('none');
          setListingPaymentRequirement('not_required');
          setError(err instanceof Error ? err.message : 'Unable to load listing information.');
        }
      } finally {
        if (!cancelled) setEntitlementLoading(false);
      }
    };

    loadListingEntitlement();
    return () => { cancelled = true; };
  }, [profile?.id, listingRole]);

  const FREE_LISTING_LIMIT = listingEntitlement?.free_limit ?? 3;

  const isPropertyManagementListing =
    listingRole === 'landlord' &&
    (subscriptionStatus === 'active' || subscriptionStatus === 'trial');

  const BASE_STEPS = isPropertyManagementListing
    ? ['Property', 'Units', 'Financial', 'Contact', 'Media', 'Details', 'Review']
    : ['Location', 'Financial', 'Contact', 'Media', 'Details', 'Review'];

  const STEPS = listingPaymentRequirement === 'required'
    ? [...BASE_STEPS, 'Payment']
    : BASE_STEPS;

  const paymentRequired = listingPaymentRequirement === 'required';
  const paymentDescription = paymentRequired
    ? `This listing requires a ${formatKES(LISTING_FEE_KES)} listing fee before publication.`
    : 'No listing payment is currently required.';

  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const paymentStepIndex = paymentRequired ? STEPS.length - 1 : -1;

  const freeListingsRemaining = Math.max(0, Number(listingEntitlement?.free_listings_remaining ?? 0));

  useEffect(() => {
    if (!paymentRequired) {
      setPaymentCompleted(true);
      setSelectedPaymentMethod(null);
      setPaymentIntentId(null);
      setPaymentModalOpen(false);
      return;
    }
    setPaymentCompleted(false);
    setSelectedPaymentMethod(null);
    setPaymentIntentId(null);
  }, [paymentRequired]);

  useEffect(() => {
    if (paymentRequired && step === paymentStepIndex && !paymentCompleted) {
      setPaymentModalOpen(true);
    }
  }, [paymentRequired, step, paymentStepIndex, paymentCompleted]);

  const handleContinueToSubscription = (plan: { id: string; name: string }, billingCycle: 'monthly' | 'annual') => {
    try {
      sessionStorage.setItem('pendingSubscriptionSelection', JSON.stringify({ planId: plan.id, planName: plan.name, billingCycle }));
    } catch {
      // Non-fatal: subscription page can still be opened manually.
    }
    setPaymentModalOpen(false);
    navigate('subscription-plans');
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Location services are not supported by this browser.');
      return;
    }
    setUsingGPS(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        try {
          setLatitude(lat);
          setLongitude(lon);
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1`, { headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('Unable to determine the address from your GPS location.');
          const data = await response.json();
          const address = data?.address || {};
          const detectedCity = address.city || address.town || address.municipality || address.village || address.suburb || '';
          const detectedCounty = address.county || address.state_district || address.state || '';
          const detectedLocation = data?.display_name || `${detectedCity}${detectedCounty ? `, ${detectedCounty}` : ''}`;
          setLocationSearch(detectedLocation);
          if (detectedCity) {
            const matchingCity = KENYAN_CITIES.find((item) => item.toLowerCase() === detectedCity.toLowerCase());
            if (matchingCity) setCity(matchingCity);
            else { setCustomCity(detectedCity); setCity('custom'); }
          }
          if (detectedCounty) {
            const normalizedCounty = detectedCounty.replace(/ County$/i, '').trim();
            const matchingCounty = KENYAN_COUNTIES.find((item) => item.toLowerCase() === normalizedCounty.toLowerCase());
            setCounty(matchingCounty || normalizedCounty);
          }
          setLocationSuggestions([{ display_name: detectedLocation, lat: String(lat), lon: String(lon), place_id: data?.place_id, type: data?.type, address }]);
        } catch (err) {
          console.error('GPS reverse geocoding failed:', err);
          setError('Your GPS coordinates were detected, but we could not determine the address. Please enter your location manually.');
        } finally {
          setUsingGPS(false);
        }
      },
      (geoError) => {
        console.error('Geolocation error:', geoError);
        setUsingGPS(false);
        switch (geoError.code) {
          case geoError.PERMISSION_DENIED: setError('Location permission was denied. Please allow location access and try again.'); break;
          case geoError.POSITION_UNAVAILABLE: setError('Your current location could not be determined. Please try again or search manually.'); break;
          case geoError.TIMEOUT: setError('Getting your location took too long. Please try again.'); break;
          default: setError('Unable to get your current location.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const createUnit = (): PropertyUnit => ({ id: crypto.randomUUID(), unitNumber: '', unitType: '', rent: '', depositAmount: '', size: '', beds: '1', baths: '1', availability: 'available', description: '', photos: [] });
  const addUnit = () => setUnits((current) => [...current, createUnit()]);
  const updateUnit = (id: string, field: keyof PropertyUnit, value: unknown) => setUnits((current) => current.map((unit) => unit.id === id ? { ...unit, [field]: value } : unit));

  const contactIsValid = phone.trim() !== '' && validatePhone(phone) && email.trim() !== '' && validateEmail(email);

  const canProceed = () => {
    if (isPropertyManagementListing) {
      switch (step) {
        case 0: return locationSearch.trim() !== '' && propertyName.trim() !== '' && propertyType.trim() !== '' && finalCity !== '' && county.trim() !== '';
        case 1: return units.length > 0 && units.every((unit) => Number(unit.rent) > 0 && unit.unitNumber.trim() !== '' && unit.unitType.trim() !== '' && Number.isInteger(Number(unit.beds)) && Number(unit.beds) >= 0 && Number.isInteger(Number(unit.baths)) && Number(unit.baths) >= 0 && unit.photos.length >= 3 && unit.photos.length <= 7);
        case 2: return units.every((unit) => Number(unit.rent) > 0);
        case 3: return contactIsValid;
        case 4: return photos.length >= 3 && photos.length <= 7;
        case 5: return title.trim() !== '' && description.trim() !== '';
        case 6: return reviewConfirmed;
        default: return step === paymentStepIndex ? (paymentRequired ? paymentCompleted : true) : false;
      }
    }
    switch (step) {
      case 0: return finalCity !== '' && county.trim() !== '';
      case 1: return price.trim() !== '' && Number.isFinite(Number(price)) && Number(price) > 0;
      case 2: return contactIsValid;
      case 3: return photos.length >= 3 && photos.length <= 7;
      case 4: return title.trim() !== '' && description.trim() !== '' && finalSize !== '';
      case 5: return reviewConfirmed;
      default: return step === paymentStepIndex ? (paymentRequired ? paymentCompleted : true) : false;
    }
  };

  const buildListingPayload = (): ListingFormPayload => ({
    title: (isPropertyManagementListing ? propertyName : title)?.trim() || '',
    description: description.trim(),
    city: finalCity.trim(),
    county: county.trim(),
    location_search: locationSearch?.trim() || null,
    latitude: latitude !== null && Number.isFinite(latitude) ? latitude : null,
    longitude: longitude !== null && Number.isFinite(longitude) ? longitude : null,
    property_name: propertyName?.trim() || null,
    property_type: propertyType?.trim() || null,
    price_kes: price !== '' ? Number(price) : null,
    listing_type: listingType?.trim() || 'rent',
    deposit_required: Boolean(depositRequired),
    deposit_structure: depositStructure?.trim() || null,
    deposit_amount: depositAmount !== '' ? Number(depositAmount) : 0,
    size: finalSize?.trim() || null,
    beds: beds !== '' ? Number(beds) : 0,
    baths: baths !== '' ? Number(baths) : 0,
    contact_phone: phone.trim(),
    contact_email: email.trim(),
    social_links: Array.isArray(socialLinks) ? socialLinks.filter((item) => item && typeof item.url === 'string' && item.url.trim()).map((item) => ({ platform: typeof item.platform === 'string' ? item.platform.trim() : '', url: item.url.trim() })) : [],
    booking_enabled: Boolean(bookingEnabled),
    payment_enabled: Boolean(paymentEnabled),
    is_property_management: Boolean(isPropertyManagementListing),
  });

  const handleListingPayment = async (): Promise<boolean> => {
    if (!paymentRequired) { setPaymentCompleted(true); return true; }
    if (!selectedPaymentMethod) { setError('Please select a payment method before continuing.'); return false; }
    if (selectedPaymentMethod === 'PAYPAL') { setError('PayPal is not yet available for the individual listing fee. Please use M-Pesa, or subscribe instead.'); return false; }
    setPaymentLoading(true);
    setError(null);
    try {
      let intentId = paymentIntentId;
      if (!intentId) {
        const intent = await createListingPaymentIntent(buildListingPayload());
        intentId = intent.paymentIntentId;
        setPaymentIntentId(intentId);
      }

      interface ListingPaymentStkResponse { success?: boolean; message?: string; error?: string; checkoutRequestId?: string; merchantRequestId?: string; }
      const response = await protectedPost<ListingPaymentStkResponse>('/rest/v1/listing-payment-stk', { payment_intent_id: intentId });
      if (!response?.success) throw new Error(response?.error || response?.message || 'The M-Pesa payment request could not be started.');

      const confirmed = await waitForListingPaymentIntent(intentId);
      if (!confirmed) throw new Error('The listing payment was not confirmed. If you completed the M-Pesa prompt, please wait a moment and try again.');
      setPaymentCompleted(true);
      return true;
    } catch (err) {
      console.error('❌ Listing payment failed:', err);
      setError(err instanceof Error ? err.message : 'Unable to process the listing payment.');
      setPaymentCompleted(false);
      return false;
    } finally {
      setPaymentLoading(false);
    }
  };

  const MAX_PHOTOS = 7;
  const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

  const handlePhotoUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) { setError(`You can upload a maximum of ${MAX_PHOTOS} photos.`); return; }
    const validFiles: File[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      if (!file.type.startsWith('image/')) { setError(`${file.name} is not a valid image file.`); continue; }
      if (file.size > MAX_PHOTO_SIZE) { setError(`${file.name} is too large. Each photo must be 10 MB or smaller.`); continue; }
      validFiles.push(file);
    }
    if (!validFiles.length) return;
    setPhotos((current) => [...current, ...validFiles.map((file, index) => ({ file, url: URL.createObjectURL(file), label: `Photo ${photos.length + index + 1}`, type: 'photo' as const }))]);
    setError('');
  };

  const handleVideoUpload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError('Please select a valid video file.'); return; }
    if (file.size > MAX_VIDEO_SIZE) { setError('Video is too large. Maximum allowed size is 100 MB.'); return; }
    if (video?.url?.startsWith('blob:')) URL.revokeObjectURL(video.url);
    setVideo({ file, url: URL.createObjectURL(file), label: 'Walkthrough Video', type: 'video' });
    setError('');
  };

  const updatePhotoLabel = (index: number, label: string) => setPhotos((current) => current.map((photo, i) => i === index ? { ...photo, label } : photo));
  const removePhoto = (index: number) => setPhotos((current) => { const photo = current[index]; if (photo?.url?.startsWith('blob:')) URL.revokeObjectURL(photo.url); return current.filter((_, i) => i !== index); });
  const removeVideo = () => { if (video?.url?.startsWith('blob:')) URL.revokeObjectURL(video.url); setVideo(null); };

  useEffect(() => () => {
    photos.forEach((photo) => { if (photo.url?.startsWith('blob:')) URL.revokeObjectURL(photo.url); });
    if (video?.url?.startsWith('blob:')) URL.revokeObjectURL(video.url);
  }, []);

  const addSocialLink = () => setSocialLinks((current) => [...current, { platform: 'WhatsApp', url: '' }]);
  const updateSocialLink = (index: number, field: 'platform' | 'url', value: string) => setSocialLinks((current) => current.map((link, i) => i === index ? { ...link, [field]: value } : link));
  const removeSocialLink = (index: number) => setSocialLinks((current) => current.filter((_, i) => i !== index));

  if (!profile) return <div className="mx-auto max-w-md px-2 py-20 text-center"><p className="text-gray-500 dark:text-gray-400">Please sign in to post a listing.</p></div>;
  if (!listingRole) return <div className="mx-auto max-w-md px-2 py-20 text-center"><p className="text-gray-500 dark:text-gray-400">Only landlord and real estate accounts can post listings.</p></div>;
  if (profile.verification_status !== 'verified') return <div className="mx-auto max-w-md px-2 py-20 text-center"><div className="card p-8"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning-100 dark:bg-warning-900/30"><FileText className="h-8 w-8 text-warning-600" /></div><h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Verification Required</h2><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">You must complete KYC verification before posting listings.</p><button type="button" onClick={() => navigate('kyc-verify')} className="btn-primary mt-6">Verify Now</button></div></div>;
  if (entitlementLoading) return <div className="flex min-h-[400px] items-center justify-center"><div className="flex items-center gap-2 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />Checking account status...</div></div>;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    setAiCaption('');
    let listingId: string | null = null;
    try {
      if (!profile?.id) throw new Error('Your login session has expired. Please sign in again.');
      if (!title?.trim() && !propertyName?.trim()) throw new Error('A listing title is required.');
      if (!description?.trim()) throw new Error('A listing description is required.');
      if (!finalCity?.trim()) throw new Error('A city is required.');
      if (!county?.trim()) throw new Error('A county is required.');
      if (!phone?.trim()) throw new Error('A contact phone number is required.');
      if (!email?.trim()) throw new Error('A contact email is required.');
      if (isPropertyManagementListing && (!Array.isArray(units) || units.length === 0)) throw new Error('At least one property unit is required.');

      if (paymentRequired) {
        if (!paymentCompleted || !paymentIntentId) throw new Error('Please complete the listing payment before publishing.');
        listingId = await getListingIdFromPaymentIntent(paymentIntentId);
        if (!listingId) throw new Error('Payment was confirmed, but the listing could not be located. Please contact support.');
      } else {
        const result = await createRoleAwareListing(buildListingPayload());
        if (result?.listing_created && result?.listing_id) listingId = result.listing_id;
        else if (result?.requires_individual_payment) { setListingPaymentRequirement('required'); throw new Error('Your free/subscription listing entitlement is no longer available. Please complete the listing payment shown on the Payment step to continue.'); }
        else throw new Error('The listing could not be created. Please try again.');
      }

      if (!listingId) throw new Error('The listing was processed but no listing ID was returned.');

      const uploadedStoragePaths: string[] = [];
      try {
        type ExistingMedia = { id: string; url: string; label: string | null; media_type: 'photo' | 'video'; position: number; unit_id?: string | null; };
        const existingMedia = await protectedGet<ExistingMedia[]>(`/rest/v1/listing_media?listing_id=eq.${encodeURIComponent(listingId)}&user_id=eq.${encodeURIComponent(profile.id)}&select=id,url,label,media_type,position,unit_id&order=position.asc`);
        const localPhotos = Array.isArray(photos) ? photos.filter((photo) => photo.file instanceof File) : [];
        for (let index = 0; index < localPhotos.length; index++) {
          const photo = localPhotos[index];
          if (!(photo.file instanceof File)) continue;
          const file = photo.file;
          const label = photo.label?.trim() || `Photo ${index + 1}`;
          if (existingMedia.find((media) => media.media_type === 'photo' && (media.label ?? '') === label)) continue;
          const originalName = file.name || `photo-${index + 1}`;
          const extension = originalName.includes('.') ? (originalName.split('.').pop()?.toLowerCase() || 'jpg') : 'jpg';
          const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80) || `photo-${index + 1}`;
          const storagePath = `${profile.id}/${listingId}/photos/${index + 1}-${crypto.randomUUID()}-${baseName}.${extension}`;
          const { error: uploadError } = await supabase.storage.from('listing-media').upload(storagePath, file, { cacheControl: '3600', contentType: file.type || 'image/jpeg', upsert: false });
          if (uploadError) throw new Error(`Failed to upload photo "${file.name}": ${uploadError.message}`);
          uploadedStoragePaths.push(storagePath);
          const { data: publicUrlData } = supabase.storage.from('listing-media').getPublicUrl(storagePath);
          const publicUrl = publicUrlData?.publicUrl;
          if (!publicUrl) throw new Error(`Photo "${file.name}" was uploaded but its public URL could not be generated.`);
          await protectedPost('listing_media_insert_response', { listing_id: listingId, user_id: profile.id, url: publicUrl, label, media_type: 'photo', position: index, unit_id: null });
        }
        if (video?.file instanceof File && !existingMedia.find((media) => media.media_type === 'video')) {
          const file = video.file;
          const originalName = file.name || 'walkthrough-video';
          const extension = originalName.includes('.') ? (originalName.split('.').pop()?.toLowerCase() || 'mp4') : 'mp4';
          const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80) || 'walkthrough-video';
          const storagePath = `${profile.id}/${listingId}/video/${crypto.randomUUID()}-${baseName}.${extension}`;
          const { error: uploadError } = await supabase.storage.from('listing-media').upload(storagePath, file, { cacheControl: '3600', contentType: file.type || 'video/mp4', upsert: false });
          if (uploadError) throw new Error(`Failed to upload walkthrough video: ${uploadError.message}`);
          uploadedStoragePaths.push(storagePath);
          const { data: publicUrlData } = supabase.storage.from('listing-media').getPublicUrl(storagePath);
          const publicUrl = publicUrlData?.publicUrl;
          if (!publicUrl) throw new Error('Walkthrough video was uploaded but its public URL could not be generated.');
          await protectedPost('/rest/v1/listing_media', { listing_id: listingId, user_id: profile.id, url: publicUrl, label: video.label?.trim() || 'Walkthrough Video', media_type: 'video', position: 0, unit_id: null }, { headers: { Prefer: 'return=representation' } });
        }
        const savedMedia = await protectedGet<ExistingMedia[]>(`/rest/v1/listing_media?listing_id=eq.${encodeURIComponent(listingId)}&user_id=eq.${encodeURIComponent(profile.id)}&select=id,url,label,media_type,position,unit_id&order=position.asc`);
        const savedPhotos = (Array.isArray(savedMedia) ? savedMedia : []).filter((media) => media.media_type === 'photo');
        const savedVideo = (Array.isArray(savedMedia) ? savedMedia : []).find((media) => media.media_type === 'video');
        if (localPhotos.length > 0 && savedPhotos.length < localPhotos.length) throw new Error(`Only ${savedPhotos.length} of ${localPhotos.length} photos were saved. The listing was not marked as fully submitted.`);
        if (video?.file instanceof File && !savedVideo) throw new Error('The walkthrough video was uploaded but was not recorded in listing_media.');
      } catch (mediaError) {
        console.error('❌ Listing media upload/save failed:', mediaError);
        if (uploadedStoragePaths.length > 0) {
          const { error: cleanupError } = await supabase.storage.from('listing-media').remove(uploadedStoragePaths);
          if (cleanupError) console.warn('Some uploaded media could not be cleaned up:', cleanupError);
        }
        throw mediaError;
      }

      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-caption`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listing: { id: listingId, title: (isPropertyManagementListing ? propertyName : title)?.trim(), description: description.trim(), city: finalCity.trim(), county: county.trim(), price_kes: price ? Number(price) : null, listing_type: listingType?.trim() || 'rent', size: finalSize?.trim() || null, beds: Number(beds) || 0, baths: Number(baths) || 0, deposit_required: Boolean(depositRequired), property_name: propertyName?.trim() || null, property_type: propertyType?.trim() || null, units: isPropertyManagementListing && Array.isArray(units) ? units.map((unit) => ({ unit_number: unit.unitNumber?.trim() || '', unit_type: unit.unitType?.trim() || '', rent: Number(unit.rent) || 0, deposit_amount: unit.depositAmount ? Number(unit.depositAmount) : 0, size: unit.size?.trim() || null, beds: Number(unit.beds) || 0, baths: Number(unit.baths) || 0, availability: unit.availability || 'available', description: unit.description?.trim() || null })) : [] } } }) });
        if (response.ok) {
          const captionData = await response.json();
          const generatedCaption = typeof captionData?.caption === 'string' ? captionData.caption.trim() : '';
          if (generatedCaption) {
            setAiCaption(generatedCaption);
            await protectedPatch(`/rest/v1/listings?id=eq.${encodeURIComponent(listingId)}`, { ai_caption: generatedCaption, ai_caption_generated_at: new Date().toISOString() }, { headers: { Prefer: 'return=minimal' } });
          }
        }
      } catch (aiError) {
        console.warn('AI caption generation failed. Listing and media remain created:', aiError);
      }

      setCreatedListingId(listingId);
      setSuccess(true);
    } catch (err) {
      console.error('❌ Failed to submit listing:', err);
      setError(err instanceof Error ? err.message : 'Failed to post listing. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  if (success) return (
    <div className="mx-auto max-w-2xl px-2 py-12"><div className="card p-8 text-center animate-scale-in"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30"><CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" /></div><h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Listing Submitted for Review</h2><p className="mt-2 text-gray-500 dark:text-gray-400">Your property has been successfully submitted and is now awaiting approval. Once approved, it will be published and made visible to renters and buyers.</p><div className="mt-4 rounded-lg bg-success-50 px-2 py-3 dark:bg-success-900/20"><p className="text-sm font-medium text-success-700 dark:text-success-400">Your listing has been submitted successfully.</p></div><div className="mt-3 rounded-lg bg-brand-50 px-2 py-3 dark:bg-brand-900/20"><p className="text-sm font-medium text-brand-700 dark:text-brand-300">Approval Status: Pending Review</p><p className="mt-1 text-xs text-brand-600 dark:text-brand-400">Our team will review your listing before it becomes publicly available.</p></div>{aiCaption && <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left dark:border-brand-800 dark:bg-brand-800/30"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-brand-600 dark:text-brand-400">AI-Generated Community Caption</p><span className="rounded-full bg-yellow-100 px-2.5 py-1 text-[11px] font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Pending Approval</span></div><p className="mb-2 text-xs text-gray-500 dark:text-gray-400">This caption has been saved to your listing. It will be used for your community post once the listing is approved.</p><p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{aiCaption}</p></div>}<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center"><button onClick={() => navigate('listings')} className="btn-primary">View My Listings</button><button onClick={() => navigate('community')} className="btn-secondary">See Community</button></div></div></div>
  );

  return <>
    <PropertyListingForm
      step={step} STEPS={STEPS} error={error} submitting={submitting} setStep={setStep} canProceed={canProceed} handleSubmit={handleSubmit}
      reviewConfirmed={reviewConfirmed} setReviewConfirmed={setReviewConfirmed}
      selectedPaymentMethod={selectedPaymentMethod} setSelectedPaymentMethod={setSelectedPaymentMethod}
      termsAccepted={termsAccepted} setTermsAccepted={setTermsAccepted}
      subscriptionStatus={subscriptionStatus} freeListingsRemaining={freeListingsRemaining} isPropertyManagementListing={isPropertyManagementListing}
      listingPaymentRequirement={listingPaymentRequirement} paymentLoading={paymentLoading} paymentRequired={paymentRequired} handleListingPayment={handleListingPayment} paymentDescription={paymentDescription} LISTING_FEE_KES={LISTING_FEE_KES} FREE_LISTING_LIMIT={FREE_LISTING_LIMIT} paymentCompleted={paymentCompleted} setPaymentCompleted={setPaymentCompleted} onOpenPaymentModal={() => setPaymentModalOpen(true)} formatKES={formatKES}
      city={city} setCity={setCity} customCity={customCity} setCustomCity={setCustomCity} county={county} setCounty={setCounty}
      locationSearch={locationSearch} setLocationSearch={setLocationSearch} locationSuggestions={locationSuggestions} setLocationSuggestions={setLocationSuggestions} latitude={latitude} setLatitude={setLatitude} longitude={longitude} setLongitude={setLongitude} usingGPS={usingGPS} setUsingGPS={setUsingGPS} handleUseCurrentLocation={handleUseCurrentLocation} KENYAN_CITIES={KENYAN_CITIES} KENYAN_COUNTIES={KENYAN_COUNTIES}
      propertyName={propertyName} setPropertyName={setPropertyName} propertyType={propertyType} setPropertyType={setPropertyType} bookingEnabled={bookingEnabled} setBookingEnabled={setBookingEnabled} paymentEnabled={paymentEnabled} setPaymentEnabled={setPaymentEnabled}
      listingType={listingType} setListingType={setListingType} price={price} setPrice={setPrice} depositRequired={depositRequired} setDepositRequired={setDepositRequired} depositStructure={depositStructure} setDepositStructure={setDepositStructure} depositAmount={depositAmount} setDepositAmount={setDepositAmount}
      units={units} setUnits={setUnits} addUnit={addUnit} updateUnit={updateUnit} phone={phone} setPhone={setPhone} email={email} setEmail={setEmail} socialLinks={socialLinks} setSocialLinks={setSocialLinks} addSocialLink={addSocialLink} updateSocialLink={updateSocialLink} removeSocialLink={removeSocialLink} SOCIAL_PLATFORMS={SOCIAL_PLATFORMS}
      photos={photos} setPhotos={setPhotos} removePhoto={removePhoto} updatePhotoLabel={updatePhotoLabel} handlePhotoUpload={handlePhotoUpload} video={video} removeVideo={removeVideo} handleVideoUpload={handleVideoUpload} title={title} setTitle={setTitle} description={description} setDescription={setDescription} size={size} setSize={setSize} customSize={customSize} setCustomSize={setCustomSize} beds={beds} setBeds={setBeds} baths={baths} setBaths={setBaths} HOUSE_SIZES={HOUSE_SIZES}
    />
    <ListingPaymentModal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} role={listingRole} amountKes={listingEntitlement?.individualListingPriceKes ?? 0} paymentLoading={paymentLoading} paymentCompleted={paymentCompleted} selectedPaymentMethod={selectedPaymentMethod} onSelectPaymentMethod={setSelectedPaymentMethod} onPayNow={handleListingPayment} subscriptionPlans={subscriptionPlans} subscriptionPlansLoading={subscriptionPlansLoading} subscriptionPlansError={subscriptionPlansError} onContinueToSubscription={handleContinueToSubscription} />
  </>;
}
