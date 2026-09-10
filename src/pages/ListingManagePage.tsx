import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';

import { useNav } from '@/context/NavContext';
import EditingListingForm from '@/components/listings/EditingListingForm';
import { KENYAN_CITIES, KENYAN_COUNTIES, HOUSE_SIZES, formatKES } from '@/lib/utils';
import { protectedDelete, protectedGet, protectedPatch, protectedUpload } from '@/lib/djangoApi';

interface LocationSuggestion { display_name: string; lat: string | number; lon: string | number; }
interface MediaItem { id?: string; url: string; label: string; type: 'photo' | 'video'; media_type?: 'photo' | 'video'; position?: number; }
interface ListingResponse {
  id: string; title?: string; description?: string; city?: string; county?: string; location_search?: string | null;
  latitude?: number | string | null; longitude?: number | string | null; property_type?: string | null; property_name?: string | null;
  price_kes?: number | string | null; listing_type?: 'rent' | 'sale'; deposit_required?: boolean;
  deposit_structure?: 'fixed' | 'installments' | null; deposit_amount?: number | string | null; size?: string | null;
  beds?: number | null; baths?: number | null; contact_phone?: string | null; contact_email?: string | null;
  social_links?: Array<{ platform: string; url: string }>; booking_enabled?: boolean; payment_enabled?: boolean;
  is_property_management?: boolean; approval_status?: string; is_approved?: boolean;
  media?: Array<{ id: string; url: string; label?: string | null; media_type: 'photo' | 'video'; position?: number }>;
}

const SOCIAL_PLATFORMS = ['WhatsApp', 'Instagram', 'Facebook', 'Website', 'TikTok', 'X', 'Other'];
const isKnownCity = (value: string) => KENYAN_CITIES.some(item => item === value);
const isKnownSize = (value: string) => HOUSE_SIZES.some(item => item === value);
const isApproved = (listing: ListingResponse) => listing.approval_status === 'approved' || listing.is_approved === true;

