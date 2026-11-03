import { useState } from 'react';
import {
  MapPin,
  DollarSign,
  Phone,
  Mail,
  Image,
  Video,
  FileText,
  Plus,
  X,
  Upload,
  CheckCircle2,
  Loader2,
  Home,
} from 'lucide-react';

import { KENYAN_CITIES, KENYAN_COUNTIES, cn } from '@/lib/utils';
import { resolveDjangoMediaUrl } from '@/lib/djangoApi';

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

interface LocationSuggestion {
  display_name: string;
  lat: string | number;
  lon: string | number;
}

const guessVideoMimeType = (url: string): string => {
  const clean = url.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase();
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  return 'video/mp4';
};

interface EditingListingFormProps {
  city: string;
  setCity: (value: string) => void;
  customCity: string;
  setCustomCity: (value: string) => void;
  county: string;
  setCounty: (value: string) => void;
  locationSearch: string;
  setLocationSearch: (value: string) => void;
  locationSuggestions: LocationSuggestion[];
  setLocationSuggestions: (value: LocationSuggestion[]) => void;
  setLatitude: (value: number | null) => void;
  setLongitude: (value: number | null) => void;
  handleUseCurrentLocation: () => void;
  usingGPS: boolean;
  listingType: 'rent' | 'sale';
  setListingType: (value: 'rent' | 'sale') => void;
  price: string;
  setPrice: (value: string) => void;
  formatKES: (value: number) => string;
  depositRequired: boolean;
  setDepositRequired: (value: boolean) => void;
  depositStructure: 'fixed' | 'installments';
  setDepositStructure: (value: 'fixed' | 'installments') => void;
  depositAmount: string;
  setDepositAmount: (value: string) => void;
  title: string;
  setTitle: (value: string) => void;
  size: string;
  setSize: (value: string) => void;
  customSize: string;
  setCustomSize: (value: string) => void;
  HOUSE_SIZES: string[];
  beds: string;
  setBeds: (value: string) => void;
  baths: string;
  setBaths: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  socialLinks: SocialLink[];
  addSocialLink: () => void;
  updateSocialLink: (index: number, field: keyof SocialLink, value: string) => void;
  removeSocialLink: (index: number) => void;
  SOCIAL_PLATFORMS: string[];
  photos: MediaItem[];
  handlePhotoUpload: (files: FileList | null) => void | Promise<void>;
  removePhoto: (index: number) => void;
  updatePhotoLabel: (index: number, label: string) => void;
  video: MediaItem | null;
  handleVideoUpload: (file: File) => void | Promise<void>;
  removeVideo: () => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  error: string | null;
  success?: boolean;
  canSave?: boolean;
}

