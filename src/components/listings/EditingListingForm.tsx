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
  bookingEnabled: boolean;
  setBookingEnabled: (value: boolean) => void;
  paymentEnabled: boolean;
  setPaymentEnabled: (value: boolean) => void;
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
  city, setCity, customCity, setCustomCity, county,
  locationSearch, setLocationSearch, locationSuggestions, setLocationSuggestions,
  setLatitude, setLongitude, handleUseCurrentLocation, usingGPS,
  listingType, setListingType, price, setPrice, formatKES,
  depositRequired, setDepositRequired, depositStructure, setDepositStructure, depositAmount, setDepositAmount,
  title, setTitle, size, setSize, customSize, setCustomSize, HOUSE_SIZES, beds, setBeds, baths, setBaths, description, setDescription,
  phone, setPhone, email, setEmail, socialLinks, addSocialLink, updateSocialLink, removeSocialLink, SOCIAL_PLATFORMS,
  bookingEnabled, setBookingEnabled, paymentEnabled, setPaymentEnabled,
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
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Deposit</label><div className="flex gap-3">{([['Optional',false],['Required',true]] as const).map(([label,value]) => <button key={label} type="button" onClick={() => setDepositRequired(value)} className={cn('flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors', depositRequired === value ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400')}>{label}</button>)}</div></div>
            {depositRequired && <div className="space-y-4 rounded-lg bg-gray-50 p-4 dark:bg-brand-800/30"><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Deposit Payment Structure</label><div className="flex gap-3">{(['fixed','installments'] as const).map(s => <button key={s} type="button" onClick={() => setDepositStructure(s)} className={cn('flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors', depositStructure === s ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400')}>{s === 'fixed' ? 'Fixed' : 'Installments Accepted'}</button>)}</div></div><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Deposit Amount (KES)</label><input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="e.g. 50000" className="input-field" min={0} /></div></div>}
          </section>

          <section className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700"><div><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Phone className="h-5 w-5 text-brand-600" />Contact Details</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Multiple contact options allowed. Renters will see these on your listing.</p></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label><div className="relative"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0712345678" className="input-field pl-10" /></div></div><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="input-field pl-10" /></div></div></div>
            {!contactLooksValid && <p className="text-xs text-error-500">Please provide at least a phone number or email address.</p>}
            <div><div className="flex items-center justify-between"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Social / Direct Links</label><button type="button" onClick={addSocialLink} className="btn-ghost text-xs"><Plus className="h-4 w-4" />Add Link</button></div><div className="mt-2 space-y-2">{socialLinks.map((link,index) => <div key={`social-${index}`} className="flex flex-col gap-2 sm:flex-row"><select value={link.platform} onChange={e => updateSocialLink(index,'platform',e.target.value)} className="input-field w-full sm:w-36">{SOCIAL_PLATFORMS.map(platform => <option key={platform} value={platform}>{platform}</option>)}</select><input type="url" value={link.url} onChange={e => updateSocialLink(index,'url',e.target.value)} placeholder="https://..." className="input-field flex-1" /><button type="button" onClick={() => removeSocialLink(index)} className="self-end rounded-lg p-2 text-gray-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/20 sm:self-auto"><X className="h-4 w-4" /></button></div>)}</div></div>
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/20"><h4 className="font-semibold text-gray-900 dark:text-white">Tenant Actions</h4><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Allow interested tenants to take action directly from your published listing.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setBookingEnabled(!bookingEnabled)} className={cn('rounded-lg border-2 p-4 text-left transition-colors', bookingEnabled ? 'border-brand-500 bg-white dark:bg-brand-800' : 'border-gray-200 dark:border-brand-700')}><div className="font-semibold text-gray-900 dark:text-white">Allow Booking</div><div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Tenants can request/book a unit.</div></button><button type="button" onClick={() => setPaymentEnabled(!paymentEnabled)} className={cn('rounded-lg border-2 p-4 text-left transition-colors', paymentEnabled ? 'border-brand-500 bg-white dark:bg-brand-800' : 'border-gray-200 dark:border-brand-700')}><div className="font-semibold text-gray-900 dark:text-white">Allow Online Payment</div><div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Tenants can pay through the listing.</div></button></div></div>
          </section>

          <section className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700"><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Image className="h-5 w-5 text-brand-600" />Media Uploads</h3>
            <div><div className="flex items-center justify-between"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Photos <span className="text-error-500">*</span> ({photos.length}/7)</label><p className="text-xs text-gray-400">Min 3, Max 7</p></div><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo,index) => <div key={`main-photo-${index}`} className="group relative"><img src={photo.url} alt={photo.label || `Property photo ${index+1}`} className="h-28 w-full rounded-lg object-cover" /><button type="button" onClick={() => removePhoto(index)} className="absolute right-1 top-1 rounded-full bg-error-600 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"><X className="h-3 w-3" /></button><input type="text" value={photo.label} onChange={e => updatePhotoLabel(index,e.target.value)} placeholder="e.g. Kitchen" className="input-field mt-1 text-xs" /></div>)}{photos.length < 7 && <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500"><Upload className="h-6 w-6 text-gray-400" /><span className="mt-1 text-xs text-gray-500 dark:text-gray-400">Add Photo</span><input type="file" accept="image/*" multiple className="hidden" onChange={e => { handlePhotoUpload(e.target.files); e.target.value=''; }} /></label>}</div>{photos.length < 3 && <p className="mt-2 text-xs text-error-500">Please add at least 3 property photos.</p>}</div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Walkthrough Video <span className="text-gray-400">(optional, up to 30 min)</span></label>{video ? <div className="relative"><video key={video.url} className="h-40 w-full rounded-lg object-contain bg-black" controls playsInline preload="metadata" onError={event => console.error('Walkthrough video playback failed:',event.currentTarget.error)}><source src={video.url} type={guessVideoMimeType(video.url)} />Your browser doesn't support playing this video.</video><button type="button" onClick={removeVideo} className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white"><X className="h-4 w-4" /></button></div> : videoUploading ? <div className="flex h-32 flex-col items-center justify-center rounded-lg border-2 border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/30"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /><span className="mt-2 text-sm font-medium text-brand-700 dark:text-brand-300">Uploading walkthrough video...</span><span className="mt-1 text-xs text-gray-500 dark:text-gray-400">Please wait. Do not close or leave this page.</span></div> : <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500"><Video className="h-6 w-6 text-gray-400" /><span className="mt-1 text-sm text-gray-500 dark:text-gray-400">Upload Video</span><input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={async e => { const file=e.target.files?.[0]; if(file){setVideoUploading(true);try{await handleVideoUpload(file);}finally{setVideoUploading(false);}}e.target.value=''; }} /></label>}</div>
          </section>

          <section className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700"><div><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><FileText className="h-5 w-5 text-brand-600" />House Details & Description</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Add the information tenants will see on the public listing.</p></div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Listing Title</label><input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Spacious 2BR Apartment in Westlands" className="input-field" /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">House Size</label><select value={size} onChange={e=>setSize(e.target.value)} className="input-field"><option value="">Select size...</option>{HOUSE_SIZES.map(item=><option key={item} value={item}>{item}</option>)}</select>{size==='Custom Size' && <input type="text" value={customSize} onChange={e=>setCustomSize(e.target.value)} placeholder="e.g. 1,200 sq ft" className="input-field mt-2" />}</div>
            <div className="grid grid-cols-2 gap-4"><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bedrooms</label><select value={beds} onChange={e=>setBeds(e.target.value)} className="input-field">{[0,1,2,3,4,5,6].map(n=><option key={n} value={n}>{n===0?'Studio':n===6?'6+':n}</option>)}</select></div><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bathrooms</label><select value={baths} onChange={e=>setBaths(e.target.value)} className="input-field">{[1,2,3,4,5].map(n=><option key={n} value={n}>{n===5?'5+':n}</option>)}</select></div></div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={6} placeholder="Describe the property, amenities, neighborhood, nearby landmarks..." className="input-field resize-none p-10" /></div>
          </section>
          {success && <div className="rounded-lg bg-success-50 px-3 py-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400">Listing updated successfully.</div>}
          {error && <div className="rounded-lg bg-error-50 px-3 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}
          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 dark:border-brand-700 sm:flex-row sm:items-center sm:justify-end"><button type="button" onClick={onSave} disabled={!canSave || saving} className={cn('btn-primary w-full sm:w-auto',(!canSave||saving)&&'cursor-not-allowed opacity-50')}>{saving?<><Loader2 className="h-4 w-4 animate-spin" />Saving...</>:<><CheckCircle2 className="h-4 w-4" />Save Changes</>}</button></div>
        </div></div></div><p className="mt-8 pb-4 text-center text-xs text-gray-400">© Copyright Saka Krib. All Rights Reserved.</p>
      </div>
    </div>
  );
}
