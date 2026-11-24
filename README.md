<p align="center">
  <img src="public/logo.png" alt="Accord Logo" width="100" />
</p>

<h1 align="center">Accord</h1>

<p align="center">
  Exam scheduling system for La Concepcion College
</p>

---

## Overview

**Accord** is a web-based exam scheduling platform built for La Concepcion College (Philippines). It automates the generation of conflict-free exam timetables while respecting room capacities, proctor availability, section conflicts, and daily exam limits.

The system supports three user roles — **Admin**, **Department Head**, and **Proctor** — each with tailored dashboards, permissions, and workflows. From schedule generation and approval to proctor assignment, emergency handling, and in-app communication, Accord covers the full exam-period lifecycle.

## Features

### Scheduling Engine
- Constraint-based schedule generation (room capacity, proctor availability, section conflicts, max exams per day)
- Draft → Generated → Approved → Ended period lifecycle with admin approval workflow
- Emergency flagging by proctors with replacement proctor discovery
- Room swap, room reassignment, and exam rescheduling
- Resolve unplaced exams after generation
- Proctor self-service assignment requests with configurable cutoff hours

### Data Import & Export
- PDF curriculum import (parses subjects, sections, units from PDF files)
- Spreadsheet room import (`.xlsx` / `.csv`)
- Export schedules as PDF, PNG, or CSV
- Full JSON backup (admin only)

### Communication
- In-app private chat messaging between users
- Bulletin / announcement board with department-targeted posts
- In-app notification system with email notifications for important events

### User Management
- Self-registration for proctors (pending admin/head approval)
- OTP email verification on signup, login, password change, email change, and password reset
- Trusted device recognition (7-day remember-me via HttpOnly cookies)
- Role-based access control with department scoping for heads

### Intelligence
- AI assistant with keyword matching and Google Gemini API fallback
- Role-scoped data queries with natural language date/time parsing
- Function-calling tools for contextual exam schedule lookups

### Other
- First-login guided tour (role-specific steps)
- Audit log with 30-day trash and restore
- Light / dark mode with customizable accent colors
- Availability entry with period-lock enforcement
- Dashboard with animated statistics

## User Roles

| Role | Access |
|------|--------|
| **Admin** | Full system access — manage all departments, programs, subjects, sections, rooms, users. Generate, approve, and end exam periods. View all schedules, reports, audit logs. Post bulletins. Access JSON backup. |
| **Department Head** | Scoped to their department — manage proctors, subjects, and sections within their department. Submit and review availability. View department schedules and reports. Post department bulletins. |
| **Proctor** | Submit availability for active periods. View personal schedule. Accept or decline exam assignments. Flag emergencies. Chat with other users. |

## Architecture & Tech Stack

```
┌──────────────────────────────────────────────────┐
│                   Frontend                       │
│  React 18 · React Router 6 · Vite 5 · TypeScript│
└────────────────────┬─────────────────────────────┘
                     │  /api/* (HTTP)
┌────────────────────▼─────────────────────────────┐
│              Vercel Serverless Functions          │
│  Node.js · TypeScript · Vercel Edge Network      │
└────────────────────┬─────────────────────────────┘
                     │  PostgreSQL + REST
┌────────────────────▼─────────────────────────────┐
│                  Supabase                        │
│  PostgreSQL · Auth · Row-Level Security · Storage│
└──────────────────────────────────────────────────┘
```

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, React Router 6, Vite 5, TypeScript / JSX |
| **Backend** | Vercel Serverless Functions (Node.js, TypeScript) |
| **Database** | Supabase (PostgreSQL) with Row-Level Security |
| **Auth** | Supabase Auth + custom OTP via Nodemailer (Gmail SMTP) |
| **AI Assistant** | Google Gemini API (optional) |
| **PDF Parsing** | pdfjs-dist |
| **Spreadsheets** | SheetJS (xlsx) |
| **Fonts** | Poppins, EB Garamond (Google Fonts) |

## Database Overview

The database schema is defined in `supabase/schema.sql` with additional migrations in the `supabase/` directory.

