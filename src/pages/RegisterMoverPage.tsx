import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';

import "@/pages/calendarIndex.css";

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
  MapPin,
  Clock3,
  Check,
  CalendarDays
} from 'lucide-react';


import GPSLocationInput, {
  type GPSLocationValue,
} from '@/components/Helpers/GPSLocationInput';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import TermsGate from '@/components/TermsGate';
import DocumentCapture from '@/components/DocumentCapture';
import DatePicker from 'react-datepicker';

import "react-datepicker/dist/react-datepicker.css";

import { protectedPost, protectedFunctionPost } from '@/lib/djangoLegacyApi';

import {
  VEHICLE_TYPES,
  KENYAN_CITIES,
  KENYAN_COUNTIES,
  validateNationalID,
  validateDL,
  validatePhone,
  validateKenyanMobilePhone,
  validateMpesaPaybill,
  validateMpesaTill,
  getPlatformSettings
} from '@/lib/utils';

/*
|--------------------------------------------------------------------------
| PAYMENT CHANNELS
|--------------------------------------------------------------------------
*/

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

interface MoverApplicationResponse {
  success: boolean;
  code?: string;
  status?: string;
  message?: string;
  mover_id?: string;
  profile_id?: string;
}

type PaymentChannel =
  (typeof PAYMENT_CHANNELS)[number]['value'];

type VehicleType =
  | 'pickup'
  | 'lorry'
  | 'trailer';

interface ReferenceContact {
  name: string;
  phone: string;
  relationship: string;
}

type EmailType =
  | 'mover_application_submitted'
  | 'mover_admin_notification';


   const DAYS = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ] as const;

  type Day = (typeof DAYS)[number];

  const DEFAULT_DAYS: Day[] = [...DAYS];
  const DEFAULT_START = '08:00';
  const DEFAULT_END = '18:00';  
/*
|--------------------------------------------------------------------------
| EMAIL FUNCTION
|--------------------------------------------------------------------------
*/
async function sendRegistrationEmail(
  type: EmailType,
  applicationData: Record<string, unknown>
): Promise<boolean> {
  try {
    await protectedFunctionPost(
      '/send-notification-emails',
      {
        type,
        application: applicationData,
      }
    );

    return true;
  } catch (error) {
    console.error(
      `Failed to request ${type} email:`,
      error
    );

    return false;
  }
}
/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

