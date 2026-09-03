import { useRef, useState } from 'react';
import { User, Phone, MapPin, Mail, Save, Loader2, ShieldCheck, Camera } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedPatch, protectedUpload } from '@/lib/djangoApi';
import { KENYAN_CITIES, KENYAN_COUNTIES, validatePhone, cn } from '@/lib/utils';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useNav();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [city, setCity] = useState(profile?.city || '');
  const [county, setCounty] = useState(profile?.county || '');
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState(profile?.profile_photo_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!profile) return <div className="mx-auto max-w-md px-2 py-20 text-center"><p className="text-gray-500 dark:text-gray-400">Please sign in to view your profile.</p></div>;

  const role = profile.role;
  const landlordVerified = role === 'landlord' && profile.landlord_application_status === 'approved';
  const moverVerified = role === 'mover' && profile.mover_application_status === 'approved';
  const renterRole = role === 'renter';
  const isRoleVerified = landlordVerified || moverVerified;
  const roleLabel = landlordVerified ? 'Landlord' : moverVerified ? 'Mover' : renterRole ? 'Renter' : role ? String(role) : 'User';
  const verificationLabel = isRoleVerified ? `${roleLabel} Verified` : roleLabel === 'Renter' ? 'Renter Account' : profile.verification_status === 'pending_verification' ? `${roleLabel} Verification Pending` : `${roleLabel} Not Verified`;
  const verificationDescription = isRoleVerified ? landlordVerified ? 'Your landlord identity has been verified. You can manage your properties.' : 'Your mover identity has been verified. You can accept moving jobs.' : renterRole ? 'You are registered as a renter.' : 'Complete identity verification to unlock your professional features.';

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Please select a JPG, PNG, or WebP image.'); event.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { setError('Profile image must be smaller than 5 MB.'); event.target.value = ''; return; }
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setProfileImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); setSuccess(false);
    if (phone && !validatePhone(phone)) { setError('Please enter a valid Kenyan phone number.'); return; }
    setSaving(true);
    try {
      let profilePhotoUrl = profile.profile_photo_url || null;
      if (profileImage) {
        const formData = new FormData();
        formData.append('file', profileImage);
        const upload = await protectedUpload<{ profile_photo_url: string }>('/api/accounts/profile-photo/', formData);
        profilePhotoUrl = upload.profile_photo_url;
      }

      await protectedPatch('/api/accounts/me/', {
        full_name: fullName.trim(),
        phone: phone.trim(),
        city: city.trim(),
        county: county.trim(),
        profile_photo_url: profilePhotoUrl,
      });
      await refreshProfile();
      setProfileImage(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (saveError) {
      console.error('Profile save failed:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'We could not save your profile. Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-2 py-8 sm:px-6">
      <div className="mb-6"><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white"><User className="h-6 w-6 text-brand-600" />My Profile</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Update your personal information and preferences.</p></div>
      <div className={cn('card mb-6 flex items-center gap-3 p-4', isRoleVerified && 'border-success-300 dark:border-success-700')}>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', isRoleVerified ? 'bg-success-100 dark:bg-success-900/30' : 'bg-warning-100 dark:bg-warning-900/30')}><ShieldCheck className={cn('h-5 w-5', isRoleVerified ? 'text-success-600' : 'text-warning-600')} /></div>
        <div className="flex-1"><p className="text-sm font-semibold text-gray-900 dark:text-white">{verificationLabel}{isRoleVerified && <span className="ml-1 text-success-600">✓</span>}</p><p className="text-xs text-gray-500 dark:text-gray-400">{verificationDescription}</p></div>
        {!isRoleVerified && !renterRole && <button type="button" onClick={() => navigate('kyc-verify')} className="btn-secondary text-sm">Verify Now</button>}
      </div>

      <form onSubmit={handleSave} className="card space-y-5 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Profile Photo</label>
          <div className="flex items-center gap-4"><div className="relative"><div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100 dark:border-brand-800 dark:bg-brand-900/30">{imagePreview ? <img src={imagePreview} alt="Profile" className="h-full w-full object-cover" /> : <User className="h-10 w-10 text-gray-400" />}</div><button type="button" onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-md transition hover:bg-brand-700" aria-label="Change profile photo"><Camera className="h-4 w-4" /></button></div><div className="flex-1"><p className="text-sm font-medium text-gray-700 dark:text-gray-300">Upload a profile photo</p><p className="mt-1 text-xs text-gray-400">JPG, PNG or WebP. Maximum 5 MB.</p><button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary mt-3 text-sm">Choose Image</button></div></div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" />
        </div>

        <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label><input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} className="input-field" /></div>
        <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="email" value={profile.email ?? ''} disabled className="input-field pl-10 opacity-60" /></div></div>
        <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label><div className="relative"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0712345678" className="input-field pl-10" /></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">City</label><div className="relative"><MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><select value={city} onChange={(event) => setCity(event.target.value)} className="input-field pl-10"><option value="">Select city...</option>{KENYAN_CITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div><div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">County</label><select value={county} onChange={(event) => setCounty(event.target.value)} className="input-field"><option value="">Select county...</option>{KENYAN_COUNTIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div>
        {error && <div role="alert" className="rounded-lg bg-error-50 px-2 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}
        {success && <div role="status" className="rounded-lg bg-success-50 px-2 py-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400">Profile saved successfully!</div>}
        <button type="submit" disabled={saving} className="btn-primary flex w-full items-center justify-center gap-2">{saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />Save Changes</>}</button>
      </form>
    </div>
  );
}