| Table | Purpose |
|-------|---------|
| `departments` | Academic departments (code, name, logo URL) |
| `programs` | Degree programs linked to departments |
| `profiles` | User accounts (name, role, department, status, avatar, tour state) |
| `subjects` | Course subjects with units and curriculum year |
| `sections` | Student sections linked to programs |
| `rooms` | Exam rooms with capacity and optional department assignment |
| `availability` | Proctor availability per exam period with day/time preferences |
| `exam_periods` | Exam period definitions with status lifecycle |
| `schedules` | Generated exam schedule entries (subject → room → proctor → timeslot) |
| `audit_log` | Action audit trail for all data changes |
| `trash` | Soft-deleted records with 30-day retention |
| `notifications` | In-app notification messages |
| `bulletins` | Announcements targeted to specific departments or all users |
| `chat_messages` | Private messages between users |
| `otp_sessions` | OTP verification sessions for login/signup flows |
| `trusted_devices` | Remembered device tokens for 7-day sessions |

## Folder Structure

```
exam-scheduler/
├── api/                    # Vercel serverless API functions
│   ├── _lib.ts             # Supabase client, auth, audit log, pagination helpers
│   ├── _notify.ts          # Email + in-app notification sender
│   ├── _otp.ts             # OTP generation and verification
│   ├── _password.ts        # Password validation rules
│   ├── _scheduler.js       # Core schedule generation algorithm
│   ├── _gemini.js          # Gemini API integration helper
│   ├── db.ts               # CRUD operations for all tables
│   ├── schedule.ts         # Schedule generation, approval, assignment endpoints
│   ├── otp.ts              # Login, signup, password/email change OTP flows
│   ├── signup.ts           # Proctor self-registration
│   ├── assistant.ts        # AI assistant with keyword + Gemini fallback
│   └── chat.ts             # Private messaging endpoints
├── public/
│   └── logo.png            # Application logo
├── scripts/
│   ├── seed-demo.ts        # Seed database with demo data
│   ├── curriculum.ts       # Curriculum data utilities
│   ├── apply-split.mjs     # Migration helper
│   └── ts-to-js.mjs        # TypeScript to JavaScript converter
├── server/
│   └── dev.ts              # Local development server (API on :3001)
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── ChatPanel.jsx       # Private messaging panel
│   │   ├── Tour.jsx            # First-login guided tour
│   │   ├── AssistantPanel.tsx   # AI assistant sidebar
│   │   ├── BulletinPanel.jsx   # Announcements panel
│   │   ├── NotificationPanel.jsx# Notifications dropdown
│   │   ├── OtpGate.jsx         # OTP verification modal
│   │   ├── CrudTable.tsx       # Generic data table with CRUD
│   │   ├── EditBlockModal.tsx   # Schedule block editor
│   │   ├── ImportCurriculum.tsx # PDF curriculum importer
│   │   ├── ImportRooms.tsx     # Spreadsheet room importer
│   │   ├── ExportMenu.jsx      # PDF/PNG/CSV export menu
│   │   ├── Charts.jsx          # Dashboard chart components
│   │   └── ...                 # Other UI components
│   ├── lib/                # Shared utilities and hooks
│   │   ├── api.ts              # API client (GET, POST)
│   │   ├── supabase.ts         # Supabase client initialization
│   │   ├── periods.ts          # Period status helpers
│   │   ├── exportSchedule.ts   # Schedule export logic
│   │   ├── exportReport.ts     # Report export logic
│   │   ├── curriculumPdf.ts    # PDF parsing for curriculum import
│   │   ├── theme.ts            # Light/dark mode and accent colors
│   │   └── ...                 # Other utilities
│   ├── pages/              # Route-level page components
│   │   ├── Overview.jsx        # Dashboard with statistics
│   │   ├── Periods.jsx         # Exam period management
│   │   ├── Config.jsx          # System configuration (departments, rooms, etc.)
│   │   ├── Reports.jsx         # Schedule reports and analytics
│   │   ├── History.jsx         # Audit log and trash
│   │   ├── MySchedule.jsx      # Proctor's personal schedule
│   │   ├── Availability.jsx    # Proctor availability entry
│   │   ├── Requests.jsx        # Assignment requests
│   │   └── Login.jsx           # Login page
│   ├── App.jsx             # Root app with routing and layout
│   ├── main.jsx            # React entry point
│   ├── main.css            # Global styles
│   └── styles.css          # Component styles
├── supabase/
│   ├── schema.sql          # Full database schema with RLS and seed data
│   └── migration-*.sql     # Incremental migration scripts
├── .env.example            # Environment variable template
├── index.html              # HTML entry point
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── vercel.json             # Vercel deployment configuration
└── vite.config.ts          # Vite build configuration
```

## Getting Started

### Prerequisites