export default function RegisterMoverPage() {
  const {
    profile,
    refreshProfile,
  } = useAuth();

  const {
    navigate,
    setAuthModalOpen,
    setRoleModalOpen,
  } = useNav();

  /*
  |--------------------------------------------------------------------------
  | FORM STATE
  |--------------------------------------------------------------------------
  */

  const [termsAccepted, setTermsAccepted] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState(false);

  const [emailStatus, setEmailStatus] =
    useState<
      'pending' | 'sent' | 'failed'
    >('pending');

  const [firstName, setFirstName] =
    useState('');

  const [middleName, setMiddleName] =
    useState('');

  const [lastName, setLastName] =
    useState('');

  const [nationalId, setNationalId] =
    useState('');

  const [dlNumber, setDlNumber] =
    useState('');

  const [dlPhotoUrl, setDlPhotoUrl] =
    useState('');

  const [vehicleType, setVehicleType] =
    useState<VehicleType>('pickup');

  const [capacity, setCapacity] =
    useState('');

  const [numberPlate, setNumberPlate] =
    useState('');

  const [city, setCity] =
    useState('');

  const [county, setCounty] =
    useState('');

  const [phone, setPhone] =
    useState('');

  const [paymentChannel, setPaymentChannel] =
    useState<PaymentChannel>(
      'mpesa_send_money'
    );

  const [paymentAccount, setPaymentAccount] =
    useState('');

  const [baseRate, setBaseRate] =
    useState('');

  const [ratePerKm, setRatePerKm] =
    useState('');

  const [insuranceDetails, setInsuranceDetails] =
    useState('');

  const [inspectionExpiry, setInspectionExpiry] =
    useState('');

  const [workingDays, setWorkingDays] =
    useState<Day[]>(DEFAULT_DAYS);

  const [startTime, setStartTime] =
    useState(DEFAULT_START);

  const [endTime, setEndTime] =
    useState(DEFAULT_END);  

  const [scheduleError, setScheduleError] =
    useState<string | null>(null);

  /*
  |--------------------------------------------------------------------------
  | GPS LOCATION STATE
  |--------------------------------------------------------------------------
  */

  const [latitude, setLatitude] =
    useState<number | null>(null);

  const [longitude, setLongitude] =
    useState<number | null>(null);

  const [location, setLocation] =
    useState('');

  const [liabilityAccepted, setLiabilityAccepted] =
    useState(false);

  const [references, setReferences] =
    useState<ReferenceContact[]>([
      {
        name: '',
        phone: '',
        relationship: '',
      },
    ]);

  const [refError, setRefError] =
    useState<string | null>(null);

  const [platformSettings, setPlatformSettings] =
    useState<
      Awaited<ReturnType<typeof getPlatformSettings>> | null
    >(null);  

  /*
  |--------------------------------------------------------------------------
  | PREFILL PROFILE DATA
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!profile) {
      return;
    }

    setFirstName(
      profile.first_name ?? ''
    );

    setMiddleName(
      profile.middle_name ?? ''
    );

    setLastName(
      profile.last_name ?? ''
    );

    setNationalId(
      profile.national_id ?? ''
    );

    setPhone(
      profile.phone ?? ''
    );
  }, [profile]);



    /*
      |--------------------------------------------------------------------------
      | LOAD PLATFORM SETTINGS
      |--------------------------------------------------------------------------
      */

      useEffect(() => {
        let mounted = true;

        const loadPlatformSettings = async () => {
          try {
            const settings =
              await getPlatformSettings();

            if (mounted) {
              setPlatformSettings(settings);
            }
          } catch (settingsError) {
            console.error(
              'Failed to load platform settings:',
              settingsError
            );

            if (mounted) {
              setPlatformSettings(null);
            }
          }
        };

        loadPlatformSettings();

        return () => {
          mounted = false;
        };
      }, []);

      const COMMISSION_RATE =
        platformSettings?.mover_commission_rate != null
          ? Number(platformSettings.mover_commission_rate) * 100
          : null;

  /*
  |--------------------------------------------------------------------------
  | NO PROFILE
  |--------------------------------------------------------------------------
  */

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <div className="card p-8">
          <Truck className="mx-auto h-10 w-10 text-brand-600" />

          <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Sign in required
          </h2>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Please sign in to continue with mover
            registration.
          </p>

          <button
            type="button"
            onClick={() =>
              setAuthModalOpen(true)
            }
            className="btn-primary mt-6"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ALREADY APPROVED
  |--------------------------------------------------------------------------
  */

  if (
    profile.mover_application_status ===
    'approved'
  ) {
    return (
      <StatusCard
        icon="success"
        title="Mover application approved"
        message="Your mover application has been approved. You can now manage your mover services from your dashboard."
        actionLabel="Open Dashboard"
        onAction={() =>
          navigate('dashboard')
        }
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ALREADY PENDING
  |--------------------------------------------------------------------------
  */

  if (
    profile.mover_application_status ===
    'pending'
  ) {
    return (
      <StatusCard
        icon="pending"
        title="Your application is under review"
        message="Your mover application has been submitted successfully and is currently being reviewed by our administration team. You do not need to submit another application. This page is temporarily unavailable until your review is completed."
        actionLabel="Go to Dashboard"
        onAction={() =>
          navigate('dashboard')
        }
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ROLE SELECTION
  |--------------------------------------------------------------------------
  */

  if (profile.role === null) {
    return (
      <StatusCard
        icon="warning"
        title="Choose your professional role"
        message="Please select your account role before registering as a mover."
        actionLabel="Choose Role"
        onAction={() =>
          setRoleModalOpen(true)
        }
      />
    );
  }

  if (profile.role !== 'renter' && profile.role !== 'mover') {
    return (
      <StatusCard
        icon="blocked"
        title="Mover registration unavailable"
        message="Mover registration is available from a renter account. Your current account role cannot submit a mover application."
        actionLabel="Home"
        onAction={() =>
          navigate('home')
        }
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | REFERENCES
  |--------------------------------------------------------------------------
  */

  const updateReference = (
    index: number,
    field: keyof ReferenceContact,
    value: string
  ) => {
    setReferences((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index
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

    setRefError(null);
  };

  const removeReference = (
    index: number
  ) => {
    setReferences((items) =>
      items.filter(
        (_, itemIndex) =>
          itemIndex !== index
      )
    );

    setRefError(null);
  };

  const validateReferences =
    (): ReferenceContact[] | null => {
      const valid = references
        .map((reference) => ({
          name: reference.name.trim(),
          phone: reference.phone.trim(),
          relationship:
            reference.relationship.trim(),
        }))
        .filter(
          (reference) =>
            reference.name ||
            reference.phone ||
            reference.relationship
        );

      if (valid.length === 0) {
        setRefError(
          'Add at least one representative reference contact.'
        );

        return null;
      }

      for (const reference of valid) {
        if (
          !reference.name ||
          !reference.phone ||
          !reference.relationship
        ) {
          setRefError(
            'All reference fields (name, phone, relationship) are required.'
          );

          return null;
        }

        if (
          reference.name.length < 2
        ) {
          setRefError(
            'Reference names must be at least 2 characters.'
          );

          return null;
        }

        if (
          !validatePhone(reference.phone)
        ) {
          setRefError(
            'Please enter a valid Kenyan phone number for every reference.'
          );

          return null;
        }
      }

      const names = valid.map(
        (reference) =>
          reference.name.toLowerCase()
      );

      if (
        new Set(names).size !==
        names.length
      ) {
        setRefError(
          'Duplicate reference names are not allowed.'
        );

        return null;
      }

      const phones = valid.map(
        (reference) =>
          reference.phone.replace(
            /\s+/g,
            ''
          )
      );

      if (
        new Set(phones).size !==
        phones.length
      ) {
        setRefError(
          'Duplicate reference phone numbers are not allowed.'
        );

        return null;
      }

      return valid;
    };

  /*
  |--------------------------------------------------------------------------
  | SUBMIT
  |--------------------------------------------------------------------------
  */

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (submitting) {
      return;
    }

    setError(null);
    setRefError(null);

    if (!profile) {
      setError(
        'Please sign in to continue.'
      );

      return;
    }

    if (
      profile.role !== 'renter' &&
      profile.role !== 'mover'
    ) {
      setError(
        'Only renter or mover accounts can submit a mover application.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | PERSONAL DETAILS
    |--------------------------------------------------------------------------
    */

    const trimmedFirstName =
      firstName.trim();

    const trimmedMiddleName =
      middleName.trim();

    const trimmedLastName =
      lastName.trim();

    const trimmedNationalId =
      nationalId.trim();

    const trimmedDlNumber =
      dlNumber.trim();

    const trimmedPhone =
      phone.trim();

    if (
      !trimmedFirstName ||
      !trimmedLastName
    ) {
      setError(
        'First name and last name are required.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | NATIONAL ID
    |--------------------------------------------------------------------------
    */

    if (
      !validateNationalID(
        trimmedNationalId
      )
    ) {
      setError(
        'National ID must be 7-8 digits.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | DRIVING LICENSE
    |--------------------------------------------------------------------------
    */

    if (
      !validateDL(
        trimmedDlNumber
      )
    ) {
      setError(
        'Please enter a valid driving license number.'
      );

      return;
    }

    const trimmedDlPhotoPath =
      dlPhotoUrl.trim();

    if (!trimmedDlPhotoPath) {
      setError(
        'Please take or upload your driving license photo.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | PHONE
    |--------------------------------------------------------------------------
    */

    if (
      !validatePhone(trimmedPhone)
    ) {
      setError(
        'Please enter a valid Kenyan phone number.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | VEHICLE
    |--------------------------------------------------------------------------
    */

    const trimmedNumberPlate =
      numberPlate
        .trim()
        .toUpperCase();

    const trimmedCapacity =
      capacity.trim();

    if (
      !trimmedNumberPlate ||
      !city ||
      !county ||
      !trimmedCapacity
    ) {
      setError(
        'Complete your vehicle and operating details.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | GPS LOCATION VALIDATION
    |--------------------------------------------------------------------------
    */

    if (
      latitude === null ||
      longitude === null
    ) {
      setError(
        'Please capture your current GPS location before submitting your mover registration.'
      );

      return;
    }

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      setError(
        'The captured latitude is invalid.'
      );

      return;
    }

    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError(
        'The captured longitude is invalid.'
      );

      return;
    }

    const trimmedLocation =
      location.trim();

    if (!trimmedLocation) {
      setError(
        'Please provide the location returned by GPS.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | RATES
    |--------------------------------------------------------------------------
    */

    const parsedBaseRate =
      baseRate.trim()
        ? Number(baseRate)
        : 0;

    const parsedRatePerKm =
      ratePerKm.trim()
        ? Number(ratePerKm)
        : 0;

    if (
      !Number.isFinite(parsedBaseRate) ||
      parsedBaseRate < 0
    ) {
      setError(
        'Base rate must be a valid non-negative amount.'
      );

      return;
    }

    if (
      !Number.isFinite(parsedRatePerKm) ||
      parsedRatePerKm < 0
    ) {
      setError(
        'Rate per kilometer must be a valid non-negative amount.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | PAYOUT
    |--------------------------------------------------------------------------
    */

    const trimmedPaymentAccount =
      paymentAccount.trim();

    if (!trimmedPaymentAccount) {
      setError(
        'Add the payout account used for receiving payments.'
      );
      return;
    }

    switch (paymentChannel) {
      case 'mpesa_send_money':
      case 'airtel_money':
        if (
          !validateKenyanMobilePhone(
            trimmedPaymentAccount
          )
        ) {
          setError(
            'Please enter a valid Kenyan mobile money phone number.'
          );
          return;
        }
        break;

      case 'mpesa_paybill':
        if (
          !validateMpesaPaybill(
            trimmedPaymentAccount
          )
        ) {
          setError(
            'Please enter a valid M-Pesa Paybill number.'
          );
          return;
        }
        break;

      case 'mpesa_lipa_na_mpesa':
        if (
          !validateMpesaTill(
            trimmedPaymentAccount
          )
        ) {
          setError(
            'Please enter a valid M-Pesa Till/Business number.'
          );
          return;
        }
        break;

      default:
        setError(
          'Unsupported payment channel.'
        );
        return;
    }

    /*
    |--------------------------------------------------------------------------
    | INSURANCE
    |--------------------------------------------------------------------------
    */

    const trimmedInsuranceDetails =
      insuranceDetails.trim();

    if (!trimmedInsuranceDetails) {
      setError(
        'Insurance policy details are required.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | INSPECTION
    |--------------------------------------------------------------------------
    */

    if (!inspectionExpiry) {
      setError(
        'Vehicle inspection expiration date is required.'
      );

      return;
    }

    const inspectionDate =
      new Date(
        `${inspectionExpiry}T00:00:00`
      );

    if (
      Number.isNaN(
        inspectionDate.getTime()
      )
    ) {
      setError(
        'Please provide a valid vehicle inspection expiration date.'
      );

      return;
    }

    const today =
      new Date();

    today.setHours(
      0,
      0,
      0,
      0
    );

    if (inspectionDate < today) {
      setError(
        'Vehicle inspection must not already be expired.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | LIABILITY
    |--------------------------------------------------------------------------
    */

    if (!liabilityAccepted) {
      setError(
        'You must accept full liability for goods in transit.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | TERMS
    |--------------------------------------------------------------------------
    */

    if (!termsAccepted) {
      setError(
        'You must accept the Terms and Conditions.'
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | REFERENCES
    |--------------------------------------------------------------------------
    */

    const validReferences =
      validateReferences();

    if (!validReferences) {
      return;
    }


    /*
    |--------------------------------------------------------------------------
    | WORKING SCHEDULE
    |--------------------------------------------------------------------------
    */

    const submittedWorkingDays: Day[] = [...workingDays];

    const submittedStartTime = startTime.trim();

    const submittedEndTime = endTime.trim();

    if (submittedWorkingDays.length === 0) {
      setScheduleError(
        'Select at least one working day before submitting.'
      );
      return;
    }

    if (!submittedStartTime || !submittedEndTime) {
      setScheduleError(
        'Start time and end time are required.'
      );
      return;
    }

    if (submittedEndTime <= submittedStartTime) {
      setScheduleError(
        'End time must be later than the start time.'
      );
      return;
    }

    setScheduleError(null);

    /*
    |--------------------------------------------------------------------------
    | SUBMISSION
    |--------------------------------------------------------------------------
    */

    setSubmitting(true);

    try {
      const fullName = [
        trimmedFirstName,
        trimmedMiddleName,
        trimmedLastName,
      ]
        .filter(Boolean)
        .join(' ');

      /*
      |--------------------------------------------------------------------------
      | APPLICATION PAYLOAD
      |--------------------------------------------------------------------------
      */

      const application = {
        driver_full_name:
          fullName,

        national_id:
          trimmedNationalId,

        dl_number:
          trimmedDlNumber,

        dl_photo_url:
          trimmedDlPhotoPath,

        vehicle_type:
          vehicleType,

        number_plate:
          trimmedNumberPlate,

        operating_city:
          city,

        operating_county:
          county,

        phone:
          trimmedPhone,

        base_rate_kes:
          parsedBaseRate,

        rate_per_km_kes:
          parsedRatePerKm,

        capacity_details:
          trimmedCapacity,

        payment_channel:
          paymentChannel,

        payment_account:
          trimmedPaymentAccount,

        liability_accepted:
          true,

        insurance_policy_details:
          trimmedInsuranceDetails,

        vehicle_inspection_expiry:
          inspectionExpiry,

        terms_accepted:
          true,

        reference_contacts:
          validReferences,

        /*
        |--------------------------------------------------------------------------
        | GPS DATA
        |--------------------------------------------------------------------------
        */

        latitude,

        longitude,

        location:

          trimmedLocation,


         /*
        |--------------------------------------------------------------------------
        | WORKING SCHEDULE
        |--------------------------------------------------------------------------
        */

        working_days:
          submittedWorkingDays,

        start_time:
          submittedStartTime,

        end_time:
          submittedEndTime, 

        /*
        |--------------------------------------------------------------------------
        | NOTIFICATION METADATA
        |--------------------------------------------------------------------------
        */

        applicant_name:
          fullName,

        applicant_email:
          profile.email,

        application_type:
          'mover',

        submitted_at:
          new Date().toISOString(),
      };

      /*
      |--------------------------------------------------------------------------
      | DATABASE SUBMISSION
      |--------------------------------------------------------------------------
      */

      console.log(
        '[MOVER APPLICATION] FINAL SCHEDULE SUBMISSION',
        {
          working_days: submittedWorkingDays,
          start_time: submittedStartTime,
          end_time: submittedEndTime,
        }
      );

      console.log(
        '[MOVER APPLICATION] FULL PAYLOAD',
        application
      );

      const submissionResult =
        await protectedPost<MoverApplicationResponse>(
          '/rest/v1/rpc/submit_mover_application',
          {
            p_application: application,
          }
        );

      if (!submissionResult?.success) {
        const code =
          submissionResult?.code;

        const message =
          submissionResult?.message?.trim();

        switch (code) {
          case 'MOVER_APPLICATION_ALREADY_PENDING':
            setError(
              'Your mover application has already been submitted and is currently under review. You cannot submit another application until the administrator completes the review.'
            );
            return;

          case 'MOVER_ALREADY_APPROVED':
            setError(
              'Your mover application has already been approved. You can manage your mover services from your dashboard.'
            );
            return;

          case 'MOVER_APPLICATION_ALREADY_EXISTS':
            setError(
              'A mover application already exists for your account. Please refresh the page to view its current status.'
            );
            return;

          case 'PROFILE_NOT_FOUND':
            setError(
              'We could not find your account profile. Please sign in again and try again.'
            );
            return;

          case 'INVALID_ROLE':
            setError(
              'Only renter accounts can submit a mover application.'
            );
            return;

          case 'MOVER_EVIDENCE_REQUIRED':
            setError(
              'Your driving licence photo and vehicle number plate are required before you can submit your mover application.'
            );
            return;

          case 'VEHICLE_CAPACITY_REQUIRED':
            setError(
              'Please provide your vehicle capacity details before submitting your mover application.'
            );
            return;

          case 'TERMS_NOT_ACCEPTED':
            setError(
              'Please accept the Mover Terms and Conditions before submitting your application.'
            );
            return;

          case 'INVALID_LATITUDE':
          case 'INVALID_LONGITUDE':
            setError(
              'Your GPS location could not be verified. Please capture your current location again.'
            );
            return;

          case 'INVALID_APPLICATION_DATA':
            setError(
              'Some of the information in your application is invalid. Please review the form and try again.'
            );
            return;

          default:
            setError(
              message ||
                'We could not submit your mover application. Please review the form and try again.'
            );
            return;
        }
      }

      /*
      |--------------------------------------------------------------------------
      | REFRESH PROFILE
      |--------------------------------------------------------------------------
      */

      try {
        await refreshProfile();
      } catch (profileError) {
        console.error(
          'Profile refresh after mover submission failed:',
          profileError
        );
      }

      /*
      |--------------------------------------------------------------------------
      | EMAILS
      |--------------------------------------------------------------------------
      */

      const applicantEmailSent =
        await sendRegistrationEmail(
          'mover_application_submitted',
          application
        );

      const adminEmailSent =
        await sendRegistrationEmail(
          'mover_admin_notification',
          application
        );

      setEmailStatus(
        applicantEmailSent &&
          adminEmailSent
          ? 'sent'
          : 'failed'
      );

      setSuccess(true);
    } catch (submissionError) {
      console.error(
        'Mover submission failed:',
        submissionError
      );

      const protectedError =
        submissionError as {
          message?: string;
          status?: number;
          code?: string;
        };

      if (
        protectedError.status ===
        401
      ) {
        setError(
          'Your login session has expired. Please sign in again.'
        );

        return;
      }

      if (
        protectedError.status ===
        403
      ) {
        setError(
          'You are not authorized to submit a mover application.'
        );

        return;
      }

      const message =
        protectedError.message?.trim();

      if (message) {
        setError(message);
      } else {
        setError(
          'Something went wrong while submitting your mover registration. Please try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | SUCCESS
  |--------------------------------------------------------------------------
  */

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-2 py-12">
        <div className="card animate-scale-in p-8 text-center">

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
            <CheckCircle2 className="h-10 w-10 text-success-600" />
          </div>

          <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
            Mover registration submitted
          </h2>

          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Your mover application has been
            successfully submitted and is now
            waiting for administrator approval.
          </p>

          {emailStatus === 'sent' && (
            <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-left dark:border-brand-700 dark:bg-brand-900/20">
              <div className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />

                <div>
                  <p className="font-semibold text-brand-900 dark:text-brand-200">
                    Confirmation emails sent
                  </p>

                  <p className="mt-1 text-sm text-brand-700 dark:text-brand-300">
                    A confirmation was sent to
                    your registered email address
                    and the administration team was
                    notified.
                  </p>
                </div>
              </div>
            </div>
          )}

          {emailStatus === 'failed' && (
            <div className="mt-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-left dark:border-warning-800 dark:bg-warning-900/20">
              <div className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" />

                <div>
                  <p className="font-semibold text-warning-900 dark:text-warning-200">
                    Application submitted
                  </p>

                  <p className="mt-1 text-sm text-warning-700 dark:text-warning-300">
                    Your application was saved
                    successfully. We could not confirm
                    delivery of one or more notification
                    emails, but this does not affect
                    your application.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                navigate('movers')
              }
              className="btn-primary"
            >
              View Movers
            </button>

            <button
              type="button"
              onClick={() =>
                navigate('dashboard')
              }
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
  |--------------------------------------------------------------------------
  | FORM
  |--------------------------------------------------------------------------
  */

  return (
    <div className="mx-auto max-w-3xl px-2 py-8 sm:px-6">

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
            capacity, compliance information and
            payout details.
          </p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-2 py-3 dark:border-brand-700 dark:bg-brand-800/30">
        <Percent className="h-5 w-5 shrink-0 text-brand-600" />

        <p className="text-sm text-brand-700 dark:text-brand-300">
          <span className="font-semibold">
            {COMMISSION_RATE}% platform fee:
          </span>{' '}
          payouts release through the platform
          escrow workflow.
        </p>
      </div>

      <TermsGate
        context="mover"
        onAccept={() => {
          setTermsAccepted(true);
          setError(null);
        }}
      >
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-6"
        >

          {/* PERSONAL DETAILS */}

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
                inputMode="numeric"
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

          {/* DRIVING LICENSE */}

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
              onUploaded={(
                storagePath: string
              ) => {
                setError(null);
                setDlPhotoUrl(
                  storagePath
                );
              }}
            />
          </section>

          {/* VEHICLE */}

          <section className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Truck className="h-5 w-5 text-brand-600" />
              Vehicle and service capacity
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">

              <SelectField
                label="Vehicle Type"
                value={vehicleType}
                onChange={(value) =>
                  setVehicleType(
                    value as VehicleType
                  )
                }
                options={VEHICLE_TYPES.map(
                  (item) => ({
                    value: item.value,
                    label: item.label,
                  })
                )}
              />

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

              <SelectField
                label="Operating City"
                value={city}
                onChange={setCity}
                placeholder="Select city..."
                options={KENYAN_CITIES.map(
                  (item) => ({
                    value: item,
                    label: item,
                  })
                )}
                required
              />

              <SelectField
                label="County"
                value={county}
                onChange={setCounty}
                placeholder="Select county..."
                options={KENYAN_COUNTIES.map(
                  (item) => ({
                    value: item,
                    label: item,
                  })
                )}
                required
              />

              <Field
                label="Base Rate (KES)"
                value={baseRate}
                onChange={setBaseRate}
                type="number"
                min={0}
                step="0.01"
              />

              <Field
                label="Rate per Kilometer (KES)"
                value={ratePerKm}
                onChange={setRatePerKm}
                type="number"
                min={0}
                step="0.01"
              />

            </div>
          </section>

          {/* GPS LOCATION */}

          <section className="card p-6">
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <MapPin className="h-5 w-5 text-brand-600" />
              Current GPS location
            </h3>

            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
              Capture your current operating location.
              This helps customers and administrators
              identify where your moving service is based.
            </p>

            <GPSLocationInput
              value={{
                locationSearch: location,
                latitude,
                longitude,
              }}
              onChange={({
                latitude: nextLatitude,
                longitude: nextLongitude,
                locationSearch: nextLocation,
              }: GPSLocationValue) => {
                setLatitude(nextLatitude);
                setLongitude(nextLongitude);
                setLocation(nextLocation);
                setError(null);
              }}
            />

            {(latitude !== null ||
              longitude !== null ||
              location) && (
              <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/20">
                <div className="grid gap-3 sm:grid-cols-3">

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Latitude
                    </p>

                    <p className="mt-1 font-mono text-sm text-gray-900 dark:text-white">
                      {latitude !== null
                        ? latitude.toFixed(7)
                        : 'Not captured'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Longitude
                    </p>

                    <p className="mt-1 font-mono text-sm text-gray-900 dark:text-white">
                      {longitude !== null
                        ? longitude.toFixed(7)
                        : 'Not captured'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Location
                    </p>

                    <p className="mt-1 text-sm text-gray-900 dark:text-white">
                      {location ||
                        'Not resolved'}
                    </p>
                  </div>

                </div>
              </div>
            )}
          </section>


          {/* WORKING SCHEDULE */}

          <section className="card p-6">
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <CalendarDays className="h-5 w-5 text-brand-600" />
              Working days and hours
            </h3>

            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
              Select the days and hours when customers can request your
              moving service.
            </p>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Working days
                <span className="text-error-500"> *</span>
              </label>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {DAYS.map((day) => {
                  const selected =
                    workingDays.includes(day);

                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setWorkingDays((current) =>
                          current.includes(day)
                            ? current.filter(
                                (item) => item !== day
                              )
                            : [...current, day]
                        );

                        setScheduleError(null);
                        setError(null);
                      }}
                      className={
                        `flex min-h-11 items-center justify-center gap-1.5 border px-3 py-2 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/40 btn-secondary ` +
                        (selected
                          ? 'border-brand-600 bg-brand-600 text-white shadow-sm dark:border-brand-500 bg-brand-50 '
                          : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50 dark:border-brand-700 dark:bg-brand-900/20 dark:text-gray-200 dark:hover:border-brand-500 dark:hover:bg-brand-800/40')
                      }
                    >
                      {selected && (
                        <Check
                          className="h-4 w-4"
                          strokeWidth={2.5}
                        />
                      )}

                      <span>
                        {day.slice(0, 3)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Start time
                  <span className="text-error-500"> *</span>
                </label>

                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />

                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => {
                      setStartTime(
                        event.target.value
                      );
                      setScheduleError(null);
                      setError(null);
                    }}
                    className="input-field w-full pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  End time
                  <span className="text-error-500"> *</span>
                </label>

                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />

                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => {
                      setEndTime(
                        event.target.value
                      );
                      setScheduleError(null);
                      setError(null);
                    }}
                    className="input-field w-full pl-10"
                    required
                  />
                </div>
              </div>
            </div>

            {scheduleError && (
              <p className="mt-3 text-sm text-error-600 dark:text-error-400">
                {scheduleError}
              </p>
            )}
          </section>


          {/* COMPLIANCE */}

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
                  <Calendar className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <DatePicker
                    selected={
                      inspectionExpiry
                        ? new Date(
                            `${inspectionExpiry}T00:00:00`
                          )
                        : null
                    }
                    onChange={(
                      date: Date | null
                    ) => {
                      if (!date) {
                        setInspectionExpiry('');
                        return;
                      }

                      const year =
                        date.getFullYear();

                      const month =
                        String(
                          date.getMonth() + 1
                        ).padStart(2, '0');

                      const day =
                        String(
                          date.getDate()
                        ).padStart(2, '0');

                      setInspectionExpiry(
                        `${year}-${month}-${day}`
                      );
                    }}
                    minDate={new Date()}
                    dateFormat="MMMM d, yyyy"
                    placeholderText="Select expiry date"
                    className="input-field w-full border border-brand-200 bg-brand-50 p-4 text-left dark:border-brand-700 dark:bg-brand-900/20"
                    wrapperClassName="w-full"
                    showPopperArrow={false}
                    showMonthDropdown
                    showYearDropdown
                    dropdownMode="select"
                    required
                  />
                </div>
              </div>

            </div>
          </section>

          {/* REFERENCES */}

          <section className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Users className="h-5 w-5 text-brand-600" />
              Representative references
            </h3>

            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Add people we can contact if you
              are unavailable. Duplicate names or
              phone numbers are not allowed.
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
                    value={
                      reference.relationship
                    }
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
                        removeReference(
                          index
                        )
                      }
                      className="btn-ghost text-sm text-error-600 ring-[.5px] ring-red-500"
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

          {/* PAYOUT */}

          <section className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Wallet className="h-5 w-5 text-brand-600" />
              Payout method
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">

              <SelectField
                label="Payment Channel"
                value={paymentChannel}
                onChange={(value) =>
                  setPaymentChannel(
                    value as PaymentChannel
                  )
                }
                options={PAYMENT_CHANNELS.map(
                  (item) => ({
                    value: item.value,
                    label: item.label,
                  })
                )}
              />

              <Field
                label="Mobile money number / account"
                value={paymentAccount}
                onChange={setPaymentAccount}
                required
                placeholder="Registered payout number"
              />

            </div>
          </section>

          {/* LIABILITY + TERMS */}

          <section className="card space-y-4 p-6">

            <label className="flex items-start gap-3 rounded-lg border border-error-200 bg-error-100 p-4 dark:border-error-800 dark:bg-error-900/20">

              <input
                type="checkbox"
                checked={liabilityAccepted}
                onChange={(event) => {
                  setLiabilityAccepted(
                    event.target.checked
                  );
                  setError(null);
                }}
                className="mt-1 h-5 w-5 rounded text-brand-600"
              />

              <span className="text-sm text-error-800 dark:text-red-400">
                I accept full financial and legal
                liability for loss, theft, or damage
                to goods while they are in my care and
                transit.
              </span>

            </label>

            <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-brand-700 dark:bg-brand-800/30">

              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => {
                  setTermsAccepted(
                    event.target.checked
                  );
                  setError(null);
                }}
                className="mt-1 h-5 w-5 rounded text-brand-600"
              />

              <span className="text-sm text-gray-700 dark:text-gray-300">
                I have read and agree to the Saka
                Krib Mover Terms and Conditions,
                including platform commission rates,
                service guidelines, compliance
                requirements and liability obligations.
              </span>

            </label>

          </section>

          {/* ERROR */}

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-lg bg-error-50 px-2 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400"
            >
              {error}
            </div>
          )}

          {/* SUBMIT */}

          <button
            type="submit"
            disabled={
              !termsAccepted ||
              !liabilityAccepted ||
              submitting
            }
            className="btn-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting registration...
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
    <div className="mx-auto max-w-md px-2 py-20">
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
| SELECT FIELD
|--------------------------------------------------------------------------
*/

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
  placeholder?: string;
  required?: boolean;
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

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="input-field"
        required={required}
      >
        {placeholder && (
          <option value="">
            {placeholder}
          </option>
        )}

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>

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
  inputMode,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  icon?: typeof IdCard;
  inputMode?:
    | 'none'
    | 'text'
    | 'decimal'
    | 'numeric'
    | 'tel'
    | 'search'
    | 'email'
    | 'url';
  min?: number;
  step?: string;
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
            onChange(
              event.target.value
            )
          }
          placeholder={placeholder}
          className={`input-field ${
            Icon ? 'pl-10' : ''
          }`}
          required={required}
          inputMode={inputMode}
          min={min}
          step={step}
        />

      </div>
    </div>
  );
}