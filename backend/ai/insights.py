"""Aggregate AI insights for an employee."""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Coroutine

from ai.burnout import assess_burnout
from ai.performance import predict_performance
from ai.retention import assess_retention
from ai.schemas import (
    BurnoutRequest,
    PerformanceRequest,
    RetentionRequest,
    SentimentRequest,
)
from ai.sentiment import analyze_sentiment


def _is_rate_limit_error(exc: BaseException) -> bool:
    text = str(exc)
    if "429" in text:
        return True
    code = getattr(exc, "status_code", None)
    return code == 429


async def _call_with_rate_limit(
    func: Callable[..., Coroutine[Any, Any, Any]],
    *args: Any,
) -> Any:
    try:
        return await func(*args)
    except Exception as exc:
        if _is_rate_limit_error(exc):
            await asyncio.sleep(1)
            return await func(*args)
        raise


async def get_employee_insights(employee_id: str, data: dict) -> dict:
    """Run all AI analyses concurrently and return a combined payload."""
    sentiment_request = SentimentRequest(
        employee_id=employee_id,
        texts=list(data.get("texts", [])),
    )
    burnout_request = BurnoutRequest(
        employee_id=employee_id,
        overtime_hours=float(data.get("overtime_hours", 0.0)),
        pto_days_unused=int(data.get("pto_days_unused", 0)),
        sentiment_score=float(data.get("sentiment_score", 0.0)),
        meeting_load_hours=float(data.get("meeting_load_hours", 0.0)),
        tenure_months=int(data.get("tenure_months", 0)),
    )
    performance_request = PerformanceRequest(
        employee_id=employee_id,
        kpi_completion_rate=float(data.get("kpi_completion_rate", 0.0)),
        peer_review_score=float(data.get("peer_review_score", 0.0)),
        sentiment_score=float(data.get("sentiment_score", 0.0)),
        tenure_months=int(data.get("tenure_months", 0)),
        recent_projects_completed=int(data.get("recent_projects_completed", 0)),
    )
    retention_request = RetentionRequest(
        employee_id=employee_id,
        burnout_risk_score=float(data.get("burnout_risk_score", 0.0)),
        performance_band=str(data.get("performance_band", "solid")),
        tenure_months=int(data.get("tenure_months", 0)),
        salary_band=str(data.get("salary_band", "mid")),
        last_promotion_months_ago=int(data.get("last_promotion_months_ago", 0)),
        sentiment_score=float(data.get("sentiment_score", 0.0)),
    )

    sentiment_task = _call_with_rate_limit(analyze_sentiment, sentiment_request)
    burnout_task = _call_with_rate_limit(assess_burnout, burnout_request)
    performance_task = _call_with_rate_limit(predict_performance, performance_request)
    retention_task = _call_with_rate_limit(assess_retention, retention_request)

    sentiment, burnout, performance, retention = await asyncio.gather(
        sentiment_task,
        burnout_task,
        performance_task,
        retention_task,
    )

    return {
        "sentiment": sentiment,
        "burnout": burnout,
        "performance": performance,
        "retention": retention,
    }
