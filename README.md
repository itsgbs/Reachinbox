# ReachInbox Email Scheduler

A production-grade email job scheduler with a full-stack dashboard. Built for the ReachInbox hiring assignment.

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Browser                           │
│               Next.js 14 + Tailwind CSS + TypeScript            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP REST / OAuth
┌──────────────────────────▼──────────────────────────────────────┐
│                   Express.js Backend (Node/TS)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Auth API   │  │  Email API   │  │   Slack OAuth API      │ │
│  │ (Google     │  │  (schedule,  │  │   (connect/disconnect) │ │
│  │  OAuth/JWT) │  │   list,      │  │                        │ │
│  └─────────────┘  │   search)    │  └────────────────────────┘ │
│                   └──────┬───────┘                              │
│                          │                                       │
│            ┌─────────────▼──────────────┐                       │
│            │       BullMQ Queue         │                       │
│            │   email-queue (delayed)    │                       │
│            └─────────────┬──────────────┘                       │
└──────────────────────────┼──────────────────────────────────────┘
                           │ Jobs
┌──────────────────────────▼──────────────────────────────────────┐
│               Email Worker (BullMQ Worker)                      │
│   - Concurrency: configurable (default 5)                       │
│   - Rate limit: Redis-backed per-sender + global counters       │
│   - Min delay: 2s between sends                                 │
│   - Idempotency: job ID = campaign:recipient (no duplicates)    │
│   - Sends via Ethereal SMTP (Nodemailer)                        │
│   - Updates PostgreSQL + Elasticsearch on completion            │
└───────────────────────────────────────────────────────────────-─┘

Data Stores:
  PostgreSQL   – email records, users, campaigns, senders
  Redis        – BullMQ job store + rate-limit counters
  Elasticsearch– full-text search index for emails
```

---

## 🚀 Quick Start (Docker Compose — Recommended)

### 1. Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/reachinbox-scheduler.git
cd reachinbox-scheduler
```

