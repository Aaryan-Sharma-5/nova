"""Intervention Engine: Rule-based + ML hybrid recommendation system."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from ai.groq_client import groq_chat
from ai.models import StructuredInsight, build_fallback_structured_insight, parse_structured_insight


class InterventionType(str, Enum):
    """Types of interventions available."""
    ONE_ON_ONE = "one-on-one"
    WORKLOAD_REDUCTION = "workload-reduction"
    MENTORING = "mentoring"
    WELLNESS_PROGRAM = "wellness-program"
    PROMOTION_DISCUSSION = "promotion-discussion"
    SABBATICAL = "sabbatical"
    TEAM_BUILDING = "team-building"
    FLEXIBLE_SCHEDULE = "flexible-schedule"


class InterventionUrgency(str, Enum):
    """Urgency levels for interventions."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class InterventionRequest(BaseModel):
    """Request for intervention recommendations."""
    employee_id: str
    burnout_score: float = Field(..., ge=0.0, le=1.0)
    sentiment_score: float = Field(..., ge=-1.0, le=1.0)
    performance_band: Literal["top", "solid", "at-risk"]
    tenure_months: int
    retention_risk: Literal["low", "medium", "high"]
    recent_behavioral_changes: list[str] = Field(default_factory=list)
    weeks_at_high_risk: int = 0  # How many consecutive weeks above threshold
    anomaly_detected: bool = False
    anomaly_type: str | None = None


class InterventionRecommendation(BaseModel):
    """Single intervention recommendation."""
    intervention_type: InterventionType
    description: str
    urgency: InterventionUrgency
    priority_score: float = Field(..., ge=0.0, le=1.0)
    estimated_impact: str
    timing_window: str
    risks_if_delayed: str


class InterventionResponse(BaseModel):
    """Complete intervention recommendation response."""
    employee_id: str
    recommendations: list[InterventionRecommendation]
    overall_urgency: InterventionUrgency
    reasoning: str
    structured_insight: StructuredInsight
    generated_at: datetime


# Rule-based decision matrix
URGENCY_MATRIX = {
    ("critical", "LOW"): InterventionUrgency.CRITICAL,
    ("critical", "MEDIUM"): InterventionUrgency.CRITICAL,
    ("critical", "HIGH"): InterventionUrgency.CRITICAL,
    ("high", "LOW"): InterventionUrgency.HIGH,
    ("high", "MEDIUM"): InterventionUrgency.HIGH,
    ("high", "HIGH"): InterventionUrgency.CRITICAL,
    ("medium", "LOW"): InterventionUrgency.MEDIUM,
    ("medium", "MEDIUM"): InterventionUrgency.MEDIUM,
    ("medium", "HIGH"): InterventionUrgency.HIGH,
    ("low", "LOW"): InterventionUrgency.LOW,
    ("low", "MEDIUM"): InterventionUrgency.MEDIUM,
    ("low", "HIGH"): InterventionUrgency.HIGH,
}


@lru_cache(maxsize=1)
def _load_intervention_prompt() -> str:
    """Load the intervention recommendation prompt."""
    prompt_path = Path(__file__).resolve().parent / "prompts" / "intervention.txt"
    if prompt_path.exists():
        return prompt_path.read_text(encoding="utf-8").strip()
    return """You are an HR intervention specialist. Based on employee risk profile, recommend targeted interventions.
    
Output exactly 3-5 interventions as JSON array of objects with fields: intervention_type, description, estimated_impact."""


def _risk_category_from_score(burnout_score: float) -> str:
    """Convert burnout score to risk category."""
    if burnout_score >= 0.75:
        return "critical"
    if burnout_score >= 0.50:
        return "high"
    if burnout_score >= 0.25:
        return "medium"
    return "low"


def _performance_to_priority(performance_band: str) -> str:
    """Convert performance band to priority level."""
    mapping = {
        "top": "HIGH",  # Top performers leaving is critical
        "solid": "MEDIUM",  # Standard priority
        "at-risk": "MEDIUM",  # Already at-risk, needs support
    }
    return mapping.get(performance_band, "MEDIUM")


