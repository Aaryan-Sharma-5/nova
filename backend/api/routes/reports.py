from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query

from ai.groq_client import groq_chat
from ai.models import build_fallback_structured_insight, parse_structured_insight
from api.deps import require_role
from models.user import User, UserRole

router = APIRouter(prefix="/api/reports", tags=["Reports"])


async def _build_executive_summary(payload: dict[str, Any]) -> str:
    prompt = (
        "Write a 150-word executive summary for an HR org wellbeing report. "
        "Be concise, business-friendly, and action-oriented."
    )
    user_payload = (
        f"Overall score: {payload['overall_workforce_health_score']}. "
        f"Top risks: {payload['top_at_risk_employees']}. "
        f"Intervention success rate: {payload['intervention_success_rate']}%. "
        f"Key deltas: {payload['key_metrics_vs_last_month']}"
    )
    try:
        response = await groq_chat(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_payload},
            ],
            max_tokens=260,
            temperature=0.2,
        )
        content = response.choices[0].message.content if response and response.choices else ""
        if content and content.strip():
            return content.strip()
    except Exception:
        pass

    return (
        "Workforce health remains stable with focused risk pockets. Attrition and burnout pressures are concentrated in a "
        "small set of teams, while engagement trends remain resilient overall. The current intervention portfolio is producing "
        "measurable impact, especially where managers are acting quickly on early warning signals. Priority actions for the next "
        "cycle include targeted retention plans for high-risk employees, stronger workload normalization in pressured departments, "
        "and consistent manager follow-through on one-on-ones. If current trends continue and interventions remain timely, the "
        "organization should improve both retention outcomes and productivity confidence over the next reporting window."
    )


