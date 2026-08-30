import { useEffect, useState } from 'react';
import {
  MapPin,
  DollarSign,
  Phone,
  Mail,
  Image,
  Video,
  FileText,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Upload,
  CheckCircle2,
  Loader2,
  Home,
  ArrowLeft,
  AlertCircle,
  Save,
  Navigation,
  Search,
} from 'lucide-react';

import {
  KENYAN_CITIES,
  KENYAN_COUNTIES,
  cn,
} from '@/lib/utils';

import { useNav } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id?: string | number;
  type?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

interface SocialLink {
  platform: string;
  url: string;
}


interface ListingMedia {
  id?: string;
  listing_id?: string;
  user_id?: string;
  unit_id?: string | null;
  url: string;
  label?: string;
  type: 'photo' | 'video';
  media_type?: 'photo' | 'video';
  position?: number;
  created_at?: string;
}

interface LocalMediaItem extends ListingMedia {
  file?: File;
}

interface ListingForm {
  title: string;
  description: string;

  city: string;
  county: string;

  price_kes: string;

  listing_type: 'rent' | 'sale';

  deposit_required: boolean;
  deposit_structure: 'fixed' | 'installments' | null;
  deposit_amount: string;

  size: string;
  beds: string;
  baths: string;

  contact_phone: string;
  contact_email: string;

  social_links: {
    platform: string;
    url: string;
  }[];

  is_property_management: boolean;
  property_name: string;
  property_type: string;

  location_search: string;
  latitude: string;
  longitude: string;

  booking_enabled: boolean;
  payment_enabled: boolean;

  ai_caption: string;
  ai_caption_generated_at: string | null;
}

const INITIAL_FORM: ListingForm = {
  title: '',
  description: '',

  city: '',
  county: '',

  price_kes: '',

  listing_type: 'rent',

  deposit_required: false,
  deposit_structure: null,
  deposit_amount: '',

  size: '',
  beds: '',
  baths: '',

  contact_phone: '',
  contact_email: '',

  social_links: [],

  is_property_management: false,
  property_name: '',
  property_type: '',

  location_search: '',
  latitude: '',
  longitude: '',

  booking_enabled: false,
  payment_enabled: false,

  ai_caption: '',
  ai_caption_generated_at: null,
};

