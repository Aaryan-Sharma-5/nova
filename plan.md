# NOVA Execution Plan (Updated: April 8, 2026)

## 1) Completed Work

### Backend
- [x] AI insight endpoints now use a strict structured output contract:
  - `summary` (concise prose)
  - `key_signals` (short bullet-like items)
  - `recommended_action` (single prioritized next step)
- [x] Added robust malformed-JSON fallback parser so LLM output failures do not break API responses.
- [x] Updated prompt templates to enforce consistent structured output format across domains:
  - burnout
  - retention
  - performance
  - sentiment
  - intervention
  - simulation
- [x] Added intervention endpoint aliases for compatibility:
  - `POST /api/interventions/recommendations`
  - `POST /api/interventions/anomalies`
- [x] Enhanced anomaly scoring with temporal weighting while preserving core base weights.
- [x] Extended composite anomaly response payload with explainability metadata (weighted contributions + comparison context).
- [x] Upgraded sentiment pipeline to classify a full emotion spectrum: stress, frustration, disengagement, satisfaction, enthusiasm, anxiety.
- [x] Updated sentiment LLM prompt/output contract to include `polarity`, six-dimension `emotions`, and `dominant_emotion`.
- [x] Added rolling emotion trend calculations with daily emotion vectors and per-emotion `trend_delta_14d` (+ `trend_delta_7d` support).
- [x] Expanded sentiment API response shape with:
  - `polarity`
  - `emotions`
  - `dominant_emotion`
  - `trend_delta_14d`

### Frontend
- [x] Integrated `InterventionRecommendations` and `AnomalyIndicator` into both:
  - dashboard page
  - org wellbeing page
- [x] Added RBAC-gated rendering for anomaly/intervention modules.
- [x] Replaced mock-only usage with real API wiring for anomaly/intervention data.
- [x] Added loading and empty states for intervention/anomaly sections.
- [x] Refactored duplicated page logic into shared `useInterventionInsights` hook.
- [x] Insight cards now render structured AI output fields (summary + key signal chips + action callout).
- [x] Composite anomaly UI now includes:
  - weighted breakdown popovers
  - "Why did this score change?" context (7-day comparison)
  - quick trend delta badge (up/down)
- [x] Sentiment page now includes a 6-dimension emotion radar chart (Recharts `RadarChart`).
- [x] Added Emotion Shift Alert when any emotion changes by more than `0.3` over 7 days.

### Validation
- [x] Backend compile checks passed.
- [x] Frontend production build passed.
- [ ] Full backend pytest suite not executed in this environment (pytest package unavailable at time of run).

## 2) Remaining Work (Priority Order)

### High Priority
- [ ] Run full backend tests in configured virtual environment and fix any regressions.
- [ ] Add/expand automated tests for:
  - structured insight parsing fallback paths
  - temporal weighting calculations
  - composite explainability payload fields
  - sentiment emotion-spectrum extraction and 14d/7d trend deltas

### Medium Priority
- [ ] Add feature-importance visualization in frontend for classifier explainability.
- [ ] Implement what-if intervention simulator UI + backend contract.
- [ ] Persist historical trend events and add correlation tagging endpoints.

### Lower Priority / Roadmap
- [ ] Org-graph burnout propagation map view.
- [ ] Competitor benchmarking module.
- [ ] Privacy hardening:
  - k-anonymity thresholds
  - PII boundary service
  - richer audit logging

## 3) Suggested Next Execution Slice

1. Enable and run backend pytest in `.venv`.
2. Add tests for structured parser and temporal composite logic.
3. Implement feature-importance panel in insights UI.
4. Start what-if simulator with a minimal end-to-end version.
