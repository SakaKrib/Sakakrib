# Saka Krib mobile and local Docker development

This guide applies only to the `backup/casa-ai-before-push` branch.

## Isolated local ports

| Service | Host port | Container port |
| --- | ---: | ---: |
| Django API + WebSockets | 8001 | 8001 |
| Vite frontend | 5175 | 5173 |
| PostgreSQL | not published | 5432 |
| Redis | not published | 6379 |

The database and Redis remain on the private Compose network. Compose-managed volumes are scoped to the Saka Krib project and do not share MaaMara Market volumes.

Start with `docker compose up --build`. A one-shot `migrate` service applies pending Django migrations before Daphne, Celery, and Celery Beat start. It never deletes or resets database volumes.

Open the web app at http://localhost:5175. Django's API and WebSocket endpoint share http://localhost:8001. Vite proxies `/api` and `/ws` to `backend:8001` over the private Docker network. If `backend/.env` explicitly defines `CORS_ALLOWED_ORIGINS` or `CSRF_TRUSTED_ORIGINS`, add `http://localhost:5175` and `http://127.0.0.1:5175` there as well; explicit environment values override Django defaults.

Override host ports only if necessary: `SAKAKRIB_FRONTEND_PORT=5176 SAKAKRIB_BACKEND_PORT=8002 docker compose up`. If you create or add a new Django migration after the initial startup, apply it with `docker compose run --rm migrate` before restarting backend workers.

## Hot reload

Frontend and backend source folders are bind-mounted into their containers. Vite hot-reloads React, TypeScript, and CSS. Django's development `runserver` uses the autoreloader with the ASGI server supplied by Channels/Daphne. Keep Compose running and save files in VS Code; ordinary source changes do not require image rebuilds. Rebuild only when Dockerfiles or installed dependencies change.

## Capacitor setup

The web build is emitted to `dist`, which is Capacitor's `webDir`. Capacitor 8 requires Node.js 22 or newer.

After checking out this branch, run: `npm install; npm run build; npx cap add android; npx cap add ios; npx cap sync`.

### Android emulator using the live Vite server

Start Docker Compose, then run: `CAPACITOR_DEV_SERVER_URL=http://10.0.2.2:5175 npx cap run android`.

For a physical Android device on the same Tailscale network, use the laptop's Tailscale IP: `CAPACITOR_DEV_SERVER_URL=http://YOUR-TAILSCALE-IP:5175 npx cap run android`.

### iOS

iOS native builds require macOS and Xcode. For a physical iPhone, use the Mac's reachable Vite address on port 5175. iOS may require local HTTPS or a narrowly scoped development-only App Transport Security exception when using HTTP. Do not ship development HTTP exceptions in production.

### Packaged mobile builds and Django authentication

For a packaged native build, set `VITE_DJANGO_API_URL` to the reachable Django API origin, for example `http://YOUR-TAILSCALE-IP:8001` for local device testing or the HTTPS production API origin for release. Configure Django CORS, CSRF trusted origins, and cookie attributes for the actual WebView origin; verify cross-origin cookie behavior on the device. If `backend/.env` defines PayPal local/network return URLs, update their frontend port to 5175.

Leave `CAPACITOR_DEV_SERVER_URL` unset for self-contained builds.

## Important

- Do not run these commands from the MaaMara Market directory.
- Do not merge these development changes into `main` as part of this setup.
- Native app identifiers and credentials remain specific to Saka Krib.
