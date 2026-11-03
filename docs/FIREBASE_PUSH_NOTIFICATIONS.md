# Saka Krib Firebase push notification setup

The application code now registers native Capacitor devices, stores their FCM registration tokens in Django, sends persisted user notifications through Firebase Cloud Messaging, and routes notification taps to an internal Saka Krib screen.

## Android Firebase configuration

1. In Firebase Console, create or select the Firebase project for Saka Krib.
2. Register an Android app using the exact application ID `com.sakakrib.app`.
3. Enable Firebase Cloud Messaging for the project and download that app's `google-services.json`.
4. Create the Android Capacitor platform if it is not already present: `npx cap add android`.
5. Place `google-services.json` at `android/app/google-services.json`. Do not commit this file if the project policy treats Firebase configuration as private.
6. Copy `branding/icons/generated/android/drawable/ic_stat_sakakrib.xml` to `android/app/src/main/res/drawable/ic_stat_sakakrib.xml`.
7. Copy `branding/icons/generated/android/res/values/sakakrib_notification_color.xml` to `android/app/src/main/res/values/sakakrib_notification_color.xml`.
8. Add the contents of `branding/icons/generated/android/AndroidManifest-notification-snippet.txt` inside the Android manifest's `<application>` element. This sets the monochrome small notification icon and the Saka Krib notification colour.

The frontend creates the `sakakrib_notifications` channel and registers only after the signed-in user grants notification permission.

## Django Firebase credentials

Create a Firebase service account with permission to send Firebase Cloud Messaging messages. Store its JSON file outside the repository on the backend host, with read permissions restricted to the backend service account.

Configure the backend environment:

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_FILE=/secure/path/to/firebase-service-account.json
```

Alternatively, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the full service-account JSON value in the deployment secret manager. Never add service-account credentials to Git.

The backend sends a notification when a `UserNotification` or `RenterNotification` record is committed. Push delivery is best-effort: a Firebase outage does not roll back or prevent the in-app notification from being saved.

## Install and apply

From the repository root:

```bash
npm install
npx cap sync android
```

In the backend environment:

```bash
pip install -r backend/requirements.txt
python backend/manage.py migrate
```

Then rebuild and install the Android app. The native Android platform folder and Firebase configuration are intentionally not generated or committed by this change; those are project-specific build assets.

## iOS

iOS also requires the app's APNs key/certificate to be configured in Firebase, the Push Notifications capability, and the native Capacitor iOS Firebase setup. The repository currently has no committed `ios/` platform project, so iOS native provisioning must be completed in that project before iOS closed-app delivery can be verified.
