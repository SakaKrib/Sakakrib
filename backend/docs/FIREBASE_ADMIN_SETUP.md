# Firebase Admin setup (Django)

This configures server-side Firebase Cloud Messaging (FCM) for Saka Krib. It is separate from the Android `google-services.json` file.

## 1. Create a service-account key

In the same Firebase project used by the Android app:

1. Open **Project settings → Service accounts**.
2. Select **Generate new private key** and download the JSON file.
3. Do not send the file or its `private_key` value in chat, email, or a source-control commit.

## 2. Store it on the Docker host

From the repository root:

```bash
mkdir -p backend/secrets
chmod 700 backend/secrets
```

Move the downloaded service-account JSON to:

```text
backend/secrets/firebase-service-account.json
```

Then restrict file permissions:

```bash
chmod 600 backend/secrets/firebase-service-account.json
```

The `backend/secrets/` directory is ignored by Git via `backend/.gitignore`.

## 3. Configure Django

Add these entries to the existing `backend/.env` file. Set the project ID to the exact `project_id` shown in the Android `google-services.json` and in the Firebase service-account JSON. They must match.

```dotenv
FIREBASE_PROJECT_ID=your-exact-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_FILE=/app/secrets/firebase-service-account.json
```

Do not put the service-account JSON itself in `.env`, and do not add its private key to GitHub Actions source files. The Admin key belongs only on the backend host.

## 4. Recreate backend workers

The Docker Compose configuration bind-mounts `./backend` at `/app` for the backend, Celery worker, and Celery Beat containers. Recreate those containers so they receive the updated environment:

```bash
docker compose up -d --no-deps --force-recreate backend celery celery-beat
```

If your Compose project uses a different compose filename or project directory, run the equivalent command from the directory containing the active Compose file.

## 5. Verify without exposing credentials

Run this from the repository root. It prints only project IDs and boolean checks; it never prints the private key:

```bash
docker compose exec backend python -c 'import json, os; p=os.environ["FIREBASE_SERVICE_ACCOUNT_FILE"]; d=json.load(open(p)); configured=os.environ.get("FIREBASE_PROJECT_ID",""); actual=d.get("project_id",""); print({"configured_project_id":configured,"service_account_project_id":actual,"project_id_matches":bool(configured and configured == actual),"private_key_present":bool(d.get("private_key"))})'
```

Expected: `project_id_matches: True` and `private_key_present: True`.

The existing Django push service initializes Firebase Admin lazily, reads this file, sends FCM to active registered device tokens, and deactivates invalid/unregistered tokens. The device-token API and its database migration are already present. A real delivery test still requires a signed APK with Firebase client configuration enabled, notification permission granted, and a registered device token.
