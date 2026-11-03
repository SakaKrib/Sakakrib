# Mobile Django API endpoints (Tailscale + Ngrok)

The Android and iOS builds can use two HTTPS API endpoints in priority order:

- `VITE_DJANGO_API_URL`: primary endpoint (currently the Tailscale Serve hostname).
- `VITE_DJANGO_API_FALLBACK_URL`: fallback endpoint (the Ngrok HTTPS hostname).

At startup, the app probes `/api/accounts/csrf/` on each configured endpoint in order. The first one that returns Django's JSON CSRF response is selected for the entire app run. REST requests, login, media URLs, and both realtime WebSocket connections use that same selected host.

## Configure the mobile build

In GitHub, open **SakaKrib → Settings → Secrets and variables → Actions → Variables** and set:

```text
VITE_DJANGO_API_URL=https://YOUR-TAILSCALE-HOST.ts.net
VITE_DJANGO_API_FALLBACK_URL=https://YOUR-NGROK-HOST.ngrok-free.app
```

Use the actual current HTTPS hostnames. Do not include `/api` at the end. The mobile workflow injects both variables into Android and iOS builds. Rebuild the APK or iOS app after changing either value.

## Configure Django for the Ngrok hostname

On the Django host, add the Ngrok hostname (without `https://`) to the existing comma-separated `DJANGO_ALLOWED_HOSTS` environment variable, then restart Django. For example:

```env
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,opondo-thinkpad-t14-gen-1.tail34bca9.ts.net,YOUR-NGROK-HOST.ngrok-free.app
```

The native WebView origins `https://localhost` and `capacitor://localhost` are already included in the project's CORS and CSRF trusted-origin defaults. They are the browser origins that Django sees; the Ngrok hostname is the destination API host.

Both tunnels must forward to the **same running Django service**, backed by the same database, media storage, and environment. Otherwise the app could select a tunnel that has different data or cannot read uploaded files.

## Authentication and failover behavior

Django authentication uses HttpOnly cookies, which are scoped to the hostname that issued them. To avoid splitting a user's session across two domains, the app selects one endpoint at startup and does not switch hosts midway through a run. If Tailscale is unavailable when the app starts, it selects Ngrok. If the selected host changes between launches, that host has a separate cookie jar and the user may need to sign in again.

A reserved/stable Ngrok hostname is preferable. Temporary Ngrok hostnames can change; whenever the hostname changes, update the GitHub Actions variable and Django's `DJANGO_ALLOWED_HOSTS`, then rebuild the app.

## Security note

Tailscale Serve is private to devices/users in the tailnet, while an Ngrok endpoint is internet-reachable. Keep Django's production security settings enabled (`DJANGO_DEBUG=false`, a strong secret key, and the intended allowed hosts), and keep account and administrative endpoints protected by authentication and authorization. An unguessable tunnel URL is not an access-control mechanism.
