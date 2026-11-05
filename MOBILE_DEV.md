# Saka Krib mobile and local Docker development

This guide applies to the `backup/casa-ai-before-push` branch.

## Isolated local ports

| Service | Host port | Container port |
| --- | ---: | ---: |
| Django API + WebSockets | 8001 | 8001 |
| Vite frontend | 5175 | 5175 |
| PostgreSQL | not published | 5432 |
| Redis | not published | 6379 |

The database and Redis remain on the private Compose network. Compose-managed volumes are scoped to the Saka Krib project and do not share MaaMara Market volumes.

Start with `docker compose up --build`. A one-shot `migrate` service applies pending Django migrations before Daphne, Celery, and Celery Beat start. It never deletes or resets database volumes.

Open the web app at http://localhost:5175. Django's API and WebSocket endpoint share http://localhost:8001. Vite proxies `/api` and `/ws` to `backend:8001` over the private Docker network. If `backend/.env` explicitly defines `CORS_ALLOWED_ORIGINS` or `CSRF_TRUSTED_ORIGINS`, retain the local origins `http://localhost:5175` and `http://127.0.0.1:5175` there.

Override host ports only if necessary: `SAKAKRIB_FRONTEND_PORT=5176 SAKAKRIB_BACKEND_PORT=8002 docker compose up`. If you create or add a new Django migration after the initial startup, apply it with `docker compose run --rm migrate` before restarting backend workers.

## Hot reload

Frontend and backend source folders are bind-mounted into their containers. Vite hot-reloads React, TypeScript, and CSS. Django's development `runserver` uses the autoreloader with the ASGI server supplied by Channels/Daphne. Keep Compose running and save files in VS Code; ordinary source changes do not require image rebuilds. Rebuild only when Dockerfiles or installed dependencies change.

## Capacitor setup

The web build is emitted to `dist`, which is Capacitor's `webDir`. Capacitor 8 requires Node.js 22 or newer.

After checking out this branch, run: `npm install; npm run build; npx cap add android; npx cap sync`. Do not run `npx cap add android` again if the Android project already exists.

### Android emulator using the live Vite server

Start Docker Compose, then run: `CAPACITOR_DEV_SERVER_URL=http://10.0.2.2:5175 npx cap run android`.

For a physical Android device on the same Tailscale network, development can use the laptop's Tailscale IP and Vite port 5175. This is development-only; do not package an HTTP development server URL into a release APK.

### Packaged Android APK using Tailscale HTTPS

Saka Krib keeps its Docker ports isolated from MaaMara: Django remains on host port **8001** and Vite remains on host port **5175**. Do not change these mappings.

The laptop's Tailscale Serve HTTPS hostname is:

`https://opondo-thinkpad-t14-gen-1.tail34bca9.ts.net`

Tailscale Serve should proxy that hostname to Saka Krib's Vite host port 5175. Vite forwards `/api`, `/media`, `/.well-known`, and `/ws` to Django on port 8001:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:5175
tailscale serve status
```

The status should show the HTTPS hostname forwarding to `http://127.0.0.1:5175`. This changes the laptop's Tailscale Serve routing; it does not change Docker port mappings. Keep Tailscale connected on both laptop and Android phone, and keep the Saka Krib backend running.

Copy `.env.production.example` to `.env.production` (or add the same variable to your existing root `.env.production`):

```env
VITE_DJANGO_API_URL=https://opondo-thinkpad-t14-gen-1.tail34bca9.ts.net
```

The URL is a frontend build-time setting. Build and sync the packaged frontend after setting it:

```bash
npm run build
npx cap sync android
```

The Capacitor bundled WebView origin is `https://localhost`. Django settings now allow that exact origin for CORS and CSRF, and `CapacitorCookiePolicyMiddleware` applies `Secure; SameSite=None` only to CSRF/JWT cookies returned to that exact origin. Ordinary browser development retains its existing cookie policy. JWT cookies remain HttpOnly; the CSRF cookie remains readable by the frontend as required by the existing CSRF flow.

**Android WebView third-party cookies:** the APK makes credentialed requests from `https://localhost` to the Tailscale HTTPS hostname, which is a cross-site request. In the generated Android project, update `android/app/src/main/java/com/sakakrib/app/MainActivity.java` so the app WebView accepts third-party cookies:

```java
package com.sakakrib.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CookieManager.getInstance().setAcceptThirdPartyCookies(
            getBridge().getWebView(),
            true
        );
    }
}
```

If the generated project uses `MainActivity.kt`, apply the equivalent CookieManager setting there instead. This is scoped to the Saka Krib app's WebView; do not enable cleartext traffic or disable CSRF.

### Android App Links and stable APK signing

The GitHub Actions Android job adds verified HTTPS intent filters for these payment return paths on the configured public hostname:

- `/paypal/subscription/return`
- `/paypal/subscription/cancel`
- `/listing/payment/return`

Django serves the Digital Asset Links document at `/.well-known/assetlinks.json`; Vite proxies that path to Django when Tailscale Serve targets the frontend on port 5175. The document stays empty until a signing-certificate fingerprint is configured.

**Use a stable signing key.** The workflow supports these GitHub Actions repository secrets:

- `ANDROID_SIGNING_KEYSTORE_BASE64`
- `ANDROID_SIGNING_KEYSTORE_PASSWORD`
- `ANDROID_SIGNING_KEY_ALIAS`
- `ANDROID_SIGNING_KEY_PASSWORD`

Create the keystore on a trusted machine and keep the original file in a safe backup. Do not commit it or share it in chat. Example command (keytool prompts for passwords and certificate details):

```bash
keytool -genkeypair -v -keystore sakakrib-upload.jks -alias sakakrib-upload -keyalg RSA -keysize 2048 -validity 10000
```

Get the public SHA-256 certificate fingerprint:

```bash
keytool -list -v -keystore sakakrib-upload.jks -alias sakakrib-upload
```

Add the four values above as GitHub Actions repository secrets. For `ANDROID_SIGNING_KEYSTORE_BASE64`, base64-encode the keystore file on your machine (for example, `base64 -w 0 sakakrib-upload.jks`) and paste that encoded value directly into the GitHub secret field. Never paste the keystore or passwords into a chat or commit them to the repository.

Then set this variable in the backend's private `backend/.env`, using the SHA-256 fingerprint from keytool with its colon separators:

```env
ANDROID_APP_SHA256_CERT_FINGERPRINTS=AA:BB:CC:...:YY:ZZ
```

Restart Django after changing the environment. Verify the public document at:

`https://opondo-thinkpad-t14-gen-1.tail34bca9.ts.net/.well-known/assetlinks.json`

The Android build uploads a fingerprint text file alongside the APK. Only use it for permanent verification after the workflow confirms that stable signing secrets were configured. If the workflow warns that it used a temporary runner debug certificate, do not put that fingerprint in Django's environment.

Changing from a previously installed debug-signed APK to the new stable certificate may require uninstalling the old app before installing the new APK. Back up any app-only data first.

### iOS

iOS native builds require macOS and Xcode. For a physical iPhone, use the Mac's reachable Vite address on port 5175 for development. Do not ship development HTTP exceptions in production.

## Important

- Do not run these commands from the MaaMara Market directory.
- Do not change Saka Krib's backend host port 8001 or frontend host port 5175 to match MaaMara.
- Do not merge these development changes into `main` as part of this setup.
- Native app identifiers and credentials remain specific to Saka Krib.
