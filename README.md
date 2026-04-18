<!-- markdownlint-disable MD012 MD022 MD031 MD032 MD033 MD034 MD036 MD040 MD051 MD058 MD060 -->

# NOVA

NOVA is an AI-powered organizational wellness and workforce risk intelligence platform. It helps HR, managers, and leadership identify burnout and attrition risk early, with explainable scoring and intervention recommendations.

Live demo: https://nova-brown-xi.vercel.app/

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture and Design Decisions](#architecture-and-design-decisions)
3. [External APIs and Required Configuration](#external-apis-and-required-configuration)
4. [Project Structure](#project-structure)
5. [Setup and Installation](#setup-and-installation)
6. [Running the Application](#running-the-application)
7. [Testing](#testing)
8. [Backend CI and Render Deploy](#backend-ci-and-render-deploy)
9. [Docker Setup](#docker-setup)
10. [API Endpoints](#api-endpoints)
11. [Role-Based Access Control](#role-based-access-control)
12. [Troubleshooting](#troubleshooting)
13. [Documentation](#documentation)
14. [License and Support](#license-and-support)

---

## Overview

NOVA provides:

- Burnout, retention, and performance risk analysis.
- Statistical anomaly detection with explainability.
- Role-aware dashboards and intervention workflows.
- Supabase-backed authentication and persistence.
- AI-assisted analysis with deterministic fallback behavior.

Core stack:

- Backend: FastAPI, Python 3.11+, Supabase/PostgreSQL, Groq integration.
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Recharts, D3.js.

---

## Architecture and Design Decisions

### System Design

```
Frontend (React + TypeScript)
    |
    | REST
    v
Backend (FastAPI)
    |
    | SQL/API
    v
Supabase PostgreSQL + Auth
```

### Design Decisions

1. Structured fallback first: AI outputs preserve a stable contract (`summary`, `key_signals`, `recommended_action`, `confidence`, `urgency`) even when external providers fail.
2. RBAC at API boundary: role checks are enforced in backend dependencies, not only frontend routing.
3. Thin route handlers: business logic remains in service/AI modules for maintainability and testability.
4. Explainability as a contract: scoring endpoints expose rationale and weighted contributors.
5. Canonical employee identity: deterministic NOVA IDs and shared hierarchy fields prevent cross-page identity drift.
6. Privacy and auditability: sensitive access paths are role-scoped and auditable.

---

## External APIs and Required Configuration

The project depends on external services for auth, storage, and AI inference.

| Service | Required | Environment variables | Setup notes |
|---|---|---|---|
| Supabase (PostgreSQL + Auth) | Yes | `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Create a Supabase project, run SQL migrations, enable Email/Password auth. |
| Groq API (LLM) | Yes for AI features | `GROQ_API_KEY` (`GROQ_MODEL_PRIMARY`, `GROQ_MODEL_FALLBACK` optional) | Create API key in Groq console. |
| Google OAuth via Supabase | Optional (recommended) | Configured in Supabase provider settings | Enable Google provider and configure redirect URL(s). |
| Jira Cloud | Optional | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | Needed only for live Jira integration paths. |

Reference files:

- Backend env template: `backend/.env.example`
- Frontend env file: `frontend/.env`

---

## Project Structure

```
backend/
  ai/
  api/
  core/
  database/
  tests/
frontend/
  src/
docs/
docker-compose.yml
```

---

## Setup and Installation

### Prerequisites

- Python 3.11+
- Node.js 18+
- Supabase project (PostgreSQL + Auth)
- Docker Desktop (optional)

### Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1  # Windows PowerShell
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
copy .env.example .env        # Windows PowerShell
# cp .env.example .env        # macOS/Linux
```

Update `backend/.env` with Supabase and Groq values.

### Database Migrations

Apply SQL migrations in Supabase SQL Editor using files in `backend/database/`.

Optional script helpers from `backend/`:

```bash
python scripts/apply_feedback_sessions_migration.py
python scripts/apply_employee_actions_migration.py
python scripts/apply_employee_feedbacks_migration.py
python scripts/apply_hierarchy_migration.py
```

### Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Optional Google OAuth setup:

- Enable Google provider in Supabase Auth.
- Add redirect URL for local frontend (example: `http://localhost:8080/login?oauth=google`).

---

## Running the Application

Run backend:

```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

Run frontend:

```bash
cd frontend
npm run dev
```

Local URLs:

- Frontend: http://localhost:8080
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

---

## Testing

Backend tests:

```bash
cd backend
python -m pytest tests -q
```

Frontend tests and build:

```bash
cd frontend
npm run test
npm run build
```

Quick health check:

```bash
curl http://localhost:8000/health
```

---

## Backend CI and Render Deploy

This repository includes a backend-only GitHub Actions workflow:

- Workflow file: [.github/workflows/backend-ci-render.yml](.github/workflows/backend-ci-render.yml)
- Trigger scope: changes under backend/, render.yaml, or the workflow file itself
- CI behavior: installs backend dependencies, runs compile check, then runs pytest on backend tests
- CD behavior: on push to main/master, triggers Render deploy only if deploy hook secret is configured

### GitHub Secrets Required

Add this repository secret in GitHub:

- RENDER_BACKEND_DEPLOY_HOOK_URL

To get this value in Render:

1. Open your Render service (nova-backend).
2. Go to Settings.
3. Find Deploy Hook and create/copy the hook URL.
4. Save it as RENDER_BACKEND_DEPLOY_HOOK_URL in GitHub repository secrets.

If the secret is missing, CI still runs, but deploy is skipped.

---

## Docker Setup

Docker files are provided for each service:

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.yml`

Required env files:

- `backend/.env`
- `frontend/.env`

Run full stack:

```bash
docker compose up --build
```

Run services separately:

```bash
# Backend
docker build -t nova-backend ./backend
docker run --rm -p 8000:8000 --env-file ./backend/.env nova-backend

# Frontend
docker build -t nova-frontend ./frontend
docker run --rm -p 8080:8080 --env-file ./frontend/.env nova-frontend
```

---

## API Endpoints

This section lists the primary route families. For full request/response schemas, use Swagger at http://localhost:8000/docs.

- Auth: `/auth/*`
- AI analysis: `/api/ai/*`
- Agent/voice routing: `/api/agent/*`
- Interventions and anomalies: `/api/interventions/*`
- Explainability and reports: `/api/explain/*`, `/api/reports/*`, `/api/benchmarks/*`
- Feedback workflows: `/api/feedback/*`, `/api/hr/feedbacks/*`
- Integrations: `/api/integrations/*`
- Organization and employees: `/api/employees/*`, `/api/org/*`
- Leadership and manager views: `/leadership/*`, `/manager/*`, `/hr/*`

---

## Role-Based Access Control

| Role | Scope |
|---|---|
| Employee | Self-service views and personal insights |
| Manager | Team-level analytics and actions |
| HR | Organization-wide analytics and intervention workflows |
| Leadership | Executive organization-level visibility |

All protected endpoints require a valid JWT with role-appropriate access.

---

## Troubleshooting

1. Missing Supabase tables (`PGRST205`): apply migrations in `backend/database/`.
2. Frontend cannot reach backend: verify `VITE_API_BASE_URL` and restart frontend dev server.
3. OAuth login fails: confirm Supabase provider settings and redirect URL.
4. AI endpoints return fallback output: verify `GROQ_API_KEY` in `backend/.env`.

---

## Documentation

- API docs: http://localhost:8000/docs
- RBAC guide: [backend/RBAC_GUIDE.md](backend/RBAC_GUIDE.md)

---

## License and Support

- License: [LICENSE](LICENSE)
- Issues: GitHub Issues
- Contact: agnivkdutta@gmail.com
