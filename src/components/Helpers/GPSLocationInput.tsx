import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  MapPin,
  Search,
  Navigation,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

export interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id?: number;
  type?: string;
  address?: Record<string, string>;
}

export interface GPSLocationValue {
  locationSearch: string;
  latitude: number | null;
  longitude: number | null;
}

interface GPSLocationInputProps {
  value: GPSLocationValue;

  onChange: (value: GPSLocationValue) => void;

  /**
   * Optional label displayed above the input.
   */
  label?: string;

  /**
   * Optional placeholder.
   */
  placeholder?: string;

  /**
   * Whether the field is required.
   */
  required?: boolean;

  /**
   * Optional error message.
   */
  error?: string | null;

  /**
   * Optional className for the outer container.
   */
  className?: string;
}

// ============================================================
// COMPONENT
// ============================================================

export default function GPSLocationInput({
  value,
  onChange,
  label = 'Location',
  placeholder = 'Search for your location...',
  required = false,
  error = null,
  className = '',
}: GPSLocationInputProps) {
  const [locationSuggestions, setLocationSuggestions] =
    useState<LocationSuggestion[]>([]);

  const [usingGPS, setUsingGPS] =
    useState(false);

  const [searching, setSearching] =
    useState(false);

  const [gpsError, setGpsError] =
    useState<string | null>(null);

  const searchTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const abortControllerRef =
    useRef<AbortController | null>(null);

  // ==========================================================
  // CLEANUP
  // ==========================================================

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      abortControllerRef.current?.abort();
    };
  }, []);

  // ==========================================================
  // LOCATION CHANGE
  // ==========================================================

  const updateLocation = (
    changes: Partial<GPSLocationValue>
  ) => {
    onChange({
      ...value,
      ...changes,
    });
  };

  // ==========================================================
  // SEARCH LOCATION
  // ==========================================================

  const searchLocations = (
    searchValue: string
  ) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    abortControllerRef.current?.abort();

    if (searchValue.trim().length < 3) {
      setLocationSuggestions([]);
      setSearching(false);
      return;
    }

    searchTimeoutRef.current =
      setTimeout(async () => {
        setSearching(true);

        const controller =
          new AbortController();

        abortControllerRef.current =
          controller;

        try {
          const response =
            await fetch(
              `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(
                searchValue.trim()
              )}`,
              {
                headers: {
                  Accept:
                    'application/json',
                  'Accept-Language':
                    'en',
                },
                signal:
                  controller.signal,
              }
            );

          if (!response.ok) {
            throw new Error(
              'Unable to search locations.'
            );
          }

          const data =
            await response.json();

          if (
            !controller.signal.aborted &&
            Array.isArray(data)
          ) {
            setLocationSuggestions(
              data
            );
          }
        } catch (err) {
          if (
            err instanceof DOMException &&
            err.name === 'AbortError'
          ) {
            return;
          }

          console.error(
            'Location search failed:',
            err
          );

          setLocationSuggestions([]);
        } finally {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        }
      }, 500);
  };

  // ==========================================================
  // INPUT CHANGE
  // ==========================================================

  const handleInputChange = (
    searchValue: string
  ) => {
    setGpsError(null);

    updateLocation({
      locationSearch: searchValue,
      latitude: null,
      longitude: null,
    });

    searchLocations(searchValue);
  };

  // ==========================================================
  // SELECT LOCATION
  // ==========================================================

  const handleSelectLocation = (
    location: LocationSuggestion
  ) => {
    const latitude =
      Number(location.lat);

    const longitude =
      Number(location.lon);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    setGpsError(null);

    updateLocation({
      locationSearch:
        location.display_name,
      latitude,
      longitude,
    });

    setLocationSuggestions([]);
  };

  // ==========================================================
  // GPS
  // ==========================================================

  const handleUseCurrentLocation =
    () => {
      setGpsError(null);

      if (
        typeof navigator === 'undefined' ||
        !navigator.geolocation
      ) {
        setGpsError(
          'Location services are not available in this browser. Please use a browser that supports GPS location.'
        );

        return;
      }

      /*
       * Browser geolocation requires a secure context.
       *
       * localhost is normally considered secure for
       * development, but an HTTP LAN/Tailscale address
       * generally is not.
       */
      if (
        typeof window !== 'undefined' &&
        !window.isSecureContext
      ) {
        setGpsError(
          'GPS location requires a secure connection (HTTPS). Please open Saka Krib using HTTPS or localhost.'
        );

        return;
      }

      /*
       * Cancel any pending location search before
       * requesting the device location.
       */
      if (searchTimeoutRef.current) {
        clearTimeout(
          searchTimeoutRef.current
        );
        searchTimeoutRef.current = null;
      }

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      setSearching(false);
      setUsingGPS(true);
      setLocationSuggestions([]);

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const latitude =
            position.coords.latitude;

          const longitude =
            position.coords.longitude;

          /*
           * Validate coordinates returned by
           * the browser before using them.
           */
          if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
          ) {
            setGpsError(
              'Your device returned an invalid GPS location. Please try again.'
            );

            setUsingGPS(false);
            return;
          }

          /*
           * Store coordinates immediately.
           *
           * This means GPS registration can still work
           * even when reverse geocoding fails.
           */
          updateLocation({
            latitude,
            longitude,
          });

          try {
            /*
             * Reverse geocode the coordinates so the
             * human-readable location is also populated.
             */
            const response =
              await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
                  latitude
                )}&lon=${encodeURIComponent(
                  longitude
                )}&addressdetails=1`,
                {
                  headers: {
                    Accept:
                      'application/json',
                    'Accept-Language':
                      'en',
                  },
                }
              );

            if (!response.ok) {
              throw new Error(
                'Unable to determine the address.'
              );
            }

            const data =
              await response.json();

            const detectedLocation =
              typeof data?.display_name ===
              'string'
                ? data.display_name
                : '';

            /*
             * Update the human-readable location
             * while preserving the GPS coordinates.
             */
            updateLocation({
              locationSearch:
                detectedLocation,
              latitude,
              longitude,
            });

            /*
             * Show the detected location as a
             * selectable result.
             */
            if (detectedLocation) {
              setLocationSuggestions([
                {
                  display_name:
                    detectedLocation,

                  lat:
                    String(latitude),

                  lon:
                    String(longitude),

                  place_id:
                    data?.place_id,

                  type:
                    data?.type,

                  address:
                    data?.address,
                },
              ]);
            }

            setGpsError(null);
          } catch (err) {
            console.error(
              'GPS reverse geocoding failed:',
              err
            );

            /*
             * IMPORTANT:
             *
             * GPS coordinates were already saved above.
             *
             * Reverse geocoding failure should NOT
             * invalidate the GPS location.
             */
            setGpsError(
              'Your GPS location was captured, but we could not determine the address. You can continue using the captured coordinates.'
            );

            updateLocation({
              latitude,
              longitude,
            });
          } finally {
            setUsingGPS(false);
          }
        },

        (geoError) => {
          console.error(
            'Geolocation error:',
            geoError
          );

          let message =
            'Unable to get your current location. Please try again.';

          switch (
            geoError.code
          ) {
            case geoError.PERMISSION_DENIED:
              message =
                'Location permission was denied. Please allow location access for this site in your browser settings and try again.';
              break;

            case geoError.POSITION_UNAVAILABLE:
              message =
                'Your current location could not be determined. Please make sure GPS/location services are enabled on your device and try again.';
              break;

            case geoError.TIMEOUT:
              message =
                'The request for your current location timed out. Please try again.';
              break;

            default:
              message =
                'Unable to get your current location. Please try again.';
          }

          setGpsError(message);
          setUsingGPS(false);
        },

        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0,
        }
      );
    };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className={className}>
      {label && (
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}

          {required && (
            <span className="ml-1 text-error-600">
              *
            </span>
          )}
        </label>
      )}

      <div className="relative">
        {/* ====================================================
            SEARCH INPUT
        ==================================================== */}

        <div className="relative">
          <MapPin
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-500"
          />

          <input
            type="text"
            value={
              value.locationSearch
            }
            onChange={(event) =>
              handleInputChange(
                event.target.value
              )
            }
            placeholder={placeholder}
            required={required}
            autoComplete="off"
            className="input-field w-full border border-brand-200 bg-brand-50 p-4 pl-11 text-left dark:border-brand-700 dark:bg-brand-900/20"
          />

          {searching && (
            <Loader2
              className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-brand-500"
            />
          )}

          {!searching &&
            value.locationSearch.length ===
              0 && (
              <Search
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              />
            )}
        </div>

        {/* ====================================================
            SEARCH SUGGESTIONS
        ==================================================== */}

        {locationSuggestions.length >
          0 && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-brand-200 bg-brand-50 shadow-lg dark:border-brand-700 dark:bg-brand-900">
            {locationSuggestions.map(
              (
                location,
                index
              ) => (
                <button
                  key={`${location.display_name}-${index}`}
                  type="button"
                  onClick={() =>
                    handleSelectLocation(
                      location
                    )
                  }
                  className="flex w-full items-start gap-3 border-b border-brand-100 px-2 py-3 text-left text-sm last:border-b-0 hover:bg-brand-100 dark:border-brand-800 dark:hover:bg-brand-800"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />

                  <span className="text-gray-700 dark:text-gray-200">
                    {
                      location.display_name
                    }
                  </span>
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* ======================================================
          GPS BUTTON
      ====================================================== */}

      <button
        type="button"
        onClick={
          handleUseCurrentLocation
        }
        disabled={usingGPS}
        className="btn-secondary mt-3 flex w-full items-center justify-center gap-2"
      >
        {usingGPS ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Getting your location...
          </>
        ) : (
          <>
            <Navigation className="h-4 w-4" />
            Use My Current Location
          </>
        )}
      </button>

      {/* ======================================================
          GPS ERROR
      ====================================================== */}

      {gpsError && (
        <p
          className="mt-2 text-sm text-error-600 dark:text-error-400"
          role="alert"
          aria-live="polite"
        >
          {gpsError}
        </p>
      )}

      {/* ======================================================
          COORDINATES
      ====================================================== */}

      {value.latitude !== null &&
        value.longitude !== null && (
          <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-gray-500 dark:bg-brand-900/30 dark:text-gray-400">
            <span className="font-medium">
              GPS:
            </span>{' '}
            {value.latitude.toFixed(6)},{' '}
            {value.longitude.toFixed(6)}
          </div>
        )}

      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && (
        <p className="mt-2 text-sm text-error-600">
          {error}
        </p>
      )}
    </div>
  );
};