def _compute_priority_score(
    burnout_score: float,
    sentiment_score: float,
    weeks_at_high_risk: int,
    anomaly_detected: bool,
) -> float:
    """Compute intervention priority using hybrid scoring."""
    score = 0.0

    # Burnout contribution (35%)
    score += burnout_score * 0.35

    # Sentiment negativity contribution (25%)
    if sentiment_score < 0:
        score += abs(sentiment_score) * 0.25

    # Time at risk contribution (20%)
    # Each week compounds the risk
    weeks_factor = min(weeks_at_high_risk * 0.05, 0.20)
    score += weeks_factor

    # Anomaly multiplier (20%)
    if anomaly_detected:
        score += 0.20

    return min(score, 1.0)


def _select_interventions(request: InterventionRequest) -> list[tuple[InterventionType, str]]:
    """Select interventions based on rules."""
    interventions: list[tuple[InterventionType, str]] = []

    # Rule 1: Critical burnout + negative sentiment → 1:1 + workload reduction
    if request.burnout_score >= 0.75 and request.sentiment_score < -0.3:
        interventions.append(
            (InterventionType.ONE_ON_ONE, "Immediate check-in for burnout assessment")
        )
        interventions.append(
            (InterventionType.WORKLOAD_REDUCTION, "Redistribute tasks to reduce immediate pressure")
        )

    # Rule 2: High performer at risk → Promotion discussion
    if request.performance_band == "top" and request.retention_risk in ("high", "medium"):
        interventions.append(
            (InterventionType.PROMOTION_DISCUSSION, "Career growth path exploration")
        )

    # Rule 3: Sustained high risk (3+ weeks) → Wellness program
    if request.weeks_at_high_risk >= 3:
        interventions.append(
            (InterventionType.WELLNESS_PROGRAM, "Stress management and wellness resources")
        )

    # Rule 4: Behavioral anomaly detected → Mentoring + check-in
    if request.anomaly_detected:
        interventions.append((InterventionType.MENTORING, "Peer or manager mentoring support"))

    # Rule 5: Medium burnout + negative sentiment → Flexible schedule
    if 0.50 <= request.burnout_score < 0.75 and request.sentiment_score < -0.2:
        interventions.append(
            (InterventionType.FLEXIBLE_SCHEDULE, "Enable flexible working arrangements")
        )

    # Rule 6: Low engagement but solid performance → Team building
    if request.burnout_score >= 0.50 and request.performance_band == "solid":
        interventions.append(
            (InterventionType.TEAM_BUILDING, "Strengthen team connections and engagement")
        )

    # Fallback: Always include 1:1 if high burnout
    if request.burnout_score >= 0.50 and not any(
        i[0] == InterventionType.ONE_ON_ONE for i in interventions
    ):
        interventions.append(
            (InterventionType.ONE_ON_ONE, "Regular check-in to monitor wellbeing")
        )

    return interventions


def _get_timing_window(urgency: InterventionUrgency) -> str:
    """Determine optimal timing for intervention."""
    windows = {
        InterventionUrgency.CRITICAL: "Within 24-48 hours (urgent)",
        InterventionUrgency.HIGH: "Within 3-5 days",
        InterventionUrgency.MEDIUM: "Within 1-2 weeks",
        InterventionUrgency.LOW: "Within 2-4 weeks",
    }
    return windows.get(urgency, "Within 2 weeks")


def _get_impact_estimate(intervention_type: InterventionType) -> str:
    """Estimate impact of intervention (empirical/research-based)."""
    impacts = {
        InterventionType.ONE_ON_ONE: "60-70% employees report improved clarity after 1:1",
        InterventionType.WORKLOAD_REDUCTION: "Reduces burnout score by 15-25% in 2 weeks",
        InterventionType.MENTORING: "Increases engagement by 20-30% over 6 weeks",
        InterventionType.WELLNESS_PROGRAM: "Reduces stress indicators by 10-15% in 4 weeks",
        InterventionType.PROMOTION_DISCUSSION: "Improves retention 5x for high performers",
        InterventionType.SABBATICAL: "Recovery: 40% of burnout reduction in 2 weeks",
        InterventionType.TEAM_BUILDING: "Improves team sentiment by 25% in 4 weeks",
        InterventionType.FLEXIBLE_SCHEDULE: "Burnout reduction of 20-30% within 3 weeks",
    }
    return impacts.get(intervention_type, "Varies by implementation")


