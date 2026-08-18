import { useState } from 'react';
import {
  Truck,
  User,
  IdCard,
  CreditCard,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Percent,
  Users,
  Wallet,
  Calendar,
  ShieldAlert,
  Mail,
  ArrowRight,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import TermsGate from '@/components/TermsGate';
import DocumentCapture from '@/components/DocumentCapture';

import { supabase } from '@/lib/supabase';

import {
  VEHICLE_TYPES,
  KENYAN_CITIES,
  KENYAN_COUNTIES,
  validateNationalID,
  validateDL,
  validatePhone,
  COMMISSION_RATE,
} from '@/lib/utils';

const PAYMENT_CHANNELS = [
  {
    value: 'mpesa_send_money',
    label: 'M-Pesa — Send Money',
  },
  {
    value: 'mpesa_paybill',
    label: 'M-Pesa — Paybill',
  },
  {
    value: 'mpesa_lipa_na_mpesa',
    label: 'M-Pesa — Lipa na M-Pesa',
  },
  {
    value: 'airtel_money',
    label: 'Airtel Money',
  },
] as const;

type PaymentChannel =
  (typeof PAYMENT_CHANNELS)[number]['value'];

interface ReferenceContact {
  name: string;
  phone: string;
  relationship: string;
}

type EmailType =
  | 'mover_application_submitted'
  | 'mover_admin_notification';

export default function RegisterMoverPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate, setAuthModalOpen, setRoleModalOpen  } = useNav();

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [firstName, setFirstName] = useState(
    profile?.first_name || ''
  );

  const [middleName, setMiddleName] = useState(
    profile?.middle_name || ''
  );

  const [lastName, setLastName] = useState(
    profile?.last_name || ''
  );

  const [nationalId, setNationalId] = useState(
    profile?.national_id || ''
  );

  const [dlNumber, setDlNumber] = useState(
    profile?.dl_number || ''
  );

  const [dlPhotoUrl, setDlPhotoUrl] = useState('');

  const [vehicleType, setVehicleType] = useState<
    'pickup' | 'lorry' | 'trailer'
  >('pickup');

  const [capacity, setCapacity] = useState('');
  const [numberPlate, setNumberPlate] = useState('');
  const [city, setCity] = useState('');
  const [county, setCounty] = useState('');

  const [phone, setPhone] = useState(
    profile?.phone || ''
  );

  const [paymentChannel, setPaymentChannel] =
    useState<PaymentChannel>('mpesa_send_money');

  const [paymentAccount, setPaymentAccount] =
    useState('');

  const [baseRate, setBaseRate] = useState('');
  const [ratePerKm, setRatePerKm] = useState('');

  const [insuranceDetails, setInsuranceDetails] =
    useState('');

  const [inspectionExpiry, setInspectionExpiry] =
    useState('');

  const [liabilityAccepted, setLiabilityAccepted] =
    useState(false);

  const [termsChecked, setTermsChecked] =
    useState(false);

  const [references, setReferences] = useState<
    ReferenceContact[]
  >([
    {
      name: '',
      phone: '',
      relationship: '',
    },
  ]);

  const [refError, setRefError] =
    useState<string | null>(null);

  /*
  * ------------------------------------------------------
  * NO PROFILE
  * ------------------------------------------------------
  */

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="card p-8">
          <Truck className="mx-auto h-10 w-10 text-brand-600" />

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Sign in required
          </h2>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Please sign in to continue with mover registration.
          </p>

          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="btn-primary mt-6"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  /*
  * ------------------------------------------------------
  * MOVER APPLICATION — APPROVED
  * ------------------------------------------------------
  */

  if (
    profile.mover_application_status === 'approved'
  ) {
    return (
      <StatusCard
        icon="success"
        title="Mover application approved"
        message="Your mover application has been approved. You can now manage your moving services from your dashboard."
        actionLabel="Open Dashboard"
        onAction={() => navigate('dashboard')}
      />
    );
  }

  /*
  * ------------------------------------------------------
  * MOVER APPLICATION — PENDING
  * ------------------------------------------------------
  */

  if (
    profile.mover_application_status === 'pending'
  ) {
    return (
      <StatusCard
        icon="pending"
        title="Mover application pending"
        message="Your mover application has been submitted and is currently waiting for administrator verification. You cannot submit another application while this request is being reviewed."
      />
    );
  }

  /*
  * ------------------------------------------------------
  * MOVER — KYC INCOMPLETE
  * ------------------------------------------------------
  */

  if (
    profile.role === 'mover' &&
    profile.kyc_completed === false
  ) {
    return (
      <StatusCard
        icon="warning"
        title="Complete your identity verification"
        message="Your identity verification has not been completed. Please complete KYC before continuing with mover registration."
        actionLabel="Complete KYC"
        onAction={() => navigate('kyc-verify')}
      />
    );
  }

  /*
  * ------------------------------------------------------
  * RENTER — ROLE SELECTION REQUIRED
  * ------------------------------------------------------
  */

  if (profile.role === 'renter') {
    return (
      <StatusCard
        icon="warning"
        title="Choose your professional role"
        message="Before becoming a mover, please confirm your professional role."
        actionLabel="Choose Role"
        onAction={() => setRoleModalOpen(true)}
      />
    );
  }

  /*
  * ------------------------------------------------------
  * UNSUPPORTED ROLE
  * ------------------------------------------------------
  */

  if (
    profile.role !== null &&
    profile.role !== 'mover'
  ) {
    return (
      <StatusCard
        icon="blocked"
        title="Mover registration unavailable"
        message="Your current account role does not allow mover registration."
        actionLabel="Home"
        onAction={() => navigate('home')}
      />
    );
  }

  /*
   * ------------------------------------------------------
   * REFERENCES
   * ------------------------------------------------------
   */

  const updateReference = (
    index: number,
    field: keyof ReferenceContact,
    value: string
  ) => {
    setReferences((items) =>
      items.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );

    setRefError(null);
  };

  const addReference = () => {
    setReferences((items) => [
      ...items,
      {
        name: '',
        phone: '',
        relationship: '',
      },
    ]);
  };

  const removeReference = (index: number) => {
    setReferences((items) =>
      items.filter((_, i) => i !== index)
    );
  };

  const validateReferences =
    (): ReferenceContact[] | null => {
      const valid = references.filter(
        (reference) =>
          reference.name.trim() ||
          reference.phone.trim() ||
          reference.relationship.trim()
      );

      for (const reference of valid) {
        if (
          !reference.name.trim() ||
          !reference.phone.trim() ||
          !reference.relationship.trim()
        ) {
          setRefError(
            'All reference fields (name, phone, relationship) are required.'
          );

          return null;
        }

        if (reference.name.trim().length < 2) {
          setRefError(
            'Reference names must be at least 2 characters.'
          );

          return null;
        }
      }

      const names = valid.map((reference) =>
        reference.name.trim().toLowerCase()
      );

      if (new Set(names).size !== names.length) {
        setRefError(
          'Duplicate reference names are not allowed.'
        );

        return null;
      }

      const phones = valid.map((reference) =>
        reference.phone.trim()
      );

      if (new Set(phones).size !== phones.length) {
        setRefError(
          'Duplicate reference phone numbers are not allowed.'
        );

        return null;
      }

      if (valid.length === 0) {
        setRefError(
          'Add at least one representative reference contact.'
        );

        return null;
      }

      return valid;
    };

  /*
   * ------------------------------------------------------
   * SEND EMAIL
   * ------------------------------------------------------
   *
   * React does not contain SMTP credentials.
   * This invokes the Supabase Edge Function responsible
   * for sending the HTML email.
   */

  const sendRegistrationEmail = async (
    type: EmailType,
    applicationData: Record<string, unknown>
  ) => {
    try {
      setSendingEmail(true);

      const { data, error: emailError } =
        await supabase.functions.invoke(
          'send-notification-emails',
          {
            body: {
              type,
              application: applicationData,
            },
          }
        );

      if (emailError) {
        console.error(
          'Registration email failed:',
          emailError
        );

        return false;
      }

      if (data?.error) {
        console.error(
          'Registration email failed:',
          data.error
        );

        return false;
      }

      return true;
    } catch (emailError) {
      console.error(
        'Registration email request failed:',
        emailError
      );

      return false;
    } finally {
      setSendingEmail(false);
    }
  };

  /*
   * ------------------------------------------------------
   * SUBMIT
   * ------------------------------------------------------
   */

  const handleSubmit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    setError(null);

    /*
     * Personal details
     */

    if (
      !firstName.trim() ||
      !lastName.trim()
    ) {
      setError(
        'First name and last name are required.'
      );

      return;
    }

    /*
     * National ID
     */

    if (!validateNationalID(nationalId)) {
      setError(
        'National ID must be 7-8 digits.'
      );

      return;
    }

    /*
     * Driving license
     */

    if (
      !validateDL(dlNumber) ||
      !dlPhotoUrl
    ) {
      setError(
        'Driving license number and photo are required.'
      );

      return;
    }

    /*
     * Phone
     */

    if (!validatePhone(phone)) {
      setError(
        'Please enter a valid Kenyan phone number.'
      );

      return;
    }

    /*
     * Vehicle information
     */

    if (
      !numberPlate.trim() ||
      !city ||
      !county ||
      !capacity.trim()
    ) {
      setError(
        'Complete your vehicle and operating details.'
      );

      return;
    }

    /*
     * Payout
     */

    if (!paymentAccount.trim()) {
      setError(
        'Add the mobile money account used for payouts.'
      );

      return;
    }

    /*
     * Insurance
     */

    if (!insuranceDetails.trim()) {
      setError(
        'Insurance policy details are required.'
      );

      return;
    }

    /*
     * Inspection
     */

    if (!inspectionExpiry) {
      setError(
        'Vehicle inspection expiration date is required.'
      );

      return;
    }

    /*
     * Liability
     */

    if (!liabilityAccepted) {
      setError(
        'You must accept full liability for goods in transit.'
      );

      return;
    }

    /*
     * Terms
     */

    if (!termsChecked) {
      setError(
        'You must accept the Terms and Conditions.'
      );

      return;
    }

    /*
     * References
     */

    const validReferences =
      validateReferences();

    if (!validReferences) {
      return;
    }

    setSubmitting(true);

    try {
      const fullName = [
        firstName.trim(),
        middleName.trim(),
        lastName.trim(),
      ]
        .filter(Boolean)
        .join(' ');

      const application = {
        driver_full_name: fullName,

        national_id: nationalId.trim(),

        dl_number: dlNumber.trim(),

        dl_photo_url: dlPhotoUrl,

        vehicle_type: vehicleType,

        number_plate:
          numberPlate.trim().toUpperCase(),

        operating_city: city,

        operating_county: county,

        phone: phone.trim(),

        base_rate_kes: baseRate
          ? Number(baseRate)
          : 0,

        rate_per_km_kes: ratePerKm
          ? Number(ratePerKm)
          : 0,

        capacity_details:
          capacity.trim(),

        payment_channel:
          paymentChannel,

        payment_account:
          paymentAccount.trim(),

        liability_accepted:
          liabilityAccepted,

        insurance_policy_details:
          insuranceDetails.trim(),

        vehicle_inspection_expiry:
          inspectionExpiry,

        terms_accepted:
          termsChecked,

        reference_contacts:
          validReferences,

        applicant_id: profile.id,

        applicant_email:
          profile.email || '',

        applicant_name: fullName,

        application_type: 'mover',

        submitted_at:
          new Date().toISOString(),
      };

      /*
       * --------------------------------------------------
       * SAVE APPLICATION
       * --------------------------------------------------
       */

      const {
        error: moverError,
      } = await supabase.rpc(
        'submit_mover_application',
        {
          p_application: application,
        }
      );

      if (moverError) {
        console.error(
          'mover registration failed',
          moverError
        );

        setError(
          'We could not save your mover registration. Please try again.'
        );

        return;
      }
     

      /*
       * --------------------------------------------------
       * REFRESH PROFILE
       * --------------------------------------------------
       */

      await refreshProfile();

      /*
       * --------------------------------------------------
       * EMAIL APPLICANT
       * --------------------------------------------------
       */

      await sendRegistrationEmail(
        'mover_application_submitted',
        application
      );

      /*
       * --------------------------------------------------
       * EMAIL ADMIN
       * --------------------------------------------------
       */

      await sendRegistrationEmail(
        'mover_admin_notification',
        application
      );

      /*
       * --------------------------------------------------
       * SUCCESS
       * --------------------------------------------------
       */

      setSuccess(true);
    } catch (submissionError) {
      console.error(
        'mover submission failed',
        submissionError
      );

      setError(
        'Something went wrong while submitting your mover registration. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * ------------------------------------------------------
   * SUCCESS SCREEN
   * ------------------------------------------------------
   */

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="card animate-scale-in p-8 text-center">

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
            <CheckCircle2 className="h-10 w-10 text-success-600" />
          </div>

          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
            Mover registration submitted
          </h2>

          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Your mover application has been successfully
            submitted and is now waiting for administrator
            approval.
          </p>

          <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-left dark:border-brand-700 dark:bg-brand-900/20">
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />

              <div>
                <p className="font-semibold text-brand-900 dark:text-brand-200">
                  Confirmation email sent
                </p>

                <p className="mt-1 text-sm text-brand-700 dark:text-brand-300">
                  We have sent a confirmation to your
                  registered email address. Our
                  administration team has also been
                  notified to review your application.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate('movers')}
              className="btn-primary"
            >
              View Movers
            </button>

            <button
              type="button"
              onClick={() => navigate('dashboard')}
              className="btn-secondary"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ------------------------------------------------------
   * REGISTRATION FORM
   * ------------------------------------------------------
   */

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">

      {/* Header */}

      <div className="mb-6 flex items-center gap-3">

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100 dark:bg-accent-900/30">
          <Truck className="h-6 w-6 text-accent-600" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Mover Registration
          </h1>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Register your moving service, vehicle
            capacity, compliance information and payout
            details.
          </p>
        </div>
      </div>

      {/* Commission information */}

      <div className="mb-6 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-700 dark:bg-brand-800/30">

        <Percent className="h-5 w-5 shrink-0 text-brand-600" />

        <p className="text-sm text-brand-700 dark:text-brand-300">
          <span className="font-semibold">
            {COMMISSION_RATE * 100}% platform fee:
          </span>{' '}
          payouts release through the platform escrow
          workflow.
        </p>
      </div>

      <TermsGate
        context="mover"
        onAccept={() => setTermsAccepted(true)}
      >
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >

          {/* =================================================
              PERSONAL DETAILS
          ================================================= */}

          <section className="card p-6">

            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <User className="h-5 w-5 text-brand-600" />
              Personal details
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">

              <Field
                label="First Name"
                value={firstName}
                onChange={setFirstName}
                required
              />

              <Field
                label="Last Name"
                value={lastName}
                onChange={setLastName}
                required
              />

              <Field
                label="Middle Name"
                value={middleName}
                onChange={setMiddleName}
              />

              <Field
                label="Phone Number"
                value={phone}
                onChange={setPhone}
                required
                placeholder="0712345678"
              />

              <Field
                label="National ID Number"
                value={nationalId}
                onChange={setNationalId}
                required
                icon={IdCard}
              />

              <Field
                label="Driving License Number"
                value={dlNumber}
                onChange={setDlNumber}
                required
                icon={CreditCard}
              />

            </div>
          </section>

          {/* =================================================
              DRIVING LICENSE
          ================================================= */}

          <section className="card p-6">

            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <CreditCard className="h-5 w-5 text-brand-600" />
              Driving license evidence
            </h3>

            <DocumentCapture
              bucket="licenses"
              userId={profile.id}
              label="Driving license photo"
              currentUrl={dlPhotoUrl}
              onUploaded={setDlPhotoUrl}
            />

          </section>

          {/* =================================================
              VEHICLE
          ================================================= */}

          <section className="card p-6">

            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Truck className="h-5 w-5 text-brand-600" />
              Vehicle and service capacity
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Vehicle Type
                </label>

                <select
                  value={vehicleType}
                  onChange={(event) =>
                    setVehicleType(
                      event.target.value as typeof vehicleType
                    )
                  }
                  className="input-field"
                >
                  {VEHICLE_TYPES.map((item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <Field
                label="Capacity details"
                value={capacity}
                onChange={setCapacity}
                required
                placeholder="e.g. 1.5 tonnes / 20 boxes"
              />

              <Field
                label="Number Plate"
                value={numberPlate}
                onChange={setNumberPlate}
                required
                placeholder="KDA 123A"
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Operating City
                </label>

                <select
                  value={city}
                  onChange={(event) =>
                    setCity(event.target.value)
                  }
                  className="input-field"
                  required
                >
                  <option value="">
                    Select city...
                  </option>

                  {KENYAN_CITIES.map((item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  County
                </label>

                <select
                  value={county}
                  onChange={(event) =>
                    setCounty(event.target.value)
                  }
                  className="input-field"
                  required
                >
                  <option value="">
                    Select county...
                  </option>

                  {KENYAN_COUNTIES.map((item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <Field
                label="Base Rate (KES)"
                value={baseRate}
                onChange={setBaseRate}
                type="number"
              />

              <Field
                label="Rate per Kilometer (KES)"
                value={ratePerKm}
                onChange={setRatePerKm}
                type="number"
              />

            </div>
          </section>

          {/* =================================================
              COMPLIANCE
          ================================================= */}

          <section className="card p-6">

            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <ShieldAlert className="h-5 w-5 text-brand-600" />
              Compliance and policy
            </h3>

            <div className="grid gap-4">

              <Field
                label="Insurance Policy Details"
                value={insuranceDetails}
                onChange={setInsuranceDetails}
                required
                placeholder="e.g. APA Insurance, Policy No. APA-2026-001234"
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Vehicle Inspection Expiration Date
                  <span className="text-error-500">
                    {' '}
                    *
                  </span>
                </label>

                <div className="relative">

                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <input
                    type="date"
                    value={inspectionExpiry}
                    onChange={(event) =>
                      setInspectionExpiry(
                        event.target.value
                      )
                    }
                    className="input-field pl-10"
                    required
                  />

                </div>
              </div>

            </div>
          </section>

          {/* =================================================
              REFERENCES
          ================================================= */}

          <section className="card p-6">

            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Users className="h-5 w-5 text-brand-600" />
              Representative references
            </h3>

            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Add people we can contact if you are
              unavailable. Duplicate names or phone
              numbers are not allowed.
            </p>

            {references.map(
              (reference, index) => (
                <div
                  key={index}
                  className="mb-3 grid gap-3 rounded-lg bg-gray-50 p-3 dark:bg-brand-800/30 sm:grid-cols-4"
                >

                  <input
                    className="input-field"
                    placeholder="Full name"
                    value={reference.name}
                    onChange={(event) =>
                      updateReference(
                        index,
                        'name',
                        event.target.value
                      )
                    }
                  />

                  <input
                    className="input-field"
                    placeholder="Phone number"
                    value={reference.phone}
                    onChange={(event) =>
                      updateReference(
                        index,
                        'phone',
                        event.target.value
                      )
                    }
                  />

                  <input
                    className="input-field"
                    placeholder="Relationship"
                    value={reference.relationship}
                    onChange={(event) =>
                      updateReference(
                        index,
                        'relationship',
                        event.target.value
                      )
                    }
                  />

                  {references.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        removeReference(index)
                      }
                      className="btn-ghost text-sm text-error-600"
                    >
                      Remove
                    </button>
                  )}

                </div>
              )
            )}

            {refError && (
              <p className="mt-2 text-sm text-error-600">
                {refError}
              </p>
            )}

            <button
              type="button"
              onClick={addReference}
              className="btn-secondary text-sm"
            >
              Add another reference
            </button>

          </section>

          {/* =================================================
              PAYOUT
          ================================================= */}

          <section className="card p-6">

            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Wallet className="h-5 w-5 text-brand-600" />
              Payout method
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Payment Channel
                </label>

                <select
                  value={paymentChannel}
                  onChange={(event) =>
                    setPaymentChannel(
                      event.target.value as PaymentChannel
                    )
                  }
                  className="input-field"
                >
                  {PAYMENT_CHANNELS.map(
                    (item) => (
                      <option
                        key={item.value}
                        value={item.value}
                      >
                        {item.label}
                      </option>
                    )
                  )}
                </select>
              </div>

              <Field
                label="Mobile money number / account"
                value={paymentAccount}
                onChange={setPaymentAccount}
                required
                placeholder="Registered payout number"
              />

            </div>
          </section>

          {/* =================================================
              LIABILITY + TERMS
          ================================================= */}

          <section className="card space-y-4 p-6">

            <label className="flex items-start gap-3 rounded-lg border border-error-200 bg-error-50 p-4 dark:border-error-800 dark:bg-error-900/20">

              <input
                type="checkbox"
                checked={liabilityAccepted}
                onChange={(event) =>
                  setLiabilityAccepted(
                    event.target.checked
                  )
                }
                className="mt-1 h-5 w-5 rounded text-brand-600"
              />

              <span className="text-sm text-error-800 dark:text-error-300">
                I accept full financial and legal
                liability for loss, theft, or damage to
                goods while they are in my care and
                transit.
              </span>

            </label>

            <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-brand-700 dark:bg-brand-800/30">

              <input
                type="checkbox"
                checked={termsChecked}
                onChange={(event) =>
                  setTermsChecked(
                    event.target.checked
                  )
                }
                className="mt-1 h-5 w-5 rounded text-brand-600"
                required
              />

              <span className="text-sm text-gray-700 dark:text-gray-300">
                I have read and agree to the Saka Krib
                Mover Terms and Conditions, including
                platform commission rates, service
                guidelines, compliance requirements and
                liability obligations.
              </span>

            </label>

          </section>

          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">
              {error}
            </div>
          )}

          {/* =================================================
              SUBMIT
          ================================================= */}

          <button
            type="submit"
            disabled={
              !termsAccepted ||
              !termsChecked ||
              submitting
            }
            className="btn-primary flex w-full items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />

                {sendingEmail
                  ? 'Sending confirmation...'
                  : 'Submitting registration...'}
              </>
            ) : (
              <>
                Submit Mover Registration
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

        </form>
      </TermsGate>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| STATUS CARD
|--------------------------------------------------------------------------
*/

function StatusCard({
  title,
  message,
  actionLabel,
  onAction,
  icon = 'default',
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?:
    | 'default'
    | 'success'
    | 'pending'
    | 'warning'
    | 'blocked';
}) {
  const Icon =
    icon === 'success'
      ? CheckCircle2
      : icon === 'warning'
      ? ShieldAlert
      : icon === 'pending'
      ? Loader2
      : ShieldCheck;

  const iconClass =
    icon === 'success'
      ? 'text-success-600'
      : icon === 'warning'
      ? 'text-warning-600'
      : icon === 'pending'
      ? 'animate-spin text-brand-600'
      : 'text-brand-600';

  return (
    <div className="mx-auto max-w-md px-4 py-20">

      <div className="card p-8 text-center">

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">
          <Icon
            className={`h-7 w-7 ${iconClass}`}
          />
        </div>

        <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {message}
        </p>

        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="btn-primary mt-6 inline-flex items-center gap-2"
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}

      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| FIELD
|--------------------------------------------------------------------------
*/

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = 'text',
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  icon?: typeof IdCard;
}) {
  return (
    <div>

      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}

        {required && (
          <span className="text-error-500">
            {' '}
            *
          </span>
        )}
      </label>

      <div className="relative">

        {Icon && (
          <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        )}

        <input
          type={type}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          className={`input-field ${
            Icon ? 'pl-10' : ''
          }`}
          required={required}
          min={
            type === 'number'
              ? 0
              : undefined
          }
        />

      </div>
    </div>
  );
}