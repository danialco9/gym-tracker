# gym-tracker (backend)

FastAPI service and analytics engine for the gym tracker.

## Features

- **API** (`/api`), with interactive docs at `http://localhost:8000/docs`:

  | Resource | Endpoints |
  | --- | --- |
  | Health | `GET /health` |
  | Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me` (training goal), `DELETE /auth/me` (with the password), `POST /auth/password-reset`, `POST /auth/password-reset/confirm` |
  | Exercises | `GET /exercises?muscle_group=&q=`, `GET /exercises/{id}`, `POST /exercises`, `PATCH /exercises/{id}`, `DELETE /exercises/{id}` |
  | Routines | `GET /routines`, `GET /routines/{id}`, `POST /routines`, `PUT /routines/{id}`, `DELETE /routines/{id}` |
  | Workouts | `GET /workouts?limit=&offset=`, `GET /workouts/{id}`, `POST /workouts`, `PUT /workouts/{id}`, `DELETE /workouts/{id}`, `POST /workouts/{id}/sets`, `DELETE /workouts/{id}/sets/{set_id}` |
  | Measurements | `GET /measurements?date_from=&date_to=`, `POST /measurements`, `PUT /measurements/{id}`, `DELETE /measurements/{id}` |
  | Progress | `GET /progress/overview`, `GET /progress/goals`, `GET /progress/achievements`, `GET /progress/exercises/{id}` |
  | Feedback | `POST /feedback` (read them with `gym-admin feedback`) |

- **Exercise catalog**: 74 built-in exercises with Spanish names and English slugs, shared by all
  users and read-only. Users can add their own custom exercises.
- **Database**: SQLAlchemy 2.0 models with Alembic migrations, named constraints and check
  constraints (RPE 1–10, non-negative loads, one measurement per day, unique set numbers).
- **Security**: Argon2 password hashing and signed tokens in an `HttpOnly`, `SameSite=Lax` cookie.
  Every resource is scoped to the authenticated user.
- **Rate limiting** (`limits`, moving window): login allows 5 attempts per minute per client
  address and email, and 20 per hour per email; registration allows 5 per hour per address.
  Excess requests get `429` with `Retry-After`. Counters live in memory by default
  (`GYM_RATE_LIMIT_STORAGE`, e.g. `redis://...` for several instances). Behind a reverse proxy, run
  uvicorn with `--proxy-headers --forwarded-allow-ips=<proxy>` so limits apply to the real client IP.
- **Analytics** (`gym_tracker.analysis`): estimated 1RM (Epley), personal records, weekly hard
  sets per muscle group, body weight trend, plateau detection and rule-based double progression.
  Routines plan each set (reps, weight, RPE), and recommendations compare the last session with
  that plan set by set, suggesting the whole next session with the same shape (e.g. a pyramid moves
  up 2.5 kg on every set). The same pandas code runs on the CSV log and, through `analysis.database`, on each user's data
  in PostgreSQL to serve the progress endpoints. A plateau is judged within the current block
  (since the top weight last went down), so rebuilding after a deload is not flagged again.
- **Demo account**: `gym-admin seed-demo` creates `demo@gymtracker.dev` (password
  `demo-gym-tracker`) with three routines and 12 weeks of simulated training and weigh-ins. Each
  lift progresses with the app's own rules against a hidden strength level, and one of them stalls.
  Running it again recreates the account.

## Development

Requires [uv](https://docs.astral.sh/uv/) and Docker. Settings are read from `GYM_*` variables
in the repository `.env` (see `../.env.example`).

```bash
uv sync                                   # install dependencies
docker compose up -d --wait               # from the repo root: start PostgreSQL
uv run alembic upgrade head               # apply migrations
uv run gym-admin seed-catalog             # load or update the exercise catalog
uv run gym-admin create-user --email you@example.com
uv run gym-admin reset-password --email you@example.com   # when a password is forgotten
uv run gym-admin seed-demo                # optional: demo account with 12 weeks of data
uv run uvicorn gym_tracker.main:create_app --factory --reload

uv run gym-report                         # training report from ../data (Spanish output)
```

### Quality checks

```bash
uv run pytest --cov=gym_tracker   # API tests start a disposable PostgreSQL with testcontainers
uv run ruff check . && uv run ruff format --check .
uv run mypy
```

### Migrations

```bash
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

A test (`test_migrations_match_models`) fails if a model change has no migration.
