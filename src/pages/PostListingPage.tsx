import { useState } from 'react';
import {
  MapPin, DollarSign, Phone, Mail, Image, Video, FileText,
  ChevronLeft, ChevronRight, Plus, X, Upload, CheckCircle2, Loader2, Home, Link2
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import TermsGate from '@/components/TermsGate';
import { supabase } from '@/lib/supabase';
import {
  KENYAN_CITIES, KENYAN_COUNTIES, HOUSE_SIZES,
  formatKES, validatePhone, validateEmail, cn,
  FREE_LISTING_LIMIT, LISTING_FEE_KES, COMMISSION_RATE
} from '@/lib/utils';

interface MediaItem {
  file?: File;
  url: string;
  label: string;
  type: 'photo' | 'video';
}

const STEPS = ['Location', 'Financial', 'Contact', 'Media', 'Details'];
const SOCIAL_PLATFORMS = ['WhatsApp', 'Instagram', 'Facebook', 'Website', 'TikTok'];

export default function PostListingPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useNav();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [needsPayment, setNeedsPayment] = useState(false);
  const [aiCaption, setAiCaption] = useState('');

  // Form data
  const [city, setCity] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [county, setCounty] = useState('');
  const [price, setPrice] = useState('');
  const [listingType, setListingType] = useState<'rent' | 'sale'>('rent');
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositStructure, setDepositStructure] = useState<'fixed' | 'installments'>('fixed');
  const [depositAmount, setDepositAmount] = useState('');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>([]);
  const [photos, setPhotos] = useState<MediaItem[]>([]);
  const [video, setVideo] = useState<MediaItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [size, setSize] = useState('');
  const [customSize, setCustomSize] = useState('');
  const [beds, setBeds] = useState('1');
  const [baths, setBaths] = useState('1');

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please sign in to post a listing.</p>
      </div>
    );
  }

  if (profile.verification_status !== 'verified' && (profile.role === 'landlord' || profile.role === 'real_estate')) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="card p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning-100 dark:bg-warning-900/30">
            <FileText className="h-8 w-8 text-warning-600" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Verification Required</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            You must complete KYC verification before posting listings.
          </p>
          <button onClick={() => navigate('kyc-verify')} className="btn-primary mt-6">
            Verify Now
          </button>
        </div>
      </div>
    );
  }

  const finalCity = city === 'custom' ? customCity : city;
  const finalSize = size === 'Custom Size' ? customSize : size;

  const canProceed = () => {
    switch (step) {
      case 0: return finalCity.trim() !== '' && county.trim() !== '';
      case 1: return price !== '' && Number(price) > 0;
      case 2: return true; // contact is optional but phone recommended
      case 3: return photos.length >= 3;
      case 4: return title.trim() !== '' && description.trim() !== '' && finalSize !== '';
      default: return false;
    }
  };

  const handlePhotoUpload = (files: FileList) => {
    const remaining = 7 - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const newPhotos = toAdd.map((file, i) => ({
      file,
      url: URL.createObjectURL(file),
      label: `Photo ${photos.length + i + 1}`,
      type: 'photo' as const,
    }));
    setPhotos([...photos, ...newPhotos]);
  };

  const handleVideoUpload = (file: File) => {
    setVideo({ file, url: URL.createObjectURL(file), label: 'Walkthrough Video', type: 'video' });
  };

  const updatePhotoLabel = (index: number, label: string) => {
    const updated = [...photos];
    updated[index].label = label;
    setPhotos(updated);
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const addSocialLink = () => {
    setSocialLinks([...socialLinks, { platform: 'WhatsApp', url: '' }]);
  };

  const updateSocialLink = (index: number, field: 'platform' | 'url', value: string) => {
    const updated = [...socialLinks];
    updated[index][field] = value;
    setSocialLinks(updated);
  };

  const removeSocialLink = (index: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);

    try {
      const isAgency = profile.role === 'real_estate' || profile.is_agency;
      const listingCount = profile.free_listings_used || 0;
      const needsPay = listingCount >= FREE_LISTING_LIMIT;
      setNeedsPayment(needsPay);

      // Insert listing
      const { data: listingData, error: listingError } = await supabase
        .from('listings')
        .insert({
          user_id: profile.id,
          title,
          description,
          city: finalCity,
          county,
          price_kes: Number(price),
          listing_type: listingType,
          deposit_required: depositRequired,
          deposit_structure: depositStructure,
          deposit_amount: depositAmount ? Number(depositAmount) : 0,
          size: finalSize,
          beds: Number(beds),
          baths: Number(baths),
          contact_phone: phone,
          contact_email: email,
          social_links: socialLinks.filter((s) => s.url.trim() !== ''),
          is_paid: needsPay,
          is_published: false,
          approval_status: 'pending_review',
        })
        .select()
        .single();

      if (listingError) throw listingError;

      // Upload photos to storage
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (photo.file) {
          const ext = photo.file.name.split('.').pop();
          const fileName = `${profile.id}/${listingData.id}/photo-${i}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('listing-media')
            .upload(fileName, photo.file);
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('listing-media')
              .getPublicUrl(fileName);
            await supabase.from('listing_media').insert({
              listing_id: listingData.id,
              user_id: profile.id,
              url: publicUrl,
              label: photo.label,
              media_type: 'photo',
              position: i,
            });
          }
        }
      }

      // Upload video if present
      if (video?.file) {
        const ext = video.file.name.split('.').pop();
        const fileName = `${profile.id}/${listingData.id}/video.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('listing-media')
          .upload(fileName, video.file);
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('listing-media')
            .getPublicUrl(fileName);
          await supabase.from('listing_media').insert({
            listing_id: listingData.id,
            user_id: profile.id,
            url: publicUrl,
            label: 'Walkthrough Video',
            media_type: 'video',
            position: 99,
          });
        }
      }

      // Generate AI caption via edge function
      let generatedCaption = '';
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-caption`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              listing: {
                title, description, city: finalCity, county,
                price_kes: Number(price), listing_type: listingType,
                size: finalSize, beds: Number(beds), baths: Number(baths),
                deposit_required: depositRequired,
              },
            }),
          }
        );
        if (response.ok) {
          const data = await response.json();
          generatedCaption = data.caption || '';
          setAiCaption(generatedCaption);
        }
      } catch {
        // Caption generation is best-effort
      }

      // Auto-create community feed post
      await supabase.from('community_posts').insert({
        user_id: profile.id,
        listing_id: listingData.id,
        content: `${title} — ${formatKES(Number(price))}${listingType === 'rent' ? '/mo' : ''} in ${finalCity}, ${county}`,
        ai_caption: generatedCaption,
        post_type: 'listing',
      });

      // Increment free listing count
      await supabase
        .from('profiles')
        .update({ free_listings_used: listingCount + 1 })
        .eq('id', profile.id);

      await refreshProfile();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post listing. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="card p-8 text-center animate-scale-in">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
            <CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Listing Published!</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Your property has been posted and shared to the Community Feed with an AI-generated caption.
          </p>
          {needsPayment && (
            <div className="mt-4 rounded-lg bg-warning-50 px-4 py-3 dark:bg-warning-900/20">
              <p className="text-sm font-medium text-warning-700 dark:text-warning-400">
                A fee of {formatKES(LISTING_FEE_KES)} applies for this listing (beyond your {FREE_LISTING_LIMIT} free listings).
                Please complete payment to publish.
              </p>
            </div>
          )}
          {aiCaption && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left dark:border-brand-800 dark:bg-brand-800/30">
              <p className="mb-1 text-xs font-semibold text-brand-600 dark:text-brand-400">AI-Generated Community Post:</p>
              <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{aiCaption}</p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button onClick={() => navigate('listings')} className="btn-primary">View Listings</button>
            <button onClick={() => navigate('community')} className="btn-secondary">See Community Post</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-800/50">
            <Home className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Post a House Listing</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {profile.role === 'real_estate' || profile.is_agency
                ? 'Agency plan: 15% commission applies after 3 free listings.'
                : `${FREE_LISTING_LIMIT - (profile.free_listings_used || 0)} free listings remaining.`}
            </p>
          </div>
        </div>
      </div>

      <TermsGate context="listing" onAccept={() => setTermsAccepted(true)}>
        <>
          {/* Step indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              {STEPS.map((label, i) => (
                <div key={i} className="flex flex-1 flex-col items-center">
                  <div className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    i < step ? 'bg-success-500 text-white' :
                    i === step ? 'bg-brand-600 text-white' :
                    'bg-gray-200 text-gray-400 dark:bg-brand-800 dark:text-gray-500'
                  )}>
                    {i < step ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                  </div>
                  <span className={cn(
                    'mt-1 hidden text-xs font-medium sm:block',
                    i === step ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'
                  )}>{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 h-1 rounded-full bg-gray-200 dark:bg-brand-800">
              <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>
          </div>

          {/* Step content */}
          <div className="card p-6">
            {step === 0 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                  <MapPin className="h-5 w-5 text-brand-600" /> Location Details
                </h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">City</label>
                  <select value={city} onChange={(e) => setCity(e.target.value)} className="input-field">
                    <option value="">Select a city...</option>
                    {KENYAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
                    {KENYAN_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                  <DollarSign className="h-5 w-5 text-brand-600" /> Financial Details
                </h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Listing Type</label>
                  <div className="flex gap-3">
                    {(['rent', 'sale'] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setListingType(t)}
                        className={cn('flex-1 rounded-lg border-2 py-3 text-sm font-semibold capitalize transition-colors',
                          listingType === t ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400')}>
                        {t === 'rent' ? 'For Rent' : 'For Sale'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Price (KES) {listingType === 'rent' && '/ month'}
                  </label>
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 25000" className="input-field" min={0} />
                  {price && Number(price) > 0 && (
                    <p className="mt-1 text-xs text-gray-400">≈ {formatKES(Number(price))}{listingType === 'rent' ? '/month' : ''}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Deposit</label>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setDepositRequired(false)}
                      className={cn('flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors',
                        !depositRequired ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400')}>
                      Optional
                    </button>
                    <button type="button" onClick={() => setDepositRequired(true)}
                      className={cn('flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-colors',
                        depositRequired ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400')}>
                      Required
                    </button>
                  </div>
                </div>
                {depositRequired && (
                  <div className="space-y-4 rounded-lg bg-gray-50 p-4 dark:bg-brand-800/30">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Deposit Payment Structure</label>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setDepositStructure('fixed')}
                          className={cn('flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                            depositStructure === 'fixed' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400')}>
                          Fixed
                        </button>
                        <button type="button" onClick={() => setDepositStructure('installments')}
                          className={cn('flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                            depositStructure === 'installments' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200' : 'border-gray-200 text-gray-500 dark:border-brand-700 dark:text-gray-400')}>
                          Installments Accepted
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Deposit Amount (KES)</label>
                      <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="e.g. 50000" className="input-field" min={0} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                  <Phone className="h-5 w-5 text-brand-600" /> Contact Details
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Multiple contact options allowed. Renters will see these on your listing.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678" className="input-field pl-10" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input-field pl-10" />
                    </div>
                  </div>
                </div>
                {/* Social links */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Social / Direct Links</label>
                    <button type="button" onClick={addSocialLink} className="btn-ghost text-xs">
                      <Plus className="h-4 w-4" /> Add Link
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {socialLinks.map((link, i) => (
                      <div key={i} className="flex gap-2">
                        <select value={link.platform} onChange={(e) => updateSocialLink(i, 'platform', e.target.value)} className="input-field w-36">
                          {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input type="url" value={link.url} onChange={(e) => updateSocialLink(i, 'url', e.target.value)} placeholder="https://..." className="input-field flex-1" />
                        <button type="button" onClick={() => removeSocialLink(i)} className="rounded-lg p-2 text-gray-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/20">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                  <Image className="h-5 w-5 text-brand-600" /> Media Uploads
                </h3>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Photos <span className="text-error-500">*</span> ({photos.length}/7)
                    </label>
                    <p className="text-xs text-gray-400">Min 3, Max 7</p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {photos.map((photo, i) => (
                      <div key={i} className="relative group">
                        <img src={photo.url} alt={photo.label} className="h-28 w-full rounded-lg object-cover" />
                        <button type="button" onClick={() => removePhoto(i)} className="absolute right-1 top-1 rounded-full bg-error-600 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                          <X className="h-3 w-3" />
                        </button>
                        <input type="text" value={photo.label} onChange={(e) => updatePhotoLabel(i, e.target.value)} placeholder="e.g. Kitchen" className="input-field mt-1 text-xs" />
                      </div>
                    ))}
                    {photos.length < 7 && (
                      <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500">
                        <Upload className="h-6 w-6 text-gray-400" />
                        <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">Add Photo</span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && handlePhotoUpload(e.target.files)} />
                      </label>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Walkthrough Video <span className="text-gray-400">(optional, up to 30 min)</span>
                  </label>
                  {video ? (
                    <div className="relative">
                      <video src={video.url} className="h-40 w-full rounded-lg object-cover" controls />
                      <button type="button" onClick={() => setVideo(null)} className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500">
                      <Video className="h-6 w-6 text-gray-400" />
                      <span className="mt-1 text-sm text-gray-500 dark:text-gray-400">Upload Video</span>
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])} />
                    </label>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                  <FileText className="h-5 w-5 text-brand-600" /> House Details & Description
                </h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Listing Title</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spacious 2BR Apartment in Westlands" className="input-field" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">House Size</label>
                  <select value={size} onChange={(e) => setSize(e.target.value)} className="input-field">
                    <option value="">Select size...</option>
                    {HOUSE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {size === 'Custom Size' && (
                    <input type="text" value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder="e.g. Maisonette" className="input-field mt-2" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bedrooms</label>
                    <select value={beds} onChange={(e) => setBeds(e.target.value)} className="input-field">
                      {[0,1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n === 0 ? 'Studio' : n === 6 ? '6+' : n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Bathrooms</label>
                    <select value={baths} onChange={(e) => setBaths(e.target.value)} className="input-field">
                      {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n === 5 ? '5+' : n}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Describe the property, amenities, neighborhood, nearby landmarks..." className="input-field resize-none p-4" />
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
                {error}
              </div>
            )}

            {/* Navigation */}
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                className="btn-secondary"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                  className="btn-primary"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canProceed() || submitting}
                  className="btn-primary"
                >
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Publishing...</> : <>Publish Listing</>}
                </button>
              )}
            </div>
          </div>
        </>
      </TermsGate>

      <p className="mt-8 text-center text-xs text-gray-400">© Copyright Saka Krib. All Rights Reserved.</p>
    </div>
  );
}