- **Node.js** ≥ 18 and **npm**
- A **Supabase** project ([supabase.com](https://supabase.com))
- A **Gmail account** with an [App Password](https://support.google.com/accounts/answer/185833) for OTP emails
- *(Optional)* A **Google Gemini API key** for the AI assistant

### 1. Clone the repository

```bash
git clone https://github.com/mjeyjey/Accord.git
cd Accord
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side only, never expose) |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `GMAIL_USER` | Gmail address for sending OTP emails |
| `GMAIL_APP_PASSWORD` | 16-character Google App Password |
| `OTP_SECRET` | A long random secret string for OTP token signing |
| `GEMINI_API_KEY` | *(Optional)* Google Gemini API key for the AI assistant |
| `GEMINI_MODEL` | *(Optional)* Gemini model name (e.g., `gemini-pro`) |
| `APP_URL` | *(Optional)* Application URL for email links |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` (exposed to browser) |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` (exposed to browser) |

> **Note:** Server-only variables must **not** be prefixed with `VITE_`. The `.env.example` file documents which variables are safe for the browser.

### 3. Set up the database

In your Supabase project's SQL Editor, run the following files **in order**:

1. `supabase/schema.sql` — Full schema, RLS policies, and seed data (10 departments, 18 programs)
2. `supabase/migration-features.sql`
3. `supabase/migration-notifications-curriculum.sql`
4. `supabase/migration-notifications-bulletin.sql`
5. `supabase/migration-trusted-device.sql`
6. `supabase/migration-accept-cutoff.sql`
7. `supabase/migration-chat-tour.sql`

Additional optional migrations: `profile-avatar.sql`, `room-department.sql`, `trash.sql`

### 4. Start the development server

```bash
npm run dev
```

This runs two processes concurrently:
- **API server** at `http://localhost:3001` — `tsx watch server/dev.ts`
- **Vite dev server** at `http://localhost:5173` — proxies `/api` requests to the API server

### 5. (Optional) Seed demo data

```bash
npx tsx scripts/seed-demo.ts
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development servers (API + Vite) |
| `npm run build` | Type-check and build for production (`tsc && vite build`) |
| `npm run typecheck` | Run TypeScript type checking only |
| `npx tsx scripts/seed-demo.ts` | Seed the database with demo data |

## API Endpoints

All endpoints are under `/api/` and require OTP-authenticated sessions (cookie-based).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/db` | GET, POST, PATCH, DELETE | CRUD operations for all data tables (departments, programs, subjects, sections, rooms, profiles, availability, bulletins, notifications). Role-based filtering. |
| `/api/schedule` | GET, POST, PATCH | Schedule generation, review/approval, proctor assignment/reassignment, room swap, emergency handling, curriculum/room import, backup. |
| `/api/otp` | POST | OTP send/verify for login, signup, password change, email change, password reset. Logout with device cleanup. |
| `/api/signup` | POST | Proctor self-registration with OTP email verification. |
| `/api/assistant` | POST | AI assistant queries — keyword matching with Gemini API fallback. |
| `/api/chat` | GET, POST | Private messaging — conversations list, message threads, unread counts, send messages. |

## Deployment

Accord is configured for deployment on **Vercel**.

1. Connect your GitHub repository to a Vercel project
2. Set all environment variables from `.env.example` in the Vercel dashboard under **Settings → Environment Variables**
3. Deploy — Vercel will automatically:
   - Build with `vite build`
   - Deploy API functions from the `api/` directory
   - Apply SPA rewrites for client-side routing

### Vercel Configuration Highlights

- `api/schedule.ts` has a 60-second function timeout (schedule generation)
- `api/assistant.ts` has a 30-second function timeout (AI responses)
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`

## Security

- **Row-Level Security (RLS)** enabled on all Supabase tables
- **Service-role key** used server-side only, with manual role-based access checks in every API endpoint
- **OTP two-factor authentication** required on every login (6-digit codes via email)
- **Trusted device cookies** — HttpOnly, Secure, SameSite=Lax, 7-day expiry
- **Password validation** with strength requirements
- **Rate limiting** on chat messages (30 per minute) and OTP requests
- **Security headers** via Vercel: HSTS, nosniff, DENY framing, strict referrer policy
- **Input validation** and length limits on all API inputs
- **Audit logging** of all data mutations

## Current Status

**Version 1.0.0** — All features listed above are implemented and functional.

There is currently no automated test suite.

## Future Considerations

These are **not yet implemented** and are noted as potential enhancements:

- Automated test suite (unit, integration, e2e)
- Mobile application

## License

This project is proprietary software developed for La Concepcion College.

---

<p align="center">
  Built for La Concepcion College
</p>
