# CLAUDE.strict.md

Strict execution guide for coding agents working in NOVA.

## 1) Scope
- Applies to the full repository.
- Use this file when you need concise, enforcement-style instructions.
- Keep behavior deterministic, explainable, and privacy-safe.

## 2) Primary Objective
Ship production-credible workforce risk features without regressing:
- RBAC boundaries
- explainability payloads
- fallback behavior when AI or integrations fail

## 3) Non-Negotiable Rules
- Do not bypass role checks in backend/api/deps.py.
- Do not remove structured insight fallbacks.
- Do not expose raw sensitive text if aggregate or derived output is enough.
- Do not introduce hidden scoring thresholds without constants or comments.
- Do not couple React components directly to fetch when a hook pattern exists.
- Do not use destructive git commands unless explicitly requested.

## 4) Contracts To Preserve
Structured insight shape must remain:
- summary
- key_signals
- recommended_action
- confidence
- urgency

Composite anomaly responses must keep temporal explainability fields:
- temporal_weight_applied
- recency_boost_reason
- score_today
- score_7d_ago
- weighted_contributions
- changed_signals

## 5) Repository Anchors
Backend:
- backend/main.py
- backend/api/routes/
- backend/ai/
- backend/core/
- backend/database/

Frontend:
- frontend/src/App.tsx
- frontend/src/hooks/
- frontend/src/components/
- frontend/src/pages/
- frontend/src/lib/api.ts

## 6) Preferred Delivery Pattern
1. Build the smallest vertical slice first.
2. Keep route handlers thin, move logic to ai or service modules.
3. Keep API shape backward compatible unless versioning intentionally changes.
4. Add or update tests for new behavior.
5. Validate loading, empty, and failure UI states.
6. Document assumptions in PR notes.

## 7) Runtime And Setup Commands
Backend:
- cd backend
- python -m venv .venv
- .venv\Scripts\Activate.ps1
- pip install -r requirements.txt
- python -m uvicorn main:app --reload --port 8000

Frontend:
- cd frontend
- npm install
- npm run dev

## 8) Test And Validation Gate
Backend:
- python -m pytest backend/tests -q

Frontend:
- npm --prefix frontend run test
- npm --prefix frontend run build

If a command cannot run in the current environment, report that clearly and continue with best-effort code validation.

## 9) Data And Privacy Guardrails
- Treat integration and HR data as sensitive.
- Prefer derived metrics over raw text display.
- Keep auditability for privileged access.
- Preserve unlock-reason and review workflows where present.

## 10) Current Priority Gaps
High-priority implementation targets:
- Replace mock graph inputs with live communication metadata ingestion.
- Productionize manager health index from 90-day direct-report trends.
- Add context-aware intervention timing windows (including no-intervene windows).
- Move burnout and flight risk from demo heuristics to trained pipelines.
- Implement explicit baseline mode to predictive mode transition.
- Strengthen k-anonymity and privacy architecture coverage.

## 11) Definition Of Done
A task is done only when:
- functionality is implemented end to end
- RBAC and privacy constraints are preserved
- explainability/fallback contracts are intact
- relevant tests are added or updated
- build and test status is reported accurately
