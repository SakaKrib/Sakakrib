# Sign in with Apple setup

Saka Krib's Apple authentication uses Apple's official Sign in with Apple flow and the existing Django authentication gateway. Apple credentials are verified by Django; Saka Krib then issues its normal Secure, HttpOnly access and refresh cookies. Apple tokens are not used as Saka Krib sessions in the frontend.

## Supported surfaces

- iOS app: native Sign in with Apple through `@capgo/capacitor-social-login`.
- Website: Apple's official JavaScript SDK using a popup and the registered redirect URI.
- Android APK: Apple button is intentionally not shown; Google and email/password remain available there. The plugin supports an Android OAuth route, but it requires a separate callback/deep-link flow before we expose it in the APK.

## Backend environment

Add these values to `backend/.env`:

```env
APPLE_CLIENT_ID=com.yourcompany.sakakrib.web
APPLE_BUNDLE_ID=com.sakakrib.app
APPLE_TEAM_ID=YOUR_APPLE_TEAM_ID
APPLE_KEY_ID=YOUR_SIGN_IN_WITH_APPLE_KEY_ID
APPLE_PRIVATE_KEY_PATH=/app/Perm/AuthKey_YOUR_KEY_ID.p8
APPLE_REDIRECT_URI=https://sakakrib.com/
```

- `APPLE_CLIENT_ID`: the Apple Services ID used by the website.
- `APPLE_BUNDLE_ID`: the iOS app's bundle identifier; currently `com.sakakrib.app`.
- `APPLE_TEAM_ID`: the Team ID shown in the Apple Developer account.
- `APPLE_KEY_ID`: the Key ID for the Sign in with Apple private key.
- `APPLE_PRIVATE_KEY_PATH`: absolute path inside the backend container to the downloaded `.p8` key.
- `APPLE_REDIRECT_URI`: exact HTTPS return URL registered for the Services ID. It must match the value sent during the web authorization-code exchange.

Keep the `.p8` file in a server-only ignored directory such as `backend/Perm/`. Never commit it, put it in a Vite variable, or expose it to the browser. The Team ID, Key ID, and private key are only used on the Django server to create Apple's short-lived client-secret JWT.

The Apple button is enabled only when all required backend values are present and the private-key file exists. The public config endpoint returns only the Services ID, redirect URL, bundle ID, and enabled flag.

## Apple Developer configuration (when enrolled)

1. Enable Sign in with Apple for the primary App ID whose bundle identifier is `com.sakakrib.app`.
2. Create a Services ID for the web service and use that exact identifier as `APPLE_CLIENT_ID`.
3. Associate the Services ID with the primary App ID.
4. Register and verify the website domain, then register the exact `APPLE_REDIRECT_URI`.
5. Create a Sign in with Apple private key, download the `.p8` file once, and record its Key ID and Team ID.
6. Enable the Sign in with Apple capability for the iOS app's App ID and ensure the distribution provisioning profile includes that capability.

Apple requires HTTPS and a verified domain for the web return URL. The return URL must match exactly.

## API contract

- `GET /api/accounts/apple/config/`: public configuration used to decide whether the Apple button can be displayed.
- `POST /api/accounts/apple/`: accepts an Apple `id_token` or one-time authorization `code`, plus the client nonce and optional first-login name.

Django verifies Apple's RS256 signature against Apple's JWKS, issuer, expiry, audience (Services ID or native bundle ID), and nonce. For authorization codes, Django generates a short-lived ES256 client-secret JWT using the server-side private key and exchanges the code with Apple.

An existing account is linked only when Apple supplies a verified email matching that account. The Apple subject is stored independently from the Google subject. Existing role selection, email/password login, Google login, and HttpOnly-cookie session behavior remain unchanged.

## Validation

After the real Apple Developer values and key are installed:

1. Restart the backend so Django loads the environment.
2. Confirm `GET /api/accounts/apple/config/` returns `enabled: true`.
3. Test the website popup and native iOS authorization.
4. Confirm the response sets both Saka Krib HttpOnly cookies.
5. Confirm the profile has an `apple_subject` and existing users retain their role and profile data.

The automated backend tests mock Apple's JWKS and token claims; they validate account creation/linking and secure cookie issuance without requiring a paid Apple Developer account.