export default function ListingManagePage() {
  const {
    selectedListingManageId,
    navigate,
  } = useNav();

  const [form, setForm] =
    useState<ListingForm>(INITIAL_FORM);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState(false);


  const [photos, setPhotos] =
    useState<LocalMediaItem[]>([]);

  const [video, setVideo] =
    useState<LocalMediaItem | null>(null);
  const [socialLinks, setSocialLinks] =
      useState<SocialLink[]>([]);
  // ==========================================================
  // LOCATION STATE
  // ==========================================================

  const [city, setCity] =
    useState('');

  const [customCity, setCustomCity] =
    useState('');

  const [county, setCounty] =
    useState('');

  const [latitude, setLatitude] =
    useState<number | null>(null);

  const [longitude, setLongitude] =
    useState<number | null>(null);

  const [locationSearch, setLocationSearch] =
    useState('');

  const [locationSuggestions, setLocationSuggestions] =
    useState<LocationSuggestion[]>([]);

  const [usingGPS, setUsingGPS] =
    useState(false);


    // ==========================================================
    // UPLOAD LIMITS
    // ==========================================================

    const MAX_PHOTOS = 7;
    const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB
    const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB


    // ==========================================================
    // PHOTO UPLOAD
    // ==========================================================

    const handlePhotoUpload = (files: FileList | null) => {
    if (!files || files.length === 0) {
        return;
    }

    const currentPhotoCount = photos.length;
    const remaining = MAX_PHOTOS - currentPhotoCount;

    if (remaining <= 0) {
        setError(
        `You can upload a maximum of ${MAX_PHOTOS} photos.`
        );
        return;
    }

    const selectedFiles = Array.from(files).slice(
        0,
        remaining
    );

    const validFiles: File[] = [];

    for (const file of selectedFiles) {
        if (!file.type.startsWith('image/')) {
        setError(
            `${file.name} is not a valid image file.`
        );
        continue;
        }

        if (file.size > MAX_PHOTO_SIZE) {
        setError(
            `${file.name} is too large. Each photo must be 10 MB or smaller.`
        );
        continue;
        }

        validFiles.push(file);
    }

    if (validFiles.length === 0) {
        return;
    }

    const newPhotos: LocalMediaItem[] =
        validFiles.map((file, index) => ({
        file,
        url: URL.createObjectURL(file),
        label: `Photo ${
            currentPhotoCount + index + 1
        }`,
        type: 'photo',
        media_type: 'photo',
        }));

    setPhotos((current) => [
        ...current,
        ...newPhotos,
    ]);

    setError(null);
    };


    // ==========================================================
    // VIDEO UPLOAD
    // ==========================================================

    const handleVideoUpload = (file: File | null) => {
    if (!file) {
        return;
    }

    if (!file.type.startsWith('video/')) {
        setError(
        'Please select a valid video file.'
        );
        return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
        setError(
        'Video is too large. Maximum allowed size is 100 MB.'
        );
        return;
    }

    // Revoke previous LOCAL video preview only.
    if (
        video?.url &&
        video.url.startsWith('blob:')
    ) {
        URL.revokeObjectURL(video.url);
    }

    const previewUrl =
        URL.createObjectURL(file);

    const newVideo: LocalMediaItem = {
        file,
        url: previewUrl,
        label: 'Walkthrough Video',
        type: 'video',
        media_type: 'video',
    };

    setVideo(newVideo);
    setError(null);
    };


    // ==========================================================
    // PHOTO LABEL
    // ==========================================================

    const updatePhotoLabel = (
    index: number,
    label: string
    ) => {
    setPhotos((current) =>
        current.map((photo, i) =>
        i === index
            ? {
                ...photo,
                label,
            }
            : photo
        )
    );

    setSuccess(false);
    };


    // ==========================================================
    // REMOVE PHOTO
    // ==========================================================

    const removePhoto = (index: number) => {
    setPhotos((current) => {
        const photo = current[index];

        if (
        photo?.file &&
        photo.url.startsWith('blob:')
        ) {
        URL.revokeObjectURL(photo.url);
        }

        return current.filter(
        (_, i) => i !== index
        );
    });

    setSuccess(false);
    };


    // ==========================================================
    // REMOVE VIDEO
    // ==========================================================

    const removeVideo = () => {
    if (
        video?.file &&
        video.url.startsWith('blob:')
    ) {
        URL.revokeObjectURL(video.url);
    }

    setVideo(null);
    setSuccess(false);
    };


    // ==========================================================
    // CLEAN UP LOCAL BLOB URLS
    // ==========================================================

    useEffect(() => {
    return () => {
        photos.forEach((photo) => {
        if (
            photo.file &&
            photo.url.startsWith('blob:')
        ) {
            URL.revokeObjectURL(photo.url);
        }
        });

        if (
        video?.file &&
        video.url.startsWith('blob:')
        ) {
        URL.revokeObjectURL(video.url);
        }
    };
    }, []);


  // ==========================================================
  // SOCIAL LINKS
  // ==========================================================

  const addSocialLink = () => {
    setSocialLinks(
      (current) => [
        ...current,
        {
          platform: 'WhatsApp',
          url: '',
        },
      ]
    );
  };


  const updateSocialLink = (
    index: number,
    field: 'platform' | 'url',
    value: string
  ) => {
    setSocialLinks(
      (current) =>
        current.map(
          (link, i) =>
            i === index
              ? { ...link, [field]: value }
              : link
        )
    );
  };


  const removeSocialLink = (
    index: number
  ) => {
    setSocialLinks(
      (current) =>
        current.filter(
          (_, i) => i !== index
        )
    );
  };
  

  // ==========================================================
  // LOAD LISTING
  // ==========================================================

  useEffect(() => {
    if (!selectedListingManageId) {
      setLoading(false);
      setError('No listing was selected.');
      return;
    }

    loadListing(selectedListingManageId);
  }, [selectedListingManageId]);

  const loadListing = async (
    listingId: string
  ) => {
    try {
      setLoading(true);
      setError(null);

     const { data, error: fetchError } = await supabase
        .from('listings')
        .select(`
            id,
            user_id,
            title,
            description,
            city,
            county,
            price_kes,
            listing_type,
            deposit_required,
            deposit_structure,
            deposit_amount,
            size,
            beds,
            baths,
            contact_phone,
            contact_email,
            social_links,
            is_property_management,
            property_name,
            property_type,
            location_search,
            latitude,
            longitude,
            booking_enabled,
            payment_enabled,
            ai_caption,
            ai_caption_generated_at,
            created_at,
            updated_at
        `)
        .eq('id', listingId)
        .single();

        if (fetchError) {
        throw fetchError;
        }

        if (!data) {
        throw new Error('Listing not found.');
        }

        /* ============================================================
        * FETCH LISTING MEDIA
        * ============================================================ */

        const {
            data: mediaData,
            error: mediaError,
            } = await supabase
            .from('listing_media')
            .select(`
                id,
                listing_id,
                user_id,
                url,
                label,
                media_type,
                position,
                created_at,
                unit_id
            `)
            .eq('listing_id', listingId)
            .order('position', {
                ascending: true,
            });

            if (mediaError) {
            throw mediaError;
            }

            /* ============================================================
            * LOAD PHOTOS
            * ============================================================ */

            const listingPhotos: LocalMediaItem[] =
            (mediaData ?? [])
                .filter(
                (media) => media.media_type === 'photo'
                )
                .map((media) => ({
                id: media.id,
                listing_id: media.listing_id,
                user_id: media.user_id,
                unit_id: media.unit_id,
                url: media.url,
                label:
                    media.label ??
                    `Photo ${(media.position ?? 0) + 1}`,
                type: 'photo',
                media_type: 'photo',
                position: media.position ?? 0,
                created_at: media.created_at,
                }));

            /* ============================================================
            * LOAD WALKTHROUGH VIDEO
            * ============================================================ */

            const listingVideoRecord =
            (mediaData ?? []).find(
                (media) => media.media_type === 'video'
            );

            const listingVideo: LocalMediaItem | null =
            listingVideoRecord
                ? {
                    id: listingVideoRecord.id,
                    listing_id:
                    listingVideoRecord.listing_id,
                    user_id:
                    listingVideoRecord.user_id,
                    unit_id:
                    listingVideoRecord.unit_id,
                    url: listingVideoRecord.url,
                    label:
                    listingVideoRecord.label ??
                    'Walkthrough Video',
                    type: 'video',
                    media_type: 'video',
                    position:
                    listingVideoRecord.position ?? 0,
                    created_at:
                    listingVideoRecord.created_at,
                }
                : null;

            /* ============================================================
            * SET MEDIA PREVIEWS
            * ============================================================ */

            setPhotos(listingPhotos);
            setVideo(listingVideo);

      
      const loadedLatitude =
        data.latitude !== null &&
        data.latitude !== undefined
          ? Number(data.latitude)
          : null;

      const loadedLongitude =
        data.longitude !== null &&
        data.longitude !== undefined
          ? Number(data.longitude)
          : null;

      const loadedCity =
        data.city ?? '';

      const loadedCounty =
        data.county ?? '';

      const loadedLocation =
        data.location_search ?? '';

      setForm({
        title: data.title ?? '',
        description: data.description ?? '',

        city: data.city ?? '',
        county: data.county ?? '',

        price_kes:
            data.price_kes !== null &&
            data.price_kes !== undefined
            ? String(data.price_kes)
            : '',

        listing_type:
            data.listing_type ?? 'rent',

        deposit_required:
            data.deposit_required ?? false,

        deposit_structure:
            data.deposit_structure ?? null,

        deposit_amount:
            data.deposit_amount !== null &&
            data.deposit_amount !== undefined
            ? String(data.deposit_amount)
            : '',

        size: data.size ?? '',

        beds:
            data.beds !== null &&
            data.beds !== undefined
            ? String(data.beds)
            : '',

        baths:
            data.baths !== null &&
            data.baths !== undefined
            ? String(data.baths)
            : '',

        contact_phone:
            data.contact_phone ?? '',

        contact_email:
            data.contact_email ?? '',

        social_links:
            data.social_links ?? [],

        is_property_management:
            data.is_property_management ?? false,

        property_name:
            data.property_name ?? '',

        property_type:
            data.property_type ?? '',

        location_search:
            data.location_search ?? '',

        latitude:
            data.latitude !== null &&
            data.latitude !== undefined
            ? String(data.latitude)
            : '',

        longitude:
            data.longitude !== null &&
            data.longitude !== undefined
            ? String(data.longitude)
            : '',

        booking_enabled:
            data.booking_enabled ?? false,

        payment_enabled:
            data.payment_enabled ?? false,

        ai_caption:
            data.ai_caption ?? '',

        ai_caption_generated_at:
            data.ai_caption_generated_at ?? null,
        });

      // Synchronize existing location state.
      setCity(loadedCity);
      setCounty(loadedCounty);
      setLocationSearch(loadedLocation);
      setLatitude(loadedLatitude);
      setLongitude(loadedLongitude);

    } catch (err) {
      console.error(
        'Failed to load listing:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load listing.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // FORM HELPER
  // ==========================================================

  const updateField = (
    field: keyof ListingForm,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setSuccess(false);
    setError(null);
  };

  // ==========================================================
  // LOCATION SYNC HELPERS
  // ==========================================================

  const updateLocationField = (
    field:
      | 'city'
      | 'county'
      | 'location_search'
      | 'latitude'
      | 'longitude',
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setSuccess(false);
    setError(null);
  };

  // ==========================================================
  // LOCATION SEARCH
  // ==========================================================

  const searchPropertyLocation = async (
    query: string
  ) => {
    const trimmedQuery =
      query.trim();

    if (trimmedQuery.length < 3) {
      setLocationSuggestions([]);
      return;
    }

    try {
      const response =
        await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ke&q=${encodeURIComponent(
            trimmedQuery
          )}`,
          {
            headers: {
              Accept:
                'application/json',
            },
          }
        );

      if (!response.ok) {
        throw new Error(
          `Location search failed: ${response.status}`
        );
      }

      const data =
        await response.json();

      setLocationSuggestions(
        data.map(
          (item: any) => ({
            display_name:
              item.display_name,
            lat: item.lat,
            lon: item.lon,
            place_id:
              item.place_id,
            type: item.type,
            address:
              item.address,
          })
        )
      );
    } catch (err) {
      console.error(
        'Property location search failed:',
        err
      );

      setLocationSuggestions([]);
    }
  };

  // ==========================================================
  // LOCATION SEARCH DEBOUNCE
  // ==========================================================

  useEffect(() => {
    const query =
      locationSearch.trim();

    if (query.length < 3) {
      setLocationSuggestions([]);
      return;
    }

    const timeout =
      setTimeout(() => {
        searchPropertyLocation(
          query
        );
      }, 400);

    return () =>
      clearTimeout(timeout);
  }, [locationSearch]);

  // ==========================================================
  // SELECT LOCATION SUGGESTION
  // ==========================================================

  const selectLocationSuggestion = (
    suggestion: LocationSuggestion
  ) => {
    const selectedLatitude =
      Number(suggestion.lat);

    const selectedLongitude =
      Number(suggestion.lon);

    const address =
      suggestion.address;

    const detectedCounty =
      address?.county ||
      '';

    const detectedCity =
      address?.city ||
      address?.town ||
      address?.village ||
      '';

    const selectedLocation =
      suggestion.display_name;

    setLocationSearch(
      selectedLocation
    );

    setLatitude(
      Number.isFinite(
        selectedLatitude
      )
        ? selectedLatitude
        : null
    );

    setLongitude(
      Number.isFinite(
        selectedLongitude
      )
        ? selectedLongitude
        : null
    );

    if (detectedCounty) {
      setCounty(detectedCounty);
    }

    if (detectedCity) {
      setCity(detectedCity);
    }

    setForm((current) => ({
      ...current,

      location_search:
        selectedLocation,

      latitude:
        Number.isFinite(
          selectedLatitude
        )
          ? String(
              selectedLatitude
            )
          : '',

      longitude:
        Number.isFinite(
          selectedLongitude
        )
          ? String(
              selectedLongitude
            )
          : '',

      county:
        detectedCounty ||
        current.county,

      city:
        detectedCity ||
        current.city,
    }));

    setLocationSuggestions([]);
    setSuccess(false);
    setError(null);
  };

  // ==========================================================
  // GPS LOCATION
  // ==========================================================

  const handleUseGPS = () => {
    if (
      !navigator.geolocation
    ) {
      setError(
        'GPS location is not supported by this browser.'
      );
      return;
    }

    setUsingGPS(true);
    setError(null);
    setSuccess(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const gpsLatitude =
            position.coords.latitude;

          const gpsLongitude =
            position.coords.longitude;

          setLatitude(
            gpsLatitude
          );

          setLongitude(
            gpsLongitude
          );

          // Reverse geocode the GPS coordinates
          // so the existing location fields are
          // populated automatically.
          const response =
            await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${gpsLatitude}&lon=${gpsLongitude}`,
              {
                headers: {
                  Accept:
                    'application/json',
                },
              }
            );

          if (!response.ok) {
            throw new Error(
              'Unable to determine the address from your GPS location.'
            );
          }

          const data =
            await response.json();

          const address =
            data.address ?? {};

          const detectedCity =
            address.city ||
            address.town ||
            address.village ||
            '';

          const detectedCounty =
            address.county ||
            '';

          const detectedLocation =
            data.display_name ||
            `${gpsLatitude}, ${gpsLongitude}`;

          setCity(
            detectedCity
          );

          setCounty(
            detectedCounty
          );

          setLocationSearch(
            detectedLocation
          );

          setForm((current) => ({
            ...current,

            location_search:
              detectedLocation,

            latitude:
              String(
                gpsLatitude
              ),

            longitude:
              String(
                gpsLongitude
              ),

            city:
              detectedCity ||
              current.city,

            county:
              detectedCounty ||
              current.county,
          }));

          setLocationSuggestions([]);
        } catch (err) {
          console.error(
            'GPS reverse geocoding failed:',
            err
          );

          // GPS coordinates are still useful
          // even if address lookup fails.
          setForm((current) => ({
            ...current,

            latitude:
              String(
                position.coords.latitude
              ),

            longitude:
              String(
                position.coords.longitude
              ),
          }));

          setError(
            'GPS coordinates were captured, but the address could not be determined automatically. Please select the location manually.'
          );
        } finally {
          setUsingGPS(false);
        }
      },
      (geoError) => {
        console.error(
          'GPS error:',
          geoError
        );

        setUsingGPS(false);

        let message =
          'Unable to get your current location.';

        if (
          geoError.code ===
          geoError.PERMISSION_DENIED
        ) {
          message =
            'Location permission was denied. Please allow location access and try again.';
        } else if (
          geoError.code ===
          geoError.POSITION_UNAVAILABLE
        ) {
          message =
            'Your current location is unavailable. Please try again.';
        } else if (
          geoError.code ===
          geoError.TIMEOUT
        ) {
          message =
            'GPS location request timed out. Please try again.';
        }

        setError(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // ==========================================================
  // VALIDATION
  // ==========================================================

  const validateForm = () => {
    if (!form.title.trim()) {
      return 'Listing title is required.';
    }

    if (
      form.title.trim().length <
      3
    ) {
      return 'Listing title must contain at least 3 characters.';
    }

    if (!form.description.trim()) {
      return 'Property description is required.';
    }

    if (!form.property_type.trim()) {
      return 'Property type is required.';
    }

    if (!form.city.trim()) {
      return 'Please select or enter the city.';
    }

    if (!form.county.trim()) {
      return 'Please select or enter the county.';
    }

    if (
      !form.location_search.trim()
    ) {
      return 'Please provide the property location.';
    }

    const price =
      form.price_kes.trim() === ''
        ? null
        : Number(
            form.price_kes
          );

    if (
      price !== null &&
      (!Number.isFinite(price) ||
        price < 0)
    ) {
      return 'Please enter a valid price.';
    }

    const beds =
      form.beds.trim() === ''
        ? null
        : Number(form.beds);

    if (
      beds !== null &&
      (!Number.isFinite(beds) ||
        beds < 0)
    ) {
      return 'Please enter a valid number of bedrooms.';
    }

    const baths =
      form.baths.trim() === ''
        ? null
        : Number(form.baths);

    if (
      baths !== null &&
      (!Number.isFinite(baths) ||
        baths < 0)
    ) {
      return 'Please enter a valid number of bathrooms.';
    }

    if (
      form.deposit_required
    ) {
      if (
        !form.deposit_structure
      ) {
        return 'Please select a deposit payment structure.';
      }

      const depositAmount =
        form.deposit_amount.trim() === ''
          ? null
          : Number(
              form.deposit_amount
            );

      if (
        depositAmount === null ||
        !Number.isFinite(
          depositAmount
        ) ||
        depositAmount < 0
      ) {
        return 'Please enter a valid deposit amount.';
      }
    }

    const parsedLatitude =
      form.latitude.trim() === ''
        ? null
        : Number(
            form.latitude
          );

    const parsedLongitude =
      form.longitude.trim() === ''
        ? null
        : Number(
            form.longitude
          );

    if (
      parsedLatitude === null ||
      !Number.isFinite(
        parsedLatitude
      ) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90
    ) {
      return 'Please provide a valid GPS latitude.';
    }

    if (
      parsedLongitude === null ||
      !Number.isFinite(
        parsedLongitude
      ) ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      return 'Please provide a valid GPS longitude.';
    }

    if (
      form.contact_phone.trim() === '' &&
      form.contact_email.trim() === ''
    ) {
      return 'Please provide at least a phone number or email address.';
    }

    if (
      form.contact_email.trim() !== ''
    ) {
      const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (
        !emailPattern.test(
          form.contact_email.trim()
        )
      ) {
        return 'Please enter a valid email address.';
      }
    }

    return null;
  };

  // ==========================================================
  // SAVE
  // ==========================================================

    const handleSave = async (
        event: React.FormEvent
        ) => {
        event.preventDefault();

        if (!selectedListingManageId) {
            setError('No listing was selected.');
            return;
        }

        try {
            setSaving(true);
            setError(null);
            setSuccess(false);

            // ==========================================================
            // VALIDATION
            // ==========================================================

            const validationError = validateForm();

            if (validationError) {
            throw new Error(validationError);
            }

            // ==========================================================
            // PARSE NUMERIC FIELDS
            // ==========================================================

            const beds =
            form.beds.trim() === ''
                ? null
                : Number(form.beds);

            const baths =
            form.baths.trim() === ''
                ? null
                : Number(form.baths);

            const price_kes =
            form.price_kes.trim() === ''
                ? null
                : Number(form.price_kes);

            const deposit_amount =
            form.deposit_amount.trim() === ''
                ? null
                : Number(form.deposit_amount);

            const parsedLatitude =
            form.latitude.trim() === ''
                ? null
                : Number(form.latitude);

            const parsedLongitude =
            form.longitude.trim() === ''
                ? null
                : Number(form.longitude);

            // ==========================================================
            // SOCIAL LINKS
            // ==========================================================

            const cleanedSocialLinks = socialLinks
            .map((link) => ({
                platform: link.platform.trim(),
                url: link.url.trim(),
            }))
            .filter(
                (link) =>
                link.platform !== '' &&
                link.url !== ''
            );

            // ==========================================================
            // UPDATE LISTING
            //
            // IMPORTANT:
            // Do NOT update:
            // status
            // approval_status
            // admin_review_note
            // admin_reviewed_at
            // is_approved
            // is_published
            // is_paid
            // user_id
            // id
            // created_at
            // ==========================================================

            const listingUpdate = {
            title: form.title.trim(),

            description: form.description.trim(),

            city: form.city.trim(),

            county: form.county.trim(),

            price_kes,

            listing_type: form.listing_type,

            deposit_required:
                form.deposit_required,

            deposit_structure:
                form.deposit_required
                ? form.deposit_structure
                : null,

            deposit_amount:
                form.deposit_required
                ? deposit_amount
                : null,

            size:
                form.size.trim() || null,

            beds,

            baths,

            contact_phone:
                form.contact_phone.trim() || null,

            contact_email:
                form.contact_email.trim() || null,

            social_links:
                cleanedSocialLinks,

            is_property_management:
                form.is_property_management,

            property_name:
                form.is_property_management
                ? form.property_name.trim() || null
                : null,

            property_type:
                form.property_type.trim() || null,

            location_search:
                form.location_search.trim() || null,

            latitude: parsedLatitude,

            longitude: parsedLongitude,

            booking_enabled:
                form.booking_enabled,

            payment_enabled:
                form.payment_enabled,

            ai_caption:
                form.ai_caption.trim() || null,

            ai_caption_generated_at:
                form.ai_caption_generated_at || null,

            updated_at:
                new Date().toISOString(),
            };

            const {
            error: updateError,
            } = await supabase
            .from('listings')
            .update(listingUpdate)
            .eq(
                'id',
                selectedListingManageId
            );

            if (updateError) {
            throw updateError;
            }

            // ==========================================================
            // SAVE SOCIAL LINKS BACK TO LOCAL FORM STATE
            // ==========================================================

            setSocialLinks(cleanedSocialLinks);

            setForm((current) => ({
            ...current,
            social_links: cleanedSocialLinks,
            }));

            // ==========================================================
            // SAVE EXISTING MEDIA LABELS / POSITIONS
            //
            // New files still need Storage upload before they can be
            // inserted into listing_media.
            // ==========================================================

            const existingPhotos = photos.filter(
            (photo) =>
                photo.id &&
                !photo.file
            );

            for (
            let index = 0;
            index < existingPhotos.length;
            index++
            ) {
            const photo = existingPhotos[index];

            const {
                error: mediaUpdateError,
            } = await supabase
                .from('listing_media')
                .update({
                label:
                    photo.label?.trim() ||
                    `Photo ${index + 1}`,

                position: index,
                })
                .eq(
                'id',
                photo.id
                )
                .eq(
                'listing_id',
                selectedListingManageId
                );

            if (mediaUpdateError) {
                throw mediaUpdateError;
            }
            }

            // ==========================================================
            // SAVE EXISTING VIDEO LABEL
            // ==========================================================

            if (
            video?.id &&
            !video.file
            ) {
            const {
                error: videoUpdateError,
            } = await supabase
                .from('listing_media')
                .update({
                label:
                    video.label?.trim() ||
                    'Walkthrough Video',
                })
                .eq(
                'id',
                video.id
                )
                .eq(
                'listing_id',
                selectedListingManageId
                );

            if (videoUpdateError) {
                throw videoUpdateError;
            }
            }

            // ==========================================================
            // SUCCESS
            // ==========================================================

            setSuccess(true);

            window.scrollTo({
            top: 0,
            behavior: 'smooth',
            });

        } catch (err) {
            console.error(
            'Failed to update listing:',
            err
            );

            setError(
            err instanceof Error
                ? err.message
                : 'Failed to update listing.'
            );

            window.scrollTo({
            top: 0,
            behavior: 'smooth',
            });

        } finally {
            setSaving(false);
        }
        };

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="card mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-2 py-4 text-center sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>
            Loading listing...
          </span>
        </div>
      </div>
    );
  }

  // ==========================================================
  // NO LISTING
  // ==========================================================

  if (!selectedListingManageId) {
    return (
      <div className="card mx-auto max-w-7xl overflow-hidden px-2 py-8 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
          <button
            type="button"
            onClick={() =>
              navigate('my-listings')
            }
            className="mb-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            My Listings
          </button>

          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Manage Listing
          </h2>
        </div>

        <div className="p-5">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />

              <div>
                <h3 className="font-semibold text-red-800 dark:text-red-300">
                  Listing not selected
                </h3>

                <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                  Please return to your listings and select a listing to manage.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate('my-listings')
              }
              className="btn-primary mt-5"
            >
              Back to My Listings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div className="card mx-auto max-w-7xl overflow-hidden px-2 py-4 sm:px-6 lg:px-8">
      {/* HEADER */}

      <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">
        <button
          type="button"
          onClick={() =>
            navigate('my-listings')
          }
          className="mb-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          My Listings
        </button>

        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Manage Listing
        </h2>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Update the information for this listing.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="space-y-6 p-5"
      >
        {/* SUCCESS */}

        {success && (
          <div className="flex items-start gap-3 rounded-2xl border border-success-200 bg-success-50 p-4 text-sm text-success-700 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-400">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-semibold">
                Listing updated successfully.
              </p>

              <p className="mt-0.5 text-xs">
                Your changes have been saved.
              </p>
            </div>
          </div>
        )}

        {/* ERROR */}

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ======================================================
            BASIC INFORMATION
        ====================================================== */}

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-brand-800 dark:bg-brand-900/30">
          <div className="mb-5">
            <h3 className="font-bold text-gray-900 dark:text-white">
              Basic Information
            </h3>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Update the main information shown on your listing.
            </p>
          </div>

          {/* ======================================================
            * MEDIA
            * ====================================================== */}

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-brand-800 dark:bg-brand-900/30">

            <div className="mb-5">
                <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                    <Image className="h-4 w-4" />
                </div>

                <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">
                    Property Media
                    </h3>

                    <p className="text-sm text-gray-500 dark:text-gray-400">
                    Update property photos and walkthrough video.
                    </p>
                </div>
                </div>
            </div>

            {/* PHOTOS */}

            <div>
                <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Photos
                </label>

                <span className="text-xs text-gray-400">
                    {photos.length}/{MAX_PHOTOS}
                </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">

                {photos.map(
                    (photo, index) => (
                    <div
                        key={`photo-${index}`}
                        className="group relative"
                    >

                        <img
                        src={photo.url}
                        alt={
                            photo.label ||
                            `Property photo ${
                            index + 1
                            }`
                        }
                        className="h-32 w-full rounded-xl object-cover"
                        />

                        <button
                        type="button"
                        onClick={() =>
                            removePhoto(index)
                        }
                        className="absolute right-2 top-2 rounded-full bg-red-600 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Remove photo ${
                            index + 1
                        }`}
                        >
                        <X className="h-3.5 w-3.5" />
                        </button>

                        <input
                        type="text"
                        value={photo.label}
                        onChange={(event) =>
                            updatePhotoLabel(
                            index,
                            event.target.value
                            )
                        }
                        placeholder="Photo label"
                        className="input-field mt-2 text-xs"
                        />

                    </div>
                    )
                )}

                {photos.length < MAX_PHOTOS && (
                    <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500">

                    <Upload className="h-6 w-6 text-gray-400" />

                    <span className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Add Photos
                    </span>

                    <span className="mt-1 text-[10px] text-gray-400">
                        Max 10 MB each
                    </span>

                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                        handlePhotoUpload(
                            event.target.files
                        );

                        event.target.value = '';
                        }}
                    />

                    </label>
                )}

                </div>

                <p className="mt-2 text-xs text-gray-400">
                Maximum {MAX_PHOTOS} photos. Each photo must
                be 10 MB or smaller.
                </p>
            </div>


            {/* VIDEO */}

            <div className="mt-6 border-t border-gray-200 pt-6 dark:border-brand-800">

                <div className="flex items-center justify-between">

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Walkthrough Video
                    </label>

                    <p className="mt-1 text-xs text-gray-400">
                    Optional. Maximum 100 MB.
                    </p>
                </div>

                </div>

                <div className="mt-3">

                {video ? (

                    <div className="relative overflow-hidden rounded-xl">

                    <video
                        src={video.url}
                        controls
                        className="h-52 w-full rounded-xl object-cover"
                    />

                    <button
                        type="button"
                        onClick={removeVideo}
                        className="absolute right-2 top-2 rounded-full bg-red-600 p-1.5 text-white"
                        aria-label="Remove walkthrough video"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    </div>

                ) : (

                    <label className="flex h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 transition-colors hover:border-brand-400 dark:border-brand-700 dark:hover:border-brand-500">

                    <Video className="h-7 w-7 text-gray-400" />

                    <span className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                        Upload Walkthrough Video
                    </span>

                    <span className="mt-1 text-xs text-gray-400">
                        MP4, WebM or MOV · Max 100 MB
                    </span>

                    <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        className="hidden"
                        onChange={(event) => {
                        const file =
                            event.target.files?.[0] ??
                            null;

                        handleVideoUpload(file);

                        event.target.value = '';
                        }}
                    />

                    </label>

                )}

                </div>

            </div>

            </div>


            {/* ======================================================
                * SOCIAL / DIRECT LINKS
                * ====================================================== */}

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-brand-800 dark:bg-brand-900/30">

                <div className="mb-5 flex items-center justify-between gap-4">

                    <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">
                        Social / Direct Links
                    </h3>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Add WhatsApp, social media, website or other
                        direct contact links.
                    </p>
                    </div>

                    <button
                    type="button"
                    onClick={addSocialLink}
                    className="btn-ghost shrink-0 text-xs"
                    >
                    <Plus className="h-4 w-4" />
                    Add Link
                    </button>

                </div>

                {socialLinks.length === 0 ? (

                    <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center dark:border-brand-700">

                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No social or direct links added.
                    </p>

                    <button
                        type="button"
                        onClick={addSocialLink}
                        className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                    >
                        + Add your first link
                    </button>

                    </div>

                ) : (

                    <div className="space-y-3">

                    {socialLinks.map(
                        (link, index) => (

                        <div
                            key={`social-${index}`}
                            className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-brand-700 dark:bg-brand-950 sm:flex-row"
                        >

                            <select
                            value={link.platform}
                            onChange={(event) =>
                                updateSocialLink(
                                index,
                                'platform',
                                event.target.value
                                )
                            }
                            className="input-field sm:w-40"
                            >
                            <option value="WhatsApp">
                                WhatsApp
                            </option>

                            <option value="Facebook">
                                Facebook
                            </option>

                            <option value="Instagram">
                                Instagram
                            </option>

                            <option value="TikTok">
                                TikTok
                            </option>

                            <option value="X">
                                X / Twitter
                            </option>

                            <option value="Website">
                                Website
                            </option>

                            <option value="Other">
                                Other
                            </option>
                            </select>

                            <input
                            type="url"
                            value={link.url}
                            onChange={(event) =>
                                updateSocialLink(
                                index,
                                'url',
                                event.target.value
                                )
                            }
                            placeholder="https://..."
                            className="input-field flex-1"
                            />

                            <button
                            type="button"
                            onClick={() =>
                                removeSocialLink(index)
                            }
                            className="self-end rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 sm:self-center"
                            aria-label={`Remove ${
                                link.platform
                            } link`}
                            >
                            <X className="h-4 w-4" />
                            </button>

                        </div>

                        )
                    )}

                    </div>

                )}

                </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Listing Title
              </label>

              <input
                type="text"
                value={form.title}
                onChange={(event) =>
                  updateField(
                    'title',
                    event.target.value
                  )
                }
                className="input-field"
                placeholder="e.g. Modern 2 Bedroom Apartment"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Property Type
              </label>

              <input
                type="text"
                value={form.property_type}
                onChange={(event) =>
                  updateField(
                    'property_type',
                    event.target.value
                  )
                }
                className="input-field"
                placeholder="Apartment"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Listing Type
              </label>

              <select
                value={form.listing_type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    listing_type:
                      event.target.value as
                        | 'rent'
                        | 'sale',
                  }))
                }
                className="input-field"
              >
                <option value="rent">
                  Rent
                </option>

                <option value="sale">
                  Sale
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Price (KES)
              </label>

              <input
                type="number"
                min="0"
                value={form.price_kes}
                onChange={(event) =>
                  updateField(
                    'price_kes',
                    event.target.value
                  )
                }
                className="input-field"
                placeholder="0"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Bedrooms
              </label>

              <input
                type="number"
                min="0"
                value={form.beds}
                onChange={(event) =>
                  updateField(
                    'beds',
                    event.target.value
                  )
                }
                className="input-field"
                placeholder="0"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Bathrooms
              </label>

              <input
                type="number"
                min="0"
                step="0.5"
                value={form.baths}
                onChange={(event) =>
                  updateField(
                    'baths',
                    event.target.value
                  )
                }
                className="input-field"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* ======================================================
            DESCRIPTION
        ====================================================== */}

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-brand-800 dark:bg-brand-900/30">
          <h3 className="font-bold text-gray-900 dark:text-white">
            Description
          </h3>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Give potential tenants useful information about the property.
          </p>

          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Property Description
            </label>

            <textarea
              value={form.description}
              onChange={(event) =>
                updateField(
                  'description',
                  event.target.value
                )
              }
              rows={7}
              className="input-field resize-y px-10 py-7"
              placeholder="Describe the property..."
            />
          </div>
        </div>

        {/* ======================================================
            LOCATION
        ====================================================== */}

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-brand-800 dark:bg-brand-900/30">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
              <MapPin className="h-4 w-4" />
            </div>

            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">
                Property Location
              </h3>

              <p className="text-sm text-gray-500 dark:text-gray-400">
                Search for the property or use your current GPS location.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {/* SEARCH */}

            <div className="relative">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Location Search
              </label>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  type="text"
                  value={
                    form.location_search
                  }
                  onChange={(event) => {
                    const value =
                      event.target.value;

                    setLocationSearch(
                      value
                    );

                    updateLocationField(
                      'location_search',
                      value
                    );
                  }}
                  className="input-field pl-10 pr-32"
                  placeholder="Search estate, road, building, area..."
                />

                <button
                  type="button"
                  onClick={
                    handleUseGPS
                  }
                  disabled={usingGPS}
                  className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {usingGPS ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Navigation className="h-3.5 w-3.5" />
                  )}

                  {usingGPS
                    ? 'Locating...'
                    : 'Use GPS'}
                </button>
              </div>

              {/* SEARCH RESULTS */}

              {locationSuggestions.length >
                0 && (
                <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-brand-700 dark:bg-brand-900">
                  {locationSuggestions.map(
                    (
                      suggestion,
                      index
                    ) => (
                      <button
                        key={
                          suggestion.place_id ??
                          `${suggestion.lat}-${suggestion.lon}-${index}`
                        }
                        type="button"
                        onClick={() =>
                          selectLocationSuggestion(
                            suggestion
                          )
                        }
                        className="block w-full border-b border-gray-100 px-2 py-3 text-left text-sm transition hover:bg-brand-50 dark:border-brand-800 dark:hover:bg-brand-800"
                      >
                        <div className="flex items-start gap-2">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />

                          <span className="text-gray-700 dark:text-gray-200">
                            {
                              suggestion.display_name
                            }
                          </span>
                        </div>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* CITY / COUNTY */}

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  County
                </label>

                <select
                  value={
                    form.county
                  }
                  onChange={(event) => {
                    const value =
                      event.target.value;

                    setCounty(value);

                    updateLocationField(
                      'county',
                      value
                    );
                  }}
                  className="input-field"
                >
                  <option value="">
                    Select county...
                  </option>

                  {KENYAN_COUNTIES.map(
                    (
                      item: string
                    ) => (
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

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  City / Town
                </label>

                <select
                  value={
                    form.city
                  }
                  onChange={(event) => {
                    const value =
                      event.target.value;

                    setCity(value);

                    updateLocationField(
                      'city',
                      value
                    );
                  }}
                  className="input-field"
                >
                  <option value="">
                    Select city / town...
                  </option>

                  {KENYAN_CITIES.map(
                    (
                      item: string
                    ) => (
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

            {/* OPTIONAL CUSTOM CITY */}

            {form.city ===
              'Other' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Custom City / Town
                </label>

                <input
                  type="text"
                  value={
                    customCity
                  }
                  onChange={(event) => {
                    const value =
                      event.target.value;

                    setCustomCity(
                      value
                    );

                    updateLocationField(
                      'city',
                      value
                    );
                  }}
                  className="input-field"
                  placeholder="Enter city or town"
                />
              </div>
            )}

            {/* GPS COORDINATES */}

            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-900/20">
              <div className="flex items-start gap-3">
                <Navigation className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />

                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">
                    GPS Location
                  </p>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    GPS coordinates are stored with the listing for accurate map and navigation features.
                  </p>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="text-xs text-gray-400">
                        Latitude
                      </span>

                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                        {form.latitude ||
                          'Not captured'}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs text-gray-400">
                        Longitude
                      </span>

                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                        {form.longitude ||
                          'Not captured'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================
            ACTIONS
        ====================================================== */}

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end dark:border-brand-800">
          <button
            type="button"
            onClick={() =>
              navigate(
                'my-listings'
              )
            }
            disabled={saving}
            className="btn-secondary"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className={cn(
              'btn-primary',
              saving &&
                'cursor-not-allowed opacity-70'
            )}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}

            {saving
              ? 'Saving...'
              : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};