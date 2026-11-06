# Saka Krib rental-request email, Firebase push, and app links

## What the request flow now does

When a renter successfully requests an available PMS unit:

1. Django creates the pending `RenterUnitAssociation`.
2. Django creates the owner's `RENTER_UNIT_REQUESTED` in-app notification.
3. After the database transaction commits, the existing Firebase Admin sender attempts delivery to every active native device token registered to that owner.
4. Django queues the dedicated `renter_unit_request` HTML email for the existing Celery email worker.
5. The email button opens `/app/pms-dashboard`. Customer-facing email buttons now use the same central `SAKAKRIB_APP_LINK_BASE_URL` origin and `/app/<route>` format. Android verified App Links open the installed APK when available; otherwise the website fallback translates the link into the existing frontend route. Account-security, listing, mover-booking, mover-tracking, dashboard, PMS, and subscription emails follow this convention. Password-reset email links use `/app/reset-password` and preserve the one-time `uid` and `token` query parameters through both native and browser routing. Administrator application-review emails open `/app/dashboard`; the signed-in administrator's role routes the dashboard to the administration interface.

Push delivery is best-effort. The database notification remains authoritative if Firebase is unavailable.

## Backend environment

Configure these on the Django deployment:

- `SAKAKRIB_APP_LINK_BASE_URL=https://sakakrib.com` (or the actual public frontend origin).
- `FIREBASE_PROJECT_ID=<Firebase project ID>`.
- `FIREBASE_SERVICE_ACCOUNT_JSON=<service-account JSON>`, or `FIREBASE_SERVICE_ACCOUNT_FILE=<path to service-account JSON>`.
- `ANDROID_APP_SHA256_CERT_FINGERPRINTS=<SHA-256 fingerprint(s)>` for the stable-signed Android APK.
- `IOS_APP_TEAM_ID=<Apple Developer Team ID>` and `IOS_APP_BUNDLE_ID=com.sakakrib.app` for iOS Universal Links.

The Firebase Admin service account and Android/iOS client configuration must belong to the same Firebase project.

## GitHub Actions configuration

Add these repository secrets:

- `FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64`: base64-encoded Firebase `google-services.json` for Android package `com.sakakrib.app`.
- `FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64`: base64-encoded Firebase `GoogleService-Info.plist` for bundle `com.sakakrib.app`.

Add this repository variable:

- `SAKAKRIB_APP_LINK_BASE_URL=https://sakakrib.com` (or the actual public frontend origin).

The mobile workflow enables the Capacitor push client only when the platform's corresponding Firebase client configuration secret is present. Without it, the build remains usable but native push registration stays disabled.

## Public domain association requirements

The following URLs must be served over HTTPS by the same public app-link domain, without authentication or redirects:

- `/.well-known/assetlinks.json`
- `/.well-known/apple-app-site-association`

Android verification requires `ANDROID_APP_SHA256_CERT_FINGERPRINTS` to contain the SHA-256 fingerprint of the **stable release signing certificate**. The debug APK uses an ephemeral GitHub runner certificate, so it is not suitable for persistent App Links verification. Install the stable-signed release APK to test verified Android links.

iOS verification requires the Apple Team ID and the Associated Domains entitlement. Firebase iOS push also requires APNs credentials to be configured for the Firebase project. The current workflow produces an iOS Simulator build, not a signed IPA or TestFlight release; a signed iOS distribution build and matching provisioning profile are still required for production installation and full Universal Links verification.

## Email delivery requirements

The request email is queued in `notification_emails` with status `pending`. Celery Beat schedules `process_notification_email_queue` every five seconds. Configure valid Django SMTP settings:

- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`.
- `EMAIL_USE_TLS` or `EMAIL_USE_SSL`, as required by the provider.
- `EMAIL_FROM` (or `DEFAULT_FROM_EMAIL`).

The worker changes the email status to `sent` when the SMTP server accepts it, or `failed` when sending raises an error. SMTP acceptance is not a guarantee that the recipient's mail provider placed it in the inbox; verify with a real test request and inspect the queue status and delivery logs.

## Customer email route map

| Email action | App-link path |
| --- | --- |
| Review Account Security | `/app/account-security` |
| Reset Password | `/app/reset-password?uid=...&token=...` |
| View Listing | `/app/listing-detail/<listing_id>` |
| Review Moving Request | `/app/mover-booking-detail/<booking_id>` |
| Track Moving Journey | `/app/mover-tracking/<booking_id>` |
| Open Dashboard | `/app/dashboard` |
| Open PMS / rental request | `/app/pms-dashboard` |
| Review or Renew Subscription | `/app/subscription-plans` |
| Admin application review | Django Admin `/admin/` on the configured backend origin |

## Verification checklist

1. Confirm both Firebase client configuration secrets and backend Firebase Admin credentials refer to the same project.
2. Confirm the stable APK signing fingerprint is published in `assetlinks.json`.
3. Confirm the public domain serves both association documents successfully.
4. Install the stable-signed APK, sign in as a landlord or real-estate user, and allow notifications.
5. From a separate renter account, request an available unit.
6. Confirm the owner sees the database notification, receives the email, and receives an Android push with the app closed.
7. Tap the email button and push notification. Confirm both open the PMS dashboard in the installed app.
8. Repeat with the app uninstalled to confirm the email link falls back to the web PMS dashboard.
