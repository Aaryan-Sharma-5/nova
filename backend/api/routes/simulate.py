"""What-if intervention simulation endpoint."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ai.groq_client import groq_chat
from ai.intervention_engine import _compute_priority_score
from ai.models import StructuredInsight, build_fallback_structured_insight, parse_structured_insight
from api.deps import require_role
from models.user import User, UserRole

router = APIRouter(prefix="/api", tags=["Simulation"])


class SimulationInterventionParams(BaseModel):
    meeting_load_reduction_pct: float = Field(..., ge=0, le=50)
    work_hours_normalization_pct: float = Field(..., ge=0, le=50)
    team_size_adjustment_pct: float = Field(..., ge=-30, le=30)
    manager_one_on_one_frequency: float = Field(..., ge=0, le=8)


class SimulationRequest(BaseModel):
    employee_id: str
    current_burnout_score: float = Field(..., ge=0.0, le=1.0)
    current_attrition_score: float = Field(..., ge=0.0, le=1.0)
    sentiment_score: float = Field(0.0, ge=-1.0, le=1.0)
    weeks_at_high_risk: int = Field(0, ge=0, le=52)
    anomaly_detected: bool = False
    intervention: SimulationInterventionParams


class SimulationResponse(BaseModel):
    employee_id: str
    current_burnout_score: float
    current_attrition_score: float
    projected_burnout_score: float
    projected_attrition_score: float
    burnout_delta_pct: float
    attrition_delta_pct: float
    explanatory_factors: list[str]
    ai_summary: str | None = None
    ai_actions: list[str] = Field(default_factory=list)
    structured_insight: StructuredInsight


@lru_cache(maxsize=1)
def _load_simulation_prompt() -> str:
    prompt_path = Path(__file__).resolve().parents[2] / "ai" / "prompts" / "simulation.txt"
    return prompt_path.read_text(encoding="utf-8").strip()


def _safe_list(value: object, fallback: list[str]) -> list[str]:
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return value
    return fallback


def _safe_text(value: object, fallback: str | None = None) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _build_ai_messages(payload: SimulationRequest, projected_burnout: float, projected_attrition: float) -> list[dict[str, str]]:
    ai_payload = {
        "employee_id": payload.employee_id,
        "current_burnout_score": round(payload.current_burnout_score, 4),
        "current_attrition_score": round(payload.current_attrition_score, 4),
        "projected_burnout_score": round(projected_burnout, 4),
        "projected_attrition_score": round(projected_attrition, 4),
        "intervention": payload.intervention.model_dump(),
        "weeks_at_high_risk": payload.weeks_at_high_risk,
        "anomaly_detected": payload.anomaly_detected,
    }
    return [
        {"role": "system", "content": _load_simulation_prompt()},
        {"role": "user", "content": json.dumps(ai_payload)},
    ]


def _compute_intervention_effect(req: SimulationRequest) -> float:
    """Reuse intervention_engine scoring weights for context sensitivity."""
    contextual_pressure = _compute_priority_score(
        burnout_score=req.current_burnout_score,
        sentiment_score=req.sentiment_score,
        weeks_at_high_risk=req.weeks_at_high_risk,
        anomaly_detected=req.anomaly_detected,
    )

    params = req.intervention

    # Intervention impact score in [0, 1]
    # Higher manager 1:1 frequency and stronger workload adjustments increase impact.
    load_effect = (params.meeting_load_reduction_pct / 50.0) * 0.35
    hours_effect = (params.work_hours_normalization_pct / 50.0) * 0.30
    one_on_one_effect = (params.manager_one_on_one_frequency / 8.0) * 0.25

    # Team size reductions (negative %) reduce risk; increases may increase risk slightly.
    if params.team_size_adjustment_pct < 0:
        team_effect = min(abs(params.team_size_adjustment_pct) / 30.0, 1.0) * 0.10
    else:
        team_effect = -min(params.team_size_adjustment_pct / 30.0, 1.0) * 0.06

    intervention_effect = max(0.0, min(load_effect + hours_effect + one_on_one_effect + team_effect, 1.0))

    # Scale by context pressure so stronger interventions matter more on truly high-risk cases.
    return max(0.0, min(intervention_effect * (0.75 + 0.5 * contextual_pressure), 1.0))


@router.post("/simulate", response_model=SimulationResponse)
async def simulate_intervention(
    payload: SimulationRequest,
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.MANAGER, UserRole.LEADERSHIP])),
) -> SimulationResponse:
    effect = _compute_intervention_effect(payload)

    projected_burnout = max(0.0, min(payload.current_burnout_score * (1 - 0.40 * effect), 1.0))
    projected_attrition = max(0.0, min(payload.current_attrition_score * (1 - 0.32 * effect), 1.0))

    burnout_delta_pct = ((projected_burnout - payload.current_burnout_score) / max(payload.current_burnout_score, 1e-6)) * 100
    attrition_delta_pct = ((projected_attrition - payload.current_attrition_score) / max(payload.current_attrition_score, 1e-6)) * 100

    factors: list[str] = []
    if payload.intervention.meeting_load_reduction_pct >= 20:
        factors.append("Meeting load reduction lowers cognitive overload and context switching")
    if payload.intervention.work_hours_normalization_pct >= 20:
        factors.append("Work hours normalization reduces sustained overwork signal")
    if payload.intervention.manager_one_on_one_frequency >= 3:
        factors.append("Frequent manager check-ins improve support and issue detection")
    if payload.intervention.team_size_adjustment_pct < 0:
        factors.append("Smaller team scope improves workload manageability")

    if not factors:
        factors.append("Intervention intensity is modest; projected impact is limited")

    fallback_insight = build_fallback_structured_insight(
        summary="Simulation summary unavailable due to malformed AI output.",
        key_signals=factors,
        recommended_action="Apply a moderate intervention and re-evaluate in one week.",
        confidence="low",
        urgency="monitor",
    )
    structured_insight = fallback_insight
    ai_summary: str | None = None
    ai_actions: list[str] = []
    try:
        response = await groq_chat(messages=_build_ai_messages(payload, projected_burnout, projected_attrition))
        content = response.choices[0].message.content if response and response.choices else ""
        structured_insight = parse_structured_insight(content, fallback_insight)
        ai_summary = structured_insight.summary
        ai_actions = [structured_insight.recommended_action]
    except Exception:
        ai_summary = fallback_insight.summary
        ai_actions = [fallback_insight.recommended_action]

    return SimulationResponse(
        employee_id=payload.employee_id,
        current_burnout_score=round(payload.current_burnout_score, 4),
        current_attrition_score=round(payload.current_attrition_score, 4),
        projected_burnout_score=round(projected_burnout, 4),
        projected_attrition_score=round(projected_attrition, 4),
        burnout_delta_pct=round(burnout_delta_pct, 2),
        attrition_delta_pct=round(attrition_delta_pct, 2),
        explanatory_factors=factors,
        ai_summary=ai_summary,
        ai_actions=ai_actions,
        structured_insight=structured_insight,
    )