### 2. Backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | From [Google Cloud Console](https://console.cloud.google.com) |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3001/auth/google/callback` |
| `JWT_SECRET` | Any strong random string |
| `SLACK_CLIENT_ID` | From your [Slack App](https://api.slack.com/apps) |
| `SLACK_CLIENT_SECRET` | From your Slack App |
| `SLACK_REDIRECT_URI` | `http://localhost:3001/auth/slack/callback` |
| `ETHEREAL_USER` | Optional — auto-created per sender if blank |
| `ETHEREAL_PASS` | Optional |
| `MAX_EMAILS_PER_HOUR` | Global hourly email cap (default: `200`) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-sender cap (default: `50`) |
| `WORKER_CONCURRENCY` | Parallel jobs per worker (default: `5`) |
| `MIN_DELAY_BETWEEN_SENDS_MS` | Min ms between sends (default: `2000`) |

### 3. Frontend environment

```bash
cp frontend/.env.example frontend/.env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Start everything

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| BullMQ Dashboard | http://localhost:3001/admin/queues |
| Elasticsearch | http://localhost:9200 |

---

## 🛠 Manual (Without Docker)

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- Elasticsearch 8+ (optional — search degrades gracefully)

### Backend

```bash
cd backend
npm install

# Set up DB + Redis in backend/.env
npm run migrate      # Run DB migrations
npm run dev          # Start API server (port 3001)

# In a separate terminal:
npm run worker       # Start BullMQ worker
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # Start Next.js (port 3000)
```

---

## 📡 API Reference

### Auth

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/google` | Initiate Google OAuth |
| `GET` | `/auth/google/callback` | OAuth callback → JWT |
| `GET` | `/auth/me` | Get current user (Bearer token) |
| `POST` | `/auth/logout` | Logout |

### Emails

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/emails/schedule` | Schedule email campaign (multipart/form-data) |
| `GET` | `/api/emails/scheduled` | List scheduled emails (paginated) |
| `GET` | `/api/emails/sent` | List sent/failed emails (paginated) |
| `GET` | `/api/emails/search?q=...` | Full-text search via Elasticsearch |
| `GET` | `/api/emails/campaigns` | List campaigns |
| `GET` | `/api/emails/stats` | Aggregate stats |

### Slack

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/slack/connect` | Start Slack OAuth |
| `GET` | `/auth/slack/callback` | Slack OAuth callback |
| `GET` | `/auth/slack/status` | Check if Slack is connected |
| `DELETE` | `/auth/slack/disconnect` | Disconnect Slack |

### Schedule Email — `POST /api/emails/schedule`

```
Content-Type: multipart/form-data

senderEmail    string   required  — SMTP sender address
subject        string   required
body           string   required  — HTML supported
startAt        ISO8601  required  — When first email should send
delayBetweenEmailsMs  number  — ms between emails (default 2000)
hourlyLimit    number   — per-sender hourly cap (default 50)
campaignName   string   optional
file           File     optional  — CSV or TXT with email addresses
recipients     string   optional  — comma-separated if no file
```

---

## ⚙️ How Scheduling Works

1. **Request arrives** → API validates, creates a Campaign record in PostgreSQL.
2. For each recipient, an email record is inserted with an `idempotency_key = campaignId:recipientEmail`.
3. A **BullMQ delayed job** is added with `jobId = email-{idempotencyKey}` and `delay = startAt + i * delayBetweenEmailsMs - now`.
   - BullMQ uses Redis Sorted Sets to store delayed jobs keyed by their trigger timestamp.
   - On **server restart**, BullMQ reconnects to Redis and picks up all existing delayed/waiting jobs — **nothing is lost**.
4. Worker picks up jobs when their delay elapses.

### Persistence After Restart

- All job definitions live in **Redis** (BullMQ's persistent store with AOF enabled).
- Emails that haven't been sent yet retain their original `delay` timestamp.
- The `jobId` = `email-{campaignId}:{recipient}` ensures **BullMQ won't create a duplicate job** if the same schedule request is retried (idempotency at the queue level).
- DB is also checked at the start of each job: if `status = 'sent'`, the job is skipped.

---

## 🚦 Rate Limiting

### Design

- **Per-sender counter**: Redis key `ratelimit:sender:{email}:hour:{YYYY-MM-DD-HH}` with 1-hour TTL.
- **Global counter**: Redis key `ratelimit:global:hour:{YYYY-MM-DD-HH}` with 1-hour TTL.
- Atomic `INCR` + `EXPIRE` via Redis pipeline — safe across **multiple worker instances**.
- **Configurable** via env:
  - `MAX_EMAILS_PER_HOUR_PER_SENDER` (default: 50)
  - `MAX_EMAILS_PER_HOUR` (default: 200)

### When Limit Is Hit

1. Worker detects counter > limit.
2. Calls `job.moveToDelayed(nextHourWindowStart + jitter)` — job is **not dropped or failed**, just rescheduled to the next hour window, preserving approximate order.
3. If the user has connected Slack, an immediate Slack notification is sent via the Slack API (`chat.postMessage`).

### BullMQ Limiter (extra layer)

Additionally, the BullMQ worker is configured with:
```ts
limiter: { max: 100, duration: 60000 }
```
This caps the rate at the queue-processor level as a safety net.

### Min Delay Between Sends

Workers `await sleep(MIN_DELAY_BETWEEN_SENDS_MS)` before each send, mimicking provider throttling. Default: **2 seconds**.

---

## 🔄 Concurrency

- `WORKER_CONCURRENCY=5` → up to 5 jobs processed in parallel per worker instance.
- Multiple `worker` replicas (2 by default in Docker Compose) → up to 10 concurrent sends.
- Rate limit counters are Redis-backed → safe across all worker instances.
- BullMQ handles job locking internally (one worker processes each job).

---

## 🧪 Ethereal Email Setup

[Ethereal Email](https://ethereal.email/) is a fake SMTP service for testing.

**Option A — Auto-generated per sender** (default):
Leave `ETHEREAL_USER` and `ETHEREAL_PASS` empty. The backend will call `nodemailer.createTestAccount()` to generate credentials for each new sender. Preview URLs are stored in the DB and shown in the UI.

**Option B — Manual account**:
1. Go to https://ethereal.email/create
2. Copy the generated credentials
3. Set `ETHEREAL_USER` and `ETHEREAL_PASS` in `backend/.env`

After an email is sent, its **Ethereal preview URL** appears in the Sent Emails table — click it to view the email in the browser.

---

## 📊 BullMQ Dashboard

Live queue visibility at: http://localhost:3001/admin/queues

Shows:
- Waiting / Delayed / Active / Completed / Failed job counts
- Individual job details, data, timestamps, retry history
- Manual retry/delete controls

---

## ✅ Feature Checklist

### Backend
- [x] Express.js + TypeScript
- [x] BullMQ delayed jobs (no cron)
- [x] PostgreSQL (users, campaigns, scheduled_emails, senders)
- [x] Ethereal Email via Nodemailer (auto-account creation)
- [x] Multiple senders with separate Ethereal credentials
- [x] Job persistence — survives server restart
- [x] Idempotency — `jobId = email-{campaignId}:{recipient}` + DB check
- [x] Worker concurrency (configurable `WORKER_CONCURRENCY`)
- [x] Min delay between sends (configurable `MIN_DELAY_BETWEEN_SENDS_MS`)
- [x] Per-sender hourly rate limiting (Redis atomic counters)
- [x] Global hourly rate limiting
- [x] Rate-limit rescheduling to next hour window (not dropped)
- [x] Slack OAuth (real OAuth2 flow, bot token stored per user)
- [x] Slack notification on rate limit hit (live API call)
- [x] Elasticsearch indexing + full-text search
- [x] BullMQ Board (`/admin/queues`)
- [x] Google OAuth + JWT auth

### Frontend
- [x] Google OAuth login (real OAuth, not mocked)
- [x] JWT token stored in localStorage, attached to all API requests
- [x] User info (name, email, avatar) in header
- [x] Logout
- [x] Stats cards (scheduled / sent / failed / total)
- [x] Scheduled emails table (paginated, live-polling every 10s)
- [x] Sent emails table with Ethereal preview links
- [x] Compose modal: subject, body, sender, file upload (CSV/TXT), manual email paste
- [x] Email count detection from uploaded file
- [x] Start time, delay, hourly limit configuration
- [x] Slack connect/disconnect button
- [x] Search bar (client-side filter + Elasticsearch backend)
- [x] Loading states, empty states, error handling, toast notifications
- [x] Dark theme, Tailwind CSS, TypeScript throughout

---

## 🏎 Behavior Under Load (1000+ emails)

When 1000 emails are scheduled simultaneously:

1. All 1000 DB records are inserted immediately.
2. 1000 BullMQ jobs are added with staggered `delay = i * delayBetweenEmailsMs`.
   - E.g., 2s delay → jobs spread over ~33 minutes.
3. Workers (up to 10 concurrent with 2 replicas × 5 concurrency) process jobs as they become ready.
4. If `MAX_EMAILS_PER_HOUR_PER_SENDER = 50` and all go through the same sender, job #51+ gets rescheduled to the next hour automatically.
5. No jobs are dropped — they're all in Redis and PostgreSQL.

---

## 🔧 Trade-offs & Assumptions

- **Email sending is async**: The `/schedule` endpoint returns immediately after creating DB records and BullMQ jobs. Actual sends happen in the background.
- **Ethereal is fake SMTP**: Not suitable for production. Swap the transport for SES/SendGrid in production.
- **Rate limit counter includes both sent and rescheduled jobs**: A job that gets rescheduled will decrement the next-hour's quota by 1 (not the current hour's) — this is the correct behavior.
- **Elasticsearch is optional**: If ES is not running, search will return a 500 but other features work fine.
- **Session + JWT**: Google OAuth uses Passport sessions internally for the callback flow; JWTs are used for API auth (stateless).
- **Multiple Senders**: Each unique `senderEmail` in a request gets its own Ethereal SMTP account auto-provisioned if one doesn't exist.

---

## 📁 Project Structure

```
reachinbox-scheduler/
├── docker-compose.yml
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express app entry
│   │   ├── api/
│   │   │   ├── auth.ts           # Google OAuth + JWT
│   │   │   ├── emails.ts         # Schedule / list / search
│   │   │   └── slack.ts          # Slack OAuth
│   │   ├── config/
│   │   │   ├── database.ts       # PostgreSQL pool
│   │   │   ├── redis.ts          # IORedis client
│   │   │   ├── elasticsearch.ts  # ES client + index setup
│   │   │   └── passport.ts       # Google OAuth strategy
│   │   ├── middleware/
│   │   │   └── auth.ts           # JWT middleware
│   │   ├── models/
│   │   │   └── migrate.ts        # DB migrations
│   │   ├── queues/
│   │   │   └── emailQueue.ts     # BullMQ Queue definition
│   │   ├── services/
│   │   │   ├── schedulerService.ts  # Campaign scheduling logic
│   │   │   ├── senderService.ts     # Ethereal account creation
│   │   │   └── slackService.ts      # Slack API calls
│   │   └── workers/
│   │       └── emailWorker.ts    # BullMQ Worker (send + rate limit)
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx           # Redirect → /login
    │   │   ├── login/page.tsx     # Google OAuth login page
    │   │   ├── auth/callback/page.tsx  # Token capture
    │   │   └── dashboard/page.tsx # Main dashboard
    │   ├── components/
    │   │   ├── ui/
    │   │   │   ├── Header.tsx
    │   │   │   ├── StatCard.tsx
    │   │   │   ├── SearchBar.tsx
    │   │   │   └── SlackButton.tsx
    │   │   └── email/
    │   │       ├── EmailTable.tsx
    │   │       └── ComposeModal.tsx
    │   ├── hooks/
    │   │   ├── useAuth.ts
    │   │   └── useEmails.ts
    │   ├── lib/
    │   │   ├── api.ts             # Axios client + all API calls
    │   │   └── utils.ts           # Helpers (cn, formatDate, etc.)
    │   └── types/
    │       └── index.ts           # TypeScript interfaces
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    └── Dockerfile
```

---

## 🎥 Demo Video Notes

The demo video (≤5 min) covers:

1. **Login** — Google OAuth flow, redirect, JWT stored
2. **Compose** — Upload CSV, set schedule time, submit → BullMQ job created
3. **Scheduled Emails table** — Jobs visible immediately
4. **BullMQ Board** — `/admin/queues` shows delayed jobs with timestamps
5. **Wait / fast-forward** — Jobs fire at scheduled time, emails appear in Sent table
6. **Preview URL** — Click Ethereal link to view the actual email
7. **Restart scenario** — Stop `docker compose stop backend worker`, restart, future jobs still fire
8. **Rate limit demo** — Set `MAX_EMAILS_PER_HOUR_PER_SENDER=2`, schedule 5 emails → Slack notification fires, jobs rescheduled
#   R e a c h i n b o x  
 