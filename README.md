# EMI Tracker

A mobile-first, self-hosted loan and instalment tracker built with TypeScript, Node.js, npm, React and SQLite. Development is local first; the intended production home is Mahmud’s **VPSDime VPS**.

## Run locally

Requires Node.js 24.14+ and npm. No external database or API keys are needed.

```bash
cd emi-tracker
npm ci
npm run dev
```

Open **http://127.0.0.1:3100** and create an account. An empty account can optionally load fictional sample loans. There are no default credentials. All account and loan data stays in `data/emi.sqlite`; fonts are served locally. The default listener is loopback only.

Optional settings are in `.env.example`; copy it to `.env` to override defaults. To preview on a physical phone on the same trusted Wi-Fi, set `APP_HOST=0.0.0.0`, restart, and open the PC’s LAN IP on port 3100 from the phone. Local firewall access may also be needed. Leave `COOKIE_SECURE=false` for local HTTP. Return the listener to `127.0.0.1` when finished.

## What works

- Separate accounts, password hashing and persistent sessions in HttpOnly cookies.
- Optional Google sign-in and explicit Google account linking from Settings.
- Loans with a name, lender, category, principal, fixed annual rate, tenure and first due date.
- Monthly reducing-balance schedules, zero-interest support, month-end date handling and a final rounding adjustment.
- Full-instalment payment recording, payment undo, overdue and upcoming views, and loan deletion with confirmation.
- Outstanding principal, current-month dues, progress and a chart of actual payment dates.
- EMI calculator with an action to create a loan from the result.
- Account name/currency settings and a CSV export with spreadsheet-formula protection.
- Mobile bottom tabs, safe-area spacing, 44px touch targets, responsive cards and bottom-sheet forms.

Each account uses one currency. Currency changes are blocked while loans exist; no implicit exchange-rate conversion is performed. Scheduled interest excludes lender fees, insurance, penalties, daily accruals and variable rates. Payments are manual records of full scheduled instalments, not transfers. Outstanding principal deducts the principal portion of recorded instalments; the schedule is not recalculated for early payments.

This is an initial SaaS foundation. Partial payments, bank integrations, email reminders, email verification, password recovery, subscriptions and billing are not implemented. Account signup is open by default and can be disabled with `ALLOW_REGISTRATION=false` after creating the intended accounts.

## Verify

```bash
npm test
npm run build
npm run test:browser
```

The browser script needs Playwright Chromium (`npx playwright install chromium` if absent). It runs a separate production server on loopback port 3317 with a temporary database. It tests widths 320, 360, 375, 390, 430, 768 and 1440, all pages for horizontal overflow, account creation, loan entry, payment recording, persistence after reload, undo, deletion and calculator values. Generated screenshots go in ignored `test-results/`; review copies live in `~/Work/emi-tracker/`. Browser emulation does not replace a physical iOS/Android check.

## Production build

```bash
npm ci
npm run build
npm start
```

`npm start` serves the compiled app and API together. `/healthz` checks the database connection. No development server is needed in production.

## VPSDime deployment preparation

No production deployment has been performed. Before applying these files, inspect the existing VPSDime services, available ports, domain, TLS termination and backup destination. Use a dedicated app directory; preserve other applications.

`Dockerfile` builds on Node 24 and runs as an unprivileged user. `compose.yaml` keeps port 3100 bound to the VPS loopback and retains SQLite in the `emi-data` named volume. A host reverse proxy should expose the app through HTTPS. For that setup, `COOKIE_SECURE=true` and `TRUST_PROXY=1` are required. Never expose the trusted-proxy backend directly to the internet.

After choosing the actual domain and inspecting the VPS, the intended deployment steps are:

```bash
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3100/healthz
```

Use the following location block inside the server’s existing HTTPS virtual host, replacing the port if 3100 is occupied:

```nginx
location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 60s;
}
```

Validate the existing proxy config before reloading it, then verify sign-up, sign-in, persistence, secure cookies, and the mobile payment flow through the final HTTPS domain. Setting `COOKIE_SECURE=true` on plain HTTP prevents successful sessions.

Back up SQLite using a consistent SQLite backup or stop the app before copying its database files, including any WAL state. Test restoration before relying on the backup. CSV is a readable export, not a full account/database backup. Preserve the named data volume during updates; `docker compose down -v` deletes it and must not be used for routine deployment.

## Google sign-in setup

Create an OAuth client with application type **Web application** in [Google Cloud Console](https://console.cloud.google.com/auth/clients). Configure the consent screen and add your account as a test user if the app is in testing. Only the `openid`, `email` and `profile` scopes are requested.

Register the exact local authorized redirect URI:

```text
http://127.0.0.1:3100/api/auth/google/callback
```

Copy `.env.example` to `.env`, fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and restart the server. Keep `GOOGLE_REDIRECT_URI` set to the exact registered callback. The Continue with Google button becomes available when both credentials are configured. Credentials stay on the server and must never be prefixed with `VITE_` or committed to Git.

For VPSDime, add `https://YOUR-DOMAIN/api/auth/google/callback` as another authorized redirect URI, set `GOOGLE_REDIRECT_URI` to that value on the VPS, and use secure cookies behind HTTPS. Compose passes these settings to the container. Localhost and 127.0.0.1 are different origins; use the same hostname as the configured callback.

Google login uses an authorization code with PKCE, a browser-bound state cookie, a single-use ten-minute server attempt, and nonce checks. Google's library validates ID token signature, audience, issuer and expiry. Accounts are identified by Google's stable subject ID. Tokens are discarded after sign-in rather than stored for API access.

Existing password accounts are never automatically merged by matching email. Sign in with your password, open Settings and click **Connect Google** to attach Google to the existing workspace. Google-only accounts have no password; the password login endpoint rejects them. Closed registration blocks new Google accounts while permitting previously linked users to sign in.

Protocol and account-lifecycle tests use a simulated provider; a real Google consent/sign-in test requires your OAuth credentials. See Google's [OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect) and [server token verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Source ownership

Code, dependencies, runtime SQLite, tests and generated builds belong here. Review screenshots belong in `~/Work/emi-tracker/`. The deployment and `dist` directories are generated outputs, not competing source roots. The existing PC–NAS updater is unchanged.