@router.get("/org-health")
async def get_org_health_report(
    format: str = Query("pdf"),
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    data = {
        "report_date": date.today().isoformat(),
        "format": format,
        "overall_workforce_health_score": 76,
        "top_at_risk_employees": [
            {"employee": "Employee A", "risk_score": 87, "department": "Sales"},
            {"employee": "Employee B", "risk_score": 82, "department": "Engineering"},
            {"employee": "Employee C", "risk_score": 79, "department": "Marketing"},
        ],
        "department_burnout_heatmap": [
            {"department": "Engineering", "burnout": 58},
            {"department": "Sales", "burnout": 72},
            {"department": "Marketing", "burnout": 54},
            {"department": "Operations", "burnout": 48},
        ],
        "intervention_success_rate": 61,
        "key_metrics_vs_last_month": {
            "attrition_rate_delta_pct": -1.3,
            "engagement_delta_pct": 2.4,
            "burnout_delta_pct": -0.9,
            "absenteeism_delta_pct": 0.7,
        },
    }
    data["executive_summary"] = await _build_executive_summary(data)
    return data


Scope = Literal["org", "team"]


# K-anonymity floor — brief aggregation must cover at least this many people
# to avoid exposing individual-inferable signals at small team sizes.
_WEEKLY_BRIEF_MIN_TEAM_SIZE = 5


def _aggregate_weekly_brief_context(scope: Scope, team_id: str | None) -> dict[str, Any]:
    """Gather the signals that seed the Weekly Brief narrative.

    Currently demo-grade: returns deterministic snapshots per scope. Live-data
    ingestion is a §10 Priority Gap (mock graph → live comms metadata) and is
    explicitly out of scope for this slice.
    """
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    if scope == "team":
        team_name = team_id or "payments-core"
        return {
            "scope": "team",
            "team_id": team_name,
            "team_name": team_name.replace("-", " ").title(),
            "week_of": week_start.isoformat(),
            "team_size": 14,
            "health_score": 68,
            "health_delta_pct": -4.2,
            "sentiment_trend_slope_30d": -0.06,
            "at_risk": [
                {
                    "alias": "Engineer R.",
                    "risk_score": 84,
                    "tenure_months": 9,
                    "top_factors": [
                        "after-hours activity up 42% over 14 days",
                        "zero peer recognition events this cycle",
                        "meeting-to-focus-work ratio at 61%",
                    ],
                },
                {
                    "alias": "Engineer S.",
                    "risk_score": 76,
                    "tenure_months": 22,
                    "top_factors": [
                        "PTO untaken for 8 months",
                        "sentiment slope -0.11 over 30 days",
                        "skip-level 1:1 overdue by 23 days",
                    ],
                },
            ],
            "interventions_in_flight": [
                {"type": "skip_level_1on1", "target": "Engineer R.", "due_in_days": 5, "status": "scheduled"},
                {"type": "workload_rebalance", "target": "team", "due_in_days": 2, "status": "pending"},
            ],
            "context_note": "Team just closed a Q-crunch sprint; post-launch fatigue is plausible.",
        }

    return {
        "scope": "org",
        "week_of": week_start.isoformat(),
        "population": 842,
        "health_score": 76,
        "health_delta_pct": 1.1,
        "sentiment_trend_slope_30d": 0.02,
        "at_risk_teams": [
            {"team": "Sales EMEA", "risk_score": 81, "drivers": ["pipeline pressure", "manager 1:1 gap"]},
            {"team": "Payments Core", "risk_score": 74, "drivers": ["post-crunch fatigue", "after-hours activity"]},
        ],
        "interventions_in_flight": 11,
        "intervention_success_rate": 63,
    }


def _weekly_brief_fallback_narrative(ctx: dict[str, Any]) -> str:
    if ctx["scope"] == "team":
        return (
            f"This week the {ctx['team_name']} team (n={ctx['team_size']}) held a health score of "
            f"{ctx['health_score']} with a {ctx['health_delta_pct']}% week-over-week change. "
            f"Two members surfaced as elevated-risk. {ctx['at_risk'][0]['alias']} is the priority "
            f"signal — tenure of {ctx['at_risk'][0]['tenure_months']} months paired with after-hours spikes "
            "and no recognition events suggests isolation-driven burnout rather than pure workload. "
            f"{ctx['at_risk'][1]['alias']} shows a slower decline: stale PTO plus an overdue skip-level "
            "is the classic disengagement pattern. Context matters — "
            f"{ctx['context_note']} Two interventions are already in flight; the skip-level 1:1 is the "
            "highest-leverage action this week. Suggested follow-through: confirm the skip-level happens on "
            "time, pair it with a workload rebalance review, and re-check sentiment after seven days. If "
            "neither signal improves by next brief, escalate to HR partner review."
        )
    return (
        f"Org-wide workforce health sits at {ctx['health_score']} ({ctx['health_delta_pct']:+.1f}% WoW), "
        "with risk concentrated in two teams rather than spread broadly. Sales EMEA is the sharpest signal "
        "— pipeline pressure compounded by missed 1:1 cadence is the usual precursor to attrition clusters. "
        "Payments Core is showing post-crunch fatigue, which typically self-corrects in 2–3 weeks if "
        "leadership visibly slows the pace. Eleven interventions are active with a 63% success rate, "
        "consistent with prior cycles. Priority for the coming week: ensure Sales EMEA managers confirm "
        "1:1 cadence is restored, and hold Payments Core leadership accountable to protecting focus time. "
        "Sentiment slope is flat-to-positive, so the intervention posture should stay targeted, not broad. "
        "Re-evaluate after one cycle and escalate only if Sales EMEA risk fails to decline."
    )


async def _generate_weekly_brief_narrative(ctx: dict[str, Any]) -> str:
    system = (
        "You are a senior People Analytics advisor writing a weekly Workforce Pulse Brief for an HR leader. "
        "Write exactly one continuous passage, 180–220 words, plain English, no headings, no bullet points. "
        "Be specific, empathetic, and action-oriented. Reference the data you were given — do not invent "
        "metrics. Flag the top risks, give one concrete intervention per risk, and close with what to watch "
        "for next week. Tone: thoughtful colleague, not corporate."
    )
    user_payload = (
        f"Scope: {ctx['scope']}. Week of: {ctx['week_of']}. Data: {ctx}. "
        "Write the brief now."
    )
    try:
        response = await groq_chat(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_payload},
            ],
            max_tokens=420,
            temperature=0.3,
        )
        content = response.choices[0].message.content if response and response.choices else ""
        if content and content.strip():
            return content.strip()
    except Exception:
        pass
    return _weekly_brief_fallback_narrative(ctx)


