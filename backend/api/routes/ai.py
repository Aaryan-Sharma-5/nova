"""AI insight endpoints for NOVA."""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator, Iterable

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from ai.burnout import assess_burnout
from ai.groq_client import groq_chat
from ai.insights import get_employee_insights
from ai.performance import predict_performance
from ai.retention import assess_retention
from ai.schemas import (
    AskNovaRequest,
    BurnoutRequest,
    BurnoutResult,
    PerformanceRequest,
    PerformanceResult,
    RetentionRequest,
    RetentionResult,
    SentimentRequest,
    SentimentResult,
)
from ai.sentiment import analyze_sentiment
from api.deps import require_role
from models.user import User, UserRole

router = APIRouter()
logger = logging.getLogger(__name__)


def _stream_text(chunk: Any) -> str:
    if not hasattr(chunk, "choices"):
        return ""
    choice = chunk.choices[0] if chunk.choices else None
    if not choice:
        return ""
    delta = getattr(choice, "delta", None)
    if delta and getattr(delta, "content", None):
        return delta.content
    message = getattr(choice, "message", None)
    return getattr(message, "content", "") or ""


def _iter_stream(stream: Any) -> AsyncIterator[Any]:
    if hasattr(stream, "__aiter__"):
        async def _aiter() -> AsyncIterator[Any]:
            async for item in stream:
                yield item
        return _aiter()

    async def _iter() -> AsyncIterator[Any]:
        for item in stream if isinstance(stream, Iterable) else []:
            yield item
    return _iter()


def _role_dependency() -> Depends:
    return Depends(require_role([UserRole.HR, UserRole.MANAGER]))


@router.post("/sentiment", response_model=SentimentResult)
async def sentiment_endpoint(
    request: SentimentRequest,
    current_user: User = _role_dependency(),
) -> SentimentResult:
    logger.info(
        "AI sentiment requested by=%s role=%s employee_id=%s text_count=%d",
        current_user.email,
        current_user.role.value,
        request.employee_id,
        len(request.texts),
    )
    result = await analyze_sentiment(request)
    logger.info(
        "AI sentiment completed by=%s employee_id=%s label=%s confidence=%.3f",
        current_user.email,
        request.employee_id,
        result.label,
        result.confidence,
    )
    return result


@router.post("/burnout-risk", response_model=BurnoutResult)
async def burnout_endpoint(
    request: BurnoutRequest,
    current_user: User = _role_dependency(),
) -> BurnoutResult:
    logger.info(
        "AI burnout requested by=%s role=%s employee_id=%s",
        current_user.email,
        current_user.role.value,
        request.employee_id,
    )
    result = await assess_burnout(request)
    logger.info(
        "AI burnout completed by=%s employee_id=%s risk=%s score=%.3f",
        current_user.email,
        request.employee_id,
        result.risk_level,
        result.risk_score,
    )
    return result


@router.post("/performance-prediction", response_model=PerformanceResult)
async def performance_endpoint(
    request: PerformanceRequest,
    current_user: User = _role_dependency(),
) -> PerformanceResult:
    logger.info(
        "AI performance requested by=%s role=%s employee_id=%s",
        current_user.email,
        current_user.role.value,
        request.employee_id,
    )
    result = await predict_performance(request)
    logger.info(
        "AI performance completed by=%s employee_id=%s band=%s confidence=%.3f",
        current_user.email,
        request.employee_id,
        result.predicted_band,
        result.confidence,
    )
    return result


@router.post("/retention-risk", response_model=RetentionResult)
async def retention_endpoint(
    request: RetentionRequest,
    current_user: User = _role_dependency(),
) -> RetentionResult:
    logger.info(
        "AI retention requested by=%s role=%s employee_id=%s",
        current_user.email,
        current_user.role.value,
        request.employee_id,
    )
    result = await assess_retention(request)
    logger.info(
        "AI retention completed by=%s employee_id=%s risk=%s score=%.3f",
        current_user.email,
        request.employee_id,
        result.retention_risk,
        result.flight_risk_score,
    )
    return result


@router.get("/insights/{employee_id}")
async def insights_endpoint(
    employee_id: str,
    texts: list[str] | None = Query(None),
    overtime_hours: float | None = None,
    pto_days_unused: int | None = None,
    sentiment_score: float | None = None,
    meeting_load_hours: float | None = None,
    tenure_months: int | None = None,
    kpi_completion_rate: float | None = None,
    peer_review_score: float | None = None,
    recent_projects_completed: int | None = None,
    burnout_risk_score: float | None = None,
    performance_band: str | None = None,
    salary_band: str | None = None,
    last_promotion_months_ago: int | None = None,
    current_user: User = _role_dependency(),
) -> dict:
    logger.info(
        "AI insights requested by=%s role=%s employee_id=%s text_count=%d",
        current_user.email,
        current_user.role.value,
        employee_id,
        len(texts or []),
    )
    payload = {
        "texts": texts or [],
        "overtime_hours": overtime_hours or 0.0,
        "pto_days_unused": pto_days_unused or 0,
        "sentiment_score": sentiment_score or 0.0,
        "meeting_load_hours": meeting_load_hours or 0.0,
        "tenure_months": tenure_months or 0,
        "kpi_completion_rate": kpi_completion_rate or 0.0,
        "peer_review_score": peer_review_score or 0.0,
        "recent_projects_completed": recent_projects_completed or 0,
        "burnout_risk_score": burnout_risk_score or 0.0,
        "performance_band": performance_band or "solid",
        "salary_band": salary_band or "mid",
        "last_promotion_months_ago": last_promotion_months_ago or 0,
    }
    result = await get_employee_insights(employee_id, payload)
    logger.info(
        "AI insights completed by=%s employee_id=%s has_summary=%s",
        current_user.email,
        employee_id,
        bool(result.get("summary")),
    )
    return result


@router.post("/ask")
async def ask_nova_endpoint(
    request: AskNovaRequest,
    current_user: User = _role_dependency(),
) -> StreamingResponse:
    logger.info(
        "AI ask requested by=%s role=%s context=%s employee_id=%s question_len=%d",
        current_user.email,
        current_user.role.value,
        request.context_type,
        request.employee_id or "n/a",
        len(request.question),
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You are NOVA, an HR analytics assistant. Answer clearly and concisely. "
                "Return plain text only (no markdown). Do not use symbols like **, __, #, or bullet markers. "
                "Use a short opening sentence followed by a numbered list with each item on a new line."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {request.question}\n"
                f"Context type: {request.context_type}\n"
                f"Employee ID: {request.employee_id or 'n/a'}"
            ),
        },
    ]

    async def event_stream() -> AsyncIterator[str]:
        try:
            stream = await groq_chat(messages=messages, stream=True)
            logger.info("AI ask stream opened by=%s", current_user.email)
            async for chunk in _iter_stream(stream):
                text = _stream_text(chunk)
                if text:
                    yield f"data: {text}\n\n"
            logger.info("AI ask stream completed by=%s", current_user.email)
        except Exception as exc:
            logger.exception("AI ask stream failed by=%s", current_user.email)
            yield f"event: error\ndata: {str(exc)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