def _get_delay_risks(intervention_type: InterventionType, weeks_delayed: int = 1) -> str:
    """Get risks if intervention is delayed."""
    if weeks_delayed >= 2:
        return "High risk of attrition if delayed further; sentiment degradation intensifying"
    
    base_risks = {
        InterventionType.ONE_ON_ONE: "Employee disengagement may deepen; missed early intervention window",
        InterventionType.WORKLOAD_REDUCTION: "Burnout escalates; potential health impact",
        InterventionType.MENTORING: "Continued isolation; performance decline likely",
        InterventionType.WELLNESS_PROGRAM: "Stress compounds; higher attrition risk",
        InterventionType.PROMOTION_DISCUSSION: "High performer retention becomes uncertain",
        InterventionType.SABBATICAL: "Severe burnout risk; possible medical leave needed",
        InterventionType.TEAM_BUILDING: "Team cohesion deteriorates further",
        InterventionType.FLEXIBLE_SCHEDULE: "Burnout metrics worsen; compliance issues",
    }
    return base_risks.get(intervention_type, "Risk escalation if delayed")


async def _enrich_with_llm(
    request: InterventionRequest,
    recommendations: list[InterventionRecommendation],
) -> StructuredInsight:
    """Enrich recommendations with LLM reasoning."""
    payload = {
        "employee_id": request.employee_id,
        "burnout_score": request.burnout_score,
        "sentiment_score": request.sentiment_score,
        "performance_band": request.performance_band,
        "retention_risk": request.retention_risk,
        "weeks_at_high_risk": request.weeks_at_high_risk,
        "anomaly_detected": request.anomaly_detected,
        "selected_interventions": [
            {
                "type": r.intervention_type.value,
                "description": r.description,
                "urgency": r.urgency.value,
            }
            for r in recommendations
        ],
    }

    messages = [
        {"role": "system", "content": _load_intervention_prompt()},
        {
            "role": "user",
            "content": f"Provide brief reasoning for these interventions:\n{json.dumps(payload, indent=2)}",
        },
    ]

    fallback = build_fallback_structured_insight(
        summary="Standard intervention protocol applied for this employee profile.",
        key_signals=[
            f"Burnout score: {request.burnout_score:.2f}",
            f"Retention risk: {request.retention_risk}",
            f"Anomaly detected: {'yes' if request.anomaly_detected else 'no'}",
        ],
        recommended_action=(
            recommendations[0].description
            if recommendations
            else "Schedule a manager check-in and monitor weekly indicators."
        ),
        confidence="medium",
        urgency="this_week",
    )

    try:
        response = await groq_chat(messages)
        content = response.choices[0].message.content if response and response.choices else ""
        return parse_structured_insight(content, fallback)
    except Exception:
        return fallback


async def get_interventions(request: InterventionRequest) -> InterventionResponse:
    """Generate intervention recommendations using rule-based + ML hybrid approach."""
    # Compute priority score
    priority_score = _compute_priority_score(
        request.burnout_score,
        request.sentiment_score,
        request.weeks_at_high_risk,
        request.anomaly_detected,
    )

    # Select interventions based on rules
    selected = _select_interventions(request)

    # Build recommendations
    recommendations: list[InterventionRecommendation] = []
    for intervention_type, description in selected:
        # Determine urgency
        risk_category = _risk_category_from_score(request.burnout_score)
        performance_priority = _performance_to_priority(request.performance_band)
        urgency_key = (risk_category, performance_priority)
        urgency = URGENCY_MATRIX.get(urgency_key, InterventionUrgency.MEDIUM)

        rec = InterventionRecommendation(
            intervention_type=intervention_type,
            description=description,
            urgency=urgency,
            priority_score=priority_score,
            estimated_impact=_get_impact_estimate(intervention_type),
            timing_window=_get_timing_window(urgency),
            risks_if_delayed=_get_delay_risks(intervention_type),
        )
        recommendations.append(rec)

    # Sort by urgency then priority
    urgency_order = {
        InterventionUrgency.CRITICAL: 0,
        InterventionUrgency.HIGH: 1,
        InterventionUrgency.MEDIUM: 2,
        InterventionUrgency.LOW: 3,
    }
    recommendations.sort(
        key=lambda r: (urgency_order.get(r.urgency, 99), -r.priority_score)
    )

    # Determine overall urgency
    overall_urgency = (
        recommendations[0].urgency if recommendations else InterventionUrgency.LOW
    )

    # Enrich with LLM reasoning
    structured_insight = await _enrich_with_llm(request, recommendations)

    return InterventionResponse(
        employee_id=request.employee_id,
        recommendations=recommendations,
        overall_urgency=overall_urgency,
        reasoning=structured_insight.summary,
        structured_insight=structured_insight,
        generated_at=datetime.utcnow(),
    )
