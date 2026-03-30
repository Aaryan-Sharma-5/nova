"""Pydantic schemas for AI insight APIs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SentimentRequest(BaseModel):
    employee_id: str
    texts: list[str]


class SentimentResult(BaseModel):
    score: float = Field(..., ge=-1.0, le=1.0)
    label: Literal["positive", "neutral", "negative"]
    summary: str
    confidence: float = Field(..., ge=0.0, le=1.0)


class BurnoutRequest(BaseModel):
    employee_id: str
    overtime_hours: float
    pto_days_unused: int
    sentiment_score: float
    meeting_load_hours: float
    tenure_months: int


class BurnoutResult(BaseModel):
    risk_level: Literal["low", "medium", "high", "critical"]
    risk_score: float = Field(..., ge=0.0, le=1.0)
    factors: list[str]
    recommendation: str


class PerformanceRequest(BaseModel):
    employee_id: str
    kpi_completion_rate: float
    peer_review_score: float
    sentiment_score: float
    tenure_months: int
    recent_projects_completed: int


class PerformanceResult(BaseModel):
    predicted_band: Literal["top", "solid", "at-risk"]
    confidence: float = Field(..., ge=0.0, le=1.0)
    narrative: str
    suggested_actions: list[str]


class RetentionRequest(BaseModel):
    employee_id: str
    burnout_risk_score: float
    performance_band: str
    tenure_months: int
    salary_band: str
    last_promotion_months_ago: int
    sentiment_score: float


class RetentionResult(BaseModel):
    retention_risk: Literal["low", "medium", "high"]
    flight_risk_score: float = Field(..., ge=0.0, le=1.0)
    key_reasons: list[str]
    retention_actions: list[str]


class AskNovaRequest(BaseModel):
    question: str
    employee_id: str | None = None
    context_type: Literal["team", "individual", "org"] = "individual"
