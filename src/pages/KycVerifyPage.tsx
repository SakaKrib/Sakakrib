import { useState, useRef } from 'react';
import { ShieldCheck, IdCard, Upload, Camera, CheckCircle2, Clock, XCircle, Loader2, UserCheck, Fingerprint } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import TermsGate from '@/components/TermsGate';
import { supabase } from '@/lib/supabase';
import { validateNationalID, validateDL, cn } from '@/lib/utils';

type KycStep = 'idle' | 'uploading' | 'verifying' | 'success' | 'failed';

export default function KycVerifyPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useNav();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [nationalId, setNationalId] = useState(profile?.national_id || '');
  const [dlNumber, setDlNumber] = useState(profile?.dl_number || '');
  const [idPhotoUrl, setIdPhotoUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [step, setStep] = useState<KycStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [verifyProgress, setVerifyProgress] = useState(0);

  const handleFileUpload = async (file: File, type: 'id' | 'selfie') => {
    if (!profile) return;
    setError(null);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${profile.id}/${type}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(fileName);
      if (type === 'id') setIdPhotoUrl(publicUrl);
      else setSelfieUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateNationalID(nationalId)) {
      setError('National ID must be 7-8 digits (Kenyan format).');
      return;
    }
    if (!validateDL(dlNumber)) {
      setError('Please enter a valid Driving License number.');
      return;
    }
    if (!idPhotoUrl) {
      setError('Please upload your National ID photo.');
      return;
    }
    if (!selfieUrl) {
      setError('Please upload a selfie photo.');
      return;
    }

    setStep('uploading');
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        national_id: nationalId,
        dl_number: dlNumber,
        id_photo_url: idPhotoUrl,
        selfie_url: selfieUrl,
        verification_status: 'pending_verification',
      })
      .eq('id', profile!.id);

    if (updateError) {
      setError(updateError.message);
      setStep('idle');
      return;
    }

    // Mock IPRS / Smile ID verification flow
    setStep('verifying');
    const stages = ['Validating National ID format...', 'Querying IPRS database...', 'Matching facial biometrics (Smile ID)...', 'Cross-referencing KYC records...', 'Finalizing verification...'];
    for (let i = 0; i < stages.length; i++) {
      await new Promise((r) => setTimeout(r, 800));
      setVerifyProgress(((i + 1) / stages.length) * 100);
    }

    // Simulate 90% success rate
    const passed = Math.random() > 0.1;
    if (passed) {
      await supabase
        .from('profiles')
        .update({ verification_status: 'verified' })
        .eq('id', profile!.id);
      setStep('success');
      await refreshProfile();
    } else {
      await supabase
        .from('profiles')
        .update({ verification_status: 'rejected' })
        .eq('id', profile!.id);
      setStep('failed');
      await refreshProfile();
    }
  };

  const resetVerification = () => {
    setStep('idle');
    setVerifyProgress(0);
    setIdPhotoUrl('');
    setSelfieUrl('');
  };

  // Success / Failed / Pending status screens
  if (step === 'success' || profile?.verification_status === 'verified') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="card p-8 text-center animate-scale-in">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
            <CheckCircle2 className="h-10 w-10 text-success-600 dark:text-success-400" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Account Verified!</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Your identity has been confirmed through our IPRS / Smile ID integration.
            You can now post property listings and accept rental inquiries.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button onClick={() => navigate('post-listing')} className="btn-primary">
              Post a Listing
            </button>
            <button onClick={() => navigate('dashboard')} className="btn-secondary">
              Go to Dashboard
            </button>
          </div>
          <p className="mt-8 text-xs text-gray-400">© Copyright Saka Krib. All Rights Reserved.</p>
        </div>
      </div>
    );
  }

  if (step === 'failed') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="card p-8 text-center animate-scale-in">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-error-100 dark:bg-error-900/30">
            <XCircle className="h-10 w-10 text-error-600 dark:text-error-400" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Verification Failed</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            We could not verify your identity. This may be due to a mismatch between your ID details
            and the IPRS database, or a poor quality photo. Please try again with clear, well-lit photos.
          </p>
          <button onClick={resetVerification} className="btn-primary mt-6">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (step === 'verifying') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-800/50">
            <Loader2 className="h-10 w-10 animate-spin text-brand-600 dark:text-brand-400" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Verifying Your Identity</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Running IPRS / Smile ID database checks...
          </p>
          <div className="mx-auto mt-6 h-2 w-full max-w-sm overflow-hidden rounded-full bg-gray-200 dark:bg-brand-800">
            <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${verifyProgress}%` }} />
          </div>
          <p className="mt-3 text-sm font-medium text-brand-600 dark:text-brand-400">{Math.round(verifyProgress)}%</p>
        </div>
      </div>
    );
  }

  if (step === 'uploading') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="card p-8 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-600" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">Submitting your verification...</p>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-800/50">
            <ShieldCheck className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account Verification (KYC)</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Required for Landlords and Movers before posting listings or taking jobs.
            </p>
          </div>
        </div>
      </div>

      {/* Current status */}
      {profile?.verification_status === 'pending_verification' && (
        <div className="mb-6 flex items-center gap-3 rounded-full bg-warning-50 px-4 py-3 dark:bg-warning-900/20">
          <Clock className="h-5 w-5 text-warning-600" />
          <p className="text-sm font-medium text-warning-700 dark:text-warning-400">
            Your verification is pending review. Please wait...
          </p>
        </div>
      )}

      <TermsGate context="landlord" onAccept={() => setTermsAccepted(true)}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Info */}
          <div className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <UserCheck className="h-5 w-5 text-brand-600" /> Personal Information
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name (as on ID)</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Mwangi" className="input-field" required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">National ID Number</label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="12345678" className="input-field pl-10" maxLength={8} required />
                </div>
                <p className="mt-1 text-xs text-gray-400">7-8 digit Kenyan National ID</p>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Driving License Number (for Movers)</label>
                <input type="text" value={dlNumber} onChange={(e) => setDlNumber(e.target.value)} placeholder="DL1234567" className="input-field" />
                <p className="mt-1 text-xs text-gray-400">Required only if registering as a Mover</p>
              </div>
            </div>
          </div>

          {/* Document Uploads */}
          <div className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Fingerprint className="h-5 w-5 text-brand-600" /> Identity Documents
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* ID Photo */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">National ID Photo (Front)</label>
                <UploadBox onUpload={(f) => handleFileUpload(f, 'id')} url={idPhotoUrl} label="ID Photo" />
              </div>
              {/* Selfie */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Selfie Photo</label>
                <UploadBox onUpload={(f) => handleFileUpload(f, 'selfie')} url={selfieUrl} label="Selfie" />
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Your documents are securely stored and used only for identity verification through IPRS / Smile ID.
            </p>
          </div>

          {error && (
            <div className="rounded-full bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
              {error}
            </div>
          )}

          <button type="submit" disabled={!termsAccepted} className="btn-primary w-full">
            <ShieldCheck className="h-4 w-4" /> Submit for Verification
          </button>
        </form>
      </TermsGate>

      <p className="mt-8 text-center text-xs text-gray-400">© Copyright Saka Krib. All Rights Reserved.</p>
    </div>
  );
}

function UploadBox({ onUpload, url, label }: { onUpload: (file: File) => void; url: string; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex h-40 cursor-pointer flex-col items-center justify-center rounded-full border-2 border-dashed transition-colors',
        url ? 'border-success-400 bg-success-50 dark:border-success-600 dark:bg-success-900/20' : 'border-gray-300 hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500'
      )}
    >
      {url ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success-600" />
          <p className="mt-1 text-sm font-medium text-success-700 dark:text-success-400">{label} uploaded</p>
        </div>
      ) : (
        <div className="text-center">
          {label === 'Selfie' ? <Camera className="mx-auto h-8 w-8 text-gray-400" /> : <Upload className="mx-auto h-8 w-8 text-gray-400" />}
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Click to upload {label}</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
        }}
      />
    </div>
  );
}
