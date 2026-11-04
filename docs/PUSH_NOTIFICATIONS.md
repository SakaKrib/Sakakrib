# Push notifications (Firebase Cloud Messaging)

Push works when the app is closed: the Django backend sends the message to Firebase, and Android
shows it from the system tray. The pieces are already in the code. Two things come from **your**
Firebase project and must be supplied once.

## What triggers a push

Every saved `UserNotification` is pushed (see `apps/core/realtime_signals.py`), including:

- new chat messages
- mover **nearby** (about 1 km) and **arrived** at Point A (pickup) and Point B (drop-off)
  (`apps/core/moving_proximity.py`, called for every GPS point the mover's phone sends)
- bookings, payments, payouts, schedule changes, listing approvals, rent invoices, subscriptions

## 1. The app (GitHub Actions secret)

1. Firebase console > Project settings > **Add app > Android**. Package name must be exactly
   `com.sakakrib.app`.
2. Download `google-services.json`.
3. Base64 it: `base64 -w0 google-services.json` (macOS: `base64 -i google-services.json`).
4. GitHub repo > Settings > Secrets and variables > Actions > **New repository secret**
   named `GOOGLE_SERVICES_JSON_BASE64`, value = the base64 text.

The next APK build turns push on automatically. Without the secret the build still succeeds, with
push off (a warning is shown in the log).

## 2. The server (environment variables)

Firebase console > Project settings > Service accounts > **Generate new private key**. Give the
backend either:

- `FIREBASE_SERVICE_ACCOUNT_JSON` = the whole JSON, or
- `FIREBASE_SERVICE_ACCOUNT_FILE` = path to the JSON file, plus `FIREBASE_PROJECT_ID`.

Never commit this file. Restart the backend (and Celery) after setting it.

## Permission prompt

After sign-in the app explains the benefits and asks "Turn on notifications?". Choosing
**Allow notifications** shows Android's own Allow / Don't allow dialog. "Not now" asks again after
3 days; if the person denies, they are told where to switch it on in phone Settings.
