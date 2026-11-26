# Deployment

The app runs on three free tiers, deployed automatically from `main`:

```
Browser ──HTTPS──▶ Vercel (frontend, CDN)
                     │  /api/* is rewritten (proxied) to the API, so the
                     │  session cookie stays first-party on the Vercel domain
                     ▼
                   Vercel (API, FastAPI function) ──TLS──▶ Neon (PostgreSQL)
```

| Piece | Service | Config in the repo |
| --- | --- | --- |
| Frontend | Vercel, root directory `frontend` | `frontend/vercel.json` |
| API | Vercel, root directory `backend` | `backend/index.py`, `backend/vercel.json` |
| Migrations | GitHub Actions, after each push to `main` | `.github/workflows/migrate.yml` |
| Database | Neon PostgreSQL | — |
| Demo reset | GitHub Actions, nightly | `.github/workflows/demo-reset.yml` |

Why the proxy: the session cookie is `HttpOnly; Secure; SameSite=Lax`. If the frontend called the
API's own domain directly, the browser would treat it as a third-party cookie and drop it.

## 1. Database (Neon)

1. Create a project (region close to the API, e.g. AWS Frankfurt) with PostgreSQL 17 or newer.
2. Copy the **pooled** connection string (`postgresql://…-pooler…/neondb?sslmode=require`).
   Plain `postgresql://` URLs are accepted: the API switches them to the psycopg driver.

## 2. API (Vercel)

The API runs on Vercel as a second project, next to the frontend:

1. New Project → import this repository → **Root Directory** `backend`. Vercel detects FastAPI and
   serves `app` from `backend/index.py`; `backend/vercel.json` pins it to `fra1`, next to Neon.
2. Set the variables in [Environment variables](#environment-variables-api).
3. Check `https://<project>.vercel.app/api/health` returns `{"status":"ok","database":"ok"}`, then
   point the `/api/:path*` rewrite in `frontend/vercel.json` at it.
4. Set the repository variable `PRODUCTION_MIGRATIONS_ENABLED=true`: with no start-up script on
   Vercel, `.github/workflows/migrate.yml` upgrades the schema and seeds the catalog after each push
   to `main`.

If `/api/health` fails with a connection to `localhost:5432`, `GYM_DATABASE_URL` is missing: the API
refuses to start without it.

The API ran on Render until October 2026; it moved to Vercel because Render's free plan slept after
15 minutes and took about a minute to wake up.

## 3. Demo account

Seed it once (and whenever you want to reset it) from **Actions → Reset demo data → Run workflow**,
after adding:

- Repository secret `PRODUCTION_DATABASE_URL`: the Neon connection string.
- Repository variable `DEMO_RESET_ENABLED`: `true`.

The workflow then also runs every night at 03:00 UTC. The account gets a random password; visitors
use the **Probar la demo** button, which calls `POST /api/auth/demo` (enabled with
`GYM_DEMO_ENABLED=true`, limited to 20 sign-ins per hour per IP).

## 4. Frontend (Vercel)

Live at https://gym-tracker-two-beta.vercel.app.

1. Add New → Project → import this repository (or `vercel link` from the repository root; the
   root `.vercelignore` keeps CLI uploads to the frontend).
2. Root directory: `frontend` (framework, install and build commands come from `vercel.json`).
3. Environment variable `VITE_DEMO_ENABLED=true` to show the demo button.
4. Deploy, open the site and try **Probar la demo**.

## Resetting a user's password

People reset it themselves from **¿Olvidaste tu contraseña?** on the login page: the API emails a
single-use link (30 minutes) through Brevo, once `GYM_BREVO_API_KEY` and `GYM_MAIL_FROM` are set.
Without them the email is written to the API log instead.

If the email never arrives, set a new password from your machine against the production database
and send it to them:

```bash
cd backend
GYM_DATABASE_URL='<Neon connection string>' GYM_JWT_SECRET=unused-by-admin-commands \
  uv run gym-admin reset-password --email someone@example.com
```

It asks for the new password twice without echoing it, so it stays out of the shell history. The
Neon connection string is under **Connect** in the Neon console (the same value as the
`PRODUCTION_DATABASE_URL` secret).

## Environment variables (API)

| Variable | Production value | Purpose |
| --- | --- | --- |
| `GYM_DATABASE_URL` | Neon connection string | Database |
| `GYM_JWT_SECRET` | a long random string (`openssl rand -hex 32`) | Signs session tokens |
| `GYM_COOKIE_SECURE` | `true` | Cookie only over HTTPS |
| `GYM_DEMO_ENABLED` | `true` | Enables `POST /api/auth/demo` |
| `GYM_DEMO_EMAIL` | `demo@gymtracker.dev` (default) | Demo account |
| `GYM_TIMEZONE` | `Europe/Madrid` | Calendar days and weeks in the analytics |
| `GYM_RATE_LIMIT_STORAGE` | `memory://` (default) | Use `redis://…` with several instances |
| `GYM_APP_URL` | `https://gym-tracker-two-beta.vercel.app` | Links in emails |
| `GYM_BREVO_API_KEY` | set in the dashboard, never in the repo | Sends password reset emails ([Brevo](https://www.brevo.com), free plan) |
| `GYM_MAIL_FROM` | a sender verified in Brevo | From address of those emails |
| `GYM_VAPID_PUBLIC_KEY` | from `gym-admin vapid-keys` | Lets phones subscribe to the end-of-rest notification |
| `GYM_VAPID_PRIVATE_KEY` | from the same command, never in the repo | Signs those notifications ([Web Push](https://developer.mozilla.org/docs/Web/API/Push_API)) |
| `SENTRY_DSN` | set by the Sentry integration on Vercel | Reports unhandled errors to [Sentry](https://sentry.io), without personal data; off when unset |

## Running the production image locally

```bash
cd backend
docker build -t gym-tracker-api .
docker run --rm -p 8001:8000 \
  -e GYM_DATABASE_URL=postgresql://gym:change-me@host.docker.internal:5432/gym_tracker \
  -e GYM_JWT_SECRET=a-long-random-local-secret -e GYM_COOKIE_SECURE=false \
  gym-tracker-api
```
