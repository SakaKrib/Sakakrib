import { useMemo, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, ChevronRight, Home, Loader2, Search, UserCheck } from 'lucide-react';

import { cn } from '@/lib/utils';
import EditingListingForm from '../listings/EditingListingForm';
import EditingListingPMSForm from '../listings/EditingListingPMSForm';

type TargetRole = 'landlord' | 'real_estate';
type ListingCategory = 'normal' | 'pms';
type UnitAvailability = 'available' | 'occupied' | 'reserved';

interface MediaItem {
  file?: File;
  url: string;
  label: string;
  type: 'photo' | 'video';
}

interface SocialLink { platform: string; url: string }

interface LocationSuggestion { display_name: string; lat: string | number; lon: string | number }

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

export interface AdminEligibleUser {
  id: string;
  full_name: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email: string;
  phone: string | null;
  role: string;
  is_agency?: boolean | null;
  profile_photo_url?: string | null;
  subscription?: { status: string | null } | null;
}

export interface AdminCreateListingInput {
  userId: string;
  category: ListingCategory;
  role: TargetRole;
  fields: Record<string, unknown>;
  photos: MediaItem[];
  video: MediaItem | null;
  units: PropertyUnit[];
}

interface Props {
  users: AdminEligibleUser[];
  formatKES: (value: number) => string;
  HOUSE_SIZES: string[];
  SOCIAL_PLATFORMS: string[];
  onCreateListing: (input: AdminCreateListingInput) => void | Promise<void>;
  creating: boolean;
  error: string | null;
  success?: boolean;
  onCancel?: () => void;
}

const normalize = (value: string | null | undefined) => String(value || '').trim().toLowerCase();
const displayName = (user: AdminEligibleUser) => user.full_name?.trim() || [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ').trim() || 'Unnamed User';
const initials = (user: AdminEligibleUser) => displayName(user).split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase() || '').join('') || 'U';
const isActiveSubscription = (user: AdminEligibleUser) => normalize(user.subscription?.status) === 'active';
const isLandlord = (user: AdminEligibleUser) => normalize(user.role) === 'landlord';
const isRealEstate = (user: AdminEligibleUser) => normalize(user.role) === 'real_estate' || user.is_agency === true;

