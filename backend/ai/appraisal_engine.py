from __future__ import annotations

import asyncio
import ast
import json
from dataclasses import dataclass
from typing import Any

from ai.groq_client import groq_chat


@dataclass
class ScoreMatrix:
    performance_score: float
    consistency_score: float
    growth_trajectory: float
    engagement_factor: float
    retention_risk_penalty: float
    burnout_penalty: float
    sentiment_bonus: float
    feedback_signal: float
    composite_appraisal_score: float


class AppraisalEngine:
    def __init__(self) -> None:
        pass

    @staticmethod
    def _clamp(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))

    @staticmethod
    def _to_percent(value: float | int | None) -> float:
        if value is None:
            return 0.0
        number = float(value)
        if number <= 1.0:
            return number * 100.0
        return number

    def _consistency_score(self, history: list[float]) -> float:
        if not history:
            return 55.0
        tail = history[-4:]
        avg = sum(tail) / len(tail)
        variance = sum((v - avg) ** 2 for v in tail) / len(tail)
        # Lower variance means more consistency.
        return self._clamp(100.0 - (variance * 0.9), 0.0, 100.0)

    def _growth_trajectory(self, history: list[float]) -> float:
        if len(history) < 2:
            return 50.0
        slope = (history[-1] - history[0]) / (len(history) - 1)
        # Map slope to 0..100 around neutral baseline of 50.
        return self._clamp(50.0 + (slope * 12.0), 0.0, 100.0)

    @staticmethod
    def _category(composite: float) -> str:
        if composite >= 85:
            return "Exceptional — Fast Track Promotion"
        if composite >= 70:
            return "High Performer — Standard Promotion + Raise"
        if composite >= 55:
            return "Meets Expectations — Merit Increment"
        if composite >= 40:
            return "Needs Improvement — PIP Consideration"
        return "Critical — Intervention Required Before Review"

    def compute_scoring_matrix(self, employee_data: dict[str, Any]) -> ScoreMatrix:
        performance_score = self._clamp(
            self._to_percent(employee_data.get("performance_score", employee_data.get("kpi_score", 0.0))),
            0.0,
            100.0,
        )

        history_raw = employee_data.get("performance_history", [])
        history: list[float] = []
        for point in history_raw:
            if isinstance(point, dict):
                history.append(self._to_percent(point.get("score", 0.0)))
            else:
                history.append(self._to_percent(point))

        if not history:
            history = [performance_score]

        consistency_score = self._consistency_score(history)
        growth_trajectory = self._growth_trajectory(history)

        engagement_factor = self._clamp(
            self._to_percent(employee_data.get("engagement_score", 0.0)),
            0.0,
            100.0,
        )

        attrition_risk = self._to_percent(employee_data.get("attrition_risk", 0.0)) / 100.0
        if attrition_risk > 0.6:
            retention_risk_penalty = -20.0
        elif attrition_risk > 0.4:
            retention_risk_penalty = -10.0
        else:
            retention_risk_penalty = 0.0

        burnout_score = self._to_percent(employee_data.get("burnout_score", 0.0)) / 100.0
        if burnout_score > 0.7:
            burnout_penalty = -15.0
        elif burnout_score > 0.5:
            burnout_penalty = -5.0
        else:
            burnout_penalty = 0.0

        sentiment_score = float(employee_data.get("sentiment_score", 0.0))
        sentiment_bonus = 10.0 if sentiment_score > 0.75 else 0.0

        positive_feedbacks = int(employee_data.get("positive_feedback_count", 0) or 0)
        critical_feedback_exists = bool(employee_data.get("critical_feedback_exists", False))
        if critical_feedback_exists:
            feedback_signal = -10.0
        elif positive_feedbacks > 3:
            feedback_signal = 5.0
        else:
            feedback_signal = 0.0

        weighted_perf = performance_score * 0.35
        weighted_consistency = consistency_score * 0.15
        weighted_growth = growth_trajectory * 0.20
        weighted_engagement = engagement_factor * 0.15

        composite = (
            weighted_perf
            + weighted_consistency
            + weighted_growth
            + weighted_engagement
            + retention_risk_penalty
            + burnout_penalty
            + sentiment_bonus
            + feedback_signal
        )
        composite = self._clamp(composite, 0.0, 100.0)

        return ScoreMatrix(
            performance_score=performance_score,
            consistency_score=consistency_score,
            growth_trajectory=growth_trajectory,
            engagement_factor=engagement_factor,
            retention_risk_penalty=retention_risk_penalty,
            burnout_penalty=burnout_penalty,
            sentiment_bonus=sentiment_bonus,
            feedback_signal=feedback_signal,
            composite_appraisal_score=composite,
        )

    @staticmethod
    def _parse_json_payload(raw_text: str) -> dict[str, Any] | None:
        text = raw_text.strip()
        if not text:
            return None

        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass

        try:
            parsed = ast.literal_eval(text)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    async def _enrich_with_groq(
        self,
        employee_data: dict[str, Any],
        matrix: ScoreMatrix,
        category: str,
    ) -> dict[str, Any]:
        feedback_themes = employee_data.get("feedback_themes_if_any", [])
        if isinstance(feedback_themes, list):
            theme_summary = ", ".join(str(item) for item in feedback_themes[:6]) or "No dominant themes"
        else:
            theme_summary = str(feedback_themes)

        sentiment_trend = employee_data.get("sentiment_trend", "stable")

        prompt = (
            "You are an experienced HR director conducting an annual appraisal. "
            f"Employee: {employee_data.get('name', 'Unknown')}, {employee_data.get('role', 'Unknown Role')}, "
            f"{employee_data.get('department', 'Unknown Dept')}, {employee_data.get('tenure_months', 0)} months tenure. "
            f"Performance score: {matrix.performance_score:.1f}%, Engagement: {matrix.engagement_factor:.1f}%, "
            f"Burnout risk: {self._to_percent(employee_data.get('burnout_score', 0.0)):.1f}%. "
            f"Sentiment trend: {sentiment_trend}. Composite appraisal score: {matrix.composite_appraisal_score:.1f}/100. "
            f"Category: {category}. Feedback summary: {theme_summary}. "
            "Write a professional 3-sentence appraisal summary for HR records. "
            "Then list exactly 3 specific recommendations (salary/promotion/training/PIP/recognition/mentorship). "
            "Format as JSON: "
            "{ 'summary': '...', 'recommendations': ['...', '...', '...'], "
            "'salary_action': 'increment_X%|no_change|review_needed', "
            "'promotion_eligible': true|false, 'review_flag': 'none|pip|fast_track|monitor' }"
        )

        fallback = {
            "summary": (
                f"{employee_data.get('name', 'This employee')} shows a composite appraisal score of "
                f"{matrix.composite_appraisal_score:.1f}/100 and is currently in category '{category}'. "
                "Performance and engagement signals are balanced against burnout and retention indicators. "
                "HR review should confirm compensation, development, and intervention priorities."
            ),
            "recommendations": [
                "Review salary positioning against current responsibilities and market median.",
                "Set a 90-day performance and growth objective with manager checkpoints.",
                "Assign a targeted development plan (mentorship/training) aligned to role goals.",
            ],
            "salary_action": "review_needed",
            "promotion_eligible": matrix.composite_appraisal_score >= 70,
            "review_flag": "fast_track" if matrix.composite_appraisal_score >= 85 else (
                "pip" if matrix.composite_appraisal_score < 55 else "monitor"
            ),
        }

        try:
            response = await groq_chat(
                messages=[
                    {
                        "role": "system",
                        "content": "Return only valid JSON with the required keys. No markdown.",
                    },
                    {"role": "user", "content": prompt},
                ]
            )
            content = response.choices[0].message.content if response and response.choices else ""
            parsed = self._parse_json_payload(content or "")
            if not parsed:
                return fallback

            recs = parsed.get("recommendations", [])
            if not isinstance(recs, list):
                recs = fallback["recommendations"]

            cleaned_recs = [str(item).strip() for item in recs if str(item).strip()][:3]
            while len(cleaned_recs) < 3:
                cleaned_recs.append(fallback["recommendations"][len(cleaned_recs)])

            return {
                "summary": str(parsed.get("summary") or fallback["summary"]).strip(),
                "recommendations": cleaned_recs,
                "salary_action": str(parsed.get("salary_action") or fallback["salary_action"]).strip(),
                "promotion_eligible": bool(parsed.get("promotion_eligible", fallback["promotion_eligible"])),
                "review_flag": str(parsed.get("review_flag") or fallback["review_flag"]).strip(),
            }
        except Exception:
            return fallback

    async def generate_suggestion(self, employee_data: dict[str, Any]) -> dict[str, Any]:
        matrix = self.compute_scoring_matrix(employee_data)
        category = self._category(matrix.composite_appraisal_score)
        llm_enrichment = await self._enrich_with_groq(employee_data, matrix, category)

        weighted_breakdown = {
            "performance_contribution": round(matrix.performance_score * 0.35, 2),
            "consistency_contribution": round(matrix.consistency_score * 0.15, 2),
            "growth_contribution": round(matrix.growth_trajectory * 0.20, 2),
            "engagement_contribution": round(matrix.engagement_factor * 0.15, 2),
            "retention_risk_penalty": round(matrix.retention_risk_penalty, 2),
            "burnout_penalty": round(matrix.burnout_penalty, 2),
            "sentiment_bonus": round(matrix.sentiment_bonus, 2),
            "feedback_signal": round(matrix.feedback_signal, 2),
            "total": round(matrix.composite_appraisal_score, 2),
        }

        return {
            "employee_id": employee_data.get("employee_id"),
            "employee_name": employee_data.get("name"),
            "department": employee_data.get("department"),
            "role": employee_data.get("role"),
            "tenure_months": employee_data.get("tenure_months", 0),
            "composite_score": round(matrix.composite_appraisal_score, 2),
            "category": category,
            "summary": llm_enrichment["summary"],
            "recommendations": llm_enrichment["recommendations"],
            "salary_action": llm_enrichment["salary_action"],
            "promotion_eligible": bool(llm_enrichment["promotion_eligible"]),
            "review_flag": llm_enrichment["review_flag"],
            "score_breakdown": weighted_breakdown,
        }

    async def batch_generate(
        self,
        employee_ids: list[Any],
        resolver: Any | None = None,
    ) -> list[dict[str, Any]]:
        payloads: list[dict[str, Any]] = []
        for item in employee_ids:
            if isinstance(item, dict):
                payloads.append(item)
                continue

            if resolver:
                payloads.append(resolver(str(item)))
            else:
                payloads.append({"employee_id": str(item), "name": f"Employee {item}"})

        tasks = [self.generate_suggestion(item) for item in payloads]
        return list(await asyncio.gather(*tasks))
