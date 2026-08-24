import { useRef, useState } from 'react';
import {
  User,
  Phone,
  MapPin,
  Mail,
  Save,
  Loader2,
  ShieldCheck,
  Camera,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';

import {
  KENYAN_CITIES,
  KENYAN_COUNTIES,
  validatePhone,
  cn,
} from '@/lib/utils';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useNav();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fullName, setFullName] = useState(
    profile?.full_name || ''
  );

  const [phone, setPhone] = useState(
    profile?.phone || ''
  );

  const [city, setCity] = useState(
    profile?.city || ''
  );

  const [county, setCounty] = useState(
    profile?.county || ''
  );

  const [profileImage, setProfileImage] = useState<File | null>(
    null
  );

  const [imagePreview, setImagePreview] = useState(
    profile?.profile_photo_url || ''
  );

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(
    null
  );

  const [success, setSuccess] = useState(false);

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Please sign in to view your profile.
        </p>
      </div>
    );
  }

  /*
   * ------------------------------------------------------
   * ROLE / VERIFICATION STATUS
   * ------------------------------------------------------
   */

  const role = profile.role;

  const landlordVerified =
    role === 'landlord' &&
    profile.landlord_application_status === 'approved';

  const moverVerified =
    role === 'mover' &&
    profile.mover_application_status === 'approved';

  const renterRole =
    role === 'renter';

  const isRoleVerified =
    landlordVerified ||
    moverVerified;

  const roleLabel =
    landlordVerified
      ? 'Landlord'
      : moverVerified
      ? 'Mover'
      : renterRole
      ? 'Renter'
      : role
      ? String(role)
      : 'User';

  const verificationLabel =
    isRoleVerified
      ? `${roleLabel} Verified`
      : roleLabel === 'Renter'
      ? 'Renter Account'
      : profile.verification_status ===
        'pending_verification'
      ? `${roleLabel} Verification Pending`
      : `${roleLabel} Not Verified`;

  const verificationDescription =
    isRoleVerified
      ? landlordVerified
        ? 'Your landlord identity has been verified. You can manage your properties.'
        : 'Your mover identity has been verified. You can accept moving jobs.'
      : renterRole
      ? 'You are registered as a renter.'
      : 'Complete identity verification to unlock your professional features.';

  /*
   * ------------------------------------------------------
   * IMAGE SELECT
   * ------------------------------------------------------
   */

  const handleImageChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);

    /*
     * Validate image type.
     */

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.type)) {
      setError(
        'Please select a JPG, PNG, or WebP image.'
      );

      event.target.value = '';
      return;
    }

    /*
     * Maximum 5 MB.
     */

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      setError(
        'Profile image must be smaller than 5 MB.'
      );

      event.target.value = '';
      return;
    }

    setProfileImage(file);

    /*
     * Create local preview.
     */

    const previewUrl =
      URL.createObjectURL(file);

    setImagePreview(previewUrl);
  };

  /*
   * ------------------------------------------------------
   * SAVE PROFILE
   * ------------------------------------------------------
   */

  const handleSave = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    setError(null);
    setSuccess(false);

    /*
     * Validate phone.
     */

    if (
      phone &&
      !validatePhone(phone)
    ) {
      setError(
        'Please enter a valid Kenyan phone number.'
      );

      return;
    }

    setSaving(true);

    let uploadedPath: string | null = null;

    try {
      /*
       * --------------------------------------------------
       * VERIFY AUTHENTICATED USER
       * --------------------------------------------------
       */

      const {
        data: {
          user,
        },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!user) {
        throw new Error(
          'Your login session has expired. Please sign in again.'
        );
      }

      /*
       * Make sure the authenticated account matches
       * the profile being edited.
       */

      if (user.id !== profile.id) {
        throw new Error(
          'You can only update your own profile.'
        );
      }

      /*
       * --------------------------------------------------
       * UPLOAD PROFILE IMAGE
       * --------------------------------------------------
       *
       * Bucket:
       *   profile-photos
       *
       * Storage path:
       *   {userId}/{timestamp}-{filename}
       */

      let profilePhotoUrl =
        profile.profile_photo_url || null;

      if (profileImage) {
        const fileExtension =
          profileImage.name
            .split('.')
            .pop()
            ?.toLowerCase() || 'jpg';

        const filePath =
          `${user.id}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

        const {
          error: uploadError,
        } = await supabase.storage
          .from('profile-photos')
          .upload(
            filePath,
            profileImage,
            {
              cacheControl: '3600',
              upsert: false,
              contentType:
                profileImage.type,
            }
          );

        if (uploadError) {
          console.error(
            'Profile image upload failed:',
            uploadError
          );

          throw new Error(
            'We could not upload your profile image. Please try again.'
          );
        }

        /*
         * Keep this path so that if the database update
         * fails we can remove the newly uploaded file.
         */

        uploadedPath = filePath;

        /*
         * Get the public URL for the image.
         */

        const {
          data: publicUrlData,
        } = supabase.storage
          .from('profile-photos')
          .getPublicUrl(filePath);

        profilePhotoUrl =
          publicUrlData.publicUrl;

        /*
         * Remove previous image only after the new
         * image has successfully uploaded.
         */

        if (
          profile.profile_photo_url &&
          profile.profile_photo_url !==
            profilePhotoUrl
        ) {
          try {
            const oldUrl =
              new URL(
                profile.profile_photo_url
              );

            const bucketMarker =
              '/storage/v1/object/public/profile-photos/';

            const markerIndex =
              oldUrl.pathname.indexOf(
                bucketMarker
              );

            if (markerIndex !== -1) {
              const oldPath =
                oldUrl.pathname
                  .substring(
                    markerIndex +
                      bucketMarker.length
                  );

              if (oldPath) {
                await supabase.storage
                  .from('profile-photos')
                  .remove([oldPath]);
              }
            }
          } catch (cleanupError) {
            /*
             * Old-image cleanup should not prevent the
             * new profile from being saved.
             */

            console.warn(
              'Could not remove previous profile image:',
              cleanupError
            );
          }
        }
      }

      /*
       * --------------------------------------------------
       * UPDATE PROFILE DATABASE RECORD
       * --------------------------------------------------
       */

      const {
        error: profileError,
      } = await supabase
        .from('profiles')
        .update({
          full_name:
            fullName.trim(),

          phone:
            phone.trim(),

          city:
            city.trim(),

          county:
            county.trim(),

          profile_photo_url:
            profilePhotoUrl,
        })
        .eq(
          'id',
          profile.id
        );

      if (profileError) {
        console.error(
          'Profile update failed:',
          profileError
        );

        /*
         * Roll back newly uploaded image if DB update
         * failed.
         */

        if (uploadedPath) {
          await supabase.storage
            .from('profile-photos')
            .remove([
              uploadedPath,
            ]);
        }

        throw profileError;
      }

      /*
       * --------------------------------------------------
       * REFRESH AUTH PROFILE
       * --------------------------------------------------
       */

      await refreshProfile();

      /*
       * --------------------------------------------------
       * SUCCESS
       * --------------------------------------------------
       */

      setProfileImage(null);

      setSuccess(true);

      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (saveError) {
      console.error(
        'Profile save failed:',
        saveError
      );

      setError(
        saveError instanceof Error
          ? saveError.message
          : 'We could not save your profile. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * ------------------------------------------------------
   * UI
   * ------------------------------------------------------
   */

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

      {/* Header */}

      <div className="mb-6">

        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">

          <User className="h-6 w-6 text-brand-600" />

          My Profile

        </h1>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Update your personal information and preferences.
        </p>

      </div>

      {/* ==================================================
          ROLE / VERIFICATION STATUS
      ================================================== */}

      <div
        className={cn(
          'card mb-6 flex items-center gap-3 p-4',
          isRoleVerified &&
            'border-success-300 dark:border-success-700'
        )}
      >

        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full',
            isRoleVerified
              ? 'bg-success-100 dark:bg-success-900/30'
              : 'bg-warning-100 dark:bg-warning-900/30'
          )}
        >

          <ShieldCheck
            className={cn(
              'h-5 w-5',
              isRoleVerified
                ? 'text-success-600'
                : 'text-warning-600'
            )}
          />

        </div>

        <div className="flex-1">

          <p className="text-sm font-semibold text-gray-900 dark:text-white">

            {verificationLabel}

            {isRoleVerified && (
              <span className="ml-1 inline-flex items-center text-success-600">
                ✓
              </span>
            )}

          </p>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {verificationDescription}
          </p>

        </div>

        {!isRoleVerified &&
          !renterRole && (
            <button
              type="button"
              onClick={() =>
                navigate('kyc-verify')
              }
              className="btn-secondary text-sm"
            >
              Verify Now
            </button>
          )}

      </div>

      {/* ==================================================
          PROFILE FORM
      ================================================== */}

      <form
        onSubmit={handleSave}
        className="card space-y-5 p-6"
      >

        {/* ==================================================
            PROFILE PHOTO
        ================================================== */}

        <div>

          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Profile Photo
          </label>

          <div className="flex items-center gap-4">

            <div className="relative">

              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100 dark:border-brand-800 dark:bg-brand-900/30">

                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-10 w-10 text-gray-400" />
                )}

              </div>

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-md transition hover:bg-brand-700"
                aria-label="Change profile photo"
              >
                <Camera className="h-4 w-4" />
              </button>

            </div>

            <div className="flex-1">

              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Upload a profile photo
              </p>

              <p className="mt-1 text-xs text-gray-400">
                JPG, PNG or WebP. Maximum 5 MB.
              </p>

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="btn-secondary mt-3 text-sm"
              >
                Choose Image
              </button>

            </div>

          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
            className="hidden"
          />

        </div>

        {/* ==================================================
            FULL NAME
        ================================================== */}

        <div>

          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Full Name
          </label>

          <input
            type="text"
            value={fullName}
            onChange={(event) =>
              setFullName(
                event.target.value
              )
            }
            className="input-field"
          />

        </div>

        {/* ==================================================
            EMAIL
        ================================================== */}

        <div>

          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>

          <div className="relative">

            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              type="email"
              value={profile.email}
              disabled
              className="input-field pl-10 opacity-60"
            />

          </div>

        </div>

        {/* ==================================================
            PHONE
        ================================================== */}

        <div>

          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Phone Number
          </label>

          <div className="relative">

            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              type="tel"
              value={phone}
              onChange={(event) =>
                setPhone(
                  event.target.value
                )
              }
              placeholder="0712345678"
              className="input-field pl-10"
            />

          </div>

        </div>

        {/* ==================================================
            CITY / COUNTY
        ================================================== */}

        <div className="grid gap-4 sm:grid-cols-2">

          <div>

            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              City
            </label>

            <div className="relative">

              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <select
                value={city}
                onChange={(event) =>
                  setCity(
                    event.target.value
                  )
                }
                className="input-field pl-10"
              >

                <option value="">
                  Select city...
                </option>

                {KENYAN_CITIES.map(
                  (item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  )
                )}

              </select>

            </div>

          </div>

          <div>

            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              County
            </label>

            <select
              value={county}
              onChange={(event) =>
                setCounty(
                  event.target.value
                )
              }
              className="input-field"
            >

              <option value="">
                Select county...
              </option>

              {KENYAN_COUNTIES.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                )
              )}

            </select>

          </div>

        </div>

        {/* ==================================================
            ERROR
        ================================================== */}

        {error && (
          <div
            role="alert"
            className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400"
          >
            {error}
          </div>
        )}

        {/* ==================================================
            SUCCESS
        ================================================== */}

        {success && (
          <div
            role="status"
            className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-400"
          >
            Profile saved successfully!
          </div>
        )}

        {/* ==================================================
            SAVE BUTTON
        ================================================== */}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary flex w-full items-center justify-center gap-2"
        >

          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}

        </button>

      </form>

    </div>
  );
}