const blankUnit = (): PropertyUnit => ({
  id: `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  unitNumber: '', unitType: '', rent: '', depositAmount: '', size: '', beds: '0', baths: '1',
  availability: 'available', description: '', photos: [],
});

const IMAGE_SIGNATURES = [
  (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  (b: Uint8Array) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
];
const readHeader = (file: File) => new Promise<Uint8Array>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
  reader.readAsArrayBuffer(file.slice(0, 12));
});
const isSupportedPhoto = async (file: File) => {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return true;
  if (/\.(jpe?g|png|webp)$/i.test(file.name)) return true;
  try { return IMAGE_SIGNATURES.some((fn) => fn(await readHeader(file))); } catch { return false; }
};
const guessVideoMime = (url: string) => {
  const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  return ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
};

export default function AdminCreateListingFlow({ users, formatKES, HOUSE_SIZES, SOCIAL_PLATFORMS, onCreateListing, creating, error, success, onCancel }: Props) {
  const [stage, setStage] = useState<'role' | 'user' | 'form'>('role');
  const [role, setRole] = useState<TargetRole | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminEligibleUser | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const [city, setCity] = useState(''); const [customCity, setCustomCity] = useState(''); const [county, setCounty] = useState('');
  const [locationSearch, setLocationSearch] = useState(''); const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [latitude, setLatitude] = useState<number | null>(null); const [longitude, setLongitude] = useState<number | null>(null); const [usingGPS, setUsingGPS] = useState(false);
  const [title, setTitle] = useState(''); const [size, setSize] = useState(''); const [customSize, setCustomSize] = useState(''); const [beds, setBeds] = useState('0'); const [baths, setBaths] = useState('1'); const [description, setDescription] = useState('');
  const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [bookingEnabled, setBookingEnabled] = useState(false); const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [photos, setPhotos] = useState<MediaItem[]>([]); const [video, setVideo] = useState<MediaItem | null>(null);
  const [listingType, setListingType] = useState<'rent' | 'sale'>('rent'); const [price, setPrice] = useState(''); const [depositRequired, setDepositRequired] = useState(false); const [depositStructure, setDepositStructure] = useState<'fixed' | 'installments'>('fixed'); const [depositAmount, setDepositAmount] = useState('');
  const [propertyName, setPropertyName] = useState(''); const [propertyType, setPropertyType] = useState(''); const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [videoUploading, setVideoUploading] = useState(false);

  const category: ListingCategory | null = selectedUser ? (isActiveSubscription(selectedUser) ? 'pms' : 'normal') : null;

  const eligibleUsers = useMemo(() => {
    if (!role) return [];
    const roleUsers = users.filter((user) => role === 'landlord' ? isLandlord(user) : isRealEstate(user));
    const query = userSearch.trim().toLowerCase();
    if (!query) return roleUsers;
    return roleUsers.filter((user) => displayName(user).toLowerCase().includes(query) || user.email.toLowerCase().includes(query) || (user.phone || '').toLowerCase().includes(query));
  }, [users, role, userSearch]);

  const revokeMedia = () => {
    photos.forEach((p) => p.file && URL.revokeObjectURL(p.url));
    if (video?.file) URL.revokeObjectURL(video.url);
    units.forEach((unit) => unit.photos.forEach((p) => p.file && URL.revokeObjectURL(p.url)));
  };

  const resetFields = () => {
    revokeMedia();
    setCity(''); setCustomCity(''); setCounty(''); setLocationSearch(''); setLocationSuggestions([]); setLatitude(null); setLongitude(null); setUsingGPS(false);
    setTitle(''); setSize(''); setCustomSize(''); setBeds('0'); setBaths('1'); setDescription(''); setPhone(''); setEmail(''); setSocialLinks([]);
    setBookingEnabled(false); setPaymentEnabled(false); setPhotos([]); setVideo(null); setListingType('rent'); setPrice(''); setDepositRequired(false); setDepositStructure('fixed'); setDepositAmount(''); setPropertyName(''); setPropertyType(''); setUnits([]);
  };

  const chooseRole = (nextRole: TargetRole) => { resetFields(); setSelectedUser(null); setUserSearch(''); setRole(nextRole); setStage('user'); };
  const chooseUser = (user: AdminEligibleUser) => { resetFields(); setSelectedUser(user); setPhone(user.phone || ''); setEmail(user.email || ''); setStage('form'); };

  const addSocialLink = () => setSocialLinks((current) => [...current, { platform: SOCIAL_PLATFORMS[0] || 'WhatsApp', url: '' }]);
  const updateSocialLink = (index: number, field: keyof SocialLink, value: string) => setSocialLinks((current) => current.map((link, i) => i === index ? { ...link, [field]: value } : link));
  const removeSocialLink = (index: number) => setSocialLinks((current) => current.filter((_link, i) => i !== index));

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setUsingGPS(true);
    navigator.geolocation.getCurrentPosition((position) => { setLatitude(position.coords.latitude); setLongitude(position.coords.longitude); setUsingGPS(false); }, () => setUsingGPS(false));
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 7 - photos.length; if (remaining <= 0) return;
    const candidates = Array.from(files); const flags = await Promise.all(candidates.map(isSupportedPhoto));
    setPhotos((current) => [...current, ...candidates.filter((_f, i) => flags[i]).slice(0, remaining).map((file) => ({ file, url: URL.createObjectURL(file), label: '', type: 'photo' as const }))]);
  };
  const removePhoto = (index: number) => setPhotos((current) => { const p = current[index]; if (p?.file) URL.revokeObjectURL(p.url); return current.filter((_p, i) => i !== index); });
  const updatePhotoLabel = (index: number, label: string) => setPhotos((current) => current.map((p, i) => i === index ? { ...p, label } : p));
  const handleVideoUpload = async (file: File) => { if (video?.file) URL.revokeObjectURL(video.url); setVideo({ file, url: URL.createObjectURL(file), label: 'Walkthrough Video', type: 'video' }); };
  const removeVideo = () => { if (video?.file) URL.revokeObjectURL(video.url); setVideo(null); };

  const handleUnitPhotoUpload = async (unit: PropertyUnit, files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 7 - unit.photos.length; if (remaining <= 0) return;
    const candidates = Array.from(files); const flags = await Promise.all(candidates.map(isSupportedPhoto));
    const newPhotos = candidates.filter((_f, i) => flags[i]).slice(0, remaining).map((file) => ({ file, url: URL.createObjectURL(file), label: '', type: 'photo' as const }));
    setUnits((current) => current.map((item) => item.id === unit.id ? { ...item, photos: [...item.photos, ...newPhotos] } : item));
  };
  const removeUnitPhoto = (unit: PropertyUnit, index: number) => setUnits((current) => current.map((item) => { if (item.id !== unit.id) return item; const p = item.photos[index]; if (p?.file) URL.revokeObjectURL(p.url); return { ...item, photos: item.photos.filter((_p, i) => i !== index) }; }));
  const updateUnit = (unitId: string, field: keyof PropertyUnit, value: unknown) => setUnits((current) => current.map((item) => item.id === unitId ? { ...item, [field]: value } : item));
  const addUnit = () => setUnits((current) => [...current, blankUnit()]);

  const handleSave = () => {
    if (!selectedUser || !category || !role || creating) return;
    const fields = {
      city: city === 'custom' ? customCity : city, county, locationSearch, latitude, longitude, title,
      size: size === 'Custom Size' ? customSize : size, beds, baths, description, phone, email, socialLinks,
      ...(category === 'pms'
        ? { propertyName, propertyType, bookingEnabled, paymentEnabled }
        : { listingType, price, depositRequired, depositStructure, depositAmount }),
    };
    void onCreateListing({ userId: selectedUser.id, category, role, fields, photos, video, units: category === 'pms' ? units : [] });
  };

  if (stage === 'role') return (
    <div className="mx-auto max-w-3xl px-2 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Listing for a User</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose the account that will own the new listing. The account's subscription will determine the listing workflow.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(['landlord', 'real_estate'] as const).map((r) => (
          <button key={r} type="button" onClick={() => chooseRole(r)} className="card group p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-300">{r === 'landlord' ? <Home className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</div>
            <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">{r === 'landlord' ? 'Landlord' : 'Real Estate'}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select an existing {r === 'landlord' ? 'landlord' : 'real-estate account'}, then SakaKrib will automatically determine whether the listing uses the normal or PMS workflow.</p>
            <div className="mt-4 flex items-center text-xs font-semibold text-brand-600 dark:text-brand-400">Continue<ChevronRight className="ml-1 h-4 w-4 group-hover:translate-x-1" /></div>
          </button>
        ))}
      </div>
      {onCancel && <button type="button" onClick={onCancel} className="btn-secondary mt-6"><ArrowLeft className="h-4 w-4" />Cancel</button>}
    </div>
  );

  if (stage === 'user') return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:px-6">
      <button type="button" onClick={() => setStage('role')} className="mb-4 text-xs font-semibold text-brand-600 dark:text-brand-400"><ArrowLeft className="mr-1 inline h-3.5 w-3.5" />Back</button>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Choose {role === 'landlord' ? 'a Landlord' : 'a Real Estate Account'}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">All existing {role === 'landlord' ? 'landlord' : 'real-estate'} accounts are available. Subscription status is checked after you select one.</p>
      <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by name, email or phone..." className="input-field w-full pl-9" /></div>
      <div className="card mt-4 divide-y divide-gray-100 overflow-hidden dark:divide-brand-800">
        {eligibleUsers.length === 0 && <p className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No matching accounts found.</p>}
        {eligibleUsers.map((user) => (
          <button key={user.id} type="button" onClick={() => chooseUser(user)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-100 font-bold text-brand-700 dark:bg-brand-800 dark:text-brand-200">{user.profile_photo_url ? <img src={user.profile_photo_url} alt={displayName(user)} className="h-full w-full object-cover" /> : initials(user)}</div>
            <div className="min-w-0 flex-1"><p className="font-semibold text-gray-900 dark:text-white">{displayName(user)}</p><p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p></div>
            <span className="mr-2 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 dark:bg-brand-800 dark:text-gray-300">Subscription checked next</span><ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  );

  if (!selectedUser || !category) return null;

  return (
    <div>
      <div className="mx-auto w-full max-w-5xl px-2 pt-8 sm:px-6 lg:px-8">
        <button type="button" onClick={() => setStage('user')} className="mb-3 text-xs font-semibold text-brand-600 dark:text-brand-400"><ArrowLeft className="mr-1 inline h-3.5 w-3.5" />Choose a different account</button>
        <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-700 dark:bg-brand-900/30">
          <div><p className="text-sm font-semibold text-brand-800 dark:text-brand-300">Creating a {category === 'pms' ? 'PMS' : 'normal'} listing for {displayName(selectedUser)}</p><p className="text-xs text-brand-700 dark:text-brand-300">{selectedUser.email} · {role === 'landlord' ? 'Landlord' : 'Real Estate'} account · {category === 'pms' ? 'Active PMS subscription' : 'No active PMS subscription'}</p></div>
          {category === 'pms' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-600" /> : null}
        </div>
        {error && <div className="mt-3 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-300">{error}</div>}
        {success && <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300"><CheckCircle2 className="h-4 w-4" />Listing created successfully.</div>}
      </div>

      {category === 'normal' ? (
        <EditingListingForm
          city={city} setCity={setCity} customCity={customCity} setCustomCity={setCustomCity} county={county} setCounty={setCounty}
          locationSearch={locationSearch} setLocationSearch={setLocationSearch} locationSuggestions={locationSuggestions} setLocationSuggestions={setLocationSuggestions}
          setLatitude={setLatitude} setLongitude={setLongitude} handleUseCurrentLocation={handleUseCurrentLocation} usingGPS={usingGPS}
          listingType={listingType} setListingType={setListingType} price={price} setPrice={setPrice} formatKES={formatKES}
          depositRequired={depositRequired} setDepositRequired={setDepositRequired} depositStructure={depositStructure} setDepositStructure={setDepositStructure} depositAmount={depositAmount} setDepositAmount={setDepositAmount}
          title={title} setTitle={setTitle} size={size} setSize={setSize} customSize={customSize} setCustomSize={setCustomSize} HOUSE_SIZES={HOUSE_SIZES} beds={beds} setBeds={setBeds} baths={baths} setBaths={setBaths} description={description} setDescription={setDescription}
          phone={phone} setPhone={setPhone} email={email} setEmail={setEmail} socialLinks={socialLinks} addSocialLink={addSocialLink} updateSocialLink={updateSocialLink} removeSocialLink={removeSocialLink} SOCIAL_PLATFORMS={SOCIAL_PLATFORMS}
          photos={photos} handlePhotoUpload={handlePhotoUpload} removePhoto={removePhoto} updatePhotoLabel={updatePhotoLabel} video={video} handleVideoUpload={handleVideoUpload} removeVideo={removeVideo}
          onSave={handleSave} saving={creating} error={null} success={success}
        />
      ) : (
        <EditingListingPMSForm
          propertyName={propertyName} setPropertyName={setPropertyName} propertyType={propertyType} setPropertyType={setPropertyType}
          city={city} setCity={setCity} customCity={customCity} setCustomCity={setCustomCity} county={county} setCounty={setCounty}
          locationSearch={locationSearch} setLocationSearch={setLocationSearch} locationSuggestions={locationSuggestions} setLocationSuggestions={setLocationSuggestions} setLatitude={setLatitude} setLongitude={setLongitude} handleUseCurrentLocation={handleUseCurrentLocation} usingGPS={usingGPS}
          units={units} setUnits={setUnits} addUnit={addUnit} updateUnit={updateUnit} handleUnitPhotoUpload={handleUnitPhotoUpload} removeUnitPhoto={removeUnitPhoto}
          formatKES={formatKES} title={title} setTitle={setTitle} size={size} setSize={setSize} customSize={customSize} setCustomSize={setCustomSize} HOUSE_SIZES={HOUSE_SIZES} beds={beds} setBeds={setBeds} baths={baths} setBaths={setBaths} description={description} setDescription={setDescription}
          phone={phone} setPhone={setPhone} email={email} setEmail={setEmail} socialLinks={socialLinks} addSocialLink={addSocialLink} updateSocialLink={updateSocialLink} removeSocialLink={removeSocialLink} SOCIAL_PLATFORMS={SOCIAL_PLATFORMS}
          bookingEnabled={bookingEnabled} setBookingEnabled={setBookingEnabled} paymentEnabled={paymentEnabled} setPaymentEnabled={setPaymentEnabled}
          photos={photos} handlePhotoUpload={handlePhotoUpload} removePhoto={removePhoto} updatePhotoLabel={updatePhotoLabel} video={video} handleVideoUpload={handleVideoUpload} removeVideo={removeVideo}
          onSave={handleSave} saving={creating} error={null} success={success}
        />
      )}

      {videoUploading && <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-brand-900 px-4 py-3 text-sm text-white shadow-lg"><Loader2 className="h-4 w-4 animate-spin" />Preparing walkthrough video…</div>}
      <input aria-hidden="true" className="hidden" value="" readOnly onChange={() => undefined} />
    </div>
  );
}
