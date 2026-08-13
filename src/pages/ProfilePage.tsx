import { useState } from 'react';
import { User, Phone, MapPin, Mail, Save, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';
import { KENYAN_CITIES, KENYAN_COUNTIES, validatePhone, cn } from '@/lib/utils';
import type { UserRole } from '@/lib/supabase';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useNav();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [city, setCity] = useState(profile?.city || '');
  const [county, setCounty] = useState(profile?.county || '');
  const [isAgency, setIsAgency] = useState(profile?.is_agency || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">Please sign in to view your profile.</p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (phone && !validatePhone(phone)) {
      setError('Please enter a valid Kenyan phone number.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone,
        city,
        county,
        is_agency: isAgency,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    await refreshProfile();
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <User className="h-6 w-6 text-brand-600" /> My Profile
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Update your personal information and preferences.</p>
      </div>

      {/* Verification status */}
      <div className={cn(
        'card mb-6 flex items-center gap-3 p-4',
        profile.verification_status === 'verified' && 'border-success-300 dark:border-success-700'
      )}>
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          profile.verification_status === 'verified'
            ? 'bg-success-100 dark:bg-success-900/30'
            : 'bg-warning-100 dark:bg-warning-900/30'
        )}>
          <ShieldCheck className={cn(
            'h-5 w-5',
            profile.verification_status === 'verified' ? 'text-success-600' : 'text-warning-600'
          )} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {profile.verification_status === 'verified' ? 'Verified Account' :
             profile.verification_status === 'pending_verification' ? 'Verification Pending' :
             'Account Not Verified'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {profile.verification_status === 'verified'
              ? 'You can post listings and accept moving jobs.'
              : 'Complete KYC verification to unlock all features.'}
          </p>
        </div>
        {profile.verification_status !== 'verified' && (
          <button onClick={() => navigate('kyc-verify')} className="btn-secondary text-sm">
            Verify Now
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="card space-y-5 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="email" value={profile.email} disabled className="input-field pl-10 opacity-60" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678" className="input-field pl-10" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">City</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <select value={city} onChange={(e) => setCity(e.target.value)} className="input-field pl-10">
                <option value="">Select city...</option>
                {KENYAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">County</label>
            <select value={county} onChange={(e) => setCounty(e.target.value)} className="input-field">
              <option value="">Select county...</option>
              {KENYAN_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-brand-800">
            <input
              type="checkbox"
              checked={isAgency}
              onChange={(e) => setIsAgency(e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">I am a Real Estate Agency</p>
              <p className="text-xs text-gray-400">Agency accounts are subject to 15% commission instead of flat fees.</p>
            </div>
          </label>
        </div>

        {error && (
          <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>
        )}
        {success && (
          <div className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400">
            Profile saved successfully!
          </div>
        )}

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Save className="h-4 w-4" /> Save Changes</>}
        </button>
      </form>
    </div>
  );
}