export default function ListingManagePage() {
  const { selectedListingManageId, navigate } = useNav();
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState(false);
  const [city, setCity] = useState(''); const [customCity, setCustomCity] = useState(''); const [county, setCounty] = useState('');
  const [locationSearch, setLocationSearch] = useState(''); const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [latitude, setLatitude] = useState<number | null>(null); const [longitude, setLongitude] = useState<number | null>(null); const [usingGPS, setUsingGPS] = useState(false);
  const [listingType, setListingType] = useState<'rent' | 'sale'>('rent'); const [price, setPrice] = useState('');
  const [depositRequired, setDepositRequired] = useState(false); const [depositStructure, setDepositStructure] = useState<'fixed' | 'installments'>('fixed'); const [depositAmount, setDepositAmount] = useState('');
  const [title, setTitle] = useState(''); const [size, setSize] = useState(''); const [customSize, setCustomSize] = useState(''); const [beds, setBeds] = useState('1'); const [baths, setBaths] = useState('1'); const [description, setDescription] = useState('');
  const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [socialLinks, setSocialLinks] = useState<Array<{ platform: string; url: string }>>([]);
  const [photos, setPhotos] = useState<MediaItem[]>([]); const [video, setVideo] = useState<MediaItem | null>(null);
  const [originalPropertyName, setOriginalPropertyName] = useState(''); const [originalPropertyType, setOriginalPropertyType] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedListingManageId) { setLoading(false); setError('No listing was selected.'); return; }
      try {
        setLoading(true); setError(null);
        const listing = await protectedGet<ListingResponse>(`/api/listings/${encodeURIComponent(selectedListingManageId)}/`);
        if (!listing || !isApproved(listing)) throw new Error('This editor is only available for approved listings.');
        if (cancelled) return;
        const loadedCity = String(listing.city ?? '');
        if (loadedCity && isKnownCity(loadedCity)) { setCity(loadedCity); setCustomCity(''); } else { setCity(loadedCity ? 'custom' : ''); setCustomCity(loadedCity); }
        setCounty(String(listing.county ?? '')); setLocationSearch(String(listing.location_search ?? ''));
        setLatitude(listing.latitude == null ? null : Number(listing.latitude)); setLongitude(listing.longitude == null ? null : Number(listing.longitude));
        setListingType(listing.listing_type === 'sale' ? 'sale' : 'rent'); setPrice(listing.price_kes == null ? '' : String(listing.price_kes));
        setDepositRequired(Boolean(listing.deposit_required)); setDepositStructure(listing.deposit_structure === 'installments' ? 'installments' : 'fixed'); setDepositAmount(listing.deposit_amount == null ? '' : String(listing.deposit_amount));
        setTitle(String(listing.title ?? ''));
        const loadedSize = String(listing.size ?? '');
        if (loadedSize && isKnownSize(loadedSize)) { setSize(loadedSize); setCustomSize(''); } else if (loadedSize) { setSize('Custom Size'); setCustomSize(loadedSize); } else { setSize(''); setCustomSize(''); }
        setBeds(listing.beds == null ? '0' : String(listing.beds)); setBaths(listing.baths == null ? '1' : String(listing.baths)); setDescription(String(listing.description ?? ''));
        setPhone(String(listing.contact_phone ?? '')); setEmail(String(listing.contact_email ?? '')); setSocialLinks(Array.isArray(listing.social_links) ? listing.social_links : []);
        setOriginalPropertyName(String(listing.property_name ?? '')); setOriginalPropertyType(String(listing.property_type ?? ''));
        const media = Array.isArray(listing.media) ? listing.media : [];
        setPhotos(media.filter(item => item.media_type === 'photo').map((item, index) => ({ id: item.id, url: item.url, label: item.label || `Photo ${index + 1}`, type: 'photo', media_type: 'photo', position: item.position ?? index })));
        const loadedVideo = media.find(item => item.media_type === 'video');
        setVideo(loadedVideo ? { id: loadedVideo.id, url: loadedVideo.url, label: loadedVideo.label || 'Walkthrough Video', type: 'video', media_type: 'video', position: loadedVideo.position ?? 0 } : null);
      } catch (loadError) { if (!cancelled) { console.error('Failed to load listing:', loadError); setError(loadError instanceof Error ? loadError.message : 'Failed to load listing.'); } }
      finally { if (!cancelled) setLoading(false); }
    };
    void load(); return () => { cancelled = true; };
  }, [selectedListingManageId]);

  useEffect(() => {
    const query = locationSearch.trim(); if (query.length < 3) { setLocationSuggestions([]); return; }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ke&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) return; const data = await response.json();
        setLocationSuggestions(Array.isArray(data) ? data.map((item: any) => ({ display_name: item.display_name, lat: item.lat, lon: item.lon })) : []);
      } catch { setLocationSuggestions([]); }
    }, 400); return () => window.clearTimeout(timer);
  }, [locationSearch]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) { setError('GPS location is not supported by this browser.'); return; }
    setUsingGPS(true); setError(null);
    navigator.geolocation.getCurrentPosition(async position => {
      const lat = position.coords.latitude; const lon = position.coords.longitude; setLatitude(lat); setLongitude(lon);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`, { headers: { Accept: 'application/json' } });
        const data = await response.json(); const address = data.address ?? {}; const detectedCity = address.city || address.town || address.village || ''; const detectedCounty = address.county || '';
        setCity(isKnownCity(detectedCity) ? detectedCity : 'custom'); setCustomCity(isKnownCity(detectedCity) ? '' : detectedCity); setCounty(detectedCounty); setLocationSearch(data.display_name || `${lat}, ${lon}`); setLocationSuggestions([]);
      } catch { setError('GPS coordinates were captured, but the address could not be determined automatically.'); } finally { setUsingGPS(false); }
    }, () => { setUsingGPS(false); setError('Unable to get your current location. Please allow location access and try again.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const addSocialLink = () => setSocialLinks(current => [...current, { platform: 'WhatsApp', url: '' }]);
  const updateSocialLink = (index: number, field: 'platform' | 'url', value: string) => setSocialLinks(current => current.map((link, i) => i === index ? { ...link, [field]: value } : link));
  const removeSocialLink = (index: number) => setSocialLinks(current => current.filter((_, i) => i !== index));

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length || !selectedListingManageId) return; const remaining = 7 - photos.length;
    if (remaining <= 0) { setError('You can upload a maximum of 7 photos.'); return; }
    try {
      for (const file of Array.from(files).slice(0, remaining)) {
        if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) throw new Error(`${file.name} must be a supported image no larger than 10 MB.`);
        const formData = new FormData(); formData.append('listing_id', selectedListingManageId); formData.append('media_type', 'photo'); formData.append('file', file); formData.append('label', `Photo ${photos.length + 1}`); formData.append('position', String(photos.length));
        const uploaded = await protectedUpload<any>('/api/listings/media/', formData);
        setPhotos(current => [...current, { id: uploaded.id, url: uploaded.url, label: uploaded.label || `Photo ${current.length + 1}`, type: 'photo', media_type: 'photo', position: current.length }]);
      }
      setError(null); setSuccess(false);
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Photo upload failed.'); }
  };

  const handleVideoUpload = async (file: File) => {
    if (!selectedListingManageId) return; if (!file.type.startsWith('video/') || file.size > 100 * 1024 * 1024) throw new Error('Video must be a supported video no larger than 100 MB.');
    try {
      if (video?.id) await protectedDelete(`/api/listings/media/${encodeURIComponent(video.id)}/`);
      const formData = new FormData(); formData.append('listing_id', selectedListingManageId); formData.append('media_type', 'video'); formData.append('file', file); formData.append('label', 'Walkthrough Video');
      const uploaded = await protectedUpload<any>('/api/listings/media/', formData);
      setVideo({ id: uploaded.id, url: uploaded.url, label: uploaded.label || 'Walkthrough Video', type: 'video', media_type: 'video' }); setError(null); setSuccess(false);
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Video upload failed.'); throw uploadError; }
  };

  const removePhoto = async (index: number) => { const photo = photos[index]; if (photo?.id) await protectedDelete(`/api/listings/media/${encodeURIComponent(photo.id)}/`); setPhotos(current => current.filter((_, i) => i !== index)); setSuccess(false); };
  const removeVideo = async () => { if (video?.id) await protectedDelete(`/api/listings/media/${encodeURIComponent(video.id)}/`); setVideo(null); setSuccess(false); };
  const updatePhotoLabel = (index: number, label: string) => { setPhotos(current => current.map((photo, i) => i === index ? { ...photo, label } : photo)); setSuccess(false); };

  const handleSave = async () => {
    if (!selectedListingManageId) { setError('No listing was selected.'); return; }
    const finalCity = city === 'custom' ? customCity.trim() : city.trim(); const finalSize = size === 'Custom Size' ? customSize.trim() : size.trim();
    if (!title.trim()) return setError('Listing title is required.'); if (!description.trim()) return setError('Property description is required.'); if (!finalCity) return setError('Please select or enter the city.'); if (!county.trim()) return setError('Please select the county.'); if (!locationSearch.trim()) return setError('Please provide the property location.'); if (!phone.trim() && !email.trim()) return setError('Please provide at least a phone number or email address.');
    try {
      setSaving(true); setError(null); setSuccess(false);
      await protectedPatch(`/api/listings/${encodeURIComponent(selectedListingManageId)}/`, {
        title: title.trim(), description: description.trim(), city: finalCity, county: county.trim(), location_search: locationSearch.trim() || null, latitude, longitude,
        property_name: originalPropertyName || null, property_type: originalPropertyType || null, price_kes: price.trim() === '' ? null : Number(price), listing_type: listingType,
        deposit_required: depositRequired, deposit_structure: depositRequired ? depositStructure : null, deposit_amount: depositRequired && depositAmount.trim() !== '' ? Number(depositAmount) : null,
        size: finalSize || null, beds: beds.trim() === '' ? null : Number(beds), baths: baths.trim() === '' ? null : Number(baths), contact_phone: phone.trim() || null, contact_email: email.trim() || null,
        social_links: socialLinks.filter(link => link.platform.trim() && link.url.trim()),
      });
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index]; if (photo.id) await protectedPatch(`/api/listings/media/${encodeURIComponent(photo.id)}/update/`, { label: photo.label.trim() || `Photo ${index + 1}`, position: index });
      }
      if (video?.id) await protectedPatch(`/api/listings/media/${encodeURIComponent(video.id)}/update/`, { label: video.label.trim() || 'Walkthrough Video' });
      setSuccess(true); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (saveError) { console.error('Failed to update listing:', saveError); setError(saveError instanceof Error ? saveError.message : 'Failed to update listing.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="card mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center"><div className="flex items-center gap-3 text-gray-600 dark:text-gray-300"><Loader2 className="h-5 w-5 animate-spin" />Loading listing...</div></div>;
  if (!selectedListingManageId || (error && !title)) return <div className="card mx-auto max-w-7xl p-6"><button type="button" onClick={() => navigate('my-listings')} className="mb-4 flex items-center gap-1 text-sm text-brand-600"><ArrowLeft className="h-4 w-4" />My Listings</button><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><div className="flex items-start gap-3"><AlertCircle className="h-5 w-5" />{error || 'No listing was selected.'}</div></div></div>;

  return <EditingListingForm
    city={city} setCity={value => { setCity(value); setSuccess(false); }} customCity={customCity} setCustomCity={setCustomCity} county={county} setCounty={value => { setCounty(value); setSuccess(false); }}
    locationSearch={locationSearch} setLocationSearch={value => { setLocationSearch(value); setLatitude(null); setLongitude(null); setSuccess(false); }} locationSuggestions={locationSuggestions} setLocationSuggestions={setLocationSuggestions} setLatitude={setLatitude} setLongitude={setLongitude} handleUseCurrentLocation={handleUseCurrentLocation} usingGPS={usingGPS}
    listingType={listingType} setListingType={value => { setListingType(value); setSuccess(false); }} price={price} setPrice={value => { setPrice(value); setSuccess(false); }} formatKES={formatKES}
    depositRequired={depositRequired} setDepositRequired={value => { setDepositRequired(value); setSuccess(false); }} depositStructure={depositStructure} setDepositStructure={setDepositStructure} depositAmount={depositAmount} setDepositAmount={setDepositAmount}
    title={title} setTitle={setTitle} size={size} setSize={setSize} customSize={customSize} setCustomSize={setCustomSize} HOUSE_SIZES={HOUSE_SIZES as unknown as string[]} beds={beds} setBeds={setBeds} baths={baths} setBaths={setBaths} description={description} setDescription={setDescription}
    phone={phone} setPhone={setPhone} email={email} setEmail={email} socialLinks={socialLinks} addSocialLink={addSocialLink} updateSocialLink={updateSocialLink} removeSocialLink={removeSocialLink} SOCIAL_PLATFORMS={SOCIAL_PLATFORMS}
    photos={photos} handlePhotoUpload={handlePhotoUpload} removePhoto={removePhoto} updatePhotoLabel={updatePhotoLabel} video={video} handleVideoUpload={handleVideoUpload} removeVideo={removeVideo}
    onSave={handleSave} saving={saving} error={error} success={success} canSave={Boolean(selectedListingManageId && !saving)}
  />;
}