"""Intervention Engine: Rule-based + ML hybrid recommendation system."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from ai.groq_client import groq_chat
from ai.models import StructuredInsight, build_fallback_structured_insight, parse_structured_insight


_BANNED_LANGUAGE_TERMS = {
    "general",
    "soldier",
    "warrior",
    "player",
    "fighter",
    "champion",
    "battle",
    "war",
    "troops",
}


def _contains_banned_language(text: str) -> bool:
    lowered = text.lower()
    return any(re.search(rf"\\b{re.escape(term)}\\b", lowered) for term in _BANNED_LANGUAGE_TERMS)


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
    attrition_probability: float | None = Field(default=None, ge=0.0, le=1.0)
    salary_band: float | None = Field(default=None, ge=0.0)
    employee_name: str | None = None
    department: str | None = None
    target_employee_ids: list[str] = Field(default_factory=list)
    recent_recognition_count_90d: int | None = Field(default=None, ge=0)


class InterventionRecommendation(BaseModel):
    """Single intervention recommendation."""
    intervention_type: InterventionType
    description: str
    urgency: InterventionUrgency
    priority_score: float = Field(..., ge=0.0, le=1.0)
    estimated_impact: str
    timing_window: str
    risks_if_delayed: str
    intervention_name: str
    intervention_cost_inr: float = 0.0
    projected_savings_inr: float = 0.0
    roi_percent: float = 0.0
    target_group: str = ""
    target_employee_count: int = 1
    savings_basis: str = ""


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


INTERVENTION_COSTS_INR: dict[InterventionType, float] = {
    InterventionType.ONE_ON_ONE: 500.0,
    InterventionType.WELLNESS_PROGRAM: 2000.0,
    InterventionType.TEAM_BUILDING: 15000.0,
    InterventionType.PROMOTION_DISCUSSION: 0.0,
    InterventionType.SABBATICAL: 25000.0,
    InterventionType.WORKLOAD_REDUCTION: 3000.0,
    InterventionType.MENTORING: 5000.0,
    InterventionType.FLEXIBLE_SCHEDULE: 1000.0,
}


INTERVENTION_LABELS: dict[InterventionType, str] = {
    InterventionType.ONE_ON_ONE: "Schedule 1:1",
    InterventionType.WELLNESS_PROGRAM: "Counselling/EAP referral",
    InterventionType.TEAM_BUILDING: "Training program",
    InterventionType.PROMOTION_DISCUSSION: "Salary review",
    InterventionType.SABBATICAL: "Team restructure",
    InterventionType.WORKLOAD_REDUCTION: "Workload rebalancing",
    InterventionType.MENTORING: "Mentorship assignment",
    InterventionType.FLEXIBLE_SCHEDULE: "Recognition program",
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


def _retention_to_probability(retention_risk: str) -> float:
    mapping = {
        "low": 0.22,
        "medium": 0.45,
        "high": 0.72,
    }
    return mapping.get(retention_risk, 0.45)


def _replacement_cost_inr(request: InterventionRequest) -> float:
    annual_salary = request.salary_band if request.salary_band and request.salary_band > 0 else 800000.0
    is_senior = request.tenure_months >= 36 or request.performance_band == "top"
    multiplier = 1.5 if is_senior else 0.75
    return annual_salary * multiplier


def _target_group_label(request: InterventionRequest) -> tuple[str, int]:
    target_count = max(1, len(request.target_employee_ids))
    if request.department and target_count > 1:
        return f"{request.department} ({target_count} employees)", target_count
    if request.employee_name and target_count > 1:
        return f"{request.employee_name} + {target_count - 1} others", target_count
    if request.employee_name:
        return request.employee_name, 1
    return f"Employee {request.employee_id}", 1


def _compute_roi_fields(
    request: InterventionRequest,
    intervention_type: InterventionType,
) -> tuple[float, float, float, str, str, int]:
    intervention_cost = INTERVENTION_COSTS_INR.get(intervention_type, 1000.0)
    probability = (
        request.attrition_probability
        if request.attrition_probability is not None
        else _retention_to_probability(request.retention_risk)
    )
    replacement_cost = _replacement_cost_inr(request)
    projected_savings = probability * replacement_cost

    if intervention_cost <= 0:
        roi_percent = round(projected_savings * 100.0 / max(replacement_cost, 1.0), 1)
    else:
        roi_percent = round(((projected_savings - intervention_cost) / intervention_cost) * 100.0, 1)

    target_group, target_count = _target_group_label(request)
    savings_basis = (
        f"Based on {target_count} at-risk employees x estimated replacement cost "
        f"of INR {round(replacement_cost):,}"
    )
    return intervention_cost, projected_savings, roi_percent, target_group, savings_basis, target_count


async def _enrich_with_llm(
    request: InterventionRequest,
    recommendations: list[InterventionRecommendation],
) -> StructuredInsight:
    """Enrich recommendations with LLM reasoning."""
    employee_name = request.employee_name or f"Employee {request.employee_id}"
    employee_role = request.performance_band
    employee_department = request.department or "General"
    burnout_pct = round(request.burnout_score * 100)
    flight_risk_pct = round(
        (
            request.attrition_probability
            if request.attrition_probability is not None
            else _retention_to_probability(request.retention_risk)
        )
        * 100
    )
    trend = "stable"
    if request.sentiment_score <= -0.2:
        trend = "declining"
    elif request.sentiment_score >= 0.2:
        trend = "improving"
    days_since_1on1 = max(3, min(45, request.weeks_at_high_risk * 7))
    selected_types = [r.intervention_type.value for r in recommendations]
    top_intervention = selected_types[0] if selected_types else "one-on-one"
    top_anomalies = request.recent_behavioral_changes[:2]
    anomaly_context = (
        f"Top anomalies: {', '.join(top_anomalies)}."
        if top_anomalies
        else (
            f"Top anomalies: {request.anomaly_type}."
            if request.anomaly_type
            else "No major anomaly label was captured, but elevated risk trend is present."
        )
    )

    messages = [
        {"role": "system", "content": _load_intervention_prompt()},
        {
            "role": "user",
            "content": (
                "You are an HR analytics AI. "
                f"An employee named {employee_name} ({employee_role}, {employee_department}) "
                f"has a burnout score of {burnout_pct}% and flight risk of {flight_risk_pct}%. "
                f"Their sentiment has been {trend} over the last 14 days. "
                f"They last had a 1:1 {days_since_1on1} days ago. "
                f"{anomaly_context} "
                f"The recommended intervention is: {top_intervention}. "
                "In 2-3 sentences, explain why this specific intervention is recommended for this employee right now, "
                "and what outcome HR should expect. Be specific, not generic. Do not use placeholder text.\n\n"
                "Do not use military metaphors, sports metaphors, or figurative language. "
                "Write in plain professional HR language only. "
                "Do not describe employees as 'soldiers', 'generals', 'warriors', 'players', or any non-workplace metaphor.\n\n"
                "Output JSON with fields: summary, key_signals, recommended_action, confidence, urgency."
            ),
        },
    ]

    top_risk_factor = "burnout risk"
    if request.retention_risk == "high":
        top_risk_factor = "flight risk"
    elif request.anomaly_detected:
        top_risk_factor = "behavioral anomaly risk"
    delta_pct = max(6, min(32, round((request.burnout_score * 100) * 0.25)))
    timing_window = recommendations[0].timing_window if recommendations else "within 1-2 weeks"
    risk_type = request.retention_risk

    fallback = build_fallback_structured_insight(
        summary=(
            f"{employee_name}'s {top_risk_factor} has increased by about {delta_pct}% in the last "
            f"{max(7, request.weeks_at_high_risk * 7)} days, and current sentiment is {trend}."
        ),
        key_signals=[
            f"Burnout score: {burnout_pct}%",
            f"Flight risk: {flight_risk_pct}%",
            f"Top anomaly context: {request.anomaly_type or 'No explicit label'}",
        ],
        recommended_action=(
            (
                f"A {top_intervention} intervention is recommended {timing_window} "
                f"to address early signs of {risk_type} risk."
            )
            if recommendations
            else "Schedule a manager check-in and monitor weekly indicators."
        ),
        confidence="medium",
        urgency="this_week",
    )

    try:
        response = await groq_chat(messages)
        content = response.choices[0].message.content if response and response.choices else ""
        if not content or len(content.strip()) < 20:
            return fallback

        parsed = parse_structured_insight(content, fallback)
        combined_text = " ".join(
            [
                parsed.summary,
                " ".join(parsed.key_signals),
                parsed.recommended_action,
            ]
        )
        if _contains_banned_language(combined_text):
            retry_response = await groq_chat(messages)
            retry_content = (
                retry_response.choices[0].message.content
                if retry_response and retry_response.choices
                else ""
            )
            if not retry_content or len(retry_content.strip()) < 20:
                return fallback

            retry_parsed = parse_structured_insight(retry_content, fallback)
            retry_combined = " ".join(
                [
                    retry_parsed.summary,
                    " ".join(retry_parsed.key_signals),
                    retry_parsed.recommended_action,
                ]
            )
            if _contains_banned_language(retry_combined):
                return fallback

            return retry_parsed

        return parsed
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

    if (request.recent_recognition_count_90d or 0) == 0:
        selected.append((InterventionType.FLEXIBLE_SCHEDULE, "Recognition Gap flagged in last 90 days"))

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
            intervention_name=INTERVENTION_LABELS.get(intervention_type, intervention_type.value),
        )
        (
            rec.intervention_cost_inr,
            rec.projected_savings_inr,
            rec.roi_percent,
            rec.target_group,
            rec.savings_basis,
            rec.target_employee_count,
        ) = _compute_roi_fields(request, intervention_type)
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