export default function EditingListingForm({
  city, setCity, customCity, setCustomCity, county, setCounty,
  locationSearch, setLocationSearch, locationSuggestions, setLocationSuggestions,
  setLatitude, setLongitude, handleUseCurrentLocation, usingGPS,
  listingType, setListingType, price, setPrice, formatKES,
  depositRequired, setDepositRequired, depositStructure, setDepositStructure, depositAmount, setDepositAmount,
  title, setTitle, size, setSize, customSize, setCustomSize, HOUSE_SIZES, beds, setBeds, baths, setBaths, description, setDescription,
  phone, setPhone, email, setEmail, socialLinks, addSocialLink, updateSocialLink, removeSocialLink, SOCIAL_PLATFORMS,
  photos, handlePhotoUpload, removePhoto, updatePhotoLabel, video, handleVideoUpload, removeVideo,
  onSave, saving, error, success, canSave = true,
}: EditingListingFormProps) {
  const [videoUploading, setVideoUploading] = useState(false);
  const normalizedPhone = String(phone || '').replace(/\s+/g, '');
  const contactLooksValid = normalizedPhone !== '' || String(email || '').trim() !== '';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-5xl px-2 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-800/50"><Home className="h-6 w-6 text-brand-600 dark:text-brand-400" /></div>
            <div className="min-w-0 flex-1"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Listing</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Update the details for this listing.</p></div>
          </div>
        </div>
        <div className="space-y-6"><div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-brand-700 dark:bg-brand-900"><div className="space-y-8 p-4 sm:p-6">
          <section className="space-y-5"><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><MapPin className="h-5 w-5 text-brand-600" />Location Details</h3>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">City</label><select value={city} onChange={e => setCity(e.target.value)} className="input-field"><option value="">Select a city...</option>{KENYAN_CITIES.map(c => <option key={c} value={c}>{c}</option>)}<option value="custom">Other (custom)...</option></select></div>
            {city === 'custom' && <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Custom City</label><input type="text" value={customCity} onChange={e => setCustomCity(e.target.value)} placeholder="Enter city name" className="input-field" /></div>}
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">County</label><select value={county} onChange={e => setCounty(e.target.value)} className="input-field"><option value="">Select a county...</option>{KENYAN_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="relative"><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Search Property Location</label><div className="relative"><MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="text" value={locationSearch} onChange={e => { setLocationSearch(e.target.value); setLatitude(null); setLongitude(null); }} placeholder="Start typing an area, road, building or landmark..." className="input-field pl-10" autoComplete="off" /></div>
              {locationSuggestions.length > 0 && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-brand-700 dark:bg-brand-900">{locationSuggestions.map((location, index) => <button key={`${location.display_name}-${index}`} type="button" onClick={() => { setLocationSearch(location.display_name); setLatitude(Number(location.lat)); setLongitude(Number(location.lon)); setLocationSuggestions([]); }} className="flex w-full items-start gap-3 px-2 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-brand-800"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span>{location.display_name}</span></button>)}</div>}
            </div>
            <button type="button" onClick={handleUseCurrentLocation} disabled={usingGPS} className="btn-secondary w-full">{usingGPS ? <><Loader2 className="h-4 w-4 animate-spin" />Getting your location...</> : <><MapPin className="h-4 w-4" />Use My Current Location</>}</button>
          </section>

          <section className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700"><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><DollarSign className="h-5 w-5 text-brand-600" />Financial Details</h3>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Listing Type</label><div className="flex gap-3">{(['rent','sale'] as const).map(t => <button key={t} type="button" onClick={() => setListingType(t)} className={cn('flex-1 rounded-lg border-2 py-3 text-sm font-semibold capitalize transition-colors', listingType === t ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400')}>{t === 'rent' ? 'For Rent' : 'For Sale'}</button>)}</div></div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Price (KES) {listingType === 'rent' && '/ month'}</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 25000" className="input-field" min={0} />{price && Number(price) > 0 && <p className="mt-1 text-xs text-gray-400">≈ {formatKES(Number(price))}{listingType === 'rent' ? '/month' : ''}</p>}</div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Deposit Required</label><button type="button" onClick={() => setDepositRequired(!depositRequired)} className={cn('w-full rounded-lg border px-4 py-3 text-left text-sm', depositRequired ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-600 dark:border-brand-700 dark:text-gray-300')}>{depositRequired ? 'Yes — deposit required' : 'No — no deposit'}</button></div>
            {depositRequired && <><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Deposit Structure</label><div className="flex gap-3">{(['fixed','installments'] as const).map(s => <button key={s} type="button" onClick={() => setDepositStructure(s)} className={cn('flex-1 rounded-lg border-2 py-3 text-sm font-semibold capitalize', depositStructure === s ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400')}>{s}</button>)}</div></div><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Deposit Amount (KES)</label><input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} className="input-field" min={0} /></div></>}
          </section>

          <section className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700"><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Home className="h-5 w-5 text-brand-600" />Property Details</h3>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Listing Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Spacious 2 Bedroom Apartment" className="input-field" /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">House Size</label><select value={size} onChange={e => setSize(e.target.value)} className="input-field"><option value="">Select house size...</option>{HOUSE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}<option value="Custom Size">Custom Size</option></select></div>
            {size === 'Custom Size' && <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Custom Size</label><input type="text" value={customSize} onChange={e => setCustomSize(e.target.value)} placeholder="e.g. 150 sqm" className="input-field" /></div>}
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bedrooms</label><select value={beds} onChange={e => setBeds(e.target.value)} className="input-field">{Array.from({length: 11}, (_, i) => <option key={i} value={i}>{i}</option>)}</select></div><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bathrooms</label><select value={baths} onChange={e => setBaths(e.target.value)} className="input-field">{Array.from({length: 11}, (_, i) => <option key={i} value={i}>{i}</option>)}</select></div></div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} className="input-field" placeholder="Describe the property..." /></div>
          </section>

          <section className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700"><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Phone className="h-5 w-5 text-brand-600" />Contact Details</h3>
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-field" placeholder="Phone number" /></div><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="Email address" /></div></div>
            {!contactLooksValid && <p className="text-xs text-amber-600">Add a phone number or email address.</p>}
            <div><div className="mb-2 flex items-center justify-between"><label className="text-sm font-medium text-gray-700 dark:text-gray-300">Social Links</label><button type="button" onClick={addSocialLink} className="text-xs font-semibold text-brand-600"><Plus className="mr-1 inline h-4 w-4" />Add Link</button></div>{socialLinks.map((link, index) => <div key={`${link.platform}-${index}`} className="mb-2 flex gap-2"><select value={link.platform} onChange={e => updateSocialLink(index, 'platform', e.target.value)} className="input-field w-1/3">{SOCIAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}</select><input value={link.url} onChange={e => updateSocialLink(index, 'url', e.target.value)} className="input-field flex-1" placeholder="https://..." /><button type="button" onClick={() => removeSocialLink(index)} className="btn-secondary"><X className="h-4 w-4" /></button></div>)}</div>
          </section>

          <section className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700"><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Image className="h-5 w-5 text-brand-600" />Photos</h3>
            <p className="text-sm text-gray-500">Upload up to 7 property photos.</p>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-6 text-sm font-semibold text-gray-600 hover:border-brand-400 dark:border-brand-700 dark:text-gray-300"><Upload className="h-5 w-5" />Choose Photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => void handlePhotoUpload(e.target.files)} /></label>
            {photos.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{photos.map((photo, index) => <div key={`${photo.url}-${index}`} className="rounded-lg border p-2"><img src={resolveDjangoMediaUrl(photo.url)} alt={photo.label || `Photo ${index + 1}`} className="h-40 w-full rounded object-cover" /><div className="mt-2 flex gap-2"><input value={photo.label} onChange={e => updatePhotoLabel(index, e.target.value)} className="input-field flex-1" placeholder={`Photo ${index + 1}`} /><button type="button" onClick={() => removePhoto(index)} className="btn-secondary"><X className="h-4 w-4" /></button></div></div>)}</div>}
          </section>

          <section className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700"><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Video className="h-5 w-5 text-brand-600" />Walkthrough Video</h3>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-6 text-sm font-semibold text-gray-600 hover:border-brand-400 dark:border-brand-700 dark:text-gray-300"><Upload className="h-5 w-5" />Choose Video<input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (!file) return; setVideoUploading(true); Promise.resolve(handleVideoUpload(file)).finally(() => setVideoUploading(false)); }} /></label>
            {videoUploading && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Preparing video...</div>}
            {video && <div className="rounded-lg border p-2"><video controls className="max-h-80 w-full rounded" src={resolveDjangoMediaUrl(video.url)} /> <div className="mt-2 flex items-center gap-2"><input value={video.label} onChange={e => { /* label is managed by parent */ }} className="input-field flex-1" placeholder="Walkthrough Video" /><button type="button" onClick={removeVideo} className="btn-secondary"><X className="h-4 w-4" /></button></div><div className="mt-1 text-xs text-gray-400">{guessVideoMimeType(video.url)}</div></div>}
          </section>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6 dark:border-brand-700">
            {error && <div className="mr-auto rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
            {success && <div className="mr-auto flex items-center gap-2 text-sm font-semibold text-green-600"><CheckCircle2 className="h-4 w-4" />Saved successfully.</div>}
            <button type="button" onClick={() => void onSave()} disabled={saving || !canSave || !contactLooksValid} className="btn-primary">{saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><CheckCircle2 className="h-4 w-4" />Save Listing</>}</button>
          </div>
        </div></div></div>
      </div>
    </div>
  );
}
