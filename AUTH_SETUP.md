# Firebase Authentication setup

Implemented: Google sign-in, email/password registration, email verification,
password reset, sign-out, server-side token/revocation verification and an email allowlist.
Firestore stores each verified user's latest settings and up to 10 history entries.
Only input text and selection settings are stored; face photos and generated images are not stored.
Old browser-local anonymous history is left untouched and is not automatically migrated.
Cloud Storage is not configured by this change.
This is logical separation, not encryption: people with access to the browser profile
can inspect local data. Use separate OS/browser profiles on shared computers.

## Configure before deployment

1. In Firebase Console, add Firebase to the existing Cloud Run Google Cloud project.
2. Register a Web app under Project settings. Copy its public config values into
   `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`.
   These are Firebase Web config values, NOT the Gemini API key or a service account key.
3. Authentication > Sign-in method: enable Google and Email/Password. Set the Google
   support email. Under settings, enable email enumeration protection and set a password
   policy (minimum 8 characters; enforce any additional policy you choose).
4. Add the actual Cloud Run hostname under Authentication > Settings > Authorized domains.
   Add `localhost` for local testing. Configure Japanese verification/reset email templates.
5. Set `AUTH_ALLOWED_EMAILS` to the four approved addresses, comma-separated. The local
   `.env` has this list and is gitignored. Configure it separately in Cloud Run environment
   variables. The server does not expose the list. Matching ignores case.
6. The Cloud Run runtime service account needs permission to look up Firebase Auth users
   for revoked/disabled-token checks (`firebaseauth.users.get`; Firebase Authentication
   Viewer is a suitable predefined role). Do not grant Owner or ship private JSON keys.
7. The same runtime service account needs Firestore read/write permission. Grant the
   narrow `Cloud Datastore User` role. Firestore client rules stay deny-all because all
   database access is made by the authenticated Cloud Run server and authorized there.
8. For local server verification, configure Application Default Credentials for the
   Firebase project, for example with `gcloud auth application-default login`. Run
   `npm ci` and `npm start`; Node reads the gitignored `.env` file. `start-server.ps1`
   instead uses the shell environment. Cloud Run uses its configured environment.

Until config AND the allowlist exist, generation fails closed with HTTP 503.
A missing token returns 401; an unverified or non-allowlisted identity returns 403.
The allowlist blocks app/API use, not creation of a Firebase Auth identity itself.
To prevent all non-invited account creation, additional Identity Platform blocking
functions or an invite-only provisioning flow would be required.

## Verification checklist

- Run `npm test` (mocked token verification + real local HTTP server; no Gemini calls).
- Test Google sign-in on PC and a real phone, including popup cancellation/blocking.
- Test email signup, verification, refresh, password reset and sign-out.
- Confirm an unlisted account and an unverified email cannot generate images.
- Confirm account switching clears current images/results and shows only that UID's history.
- Confirm settings/history save, load, individual delete, clear-all and the 10-entry limit.
- Keep the production revision unchanged until Firebase is configured and these checks pass.
