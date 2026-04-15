<h1 align="center">🚀 NOVA: AI-Powered Organizational Wellness & Risk Intelligence Platform</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111827" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Groq-LLM-F55036" alt="Groq" />
</p>

**Live Demo**: https://nova-two-woad.vercel.app/

---

## 📋 Table of Contents

1. [Overview](#-overview)
2. [The Problem](#-the-problem)
3. [Our Solution](#-our-solution)
4. [Key Features](#-key-features)
5. [Tech Stack](#-tech-stack)
6. [Architecture](#-architecture)
7. [API Endpoints](#-api-endpoints)
8. [Setup & Installation](#-setup--installation)
9. [Running the Application](#-running-the-application)
10. [Role-Based Access Control](#-rbac)
11. [Implementation Status](#-implementation-status)
12. [Roadmap](#-roadmap)

---

## 🎯 Overview

**NOVA** is an enterprise-grade AI analytics platform designed to predict and prevent employee burnout, attrition, and organizational health crises **before they happen**.

Using advanced machine learning, statistical anomaly detection, and network analysis, NOVA provides HR leaders with **actionable insights** and **AI-recommended interventions** to protect their most valuable assets: their people.

### Key Statistics
- **15+ role-aware dashboards and panels** for organizational health
- **100-employee canonical directory** with deterministic NOVA IDs and shared hierarchy fields
- **8 intervention types** automatically recommended by AI
- **5 behavioral anomaly detectors** using Z-score analysis
- **Network-based burnout propagation modeling**
- **7 enterprise expansion modules** now integrated (OAuth, reporting, benchmarking, Jira signals, manager 360, onboarding watch, PWA)
- **Role-based access control** for HR, Managers, Leadership, and Employees

---

## 🔴 The Problem

### The Burnout Crisis
- **76% of employees** report experiencing burnout at least sometimes
- **High-performing employees** leave at 5x the rate due to burnout
- **Average turnover cost**: 50-200% of annual salary
- **Detection lag**: Companies typically notice burnout **3-6 months too late**

### Current State of HR Analytics
❌ Reactive dashboards (showing past trends, not predicting future)  
❌ No early intervention system (waiting for employee complaints)  
❌ Silent departures (high performers leaving before anyone notices)  
❌ Isolated metrics (burnout, sentiment, performance not connected)  
❌ No network effects considered (burnout spreading through teams)  
❌ Manual intervention planning (rules of thumb, not data-driven)

---

## ✅ Our Solution

### 🤖 AI-Powered Prediction Engine

**NOVA combines three powerful approaches:**

#### 1. **Rule-Based Burnout Scoring** (Instant, Explainable)
```
Risk Score = (
  0.30 × overtime_hours +
  0.20 × unused_pto_days +
  0.25 × negative_sentiment +
  0.15 × meeting_load +
  0.10 × tenure_risk
)
```
- Visible rules → stakeholders understand the scoring
- Instant calculation → real-time dashboards
- Calibrated on IBM HR Analytics dataset

#### 2. **LLM-Enriched Analysis** (Context-aware, Nuanced)
- **Groq AI integration** analyzes text feedback, survey responses, performance notes
- Generates natural language explanations of risk drivers
- Produces standardized 3-bullet summaries and action recommendations
- Streaming responses for real-time dashboards
- Sentiment engine also checks **sarcasm cues** (positive wording with negative intent)
- Judge demo prompt samples for the existing Sentiment Analyzer:
  - Should detect sarcasm:
    - "Oh great, another all-hands meeting. Just what I needed on a Friday afternoon."
    - "Sure, I absolutely love staying until 9 PM every single day. Best work-life balance ever."
    - "Wow, my manager finally responded to my message. Only took three weeks."
    - "Yeah, the new process is amazing. We now need 6 approvals to send one email."
  - Should NOT detect sarcasm:
    - "The team lunch today was really fun, felt good to connect outside work."
    - "Got great feedback on my presentation, feeling motivated."
  - Edge case (subtle sarcasm):
    - "I'm sure the 'optional' team outing that managers track attendance for will be very relaxing."

#### 3. **Statistical Anomaly Detection** (Early Warning System)
- **Z-score analysis** detects sudden behavioral shifts (not just absolute scores)
- **5 detection types**: Sentiment crashes, engagement drops, performance declines, after-hours surges, communication drops
- **Composite detection**: 3+ simultaneous anomalies = **CRITICAL alert**
- Example: Employee's sentiment yesterday: 0.5 → today: -0.8 = **2.8σ anomaly**

#### 4. **Network-Based Risk Propagation** (Contagion Modeling)
- Models burnout as epidemiological network spread
- Calculates centrality (influence, bridge positions, isolation)
- Estimates propagation risk: `Risk = 0.4×own + 0.3×neighbors + 0.2×centrality×neighbor_avg + 0.1×degree`
- **Identifies burnout clusters** spreading through teams

#### 5. **Onboarding Cohort Baselines** (Fair Comparison for New Joiners)
- Detects employees in first 90 days and marks onboarding phase explicitly
- Uses onboarding baseline logic instead of org-wide comparisons for early-tenure risk
- Adds onboarding risk flags: **Integration Risk**, **Ramp Risk**, **Isolation Risk**
- Exposes onboarding watchlist for HR/Leadership via dedicated endpoint

### 🎯 Intelligent Intervention Engine

**8 Intervention Types** automatically recommended based on AI analysis:

| Intervention | Trigger | Timeline | Impact |
|---|---|---|---|
| **1:1 Check-in** | Burnout ≥ 0.75 + negative sentiment | 24-48h | 60-70% report clarity |
| **Workload Reduction** | Chronic high burnout | 1-2 weeks | -20-30% burnout |
| **Peer Mentoring** | Engagement drop + isolation | 6 weeks | +20-30% engagement |
| **Wellness Program** | Sustained high risk ≥ 3 weeks | 4 weeks | -10-15% stress |
| **Promotion Discussion** | High performer + retention risk | 1-2 weeks | 5x better retention |
| **Sabbatical** | Severe burnout (0.95+) | ASAP | 40% recovery in 2w |
| **Team Building** | Low team engagement | 4 weeks | +25% team sentiment |
| **Flexible Schedule** | Work-life imbalance signal | 3 weeks | -20-30% burnout |

### 🧾 Explainability, Accountability, and Trust

- Every major risk metric now supports **"Why this score?"** drilldowns in dashboard UI
- Score explanations include weighted contributors, confidence, and readable rationale
- Cost and savings analytics expose formulas, inputs, and stepwise calculations
- Org Health includes methodology disclosures and simulated-benchmark labels for transparency
- AI feedback sessions include explicit consent handling and review workflow for HR

### 📊 Real-Time Organizational Health Dashboard

**One screen shows the entire org's wellness:**
- Workforce Health Score (composite metric)
- Department burnout heatmaps
- Manager effectiveness scorecards
- Peer network isolation detection
- Attrition prediction timeline
- Engagement × Performance quadrant
- Sentiment trends & vocabulary shifts
- Industry benchmark overlays (simulated medians) for context-aware interpretation
- Downloadable executive-ready report package (multi-page PDF export)

---

## 🎨 Key Features

### 🔍 **Advanced Analytics**
- ✅ **Burnout Risk Assessment** - Rule-based + LLM hybrid scoring
- ✅ **Sentiment Analysis** - Groq-powered with emotion classification + sarcasm cue detection
- ✅ **Retention Flight Risk** - Predict who might leave
- ✅ **Performance Prediction** - Identify high performers at risk
- ✅ **Anomaly Detection** - Z-score detection of sudden behavioral shifts
- ✅ **Network Analysis** - Centrality, collaboration entropy, propagation modeling
- ✅ **Composite Risk Scoring** - Temporal-weighted multi-factor scoring
- ✅ **Onboarding Risk Scoring** - 90-day cohort baseline + onboarding flags
- ✅ **Benchmark Comparison** - Sector-level median overlays for workforce and attrition trends

### 📈 **Visualization & Insights**
- ✅ **12+ Dashboard Components** - Real-time metrics & trends
- ✅ **Workforce Health Score** - Executive summary metric
- ✅ **Manager Effectiveness Scorecard** - Team metrics & eNPS
- ✅ **Burnout Heatmap** - Department × Time visualization
- ✅ **Attrition Prediction Timeline** - Forecast with confidence bands
- ✅ **Engagement-Performance Quadrant** - Identify Stars & At-Risk
- ✅ **Sentiment Analyzer** - Word clouds & trend analysis
- ✅ **Peer Network Graph** - D3.js force-directed graph
- ✅ **Jira Health Panel** - Objective delivery signals with privacy framing
- ✅ **Onboarding Watch** - HR-focused new-joiner risk card with baseline tooltip
- ✅ **HR Feedback Analyzer** - Three-column analysis workspace (filters, feedback queue, batch/single AI analysis)
- ✅ **How You Compare** - Benchmark badge + industry comparison section
- ✅ **Explainability Drawers** - Score-level factor contributions across key cards/charts

### 🎯 **AI-Powered Interventions**
- ✅ **Intervention Engine** - Rule-based + ML hybrid recommendations
- ✅ **Execution Tracking** - Log & monitor intervention outcomes
- ✅ **Timing Awareness** - Avoid suggesting interventions during crunch weeks
- ✅ **Impact Estimation** - "This will reduce burnout by 20-30% in 3 weeks"
- ✅ **Risk Explanation** - "If delayed, disengagement will deepen"
- ✅ **Mandatory Feedback Session Workflow** - Schedule, consent, review, and HR ingestion
- ✅ **HR Session Scheduler** - Dedicated tab for single-employee or department-wide scheduling
- ✅ **HR Session Queue** - Sessions to Review now tracks scheduled, in-progress, and completed-not-reviewed states
- ✅ **Employee Action Channels** - Internal messages, recognitions, and manager 1:1 scheduling integrated end-to-end
- ✅ **Manager 360 Feedback Loop** - Anonymous upward ratings + trend and improvement suggestions
- ✅ **Feedback-to-Appraisal Bridge** - Deep-analyzed feedback can be pushed into appraisal context queue

### 🔐 **Security & Access Control**
- ✅ **Role-Based Access** (RBAC) - HR, Manager, Leadership, Employee roles
- ✅ **Supabase Authentication** - Email/password and Google OAuth + JWT exchange
- ✅ **Data Privacy** - PII handling, audit logging
- ✅ **Streaming AI Chat** - Real-time insights with Server-Sent Events
- ✅ **OAuth Account Linking Rules** - Existing org account matching and explicit reject message for unknown emails

### 📊 **Data Integration**
- ✅ **Multi-Source Data** - Survey, system telemetry, feedback sessions, and integration-ready connectors
- ✅ **Feature Engineering** - 10+ engineered features for ML
- ✅ **Batch Processing** - APScheduler for periodic inference
- ✅ **Real-Time Updates** - Async concurrent processing
- ✅ **Jira Connector (Mock Pipeline)** - Stable seeded ingestion for demo-consistent objective metrics

### 📱 **Product Experience**
- ✅ **Google Sign-In Primary CTA** - OAuth-first login experience
- ✅ **Installable PWA** - Manifest + service worker for app-shell caching
- ✅ **Mobile UX Enhancements** - Bottom tab navigation, install banner, chart touch zoom/scroll handling
- ✅ **Org Health Report Export** - One-click multi-page PDF generation with progress states
- ✅ **Anomaly Alerts List Panel** - Dedicated `/anomalies` view with per-employee anomaly rows and quick profile navigation
- ✅ **Live Sidebar Session Badges** - Sessions-to-review and upcoming-sessions badges auto-refresh every 60s and on window focus
- ✅ **Scroll-Safe What-If Modal** - Fixed header, backdrop close, and 90vh scrollable simulator body for full-content reachability
- ✅ **Employee Profile Data Sources Tab** - Fetches server-side employee detail payload including computed `data_quality_score`
- ✅ **Jira Demo Configure Modal** - Test connection simulation + persisted demo-connected status updates in Integrations UI
- ✅ **Role-Aware Sentiment Navigation** - HR sees Feedback Analyzer while Leadership retains Sentiment Analyzer
- ✅ **Focused Org Tree + Full Org Tree** - hierarchical drilldown with expand/collapse and dedicated tree route
- ✅ **Page-Aware Voice Assistant** - auto-routes to specialized agents by route context (overview, employee, appraisal, feedback, dept heatmap, org structure)
- ✅ **Voice Onboarding Nudge** - first-session bounce + tooltip intro for discoverability
- ✅ **Suggested Question Pills** - page-specific one-tap prompts for judge/demo flow
- ✅ **Speaking Waveform Feedback** - in-bubble animated waveform while speech synthesis is active
- ✅ **Graceful Voice Fallbacks** - text-only mode notice when Web Speech API is unavailable

### 🧭 **Unified Employee Directory & Identity**
- ✅ **Single source of truth roster** - one canonical Indian employee directory reused across Employees, Org Tree, Org Health, and drilldown APIs
- ✅ **Deterministic NOVA IDs** - IDs like `NOVA-ENG001` and `NOVA-SAL005` are stable across frontend and backend
- ✅ **Shared hierarchy model** - `title`, `reports_to`, and `org_level` are wired end to end
- ✅ **No cross-page identity drift** - legacy mixed placeholder pools removed to prevent overlap/confusion

---

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI 0.109.2
- **Server**: Uvicorn
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT + Supabase Auth (email/password + Google OAuth)
- **AI/ML**:
  - Groq API (LLM inference)
  - NumPy / Scikit-Learn (ML models)
  - Custom anomaly detection (Z-score)
  - Network analysis algorithms
- **Integration Layer**:
  - Jira connector module (mocked deterministic ingestion, real API shape)
  - Integration config persistence (`integration_configs`)
- **Async**: Python asyncio
- **Scheduling**: APScheduler (batch jobs)

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **Visualization**: D3.js (network graphs), Recharts (dashboards)
- **State Management**: React Context
- **Auth SDK**: supabase-js (Google OAuth flow)
- **Export Tooling**: jsPDF + html2canvas
- **PWA Runtime**: Web App Manifest + Service Worker
- **HTTP Client**: Fetch API

### Infrastructure
- **Backend**: Render / Heroku (deployment ready)
- **Frontend**: Vercel (deployed)
- **Database**: Supabase Cloud
- **LLM API**: Groq Cloud

---

## 🏗️ Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + TypeScript)            │
│  ├─ Dashboard (12+ visualization components)                 │
│  ├─ OAuth Login + Session Exchange                            │
│  ├─ Employee Management                                      │
│  ├─ Intervention Recommendations UI                          │
│  ├─ Explainability Drawers                                   │
│  ├─ Report Export (PDF)                                      │
│  └─ PWA + Mobile UX Shell                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────┐
│                   BACKEND (FastAPI)                          │
│  ├─ Authentication & RBAC                                   │
│  ├─ AI Analysis Engine                                      │
│  │  ├─ Burnout Assessment (rules + Groq LLM)               │
│  │  ├─ Sentiment Analysis                                   │
│  │  ├─ Performance Prediction                               │
│  │  ├─ Retention Risk Assessment                            │
│  │  ├─ Anomaly Detection (Z-score)                         │
│  │  ├─ Network Analysis (centrality, propagation)          │
│  │  └─ Intervention Engine (8 types)                       │
│  ├─ Batch Processing (APScheduler)                         │
│  ├─ Integrations Layer (Jira connector + config)           │
│  ├─ Reporting & Benchmark APIs                             │
│  └─ API Routes (70+ endpoints)                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ SQL
┌──────────────────────────▼──────────────────────────────────┐
│           DATABASE (Supabase PostgreSQL)                     │
│  ├─ Users & Authentication                                  │
│  ├─ Employee Data                                           │
│  ├─ Risk Scores & History                                   │
│  ├─ Interventions & Execution Log                          │
│  ├─ Anomaly Records                                         │
│  ├─ Integration Configs                                     │
│  ├─ Manager 360 Feedback                                    │
│  ├─ Feedback Session Artifacts                              │
│  └─ Audit Trail                                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow
1. **Data Ingestion** → Employee data from HR systems → Supabase
2. **Analysis** → FastAPI processes data concurrently
   - Burnout scoring (rules)
   - Sentiment analysis (Groq LLM)
   - Retention assessment (hybrid)
   - Performance prediction (LLM)
   - Anomaly detection (Z-score)
   - Network analysis (centrality, propagation)
3. **Recommendations** → Intervention Engine generates suggestions
4. **Visualization** → Real-time dashboards + alerts
5. **Logging** → Track interventions & outcomes

### Employee Identity and Hierarchy Flow
1. **Canonical Directory Seed** → Backend builds deterministic employee directory with NOVA IDs
2. **Shared Consumption** → Employee pages, org-tree endpoints, and analytics widgets read the same roster model
3. **Hierarchy Projection** → `reports_to` relationships are transformed into subtree/full-tree API responses
4. **UI Rendering** → Focused org chart and full org page render identical identities and reporting lines

### Frontend Routes (Role-Aware)
| Route | Purpose | Roles |
|---|---|---|
| `/` | Main dashboard (org snapshots, anomaly bar, interventions) | Manager, HR, Leadership |
| `/employees` | Employee table and drill-in entrypoint | Manager, HR, Leadership |
| `/employees/:employeeId/profile` | Employee profile with Data Sources tab and explainability links | Manager, HR, Leadership |
| `/insights/:employeeId` | AI insights dashboard with composite risk and card-level analysis | HR, Manager |
| `/hr/feedback-analyzer` | HR Feedback Analyzer (batch + deep feedback intelligence) | HR |
| `/hr/sessions-schedule` | Schedule mandatory sessions (single employee or department) | HR, Leadership |
| `/hr/sessions-review` | Session queue and HR review/ingestion workflow | HR, Leadership |
| `/anomalies` | Full anomalies list panel with View Employee navigation | Manager, HR, Leadership |
| `/integrations` | Jira demo config and integration status cards | HR, Leadership |
| `/your-data` | Employee self-service data view | Employee |
| `/feedback-session` | Employee feedback recording/consent flow | Employee |

---

## 📡 API Endpoints

### Authentication
```
POST   /auth/register              Register new user
POST   /auth/login                 Login & get JWT token
POST   /auth/oauth/exchange        Exchange Supabase OAuth token for NOVA JWT
GET    /auth/me                    Get current user profile
```

### AI Insights
```
POST   /api/ai/sentiment            Analyze sentiment from text
POST   /api/ai/burnout-risk         Assess burnout risk
POST   /api/ai/performance-prediction  Predict performance band
POST   /api/ai/retention-risk       Assess retention/flight risk
GET    /api/ai/insights/{id}       Get all insights for employee
POST   /api/ai/ask-nova             Chat with AI assistant (streaming)
```

### Voice Assistant & Agent Routing
```
POST   /api/agent/chat              Route chat/voice turn to page-specialized agent
GET    /api/agent/agents            List registered voice agents
```

### Interventions (NEW)
```
POST   /api/interventions/recommend           Get AI intervention recommendations
POST   /api/interventions/recommendations     Alias: intervention recommendations
POST   /api/interventions/analyze-anomalies   Detect behavioral anomalies
POST   /api/interventions/anomalies           Alias: anomaly analysis endpoint
GET    /api/interventions/history/{id}        Get intervention history
POST   /api/interventions/execute/{id}        Log intervention execution
```

### Explainability, Reporting, and Benchmarks
```
GET    /api/explain/burnout/{id}              Explain burnout score factors
GET    /api/explain/attrition/{id}            Explain attrition score factors
GET    /api/explain/engagement/{id}           Explain engagement score factors
GET    /api/insights/cost-impact              Transparent cost/savings methodology payload
GET    /api/reports/org-health?format=pdf     Structured report payload for frontend PDF rendering
GET    /api/benchmarks/{sector}               Sector benchmark reference data
GET    /api/benchmarks/current/org            Org-sector benchmark mapping
```

### Feedback Sessions and 360 Feedback
```
POST   /api/feedback/sessions/schedule                    HR schedule session (employee or department)
GET    /api/feedback/sessions/my                          Employee session schedule/status
POST   /api/feedback/sessions/{session_id}/consent       Record explicit feedback-session consent
POST   /api/feedback/sessions/{session_id}/upload        Upload recorded feedback session
POST   /api/feedback/sessions/{session_id}/process       Process transcript + emotion analysis
GET    /api/feedback/sessions/pending-review             HR queue: scheduled/in-progress/completed pending review
GET    /api/feedback/sessions/{session_id}/results       HR review payload (transcript/timeline/scores/summary)
POST   /api/feedback/sessions/{session_id}/hr-ingest     Mark reviewed and ingest derived signals
POST   /api/feedback/sessions/{session_id}/flag-follow-up  Mark session follow-up required
POST   /api/feedback/sessions/seed-demo                  Seed mixed-state demo sessions
POST   /api/feedback/manager/{manager_id}     Anonymous upward manager feedback submission
GET    /api/managers/{id}/360-scores          Aggregated manager 360 trends + suggestion
```

### HR Feedback Analyzer
```
GET    /api/hr/feedbacks                         Paginated feedback list with filters (dept/type/sentiment/date/search/anonymous)
POST   /api/hr/feedbacks/analyze-batch           Batch AI analysis + org-theme frequency + sarcasm/critical summary
POST   /api/hr/feedbacks/analyze-single/{id}     Deep single-feedback analysis (sarcasm, emotions, key phrases, risk, HR action)
GET    /api/hr/feedbacks/org-themes              Org-wide theme distribution and sentiment/sarcasm aggregates
POST   /api/hr/feedbacks/appraisal-context/{id}  Add analyzed feedback into employee appraisal context queue
POST   /api/hr/feedbacks/bootstrap               One-click self-heal: migration check + schema reload + optional seed
```

### Employee Action APIs
```
POST   /api/meetings/schedule                           Create/reschedule manager 1:1
GET    /api/meetings?employee_id={employee_id}         List employee meetings
POST   /api/messages/send                               Send internal employee message/reminder
GET    /api/messages/inbox                              Employee/role inbox with unread count
PATCH  /api/messages/{message_id}/read                  Mark message as read
POST   /api/recognition/send                            Send recognition
GET    /api/recognition/{employee_id}                   Recognition history + 90-day count
```

### Integrations
```
GET    /api/integrations/jira/metrics/{employee_id}  Jira metrics per employee (mock-backed)
GET    /api/integrations/jira/team/{department}      Team-level Jira health aggregate
POST   /api/integrations/config                      Save integration config (HR/Leadership)
GET    /api/integrations/status                      Connected/disconnected integration statuses
POST   /api/integrations/jira/sync                  Trigger Jira sync (manual)
```

### Organization Hierarchy & Directory
```
GET    /api/employees                      Canonical employee directory (NOVA IDs + hierarchy fields)
GET    /api/org/hierarchy                  Role-scoped organization hierarchy tree
GET    /api/org/hierarchy/stats            Org hierarchy metrics (levels/span/managers/IC count)
GET    /api/org/hierarchy/{employee_id}/subtree  Subtree rooted at employee (RBAC constrained)
```

### Onboarding Intelligence
```
GET    /api/employees/onboarding          Onboarding watchlist with adjusted risk and flags
GET    /api/employees/{employee_id}       Employee detail with server-computed data_quality_score
```

### Employee Management (Legacy Route Family)
```
GET    /employees                   Get all employees (paginated)
GET    /employees/{id}              Get employee details
POST   /employees                   Create employee
PUT    /employees/{id}              Update employee
DELETE /employees/{id}              Delete employee
GET    /employees/risk-summary      Get organization-wide risk summary
```

### HR Analytics
```
GET    /hr/dashboard                Get HR dashboard metrics
GET    /hr/burnout-report           Get burnout analysis report
GET    /hr/retention-analysis       Get retention risk analysis
GET    /hr/team-insights            Get team-level insights
POST   /hr/export-report            Export insights as PDF/CSV
```

### Manager Tools
```
GET    /manager/team                Get manager's team details
GET    /manager/dashboard           Get manager's team dashboard
GET    /manager/effectiveness/{id}  Get manager effectiveness scorecard
POST   /manager/1-on-1-notes        Log 1-on-1 meeting notes
```

### Leadership
```
GET    /leadership/org-health        Get organization health score
GET    /leadership/risk-clusters     Get burnout risk clusters
GET    /leadership/strategic-insights  Get strategic recommendations
GET    /leadership/benchmarking      Get industry benchmarks
```

### Status & Health
```
GET    /health                      Health check
GET    /docs                        API documentation (Swagger)
GET    /redoc                       API documentation (ReDoc)
```

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (via Supabase)
- Git

### Backend Setup

**1. Clone repository:**
```bash
git clone https://github.com/yourusername/nova.git
cd nova/backend
```

**2. Create virtual environment:**
```bash
python -m venv .venv
.venv\Scripts\Activate.ps1  # Windows PowerShell
# or
source .venv/bin/activate   # macOS/Linux
```

**3. Install dependencies:**
```bash
pip install -r requirements.txt
```

**4. Configure environment:**
```bash
# Copy example config
cp .env.example .env

# Edit .env with your values:
# SUPABASE_URL=your_supabase_url
# SUPABASE_KEY=your_supabase_key
# GROQ_API_KEY=your_groq_key
```

**5. Run database migrations:**
```bash
# Recommended order in Supabase SQL editor:
# 001_create_users_table.sql
# 002_create_interventions_table.sql
# 003_add_hierarchy_fields.sql
# 003_create_employee_feedback_table.sql
# 004_employee_feedbacks.sql
# feedback_sessions.sql
# 004_employee_actions_tables.sql
# 005_feedback_sessions_status_update.sql

# Optional scripted helpers (reads backend/.env):
# python scripts/apply_feedback_sessions_migration.py
# python scripts/apply_employee_actions_migration.py
# python scripts/apply_employee_feedbacks_migration.py
# python scripts/apply_hierarchy_migration.py
# python scripts/seed_feedbacks.py
```

### Frontend Setup

**1. Navigate to frontend:**
```bash
cd ../frontend
```

**2. Install dependencies:**
```bash
npm install
```

**3. Configure environment:**
```bash
# Edit .env
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
```

**4. Enable Google OAuth in Supabase:**
- In Supabase Auth Providers, enable Google
- Add site URL and redirect URL for your frontend (e.g., `http://localhost:8080/login?oauth=google`)
- Ensure allowed email domains/org policy align with your employee directory

**5. Run frontend tests (optional but recommended):**
```bash
npm run test
```

Voice UX browser note:
- Chrome and Edge provide the best Web Speech API support.
- On unsupported browsers, NOVA Assistant automatically falls back to text-only mode.

Lightweight integration coverage now includes:
- sidebar badge polling behavior (`AppLayout.badges.test.tsx`)
- what-if modal scroll/backdrop-close behavior (`WhatIfSimulator.modal.test.tsx`)

### Troubleshooting

**1. Missing Supabase tables (`PGRST205` / relation does not exist)**
- Symptom: API errors mention missing tables such as `public.feedback_sessions` or `public.internal_messages`.
- Fix: run the setup SQL in the migration order listed above.
- Optional verification scripts from `backend/`:
```bash
python scripts/verify_feedback_tables.py
python scripts/verify_employee_action_tables.py
```
- HR Feedback Analyzer specific fix path:
```bash
python scripts/apply_employee_feedbacks_migration.py
python scripts/seed_feedbacks.py
```

**2. HR Feedback Analyzer still says table unavailable after migration**
- Cause: PostgREST schema cache delay (table exists in SQL but REST path has stale schema snapshot).
- Fix options:
  - Restart backend and retry.
  - Use the bootstrap endpoint once (HR role): `POST /api/hr/feedbacks/bootstrap`.

**3. Frontend cannot reach backend (NetworkError / fetch failed / empty panels)**
- Symptom: scheduling, review, or insights requests fail despite backend running.
- Fix: confirm frontend `.env` uses the backend host and port actually running locally:
```bash
VITE_API_BASE_URL=http://localhost:8000
```
- Then restart the frontend dev server after changing `.env`.

**4. Session Queue not updating after scheduling**
- Symptom: a session is scheduled successfully but does not appear in Sessions to Review.
- Checks:
  - Verify `feedback_sessions` rows are being created in Supabase.
  - Confirm signed-in role can access HR/leadership review surfaces.
  - Ensure the app is not calling a stale origin (all review calls should use the shared API client and `VITE_API_BASE_URL`).

**5. Reminder send errors after successful scheduling**
- Symptom: reminder call fails, but the session appears scheduled.
- Cause: `internal_messages` table missing or policy issue.
- Fix: apply `004_employee_actions_tables.sql` and re-test reminder send.

**6. Composite risk shows 0% unexpectedly**
- Context: anomaly composite can be 0% when no significant anomalies are detected.
- Current behavior: UI falls back to baseline composite risk (workload/sentiment/performance/engagement model) when anomaly composite has no signal.
- If still 0%: inspect input histories (sentiment/performance/engagement) for the selected employee and verify data generation/API payloads are non-empty.

**7. Org Tree page shows "Unable to load hierarchy"**
- Confirm backend is actually running on port 8000 from the backend directory:
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```
- Validate API health quickly:
```bash
curl http://localhost:8000/health
```
- If frontend was started before backend was healthy, restart frontend once after confirming `VITE_API_BASE_URL`.

**8. Two different employee groups appear across pages**
- Cause: stale browser state or an old frontend bundle after roster-unification updates.
- Fix:
  - hard refresh the browser (`Ctrl+F5`)
  - ensure frontend and backend are both restarted
  - verify `VITE_API_BASE_URL=http://localhost:8000`
  - if needed, clear site data for `localhost:8080` and sign in again
- Expected state: Employees, Org Tree, Org Health risk cards, and heatmap detail all use the same canonical roster.

**9. Voice input is unavailable or mic does not start**
- If your browser lacks Web Speech API support, NOVA Assistant automatically runs in text-only mode.
- Recommended browsers: Chrome or Edge.
- If supported browser still fails: verify microphone permission and refresh once.

---

## ▶️ Running the Application

### Start Backend

**Terminal 1:**
```powershell
cd "C:\path\to\NOVA\backend"
python -m uvicorn main:app --reload --port 8000
```

✅ Backend runs at: `http://localhost:8000`  
📖 API docs at: `http://localhost:8000/docs`

If you need to bootstrap HR feedback analyzer data in one go (HR-ready local demo state):
```powershell
cd "C:\path\to\NOVA\backend"
python scripts/apply_employee_feedbacks_migration.py
python scripts/seed_feedbacks.py
```

### Start Frontend

**Terminal 2:**
```powershell
cd "C:\path\to\NOVA\frontend"
npm run dev
```

✅ Frontend runs at: `http://localhost:8080` (this repo's Vite config)

### Access Application

1. Open browser to `http://localhost:8080`
2. Sign in with test credentials:
   - Email: `hr.admin@company.com`
   - Password: `TestPassword123!` (or your test user)
3. Explore dashboards and features

---

## 🔐 RBAC (Role-Based Access Control)

### Roles & Permissions

| Role | Access Level | Visible Data |
|------|---|---|
| **Employee** | Self-only | Own profile, own insights, personal dashboard |
| **Manager** | Team-level | Team members, team dashboard, effectiveness scores |
| **HR** | Organization-wide | All employees, reports, interventions, trends |
| **Leadership** | Executive | Org health, strategic insights, benchmarking |

### Voice Assistant Scope by Role

| Role | Voice Assistant Data Scope | Example Behavior |
|---|---|---|
| **Employee** | Personal-only | Answers personal questions; no peer/team/org comparisons |
| **Manager** | Team-level only | Team insights and manager actions; no org-wide numeric comparisons |
| **HR** | Organization-wide | Full org metrics with specific values and cross-department comparisons |
| **Leadership** | Organization-wide (executive) | Full org summaries, trends, and strategic comparisons |

NOVA Assistant enforces these limits on every `/api/agent/chat` turn by passing the authenticated role to the active specialized agent.

### Endpoint Protection
All API endpoints require valid JWT token with appropriate role.

Example request:
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8000/api/ai/sentiment
```

---

## 📊 Implementation Status

### ✅ **Fully Implemented**
- FastAPI backend with 55+ endpoints
- Burnout risk assessment (rules + Groq LLM)
- Sentiment analysis with structured LLM outputs
- Retention flight risk prediction
- Performance prediction
- Staff aggregated insights API
- Role-based access control (RBAC)
- Streaming AI chat (Server-Sent Events)
- Supabase authentication & database
- Google OAuth sign-in with account linking rules and avatar propagation
- 12+ frontend visualization components
- Intervention Engine (8 recommendation types)
- Anomaly Detection (Z-score + temporal weighting)
- Network Analysis (centrality, propagation)
- Batch Scheduler (APScheduler ready)
- Structured AI insight schema (summary, key signals, recommended action + fallback parser)
- Intervention + anomaly widgets integrated in both dashboard and org health pages with RBAC visibility
- Composite score explainability UI (weighted breakdown, 7-day change reason, trend badges)
- Jira integration system (mocked ingestion, real UI and config lifecycle)
- Manager 360 feedback loop with k-anonymity behavior and trend aggregation
- Onboarding risk handling with first-90-days cohort baseline and onboarding watchlist
- Org Health report export API + frontend multi-page PDF generation flow
- Industry benchmark APIs and UI overlays/badges (explicitly labeled simulated medians)
- PWA support + mobile responsiveness enhancements (install banner, bottom tabs, touch graph interactions)
- Feedback session scheduler page and session queue page wired for HR/Leadership roles
- Session queue behavior for scheduled/in-progress/completed states with status-aware review panel
- Sidebar session badges with 60-second polling and focus-triggered refresh
- Supabase-backed feedback session persistence (`public.feedback_sessions`, `public.session_consent_log`)
- Supabase-backed employee action persistence (`public.internal_messages`, `public.scheduled_meetings`, `public.recognitions`)
- Backend migration helper scripts for Supabase schema application and verification
- Dedicated employee detail endpoint with deterministic required fields and server-computed `data_quality_score`
- Dedicated anomalies page route (`/anomalies`) with View All flow from dashboard anomaly bar
- What-if simulator modal UX hardening (scrollable body, fixed header, backdrop dismiss, close control)
- Integrations page Jira demo configuration flow with test connection simulation and connected-state update
- Lightweight frontend integration tests for sidebar polling and modal behavior
- HR Feedback Analyzer page with three-column UX, sentiment/sarcasm-aware cards, and batch/deep Groq analysis flows
- `employee_feedbacks` schema migration + realistic 50-row seed script with precomputed sentiment/emotion/theme fields
- Feedback Analyzer bootstrap endpoint for migration/seed/schema-cache self-healing in non-primed environments
- Unified canonical employee roster wired into frontend and backend org-tree generation (single identity model)
- Deterministic NOVA ID + hierarchy model (`title`, `reports_to`, `org_level`) propagated to employee and org endpoints
- Organization hierarchy endpoints with RBAC-scoped full tree, subtree, and hierarchy stats
- Org Health and Burnout Heatmap employee cards now sourced from the canonical employee context (no mixed placeholder roster)
- Specialized voice agents for Department Heatmap and Org Structure pages, including route-aware context prefetching
- Voice assistant UX polish: first-session onboarding nudge, page-specific suggested questions, speaking waveform, and resilient text-only fallback handling

### 🔄 **In Progress**
- ML feature importance visualization
- What-If intervention simulator
- Historical trend persistence with correlation tagging
- Production hardening of Jira connector from mock pipeline to live API token flow

### ⏳ **Planned (Roadmap)**
- Org-graph burnout propagation map enhancements
- k-anonymity privacy layer
- PII boundary service
- Advanced audit logging

---

## 🗺️ Roadmap

### Phase 1: Foundation (✅ COMPLETE)
- Core AI engines (burnout, sentiment, retention, performance)
- Basic dashboards and visualizations
- RBAC and authentication
- Intervention engine with 8 recommendation types

### Phase 2: Intelligence (Current)
- Structured AI summaries with robust fallback handling
- Temporal-weighted anomaly composite with explainability panels
- ML classifier with feature importance visualization
- What-if intervention simulator
- Manager 360 trend quality scoring and manager coaching feedback loop refinements

### Phase 3: Enterprise (Q2 2026)
- Advanced privacy & compliance (k-anonymity, PII vault)
- Multi-org support
- Custom intervention types
- External data integrations (Slack, Google Calendar, HiBob)
- Live Jira REST v3 integration rollout (replacing seeded mock provider)

### Phase 4: Scale (Q3+ 2026)
- Competitor benchmarking database expansion (real datasets beyond simulated medians)
- Industry-specific insights
- Advanced predictive models
- API for third-party integrations

---

## 📖 Documentation

- **API Guide**: See [docs](http://localhost:8000/docs) when backend is running
- **RBAC Guide**: [backend/RBAC_GUIDE.md](backend/RBAC_GUIDE.md)
- **Integration Guide**: [backend/INTEGRATION_GUIDE.md](backend/INTEGRATION_GUIDE.md)
- **Quick Start**: [QUICK_START.md](QUICK_START.md)
- **Team Checklist**: [TEAM_INTEGRATION_CHECKLIST.md](TEAM_INTEGRATION_CHECKLIST.md)
- **Feedback Analyzer setup scripts**: [backend/scripts/apply_employee_feedbacks_migration.py](backend/scripts/apply_employee_feedbacks_migration.py), [backend/scripts/seed_feedbacks.py](backend/scripts/seed_feedbacks.py)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

---

## 🎯 Mission

**NOVA exists to solve the burnout crisis.**

We believe organizations can predict and prevent employee burnout before it happens. Using AI, data science, and human-centered interventions, NOVA transforms HR from reactive to proactive.

### Our Impact Goals
- 📉 Reduce burnout-related turnover by 40%
- 🎯 Improve intervention effectiveness by 60%
- ⏰ Enable early detection (3-6 months earlier)
- 💼 Empower HR teams with data-driven decisions
- 👥 Protect high performers from silent departures

---

## 📞 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: agnivkdutta@gmail.com
- **Live Demo**: https://nova-two-woad.vercel.app/

---

## 🙏 Acknowledgments

Built by a team of 4 passionate developers committed to workplace wellness.

**Technologies**: FastAPI, React, TypeScript, Groq AI, Supabase, D3.js

---

**NOVA: Predict. Prevent. Protect.** 🚀

---

