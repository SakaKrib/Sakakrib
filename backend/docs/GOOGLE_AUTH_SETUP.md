# Google Sign-In configuration

Saka Krib uses Google Identity Services in browsers and the Capacitor Social Login native provider in Android/iOS. Both flows send a Google ID token to Django; Django verifies the token and issues the existing HttpOnly JWT cookies. Google tokens are not stored as application sessions in the frontend.

## Backend environment

Set the Web OAuth client ID in `backend/.env`:

```env
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

The Google client secret is not required for this ID-token verification flow. Keep it server-side if another server-side OAuth authorization-code flow is added; never expose it through a `VITE_` variable.

For HTTPS deployments and cross-origin Capacitor requests, use:

```env
CSRF_COOKIE_SAMESITE=None
CSRF_COOKIE_SECURE=true
SESSION_COOKIE_SECURE=true
```

The access and refresh JWT cookies are already issued with `HttpOnly`, `Secure`, and `SameSite=None`.

## Frontend environment

At the repository root, configure the Vite variables in `.env.local`:

```env
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
VITE_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
```

The web client ID is used by browser sign-in and as the native server client ID so Django validates the same audience on Android and iOS.

## GitHub Actions

Add these repository Actions variables (or secrets) so CI builds embed the public client IDs:

- `GOOGLE_CLIENT_ID`: the Google OAuth Web application client ID.
- `GOOGLE_IOS_CLIENT_ID`: the Google OAuth iOS client ID. The workflow also accepts the legacy variable name `GOOGLE_IOS_CLIENT_IOS`.

The Android OAuth client ID is configured in Google Cloud Console against package `com.sakakrib.app` and the SHA-1 fingerprints for each signing certificate. It is not passed as the frontend server client ID.

The iOS workflow derives the reversed client ID URL scheme from `GOOGLE_IOS_CLIENT_ID` and installs it in the generated app's `Info.plist`; it also wires the Google URL callback into `AppDelegate.swift`.

## Google Cloud OAuth clients

Create all OAuth clients in the same Google Cloud project:

1. Web application client: authorized JavaScript origins include the web origin(s), with no paths or trailing slash.
2. Android client: package `com.sakakrib.app` and SHA-1 for the installed APK signing certificate. Register the Play App Signing SHA-1 separately if distributing through Play.
3. iOS client: bundle identifier `com.sakakrib.app`.

For Android, register the SHA-1 belonging to the actual APK being installed. The upload-key SHA-1 and Play App Signing SHA-1 can differ.

## Verification

After deploying the backend and rebuilding the native apps:

- Confirm a browser sign-in creates or links a profile and returns both secure HttpOnly cookies.
- Confirm Android and iOS obtain an ID token from native Google sign-in and exchange it at `POST /api/accounts/google/`.
- Confirm new Google profiles have a verified email but no selected Saka Krib role until the existing role-selection process runs.
- Run `python manage.py test apps.accounts.test_google_auth` from the backend environment.
