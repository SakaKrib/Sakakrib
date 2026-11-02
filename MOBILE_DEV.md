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

Start from this branch with: docker compose up --build

Open the web app at http://localhost:5174. The backend is available on the host at http://localhost:8001. The frontend proxies /api and /ws to Django over the private Docker network.

Override host ports without editing Compose: SAKAKRIB_FRONTEND_PORT=5175 SAKAKRIB_BACKEND_PORT=8002 docker compose up --build

## Capacitor setup

The web build is emitted to dist, which is Capacitor's webDir. Capacitor 8 requires Node.js 22 or newer.

After checking out this branch, run: npm install; npm run build; npx cap add android; npx cap add ios; npx cap sync.

The generated android/ and ios/ native projects should be committed to this Saka Krib branch after generation and review. Do not copy native project files or credentials from another app.

### Android emulator using the live Vite server

Start Docker Compose, then run: CAPACITOR_DEV_SERVER_URL=http://10.0.2.2:5174 npx cap run android

For a physical Android device on the same network, use the computer's LAN IP address instead of 10.0.2.2, e.g. http://192.168.x.x:5174.

### iOS

iOS native builds require macOS and Xcode. For the iOS simulator, use the Mac's reachable Vite address: CAPACITOR_DEV_SERVER_URL=http://localhost:5174 npx cap run ios

For a physical iPhone, use the Mac's LAN IP address. iOS may require local HTTPS or a narrowly scoped development-only App Transport Security exception when using HTTP. Do not ship development HTTP exceptions in production.

For a self-contained mobile build, leave CAPACITOR_DEV_SERVER_URL unset, run npm run build, then npx cap sync. The native app packages the built dist assets. Configure the production Django API origin and its cookie, CORS, and CSRF trusted-origin settings before distributing that build.

## iOS dependency manager

Capacitor 8 uses Swift Package Manager by default. CocoaPods is not required unless a native plugin or project-specific dependency needs it. iOS dependencies belong to this Saka Krib native project; do not share Pods or Xcode build products with another repository.

## Important

- Do not run these commands from the MaaMara Market directory.
- Do not merge these development changes into main as part of this setup.
- com.sakakrib.app is the initial application identifier; confirm it before publishing because changing it later creates a different app identity.
- Run npm install after Capacitor dependencies are added so package-lock.json is regenerated and committed.
