# Saka Krib mobile and local Docker development

This guide applies only to the backup/casa-ai-before-push branch.

## Isolated local ports

| Service | Host port | Container port |
| --- | ---: | ---: |
| Vite frontend | 5174 | 5173 |
| Django / Daphne | 8001 | 8000 |
| PostgreSQL | not published | 5432 |
| Redis | not published | 6379 |

The database and Redis remain on the private Compose network. Compose-managed volumes are scoped to the Saka Krib project and do not share MaaMara Market volumes.

Start from this branch with: `docker compose up --build`

Open the web app at http://localhost:5174. The backend is available on the host at http://localhost:8001. The frontend proxies /api and /ws to Django over the private Docker network. If `backend/.env` explicitly defines `CORS_ALLOWED_ORIGINS` or `CSRF_TRUSTED_ORIGINS`, add `http://localhost:5174` and `http://127.0.0.1:5174` there as well; explicit environment values override Django's defaults.

Override host ports without editing Compose: `SAKAKRIB_FRONTEND_PORT=5175 SAKAKRIB_BACKEND_PORT=8002 docker compose up --build`

## Capacitor setup

The web build is emitted to `dist`, which is Capacitor's `webDir`. Capacitor 8 requires Node.js 22 or newer.

After checking out this branch, run: `npm install; npm run build; npx cap add android; npx cap add ios; npx cap sync`.

The generated `android/` and `ios/` native projects should be committed to this Saka Krib branch after generation and review. Do not copy native project files or credentials from another app.

### Android emulator using the live Vite server

Start Docker Compose, then run: `CAPACITOR_DEV_SERVER_URL=http://10.0.2.2:5174 npx cap run android`

For a physical Android device on the same network, use the computer's LAN IP address instead of `10.0.2.2`, e.g. `http://192.168.x.x:5174`.

### iOS

iOS native builds require macOS and Xcode. For the iOS simulator, use the Mac's reachable Vite address: `CAPACITOR_DEV_SERVER_URL=http://localhost:5174 npx cap run ios`

For a physical iPhone, use the Mac's LAN IP address. iOS may require local HTTPS or a narrowly scoped development-only App Transport Security exception when using HTTP. Do not ship development HTTP exceptions in production.

### Packaged mobile builds and Django authentication

The API client uses the current page origin by default, which is correct for browser development through the Vite proxy. For a packaged native build, set `VITE_DJANGO_API_URL` to the HTTPS origin of the deployed Django API before building, for example in an ignored `.env.production.local` file:

```dotenv
VITE_DJANGO_API_URL=https://YOUR-DJANGO-API-HOST
```

Then run `npm run build` and `npx cap sync`. Do not include a trailing `/api` in the value. The existing API client continues to send credentials and CSRF headers; it does not expose HttpOnly JWTs to JavaScript.

Before testing sign-in in a packaged app, configure Django CORS and CSRF trusted origins for the actual Capacitor WebView origin(s), HTTPS, and cookie attributes appropriate to the mobile WebView. Cross-origin cookie behavior must be verified on both Android and iOS; this configuration cannot be safely guessed without the deployed API hostname and actual device tests.

For a self-contained mobile build, leave `CAPACITOR_DEV_SERVER_URL` unset so Capacitor packages the built `dist` assets.

## iOS dependency manager

Capacitor 8 uses Swift Package Manager by default. CocoaPods is not required unless a native plugin or project-specific dependency needs it. iOS dependencies belong to this Saka Krib native project; do not share Pods or Xcode build products with another repository.

## Important

- Do not run these commands from the MaaMara Market directory.
- Do not merge these development changes into `main` as part of this setup.
- `com.sakakrib.app` is the initial application identifier; confirm it before publishing because changing it later creates a different app identity.
- Run `npm install` after Capacitor dependencies are added so `package-lock.json` is regenerated and committed.
