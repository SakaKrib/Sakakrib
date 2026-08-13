import { useState } from 'react';
import { Building2, CheckCircle2, FileText, Mail, Phone, User, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import TermsGate from '@/components/TermsGate';
import DocumentCapture from '@/components/DocumentCapture';
import { supabase } from '@/lib/supabase';
import { validateEmail, validatePhone } from '@/lib/utils';

export default function RegisterLandlordPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useNav();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [middleName, setMiddleName] = useState(profile?.middle_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [nationalId, setNationalId] = useState(profile?.national_id || '');
  const [documentType, setDocumentType] = useState<'national_id' | 'passport'>('national_id');
  const [documentUrl, setDocumentUrl] = useState(profile?.id_document_url || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!profile) {
    return <div className="mx-auto max-w-md px-4 py-20 text-center"><p className="text-gray-500 dark:text-gray-400">Please sign in to register as a landlord.</p></div>;
  }

  if (profile.role !== 'renter') {
    return <StatusCard title="Renter accounts only" message="Only renter accounts can submit a landlord application." />;
  }

  if (profile.landlord_application_status === 'pending') {
    return <StatusCard title="Landlord application pending" message="Your landlord application is waiting for administrator approval. You cannot submit another request while it is being reviewed." />;
  }

  if (profile.landlord_application_status === 'approved') {
    return <StatusCard title="Landlord application approved" message="Your landlord access is already approved. You can manage your properties from the dashboard." actionLabel="Open dashboard" onAction={() => navigate('dashboard')} />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) { setError('First name and last name are required.'); return; }
    if (!validateEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (!validatePhone(phone)) { setError('Please enter a valid Kenyan phone number.'); return; }
    if (!nationalId.trim()) { setError('Please enter your National ID or Passport number.'); return; }
    if (!documentUrl) { setError('Please upload or capture your identity document.'); return; }

    setSubmitting(true);
    const { error: updateError } = await supabase.rpc('submit_landlord_application', {
      p_first_name: firstName.trim(),
      p_middle_name: middleName.trim(),
      p_last_name: lastName.trim(),
      p_email: email.trim(),
      p_phone: phone.trim(),
      p_national_id: nationalId.trim(),
      p_document_type: documentType,
      p_document_url: documentUrl,
    });

    if (updateError) {
      console.error('landlord registration failed', updateError);
      setError('We could not save your registration. Please try again.');
      setSubmitting(false);
      return;
    }
    await refreshProfile();
    setSuccess(true);
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="card animate-scale-in p-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30"><CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" /></div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Landlord registration submitted</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Your identity details are ready for review. You will be able to publish homes after verification.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button onClick={() => navigate('dashboard')} className="btn-primary">Go to Dashboard</button><button onClick={() => navigate('post-listing')} className="btn-secondary">View Listing Requirements</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-100 dark:bg-success-900/30"><Building2 className="h-6 w-6 text-success-600 dark:text-success-400" /></div><div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Landlord / Real Estate Owner</h1><p className="text-sm text-gray-500 dark:text-gray-400">Create a verified professional profile for your properties.</p></div></div>
      <TermsGate context="landlord" onAccept={() => setTermsAccepted(true)}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card p-6"><h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white"><User className="h-5 w-5 text-brand-600" /> Personal details</h3><div className="grid gap-4 sm:grid-cols-2">
            <Field label="First Name" required value={firstName} onChange={setFirstName} placeholder="Jane" />
            <Field label="Last Name" required value={lastName} onChange={setLastName} placeholder="Wanjiku" />
            <Field label="Middle Name" value={middleName} onChange={setMiddleName} placeholder="Optional" />
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field pl-10" required /></div></div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label><div className="relative"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field pl-10" placeholder="0712345678" required /></div></div>
            <Field label="National ID / Passport Number" required value={nationalId} onChange={setNationalId} placeholder="ID or passport number" />
          </div></div>
          <div className="card p-6"><h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white"><FileText className="h-5 w-5 text-brand-600" /> Identity document</h3><div className="mb-4 flex gap-2"><button type="button" onClick={() => setDocumentType('national_id')} className={`btn-secondary flex-1 ${documentType === 'national_id' ? 'border-brand-500 bg-brand-50 text-brand-700' : ''}`}>National ID</button><button type="button" onClick={() => setDocumentType('passport')} className={`btn-secondary flex-1 ${documentType === 'passport' ? 'border-brand-500 bg-brand-50 text-brand-700' : ''}`}>Passport</button></div><DocumentCapture bucket="id-documents" userId={profile.id} label="ID document photo" currentUrl={documentUrl} onUploaded={setDocumentUrl} /></div>
          {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}
          <button type="submit" disabled={!termsAccepted || submitting} className="btn-primary w-full">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Submit Landlord Registration'}</button>
        </form>
      </TermsGate>
    </div>
  );
}

function StatusCard({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="mx-auto max-w-md px-4 py-20"><div className="card p-8 text-center"><Building2 className="mx-auto h-10 w-10 text-brand-600" /><h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{title}</h2><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{message}</p>{actionLabel && onAction && <button onClick={onAction} className="btn-primary mt-6">{actionLabel}</button>}</div></div>;
}

function Field({ label, required, value, onChange, placeholder }: { label: string; required?: boolean; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}{required && <span className="text-error-500"> *</span>}</label><input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input-field" required={required} /></div>;
}
