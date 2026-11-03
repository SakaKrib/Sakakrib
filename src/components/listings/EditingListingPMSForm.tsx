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

type UnitAvailability = 'available' | 'occupied' | 'reserved';

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

const guessVideoMimeType = (url: string): string => {
  const clean = url.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase();
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  return 'video/mp4';
};

export interface EditingListingPMSFormProps {
  propertyName: string;
  setPropertyName: (value: string) => void;
  propertyType: string;
  setPropertyType: (value: string) => void;
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
  units: PropertyUnit[];
  setUnits: (updater: (current: PropertyUnit[]) => PropertyUnit[]) => void;
  addUnit: () => void;
  updateUnit: (unitId: string, field: keyof PropertyUnit, value: unknown) => void;
  handleUnitPhotoUpload: (unit: PropertyUnit, files: FileList | null) => void | Promise<void>;
  removeUnitPhoto?: (unit: PropertyUnit, photoIndex: number) => void;
  formatKES: (value: number) => string;
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

export type { MediaItem, PropertyUnit, SocialLink, LocationSuggestion, UnitAvailability };

export default function EditingListingPMSForm({
  propertyName,
  setPropertyName,
  propertyType,
  setPropertyType,
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
  units,
  setUnits,
  addUnit,
  updateUnit,
  handleUnitPhotoUpload,
  removeUnitPhoto,
  formatKES,
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
  phone,
  setPhone,
  email,
  setEmail,
  socialLinks,
  addSocialLink,
  updateSocialLink,
  removeSocialLink,
  SOCIAL_PLATFORMS,
  bookingEnabled,
  setBookingEnabled,
  paymentEnabled,
  setPaymentEnabled,
  photos,
  handlePhotoUpload,
  removePhoto,
  updatePhotoLabel,
  video,
  handleVideoUpload,
  removeVideo,
  onSave,
  saving,
  error,
  success,
  canSave = true,
}: EditingListingPMSFormProps) {
  const [videoUploading, setVideoUploading] = useState(false);

  const normalizedPhone = String(phone || '').replace(/\s+/g, '');
  const contactLooksValid = normalizedPhone !== '' || String(email || '').trim() !== '';

  const handleUnitPhotoRemoved = (unit: PropertyUnit, photoIndex: number) => {
    if (typeof removeUnitPhoto === 'function') {
      removeUnitPhoto(unit, photoIndex);
      return;
    }
    updateUnit(unit.id, 'photos', unit.photos.filter((_photo, index) => index !== photoIndex));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-5xl px-2 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-800/50">
              <Home className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Property</h1>
                <span className="inline-flex w-fit items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-800/50 dark:text-brand-300">
                  Property Management
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Update this property and its individual units.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-brand-700 dark:bg-brand-900">
            <div className="space-y-8 p-4 sm:p-6">
              <div className="space-y-5">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                  <MapPin className="h-5 w-5 text-brand-600" />Location Details
                </h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">City</label>
                  <select value={city} onChange={(e) => setCity(e.target.value)} className="input-field">
                    <option value="">Select a city...</option>
                    {KENYAN_CITIES.map((c: string) => <option key={c} value={c}>{c}</option>)}
                    <option value="custom">Other (custom)...</option>
                  </select>
                </div>
                {city === 'custom' && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Custom City</label>
                    <input type="text" value={customCity} onChange={(e) => setCustomCity(e.target.value)} placeholder="Enter city name" className="input-field" />
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">County</label>
                  <select value={county} onChange={(e) => setCounty(e.target.value)} className="input-field">
                    <option value="">Select a county...</option>
                    {KENYAN_COUNTIES.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Search Property Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={locationSearch} onChange={(e) => { setLocationSearch(e.target.value); setLatitude(null); setLongitude(null); }} placeholder="Start typing an area, road, building or landmark..." className="input-field pl-10" autoComplete="off" />
                  </div>
                  {locationSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-brand-700 dark:bg-brand-900">
                      {locationSuggestions.map((location, index) => (
                        <button key={`${location.display_name}-${index}`} type="button" onClick={() => { setLocationSearch(location.display_name); setLatitude(Number(location.lat)); setLongitude(Number(location.lon)); setLocationSuggestions([]); }} className="flex w-full items-start gap-3 px-2 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-brand-800">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                          <span>{location.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={handleUseCurrentLocation} disabled={usingGPS} className="btn-secondary w-full">
                  {usingGPS ? <><Loader2 className="h-4 w-4 animate-spin" />Getting your location...</> : <><MapPin className="h-4 w-4" />Use My Current Location</>}
                </button>
                <div className="mt-6 grid gap-5 border-t border-gray-200 pt-5 dark:border-brand-700 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <h4 className="font-semibold text-gray-900 dark:text-white">Property Information</h4>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">These details identify the property containing your units.</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Property / Apartment Name</label>
                    <input type="text" value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="e.g. Green View Apartments" className="input-field" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Property Type</label>
                    <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="input-field">
                      <option value="">Select property type...</option>
                      <option value="apartment">Apartment</option><option value="flats">Flats</option><option value="townhouse">Townhouse</option><option value="maisonette">Maisonette</option><option value="residential_building">Residential Building</option><option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Home className="h-5 w-5 text-brand-600" />Property Units</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">Add the individual units available in this property. Each unit can have its own rent, availability and details.</p>
                  </div>
                  <button type="button" onClick={addUnit} className="btn-primary w-full sm:w-auto sm:shrink-0"><Plus className="h-4 w-4" />Add Unit</button>
                </div>
                {units.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center dark:border-brand-700">
                    <Home className="mx-auto h-10 w-10 text-gray-400" /><p className="mt-3 font-medium text-gray-700 dark:text-gray-300">No units added yet</p><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Add at least one unit to continue.</p>
                    <button type="button" onClick={addUnit} className="btn-secondary mt-4"><Plus className="h-4 w-4" />Add First Unit</button>
                  </div>
                )}
                <div className="space-y-4">
                  {units.map((unit, index) => (
                    <div key={unit.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 dark:border-brand-700 dark:bg-brand-900/40">
                      <div className="mb-5 flex items-center justify-between"><div><h4 className="font-semibold text-gray-900 dark:text-white">Unit {index + 1}</h4><p className="text-xs text-gray-500 dark:text-gray-400">Unit-specific information</p></div><button type="button" onClick={() => setUnits((current) => current.filter((item) => item.id !== unit.id))} className="rounded-lg p-2 text-gray-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/20" aria-label={`Remove unit ${index + 1}`}><X className="h-4 w-4" /></button></div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div><label className="mb-1.5 block text-sm font-medium">Unit Number / Name</label><input value={unit.unitNumber} onChange={(e) => updateUnit(unit.id, 'unitNumber', e.target.value)} placeholder="e.g. A101" className="input-field" /></div>
                        <div><label className="mb-1.5 block text-sm font-medium">Unit Type</label><select value={unit.unitType} onChange={(e) => updateUnit(unit.id, 'unitType', e.target.value)} className="input-field"><option value="">Select type...</option><option value="studio">Studio</option><option value="1_bedroom">1 Bedroom</option><option value="2_bedroom">2 Bedroom</option><option value="3_bedroom">3 Bedroom</option><option value="4_bedroom">4+ Bedroom</option><option value="shop">Shop</option><option value="office">Office</option><option value="other">Other</option></select></div>
                        <div><label className="mb-1.5 block text-sm font-medium">Monthly Rent (KES)</label><input type="number" value={unit.rent} onChange={(e) => updateUnit(unit.id, 'rent', e.target.value)} placeholder="e.g. 35000" className="input-field" min={0} /></div>
                        <div><label className="mb-1.5 block text-sm font-medium">Deposit (KES)</label><input type="number" value={unit.depositAmount} onChange={(e) => updateUnit(unit.id, 'depositAmount', e.target.value)} placeholder="e.g. 35000" className="input-field" min={0} /></div>
                        <div><label className="mb-1.5 block text-sm font-medium">Availability</label><select value={unit.availability} onChange={(e) => updateUnit(unit.id, 'availability', e.target.value as UnitAvailability)} className="input-field"><option value="available">Available</option><option value="occupied">Occupied</option><option value="reserved">Reserved</option></select></div>
                        <div><label className="mb-1.5 block text-sm font-medium">Size</label><input value={unit.size} onChange={(e) => updateUnit(unit.id, 'size', e.target.value)} placeholder="e.g. 850 sq ft" className="input-field" /></div>
                        <div><label className="mb-1.5 block text-sm font-medium">Bedrooms</label><select value={unit.beds} onChange={(e) => updateUnit(unit.id, 'beds', e.target.value)} className="input-field">{[0,1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n === 0 ? 'Studio' : n === 6 ? '6+' : n}</option>)}</select></div>
                        <div><label className="mb-1.5 block text-sm font-medium">Bathrooms</label><select value={unit.baths} onChange={(e) => setBaths(e.target.value)} className="input-field">{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n === 5 ? '5+' : n}</option>)}</select></div>
                      </div>
                      <div className="mt-4"><label className="mb-1.5 block text-sm font-medium">Unit Description</label><textarea value={unit.description} onChange={(e) => updateUnit(unit.id, 'description', e.target.value)} rows={3} placeholder="Describe this particular unit..." className="input-field resize-none" /></div>
                      <div className="mt-6 border-t border-gray-200 pt-5 dark:border-brand-700">
                        <div className="flex items-center justify-between"><div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Unit Photos <span className="text-error-500">*</span></label><p className="mt-1 text-xs text-gray-400">Add 3–7 photos showing this specific unit.</p></div><span className="text-xs text-gray-400">{unit.photos.length}/7</span></div>
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {unit.photos.map((photo, photoIndex) => <div key={`${unit.id}-photo-${photoIndex}`} className="group relative"><img src={resolveDjangoMediaUrl(photo.url)} alt={photo.label || `Unit photo ${photoIndex + 1}` className="h-28 w-full rounded-lg object-cover" /><button type="button" onClick={() => handleUnitPhotoRemoved(unit, photoIndex)} className="absolute right-1 top-1 rounded-full bg-error-600 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Remove unit photo ${photoIndex + 1}`}><X className="h-3 w-3" /></button><input type="text" value={photo.label} onChange={(e) => { const updatedPhotos = [...unit.photos]; updatedPhotos[photoIndex] = { ...updatedPhotos[photoIndex], label: e.target.value }; updateUnit(unit.id, 'photos', updatedPhotos); }} placeholder="e.g. Living Room" className="input-field mt-1 text-xs" /></div>)}
                          {unit.photos.length < 7 && <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500"><Upload className="h-6 w-6 text-gray-400" /><span className="mt-1 text-xs text-gray-500 dark:text-gray-400">Add Unit Photo</span><input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void handleUnitPhotoUpload(unit, e.target.files); e.target.value = ''; }} /></label>}
                        </div>
                        {unit.photos.length < 3 && <p className="mt-2 text-xs text-error-500">Please add at least 3 photos for this unit.</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700">
                <div><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><DollarSign className="h-5 w-5 text-brand-600" />Unit Financial Summary</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Financial information for property-management listings is stored against each individual unit. Edit rent and deposit above, per unit.</p></div>
                {units.length === 0 ? <div className="rounded-xl border border-error-200 bg-error-50 p-5 dark:border-error-900/40 dark:bg-error-900/20"><p className="font-medium text-error-700 dark:text-error-400">No units have been added.</p><p className="mt-1 text-sm text-error-600 dark:text-error-400">Add at least one unit above.</p></div> : <div className="space-y-3">{units.map((unit, index) => <div key={unit.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-700 dark:bg-brand-800/40"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-gray-900 dark:text-white">Unit {unit.unitNumber || index + 1}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{unit.unitType || 'Unit type not selected'}</p></div><span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', unit.availability === 'available' ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : unit.availability === 'reserved' ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' : 'bg-gray-200 text-gray-600 dark:bg-brand-700 dark:text-gray-300')}>{unit.availability}</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="text-xs text-gray-400">Rent</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{unit.rent ? formatKES(Number(unit.rent)) : 'Not set'}</p></div><div><p className="text-xs text-gray-400">Deposit</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{unit.depositAmount ? formatKES(Number(unit.depositAmount)) : 'Not set'}</p></div><div><p className="text-xs text-gray-400">Bedrooms</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{unit.beds || '0'}</p></div><div><p className="text-xs text-gray-400">Bathrooms</p><p className="mt-1 font-semibold text-gray-900 dark:text-white">{unit.baths || '0'}</p></div></div></div>)}</div>}
              </div>

              <div className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700">
                <div><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Phone className="h-5 w-5 text-brand-600" />Contact Details</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Multiple contact options allowed. Renters will see these on your listing.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label><div className="relative"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678" className="input-field pl-10" /></div></div>
                  <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input-field pl-10" /></div></div>
                </div>
                {!contactLooksValid && <p className="text-xs text-error-500">Please provide at least a phone number or email address.</p>}
                <div><div className="flex items-center justify-between"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Social / Direct Links</label><button type="button" onClick={addSocialLink} className="btn-ghost text-xs"><Plus className="h-4 w-4" />Add Link</button></div><div className="mt-2 space-y-2">{socialLinks.map((link, index) => <div key={`social-${index}`} className="flex flex-col gap-2 sm:flex-row"><select value={link.platform} onChange={(e) => updateSocialLink(index, 'platform', e.target.value)} className="input-field w-full sm:w-36">{SOCIAL_PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select><input type="url" value={link.url} onChange={(e) => updateSocialLink(index, 'url', e.target.value)} placeholder="https://..." className="input-field flex-1" /><button type="button" onClick={() => removeSocialLink(index)} className="self-end rounded-lg p-2 text-gray-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/20 sm:self-auto"><X className="h-4 w-4" /></button></div>)}</div></div>
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/20"><h4 className="font-semibold text-gray-900 dark:text-white">Tenant Actions</h4><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Allow interested tenants to take action directly from your published listing.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setBookingEnabled(!bookingEnabled)} className={cn('rounded-lg border-2 p-4 text-left transition-colors', bookingEnabled ? 'border-brand-500 bg-white dark:bg-brand-800' : 'border-gray-200 dark:border-brand-700')}><div className="font-semibold text-gray-900 dark:text-white">Allow Booking</div><div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Tenants can request/book a unit.</div></button><button type="button" onClick={() => setPaymentEnabled(!paymentEnabled)} className={cn('rounded-lg border-2 p-4 text-left transition-colors', paymentEnabled ? 'border-brand-500 bg-white dark:bg-brand-800' : 'border-gray-200 dark:border-brand-700')}><div className="font-semibold text-gray-900 dark:text-white">Allow Online Payment</div><div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Tenants can view the configured payment methods.</div></button></div></div>
              </div>

              <div className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Image className="h-5 w-5 text-brand-600" />Media Uploads</h3>
                <div><div className="flex items-center justify-between"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Photos <span className="text-error-500">*</span> ({photos.length}/7)</label><p className="text-xs text-gray-400">Min 3, Max 7</p></div><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <div key={`main-photo-${index}`} className="group relative"><img src={resolveDjangoMediaUrl(photo.url)} alt={photo.label || `Property photo ${index + 1}` className="h-28 w-full rounded-lg object-cover" /><button type="button" onClick={() => removePhoto(index)} className="absolute right-1 top-1 rounded-full bg-error-600 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Remove photo ${index + 1}`}><X className="h-3 w-3" /></button><input type="text" value={photo.label} onChange={(e) => updatePhotoLabel(index, e.target.value)} placeholder="e.g. Kitchen" className="input-field mt-1 text-xs" /></div>)}{photos.length < 7 && <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500"><Upload className="h-6 w-6 text-gray-400" /><span className="mt-1 text-xs text-gray-500 dark:text-gray-400">Add Photo</span><input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void handlePhotoUpload(e.target.files); e.target.value = ''; }} /></label>}</div>{photos.length < 3 && <p className="mt-2 text-xs text-error-500">Please add at least 3 property photos.</p>}</div>
                <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Walkthrough Video <span className="text-gray-400">(optional, up to 30 min)</span></label>{video ? <div className="relative"><video key={video.url} className="h-40 w-full rounded-lg object-contain bg-black" controls playsInline preload="metadata" onError={(event) => console.error('Walkthrough video playback failed:', event.currentTarget.error)}><source src={resolveDjangoMediaUrl(video.url)} type={guessVideoMimeType(video.url)} />Your browser doesn't support playing this video.</video><button type="button" onClick={removeVideo} className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white" aria-label="Remove walkthrough video"><X className="h-4 w-4" /></button></div> : videoUploading ? <div className="flex h-32 flex-col items-center justify-center rounded-lg border-2 border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/30"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /><span className="mt-2 text-sm font-medium text-brand-700 dark:text-brand-300">Uploading walkthrough video...</span><span className="mt-1 text-xs text-gray-500 dark:text-gray-400">Please wait. Do not close or leave this page.</span></div> : <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500"><Video className="h-6 w-6 text-gray-400" /><span className="mt-1 text-sm text-gray-500 dark:text-gray-400">Upload Video</span><input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setVideoUploading(true); try { await handleVideoUpload(file); } finally { setVideoUploading(false); } } e.target.value = ''; }} /></label>}</div>
              </div>

              <div className="space-y-5 border-t border-gray-200 pt-8 dark:border-brand-700">
                <div><h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><FileText className="h-5 w-5 text-brand-600" />House Details & Description</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Add the information tenants will see on the public listing.</p></div>
                <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Listing Title</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spacious 2BR Apartment in Westlands" className="input-field" /></div>
                <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">House Size</label><select value={size} onChange={(e) => setSize(e.target.value)} className="input-field"><option value="">Select size...</option>{HOUSE_SIZES.map((item) => <option key={item} value={item}>{item}</option>)}</select>{size === 'Custom Size' && <input type="text" value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder="e.g. 1,200 sq ft" className="input-field mt-2" />}</div>
                <div className="grid grid-cols-2 gap-4"><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bedrooms</label><select value={beds} onChange={(e) => setBeds(e.target.value)} className="input-field">{[0,1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n === 0 ? 'Studio' : n === 6 ? '6+' : n}</option>)}</select></div><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bathrooms</label><select value={baths} onChange={(e) => setBaths(e.target.value)} className="input-field">{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n === 5 ? '5+' : n}</option>)}</select></div></div>
                <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder="Describe the property, amenities, neighborhood, nearby landmarks..." className="input-field resize-none p-10" /></div>
              </div>

              {success && <div className="rounded-lg bg-success-50 px-3 py-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400">Property updated successfully.</div>}
              {error && <div className="rounded-lg bg-error-50 px-3 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}
              <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 dark:border-brand-700 sm:flex-row sm:items-center sm:justify-end"><button type="button" onClick={onSave} disabled={!canSave || saving} className={cn('btn-primary w-full sm:w-auto', (!canSave || saving) && 'cursor-not-allowed opacity-50')}>{saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><CheckCircle2 className="h-4 w-4" />Save Changes</>}</button></div>
            </div>
          </div>
        </div>
        <p className="mt-8 pb-4 text-center text-xs text-gray-400">© Copyright Saka Krib. All Rights Reserved.</p>
      </div>
    </div>
  );
}
