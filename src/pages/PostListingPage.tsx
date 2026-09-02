import { useEffect, useRef, useState } from 'react';
import { FileText, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import PropertyListingForm from './PropertyListingForm';
import ListingPaymentModal from '@/modals/Listingpaymentmodal';
import { protectedGet, protectedPost, protectedUpload } from '@/lib/djangoApi';
import { KENYAN_CITIES, KENYAN_COUNTIES, HOUSE_SIZES, formatKES, validatePhone, validateEmail } from '@/lib/utils';
import { fetchListingEntitlement, createListingPaymentIntent, waitForListingPaymentIntent, type ListingEntitlement, type ListingFormPayload, type ListingRole, type SubscriptionPlan, type SubscriptionStatus } from '@/lib/ListingEntitlement';

type ListingPaymentRequirement = 'not_required' | 'required';
interface MediaItem { file?: File; url: string; label: string; type: 'photo' | 'video'; id?: string; }
interface PropertyUnit { id: string; unitNumber: string; unitType: string; rent: string; depositAmount: string; size: string; beds: string; baths: string; availability: 'available' | 'occupied' | 'reserved'; description: string; photos: MediaItem[]; }
interface LocationSuggestion { display_name: string; lat: string; lon: string; place_id?: string | number; type?: string; address?: { city?: string; town?: string; village?: string; county?: string; state?: string; country?: string; }; }
interface SocialLink { platform: string; url: string; }
interface ExistingMedia { id: string; url: string; label: string | null; media_type: 'photo' | 'video'; position: number; unit_id?: string | null; }

export default function PostListingPage() {
  const { profile } = useAuth();
  const { navigate, selectedPostListingDraftId } = useNav();
  const [draftId, setDraftId] = useState<string | null>(selectedPostListingDraftId);
  const [draftLoading, setDraftLoading] = useState(Boolean(selectedPostListingDraftId));
  const [draftSaving, setDraftSaving] = useState(false);
  const draftHydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptionPlansLoading, setSubscriptionPlansLoading] = useState(false);
  const [subscriptionPlansError, setSubscriptionPlansError] = useState<string | null>(null);
  const [aiCaption, setAiCaption] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);
  const [listingEntitlement, setListingEntitlement] = useState<ListingEntitlement | null>(null);
  const LISTING_FEE_KES = listingEntitlement?.individualListingPriceKes ?? 1000;
  const [entitlementLoading, setEntitlementLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('none');
  const [listingPaymentRequirement, setListingPaymentRequirement] = useState<ListingPaymentRequirement>('not_required');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'MPESA' | 'PAYPAL' | null>(null);
  const [propertyName, setPropertyName] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [city, setCity] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [county, setCounty] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [usingGPS, setUsingGPS] = useState(false);
  const [price, setPrice] = useState('');
  const [listingType, setListingType] = useState<'rent' | 'sale'>('rent');
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositStructure, setDepositStructure] = useState<'fixed' | 'installments'>('fixed');
  const [depositAmount, setDepositAmount] = useState('');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [photos, setPhotos] = useState<MediaItem[]>([]);
  const [video, setVideo] = useState<MediaItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [size, setSize] = useState('');
  const [customSize, setCustomSize] = useState('');
  const [beds, setBeds] = useState('1');
  const [baths, setBaths] = useState('1');

  const SOCIAL_PLATFORMS = ['WhatsApp', 'Instagram', 'Facebook', 'Website', 'TikTok'];
  const finalCity = city === 'custom' ? customCity.trim() : city.trim();
  const finalSize = size === 'Custom Size' ? customSize.trim() : size.trim();
  const listingRole: ListingRole | null = profile?.role === 'landlord' || profile?.role === 'real_estate' ? profile.role : null;

  useEffect(() => {
    if (selectedPostListingDraftId !== draftId) setDraftId(selectedPostListingDraftId);
  }, [selectedPostListingDraftId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!profile?.id || !listingRole) return;
      setEntitlementLoading(true);
      try {
        const entitlement = await fetchListingEntitlement(listingRole, profile.id);
        if (cancelled) return;
        setListingEntitlement(entitlement);
        setSubscriptionStatus(entitlement.subscriptionStatus);
        setListingPaymentRequirement(entitlement.requiresIndividualPayment ? 'required' : 'not_required');
      } catch (err) {
        if (!cancelled) { setListingEntitlement(null); setSubscriptionStatus('none'); setListingPaymentRequirement('not_required'); setError(err instanceof Error ? err.message : 'Unable to load listing information.'); }
      } finally { if (!cancelled) setEntitlementLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [profile?.id, listingRole]);

  const FREE_LISTING_LIMIT = listingEntitlement?.free_limit ?? 3;
  const isPropertyManagementListing = listingRole === 'landlord' && (subscriptionStatus === 'active' || subscriptionStatus === 'trial');
  const BASE_STEPS = isPropertyManagementListing ? ['Property', 'Units', 'Financial', 'Contact', 'Media', 'Details', 'Review'] : ['Location', 'Financial', 'Contact', 'Media', 'Details', 'Review'];
  const STEPS = listingPaymentRequirement === 'required' ? [...BASE_STEPS, 'Payment'] : BASE_STEPS;
  const paymentRequired = listingPaymentRequirement === 'required';
  const paymentDescription = paymentRequired ? `This listing requires a ${formatKES(LISTING_FEE_KES)} listing fee before publication.` : 'No listing payment is currently required.';
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const paymentStepIndex = paymentRequired ? STEPS.length - 1 : -1;
  const freeListingsRemaining = Math.max(0, Number(listingEntitlement?.free_listings_remaining ?? 0));

  const buildListingPayload = (): ListingFormPayload => ({
    title: (isPropertyManagementListing ? propertyName : title).trim(),
    description: description.trim(), city: finalCity.trim(), county: county.trim(), location_search: locationSearch.trim() || null,
    latitude: latitude !== null && Number.isFinite(latitude) ? latitude : null, longitude: longitude !== null && Number.isFinite(longitude) ? longitude : null,
    property_name: propertyName.trim() || null, property_type: propertyType.trim() || null, price_kes: price !== '' ? Number(price) : null,
    listing_type: listingType, deposit_required: Boolean(depositRequired), deposit_structure: depositStructure || null, deposit_amount: depositAmount !== '' ? Number(depositAmount) : 0,
    size: finalSize || null, beds: beds !== '' ? Number(beds) : 0, baths: baths !== '' ? Number(baths) : 0, contact_phone: phone.trim(), contact_email: email.trim(),
    social_links: socialLinks.filter((item) => item?.url?.trim()).map((item) => ({ platform: item.platform.trim(), url: item.url.trim() })),
    booking_enabled: Boolean(bookingEnabled), payment_enabled: Boolean(paymentEnabled), is_property_management: Boolean(isPropertyManagementListing),
  });

  const draftPayload = () => ({ ...buildListingPayload(), draft_ui: { customCity, customSize, units, termsAccepted, reviewConfirmed, step } });

  useEffect(() => {
    let cancelled = false;
    const loadDraft = async () => {
      if (!selectedPostListingDraftId || !profile?.id || !listingRole) { draftHydrated.current = true; setDraftLoading(false); return; }
      setDraftLoading(true); draftHydrated.current = false;
      try {
        const draft = await protectedGet<{ id: string; listing_id: string; data: Record<string, unknown> }>(`/api/listings/drafts/${encodeURIComponent(selectedPostListingDraftId)}/`);
        if (cancelled) return;
        const d = draft.data || {};
        setDraftId(String(draft.listing_id || draft.id));
        setTitle(String(d.title || '')); setDescription(String(d.description || '')); setCity(String(d.city || '')); setCounty(String(d.county || ''));
        setLocationSearch(String(d.location_search || '')); setLatitude(d.latitude == null ? null : Number(d.latitude)); setLongitude(d.longitude == null ? null : Number(d.longitude));
        setPropertyName(String(d.property_name || '')); setPropertyType(String(d.property_type || '')); setPrice(d.price_kes == null ? '' : String(d.price_kes));
        setListingType(d.listing_type === 'sale' ? 'sale' : 'rent'); setDepositRequired(Boolean(d.deposit_required)); setDepositStructure(d.deposit_structure === 'installments' ? 'installments' : 'fixed'); setDepositAmount(d.deposit_amount == null ? '' : String(d.deposit_amount));
        setSize(String(d.size || '')); setBeds(d.beds == null ? '1' : String(d.beds)); setBaths(d.baths == null ? '1' : String(d.baths)); setPhone(String(d.contact_phone || profile.phone || '')); setEmail(String(d.contact_email || profile.email || ''));
        setSocialLinks(Array.isArray(d.social_links) ? d.social_links as SocialLink[] : []); setBookingEnabled(Boolean(d.booking_enabled)); setPaymentEnabled(Boolean(d.payment_enabled));
        const ui = d.draft_ui as Record<string, unknown> | undefined;
        if (ui) { setCustomCity(String(ui.customCity || '')); setCustomSize(String(ui.customSize || '')); setTermsAccepted(Boolean(ui.termsAccepted)); setReviewConfirmed(Boolean(ui.reviewConfirmed)); if (Array.isArray(ui.units)) setUnits(ui.units as PropertyUnit[]); if (typeof ui.step === 'number') setStep(Math.max(0, ui.step)); }
        const media = await protectedGet<ExistingMedia[]>(`/api/listings/media/?listing_id=${encodeURIComponent(String(draft.listing_id || draft.id))}`);
        if (cancelled) return;
        setPhotos((media || []).filter((m) => m.media_type === 'photo').sort((a,b) => a.position-b.position).map((m) => ({ id: m.id, url: m.url, label: m.label || 'Photo', type: 'photo' })));
        const savedVideo = (media || []).find((m) => m.media_type === 'video');
        setVideo(savedVideo ? { id: savedVideo.id, url: savedVideo.url, label: savedVideo.label || 'Walkthrough Video', type: 'video' } : null);
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : 'Unable to load the saved listing draft.'); navigate('post-listing'); }
      } finally { if (!cancelled) { draftHydrated.current = true; setDraftLoading(false); } }
    };
    loadDraft();
    return () => { cancelled = true; };
  }, [selectedPostListingDraftId, profile?.id, listingRole]);

  useEffect(() => {
    if (!profile?.id || !listingRole || !draftHydrated.current || draftLoading || success) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setDraftSaving(true);
      try {
        const result = await protectedPost<{ listing_id: string; id: string }>('/api/listings/drafts/', { draft_id: draftId || undefined, data: draftPayload() });
        const id = String(result.listing_id || result.id);
        if (!draftId && id) { setDraftId(id); navigate('post-listing', id); }
      } catch (err) { console.warn('Draft auto-save failed:', err); }
      finally { setDraftSaving(false); }
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [profile?.id, listingRole, draftId, draftLoading, success, step, propertyName, propertyType, units, bookingEnabled, paymentEnabled, reviewConfirmed, city, customCity, county, latitude, longitude, locationSearch, price, listingType, depositRequired, depositStructure, depositAmount, phone, email, socialLinks, photos, video, title, description, size, customSize, beds, baths]);

  useEffect(() => {
    if (!paymentRequired) { setPaymentCompleted(true); setSelectedPaymentMethod(null); setPaymentIntentId(null); setPaymentModalOpen(false); return; }
    setPaymentCompleted(false); setSelectedPaymentMethod(null); setPaymentIntentId(null);
  }, [paymentRequired]);
  useEffect(() => { if (paymentRequired && step === paymentStepIndex && !paymentCompleted) setPaymentModalOpen(true); }, [paymentRequired, step, paymentStepIndex, paymentCompleted]);

  useEffect(() => {
    if (!listingRole) return;
    let cancelled = false; setSubscriptionPlansLoading(true);
    protectedGet<SubscriptionPlan[]>(`/api/subscriptions/plans/?audience=${listingRole === 'landlord' ? 'LANDLORD' : 'REAL_ESTATE'}`)
      .then((plans) => { if (!cancelled) setSubscriptionPlans(Array.isArray(plans) ? plans : []); })
      .catch((err) => { if (!cancelled) setSubscriptionPlansError(err instanceof Error ? err.message : 'Unable to load subscription plans.'); })
      .finally(() => { if (!cancelled) setSubscriptionPlansLoading(false); });
    return () => { cancelled = true; };
  }, [listingRole]);

  const ensureDraft = async () => {
    if (draftId) return draftId;
    const result = await protectedPost<{ listing_id: string; id: string }>('/api/listings/drafts/', { data: draftPayload() });
    const id = String(result.listing_id || result.id);
    setDraftId(id); navigate('post-listing', id); return id;
  };

  const handleContinueToSubscription = (plan: { id: string; name: string }, billingCycle: 'monthly' | 'annual') => {
    setPaymentModalOpen(false);
    navigate('subscription-plans', draftId || undefined);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) { setError('Location services are not supported by this browser.'); return; }
    setUsingGPS(true); setError(null);
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude, lon = position.coords.longitude;
      try {
        setLatitude(lat); setLongitude(lon);
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Unable to determine the address from your GPS location.');
        const data = await response.json(), address = data?.address || {};
        const detectedCity = address.city || address.town || address.municipality || address.village || address.suburb || '', detectedCounty = address.county || address.state_district || address.state || '', detectedLocation = data?.display_name || `${detectedCity}${detectedCounty ? `, ${detectedCounty}` : ''}`;
        setLocationSearch(detectedLocation);
        if (detectedCity) { const matchingCity = KENYAN_CITIES.find((item) => item.toLowerCase() === detectedCity.toLowerCase()); if (matchingCity) setCity(matchingCity); else { setCustomCity(detectedCity); setCity('custom'); } }
        if (detectedCounty) { const normalizedCounty = detectedCounty.replace(/ County$/i, '').trim(); setCounty(KENYAN_COUNTIES.find((item) => item.toLowerCase() === normalizedCounty.toLowerCase()) || normalizedCounty); }
        setLocationSuggestions([{ display_name: detectedLocation, lat: String(lat), lon: String(lon), place_id: data?.place_id, type: data?.type, address }]);
      } catch (err) { setError(err instanceof Error ? err.message : 'Unable to determine your location.'); }
      finally { setUsingGPS(false); }
    }, (geoError) => { setUsingGPS(false); setError(geoError.code === geoError.PERMISSION_DENIED ? 'Location permission was denied. Please allow location access and try again.' : 'Unable to get your current location.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const createUnit = (): PropertyUnit => ({ id: crypto.randomUUID(), unitNumber: '', unitType: '', rent: '', depositAmount: '', size: '', beds: '1', baths: '1', availability: 'available', description: '', photos: [] });
  const addUnit = () => setUnits((current) => [...current, createUnit()]);
  const updateUnit = (id: string, field: keyof PropertyUnit, value: unknown) => setUnits((current) => current.map((unit) => unit.id === id ? { ...unit, [field]: value } : unit));
  const contactIsValid = phone.trim() !== '' && validatePhone(phone) && email.trim() !== '' && validateEmail(email);
  const canProceed = () => {
    if (isPropertyManagementListing) { switch (step) { case 0: return locationSearch.trim() !== '' && propertyName.trim() !== '' && propertyType.trim() !== '' && finalCity !== '' && county.trim() !== ''; case 1: return units.length > 0 && units.every((u) => Number(u.rent) > 0 && u.unitNumber.trim() !== '' && u.unitType.trim() !== '' && Number.isInteger(Number(u.beds)) && Number(u.beds) >= 0 && Number.isInteger(Number(u.baths)) && Number(u.baths) >= 0 && u.photos.length >= 3 && u.photos.length <= 7); case 2: return units.every((u) => Number(u.rent) > 0); case 3: return contactIsValid; case 4: return photos.length >= 3 && photos.length <= 7; case 5: return title.trim() !== '' && description.trim() !== ''; case 6: return reviewConfirmed; default: return step === paymentStepIndex ? (paymentRequired ? paymentCompleted : true) : false; } }
    switch (step) { case 0: return finalCity !== '' && county.trim() !== ''; case 1: return price.trim() !== '' && Number.isFinite(Number(price)) && Number(price) > 0; case 2: return contactIsValid; case 3: return photos.length >= 3 && photos.length <= 7; case 4: return title.trim() !== '' && description.trim() !== '' && finalSize !== ''; case 5: return reviewConfirmed; default: return step === paymentStepIndex ? (paymentRequired ? paymentCompleted : true) : false; }
  };

  const handleListingPayment = async (): Promise<boolean> => {
    if (!paymentRequired) { setPaymentCompleted(true); return true; }
    if (!selectedPaymentMethod) { setError('Please select a payment method before continuing.'); return false; }
    setPaymentLoading(true); setError(null);
    try {
      const id = await ensureDraft();
      let intentId = paymentIntentId;
      if (!intentId) { const intent = await createListingPaymentIntent(buildListingPayload(), id); intentId = intent.paymentIntentId; setPaymentIntentId(intentId); }
      const response = await protectedPost<{ success?: boolean; message?: string; error?: string }>('/api/payments/listing/start/', { payment_intent_id: intentId, provider: selectedPaymentMethod === 'MPESA' ? 'mpesa' : 'paypal', phone_number: phone.trim() });
      if (!response?.success) throw new Error(response?.error || response?.message || 'The payment request could not be started.');
      const confirmed = await waitForListingPaymentIntent(intentId);
      if (!confirmed) throw new Error('The listing payment was not confirmed. If you completed the M-Pesa prompt, please wait a moment and try again.');
      setPaymentCompleted(true); return true;
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to process the listing payment.'); setPaymentCompleted(false); return false; }
    finally { setPaymentLoading(false); }
  };

  const MAX_PHOTOS = 7, MAX_PHOTO_SIZE = 10 * 1024 * 1024, MAX_VIDEO_SIZE = 100 * 1024 * 1024;
  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = MAX_PHOTOS - photos.length; if (remaining <= 0) { setError(`You can upload a maximum of ${MAX_PHOTOS} photos.`); return; }
    try {
      const id = await ensureDraft(); const validFiles: File[] = [];
      for (const file of Array.from(files).slice(0, remaining)) { if (!file.type.startsWith('image/')) { setError(`${file.name} is not a valid image file.`); continue; } if (file.size > MAX_PHOTO_SIZE) { setError(`${file.name} is too large. Each photo must be 10 MB or smaller.`); continue; } validFiles.push(file); }
      for (const [index, file] of validFiles.entries()) { const formData = new FormData(); formData.append('listing_id', id); formData.append('file', file); formData.append('media_type', 'photo'); formData.append('label', `Photo ${photos.length + index + 1}`); formData.append('position', String(photos.length + index)); await protectedUpload<ExistingMedia>('/api/listings/media/', formData); }
      const saved = await protectedGet<ExistingMedia[]>(`/api/listings/media/?listing_id=${encodeURIComponent(id)}`); setPhotos((saved || []).filter((m) => m.media_type === 'photo').sort((a,b) => a.position-b.position).map((m) => ({ id: m.id, url: m.url, label: m.label || 'Photo', type: 'photo' })));
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to upload photos.'); }
  };
  const handleVideoUpload = async (file: File | null) => {
    if (!file) return; if (!file.type.startsWith('video/')) { setError('Please select a valid video file.'); return; } if (file.size > MAX_VIDEO_SIZE) { setError('Video is too large. Maximum allowed size is 100 MB.'); return; }
    try { const id = await ensureDraft(); const formData = new FormData(); formData.append('listing_id', id); formData.append('file', file); formData.append('media_type', 'video'); formData.append('label', 'Walkthrough Video'); formData.append('position', '0'); const saved = await protectedUpload<ExistingMedia>('/api/listings/media/', formData); setVideo({ id: saved.id, url: saved.url, label: saved.label || 'Walkthrough Video', type: 'video' }); setError(''); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to upload video.'); }
  };
  const updatePhotoLabel = (index: number, label: string) => setPhotos((current) => current.map((p, i) => i === index ? { ...p, label } : p));
  const removePhoto = async (index: number) => { const photo = photos[index]; setPhotos((current) => current.filter((_, i) => i !== index)); if (photo?.id) { try { await protectedPost(`/api/listings/media/${encodeURIComponent(photo.id)}/delete/`, {}); } catch { /* media delete endpoint may be patched separately */ } } };
  const removeVideo = async () => { const current = video; setVideo(null); if (current?.id) { try { await protectedPost(`/api/listings/media/${encodeURIComponent(current.id)}/delete/`, {}); } catch { /* media delete endpoint may be patched separately */ } } };

  const handleSubmit = async () => {
    setError(null); setSubmitting(true); setAiCaption('');
    try {
      if (!profile?.id) throw new Error('Your login session has expired. Please sign in again.');
      if (!title.trim() && !propertyName.trim()) throw new Error('A listing title is required.');
      if (!description.trim()) throw new Error('A listing description is required.'); if (!finalCity.trim()) throw new Error('A city is required.'); if (!county.trim()) throw new Error('A county is required.'); if (!phone.trim()) throw new Error('A contact phone number is required.'); if (!email.trim()) throw new Error('A contact email is required.');
      if (isPropertyManagementListing && (!units.length)) throw new Error('At least one property unit is required.');
      const id = await ensureDraft();
      let paidIntentId = paymentIntentId;
      if (paymentRequired) { if (!paymentCompleted || !paidIntentId) throw new Error('Please complete the listing payment before publishing.'); }
      const result = await protectedPost<{ success?: boolean; listing_created?: boolean; listing_id?: string; detail?: string }>(`/api/listings/drafts/${encodeURIComponent(id)}/`, { payment_intent_id: paidIntentId || undefined });
      if (!result?.success || !result.listing_id) throw new Error(result?.detail || 'The listing could not be finalized.');
      const listingId = String(result.listing_id);
      try { const response = await protectedPost<{ caption?: string }>(`/api/listings/${encodeURIComponent(listingId)}/ai-caption/`, {}); if (response?.caption) setAiCaption(response.caption.trim()); } catch (aiError) { console.warn('AI caption generation failed:', aiError); }
      setCreatedListingId(listingId); setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to post listing. Please try again.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    finally { setSubmitting(false); }
  };

  if (!profile) return <div className="mx-auto max-w-md px-2 py-20 text-center"><p className="text-gray-500 dark:text-gray-400">Please sign in to post a listing.</p></div>;
  if (!listingRole) return <div className="mx-auto max-w-md px-2 py-20 text-center"><p className="text-gray-500 dark:text-gray-400">Only landlord and real estate accounts can post listings.</p></div>;
  if (profile.verification_status !== 'verified') return <div className="mx-auto max-w-md px-2 py-20 text-center"><div className="card p-8"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning-100 dark:bg-warning-900/30"><FileText className="h-8 w-8 text-warning-600" /></div><h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Verification Required</h2><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">You must complete KYC verification before posting listings.</p><button type="button" onClick={() => navigate('kyc-verify')} className="btn-primary mt-6">Verify Now</button></div></div>;
  if (entitlementLoading || draftLoading) return <div className="flex min-h-[400px] items-center justify-center"><div className="flex items-center gap-2 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />{draftLoading ? 'Loading saved listing draft...' : 'Checking account status...'}</div></div>;
  if (success) return <div className="mx-auto max-w-2xl px-2 py-12"><div className="card p-8 text-center animate-scale-in"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30"><CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" /></div><h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Listing Submitted for Review</h2><p className="mt-2 text-gray-500 dark:text-gray-400">Your property has been successfully submitted and is now awaiting approval. Once approved, it will be published and made visible to renters and buyers.</p><div className="mt-4 rounded-lg bg-success-50 px-2 py-3 dark:bg-success-900/20"><p className="text-sm font-medium text-success-700 dark:text-success-400">Your listing has been submitted successfully.</p></div><div className="mt-3 rounded-lg bg-brand-50 px-2 py-3 dark:bg-brand-900/20"><p className="text-sm font-medium text-brand-700 dark:text-brand-300">Approval Status: Pending Review</p></div>{aiCaption && <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left"><p className="mb-2 text-xs font-semibold text-brand-600">AI-Generated Community Caption</p><p className="whitespace-pre-line text-sm text-gray-700">{aiCaption}</p></div>}<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center"><button onClick={() => navigate('listings')} className="btn-primary">View My Listings</button><button onClick={() => navigate('community')} className="btn-secondary">See Community</button></div></div></div>;

  return <><PropertyListingForm
    step={step} STEPS={STEPS} error={error} submitting={submitting} setStep={setStep} canProceed={canProceed} handleSubmit={handleSubmit}
    reviewConfirmed={reviewConfirmed} setReviewConfirmed={setReviewConfirmed} selectedPaymentMethod={selectedPaymentMethod} setSelectedPaymentMethod={setSelectedPaymentMethod}
    termsAccepted={termsAccepted} setTermsAccepted={setTermsAccepted} subscriptionStatus={subscriptionStatus} freeListingsRemaining={freeListingsRemaining} isPropertyManagementListing={isPropertyManagementListing}
    listingPaymentRequirement={listingPaymentRequirement} paymentLoading={paymentLoading} paymentRequired={paymentRequired} handleListingPayment={handleListingPayment} paymentDescription={paymentDescription} LISTING_FEE_KES={LISTING_FEE_KES} FREE_LISTING_LIMIT={FREE_LISTING_LIMIT} paymentCompleted={paymentCompleted} setPaymentCompleted={setPaymentCompleted} onOpenPaymentModal={() => setPaymentModalOpen(true)} formatKES={formatKES}
    city={city} setCity={setCity} customCity={customCity} setCustomCity={setCustomCity} county={county} setCounty={setCounty} locationSearch={locationSearch} setLocationSearch={setLocationSearch} locationSuggestions={locationSuggestions} setLocationSuggestions={setLocationSuggestions} latitude={latitude} setLatitude={setLatitude} longitude={longitude} setLongitude={setLongitude} usingGPS={usingGPS} setUsingGPS={setUsingGPS} handleUseCurrentLocation={handleUseCurrentLocation} KENYAN_CITIES={KENYAN_CITIES} KENYAN_COUNTIES={KENYAN_COUNTIES}
    propertyName={propertyName} setPropertyName={setPropertyName} propertyType={propertyType} setPropertyType={setPropertyType} bookingEnabled={bookingEnabled} setBookingEnabled={setBookingEnabled} paymentEnabled={paymentEnabled} setPaymentEnabled={setPaymentEnabled}
    listingType={listingType} setListingType={setListingType} price={price} setPrice={setPrice} depositRequired={depositRequired} setDepositRequired={setDepositRequired} depositStructure={depositStructure} setDepositStructure={setDepositStructure} depositAmount={depositAmount} setDepositAmount={setDepositAmount}
    units={units} setUnits={setUnits} addUnit={addUnit} updateUnit={updateUnit} phone={phone} setPhone={setPhone} email={email} setEmail={setEmail} socialLinks={socialLinks} setSocialLinks={setSocialLinks} addSocialLink={addSocialLink} updateSocialLink={updateSocialLink} removeSocialLink={removeSocialLink} SOCIAL_PLATFORMS={SOCIAL_PLATFORMS}
    photos={photos} setPhotos={setPhotos} removePhoto={removePhoto} updatePhotoLabel={updatePhotoLabel} handlePhotoUpload={handlePhotoUpload} video={video} removeVideo={removeVideo} handleVideoUpload={handleVideoUpload} title={title} setTitle={setTitle} description={description} setDescription={setDescription} size={size} setSize={setSize} customSize={customSize} setCustomSize={setCustomSize} beds={beds} setBeds={setBeds} baths={baths} setBaths={setBaths} HOUSE_SIZES={HOUSE_SIZES}
  /><ListingPaymentModal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} role={listingRole} amountKes={listingEntitlement?.individualListingPriceKes ?? 0} paymentLoading={paymentLoading} paymentCompleted={paymentCompleted} selectedPaymentMethod={selectedPaymentMethod} onSelectPaymentMethod={setSelectedPaymentMethod} onPayNow={handleListingPayment} subscriptionPlans={subscriptionPlans} subscriptionPlansLoading={subscriptionPlansLoading} subscriptionPlansError={subscriptionPlansError} onContinueToSubscription={handleContinueToSubscription} /></>;
}