def _weekly_brief_structured_insight(ctx: dict[str, Any]):
    if ctx["scope"] == "team":
        top = ctx["at_risk"][0]
        signals = [
            f"{top['alias']} risk at {top['risk_score']} driven by {top['top_factors'][0]}",
            f"Secondary: {ctx['at_risk'][1]['alias']} disengagement pattern (stale PTO, overdue skip-level)",
            f"Context: {ctx['context_note']}",
        ]
        action = "Confirm skip-level 1:1 lands on time; pair with a workload rebalance review within 7 days."
        urgency = "this_week"
        confidence = "medium"
    else:
        signals = [
            f"Sales EMEA risk at 81 — pipeline pressure + 1:1 cadence gap",
            f"Payments Core risk at 74 — post-crunch fatigue pattern",
            f"Intervention portfolio healthy (success rate {ctx['intervention_success_rate']}%, {ctx['interventions_in_flight']} active)",
        ]
        action = "Restore 1:1 cadence in Sales EMEA this week; protect focus time in Payments Core."
        urgency = "this_week"
        confidence = "medium"

    return build_fallback_structured_insight(
        summary=f"Weekly brief — {ctx['scope']} scope, week of {ctx['week_of']}.",
        key_signals=signals,
        recommended_action=action,
        confidence=confidence,
        urgency=urgency,
    )


def _word_count(text: str) -> int:
    return len([w for w in text.split() if w.strip()])


@router.get("/weekly-brief")
async def get_weekly_brief(
    scope: Scope = Query("org"),
    team_id: str | None = Query(None),
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict:
    """Narrative Weekly Brief — 200-word People-Ops-advisor-style workforce pulse."""
    # Managers are scoped to team briefs only; org briefs require HR/Leadership.
    effective_scope: Scope = scope
    if current_user.role == UserRole.MANAGER:
        effective_scope = "team"

    ctx = _aggregate_weekly_brief_context(effective_scope, team_id)

    # k-anonymity floor for team briefs — refuse to narrate if the team is too
    # small to aggregate safely. The structured_insight contract is still
    # honored so the frontend can render a graceful empty state.
    if effective_scope == "team" and ctx.get("team_size", 0) < _WEEKLY_BRIEF_MIN_TEAM_SIZE:
        fallback_insight = build_fallback_structured_insight(
            summary="Team too small to aggregate safely.",
            key_signals=[
                f"Team size below k-anonymity floor of {_WEEKLY_BRIEF_MIN_TEAM_SIZE}",
                "Individual-inference risk too high for narrative generation",
                "Escalate to HR partner for 1:1 review instead",
            ],
            recommended_action="Run manual 1:1 review; weekly brief suppressed until team size threshold is met.",
            confidence="high",
            urgency="monitor",
        )
        return {
            "scope": effective_scope,
            "week_of": ctx["week_of"],
            "narrative": None,
            "suppressed": True,
            "suppression_reason": f"team_size<{_WEEKLY_BRIEF_MIN_TEAM_SIZE}",
            "structured_insight": fallback_insight.model_dump(),
            "context": None,
            "word_count": 0,
        }

    narrative = await _generate_weekly_brief_narrative(ctx)
    insight = _weekly_brief_structured_insight(ctx)

    # Try to validate/repair the narrative through the structured-insight
    # parser when Groq returns JSON-shaped output instead of prose.
    insight = parse_structured_insight(narrative, insight)

    return {
        "scope": effective_scope,
        "week_of": ctx["week_of"],
        "narrative": narrative,
        "suppressed": False,
        "structured_insight": insight.model_dump(),
        "context": ctx,
        "word_count": _word_count(narrative),
    }
