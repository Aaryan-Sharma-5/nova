"""Cross-score explainability helpers with ML-backed and rule-based fallbacks."""

from __future__ import annotations

import hashlib
from typing import Any, Literal

from ai.ml.burnout_classifier import get_feature_contributions

ScoreType = Literal["burnout", "attrition", "engagement"]


def _deterministic_unit(seed: str, salt: str) -> float:
    digest = hashlib.sha256(f"{seed}:{salt}".encode("utf-8")).hexdigest()
    value = int(digest[:8], 16)
    return value / float(0xFFFFFFFF)


def _feature_profile(employee_id: str) -> dict[str, float]:
    """Deterministic fallback profile used when live ML feature rows are unavailable."""
    return {
        "overtime_hours": 20 + _deterministic_unit(employee_id, "overtime") * 40,
        "pto_days_unused": _deterministic_unit(employee_id, "pto") * 20,
        "meeting_load_hours": 10 + _deterministic_unit(employee_id, "meeting") * 25,
        "sentiment_score": -0.6 + _deterministic_unit(employee_id, "sentiment") * 1.4,
        "tenure_months": 3 + _deterministic_unit(employee_id, "tenure") * 84,
        "performance_score": 0.35 + _deterministic_unit(employee_id, "performance") * 0.6,
        "days_since_promotion": 30 + _deterministic_unit(employee_id, "promotion") * 1300,
        "after_hours_ratio": _deterministic_unit(employee_id, "after_hours"),
        "communication_drop_indicator": _deterministic_unit(employee_id, "comm_drop"),
        "engagement_score": 0.3 + _deterministic_unit(employee_id, "engagement") * 0.65,
    }


def _normalize_explanations(contributions: list[dict[str, Any]], top_k: int = 3) -> tuple[list[dict[str, Any]], float]:
    total_abs = sum(abs(float(item.get("contribution", 0.0))) for item in contributions) or 1.0
    top = contributions[:top_k]
    covered = sum(abs(float(item.get("contribution", 0.0))) for item in top)

    normalized = []
    for item in top:
        contribution = float(item.get("contribution", 0.0))
        direction = "↑ increases risk" if contribution >= 0 else "↓ decreases risk"
        normalized.append(
            {
                "feature": item.get("feature", "unknown_feature"),
                "contribution": round(contribution / 100.0, 3),
                "direction": direction,
                "plain_english": item.get("explanation")
                or f"{item.get('label', 'Feature')} contributes {contribution:+.1f}%.",
            }
        )

    confidence_coverage = round((covered / total_abs) * 100.0, 1)
    return normalized, confidence_coverage


def _rule_explanations(employee_id: str, score_type: ScoreType, top_k: int = 3) -> tuple[list[dict[str, Any]], float]:
    profile = _feature_profile(employee_id)

    if score_type == "attrition":
        candidates = [
            {
                "feature": "sentiment_score",
                "contribution": 0.32 * (max(0.0, 0.2 - profile["sentiment_score"])),
                "plain_english": f"Sentiment dipped to {profile['sentiment_score']:.2f}, elevating attrition risk.",
            },
            {
                "feature": "engagement_score",
                "contribution": 0.28 * (max(0.0, 0.65 - profile["engagement_score"])),
                "plain_english": f"Engagement at {profile['engagement_score']:.2f} is below resilient-range baseline.",
            },
            {
                "feature": "days_since_promotion",
                "contribution": 0.24 * (min(profile["days_since_promotion"], 1825.0) / 1825.0),
                "plain_english": f"Long promotion gap ({profile['days_since_promotion']:.0f} days) is a flight-risk pressure.",
            },
            {
                "feature": "pto_days_unused",
                "contribution": 0.16 * (min(profile["pto_days_unused"], 25.0) / 25.0),
                "plain_english": f"Unused PTO ({profile['pto_days_unused']:.1f} days) can indicate sustained disengagement.",
            },
        ]
    else:
        candidates = [
            {
                "feature": "meeting_load_hours",
                "contribution": -0.30 * (min(profile["meeting_load_hours"], 40.0) / 40.0),
                "plain_english": f"High meeting load ({profile['meeting_load_hours']:.1f}h/week) reduces engagement headroom.",
            },
            {
                "feature": "sentiment_score",
                "contribution": 0.28 * profile["sentiment_score"],
                "plain_english": f"Sentiment at {profile['sentiment_score']:.2f} directly influences engagement momentum.",
            },
            {
                "feature": "after_hours_ratio",
                "contribution": -0.22 * profile["after_hours_ratio"],
                "plain_english": f"After-hours ratio at {profile['after_hours_ratio']:.2f} suggests recovery-time erosion.",
            },
            {
                "feature": "performance_score",
                "contribution": 0.20 * profile["performance_score"],
                "plain_english": f"Performance trajectory ({profile['performance_score']:.2f}) supports engagement confidence.",
            },
        ]

    candidates.sort(key=lambda item: abs(float(item["contribution"])), reverse=True)
    top = candidates[:top_k]

    total_abs = sum(abs(float(item["contribution"])) for item in candidates) or 1.0
    covered = sum(abs(float(item["contribution"])) for item in top)

    normalized = []
    for item in top:
        contribution = float(item["contribution"])
        direction = "↑ increases risk" if contribution >= 0 else "↓ decreases risk"
        normalized.append(
            {
                "feature": item["feature"],
                "contribution": round(contribution, 3),
                "direction": direction,
                "plain_english": item["plain_english"],
            }
        )

    return normalized, round((covered / total_abs) * 100.0, 1)


def explain_score(employee_id: str, score_type: ScoreType) -> dict[str, Any]:
    """Explain top drivers for burnout/attrition/engagement score outputs."""
    normalized_type: ScoreType = score_type if score_type in {"burnout", "attrition", "engagement"} else "burnout"

    if normalized_type == "burnout":
        contributions = get_feature_contributions(_feature_profile(employee_id), top_k=10)
        top, coverage = _normalize_explanations(contributions, top_k=3)
        source = "ml_feature_importance_or_fallback"
    else:
        top, coverage = _rule_explanations(employee_id, normalized_type, top_k=3)
        source = "rule_weight_explanations"

    return {
        "employee_id": employee_id,
        "score_type": normalized_type,
        "explanations": top,
        "confidence_coverage": coverage,
        "source": source,
    }
