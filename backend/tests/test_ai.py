import json

import pytest
from httpx import AsyncClient

from ai.burnout import assess_burnout
from ai.retention import assess_retention
from ai.schemas import BurnoutRequest, RetentionRequest
from core.security import create_access_token
from main import app
from models.user import UserInDB, UserRole
from api import deps
from ai import groq_client


class FakeMessage:
    def __init__(self, content: str):
        self.content = content


class FakeChoice:
    def __init__(self, content: str):
        self.message = FakeMessage(content)


class FakeResponse:
    def __init__(self, content: str):
        self.choices = [FakeChoice(content)]


def make_token(email: str, role: UserRole) -> str:
    return create_access_token({"sub": email, "role": role.value})


def make_user(email: str, role: UserRole) -> UserInDB:
    return UserInDB(
        email=email,
        full_name="Test User",
        role=role,
        disabled=False,
        hashed_password="hashed",
    )


@pytest.mark.anyio
async def test_sentiment_endpoint_returns_shape(monkeypatch: pytest.MonkeyPatch):
    async def fake_groq_chat(*_args, **_kwargs):
        payload = json.dumps(
            {
                "score": 0.3,
                "label": "neutral",
                "summary": "Balanced tone.",
                "confidence": 0.7,
            }
        )
        return FakeResponse(payload)

    def fake_get_user_by_email(email: str):
        return make_user(email, UserRole.MANAGER)

    monkeypatch.setattr(groq_client, "groq_chat", fake_groq_chat)
    monkeypatch.setattr(deps, "get_user_by_email", fake_get_user_by_email)

    token = make_token("manager@company.com", UserRole.MANAGER)

    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/ai/sentiment",
            json={"employee_id": "emp-1", "texts": ["Great week!"]},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert set(data.keys()) >= {"score", "label", "summary", "confidence"}


@pytest.mark.anyio
async def test_burnout_rule_score_without_llm(monkeypatch: pytest.MonkeyPatch):
    async def fake_groq_chat(*_args, **_kwargs):
        raise RuntimeError("LLM unavailable")

    monkeypatch.setattr(groq_client, "groq_chat", fake_groq_chat)

    request = BurnoutRequest(
        employee_id="emp-2",
        overtime_hours=60,
        pto_days_unused=12,
        sentiment_score=-0.5,
        meeting_load_hours=40,
        tenure_months=3,
    )

    result = await assess_burnout(request)

    assert result.risk_score == 1.0
    assert result.risk_level == "critical"


@pytest.mark.anyio
async def test_retention_prefilter_forces_high_risk(monkeypatch: pytest.MonkeyPatch):
    async def fake_groq_chat(*_args, **_kwargs):
        payload = json.dumps(
            {
                "key_reasons": ["High workload", "Recent burnout"],
                "retention_actions": ["Offer time off", "Discuss workload"],
            }
        )
        return FakeResponse(payload)

    monkeypatch.setattr(groq_client, "groq_chat", fake_groq_chat)

    request = RetentionRequest(
        employee_id="emp-3",
        burnout_risk_score=0.7,
        performance_band="solid",
        tenure_months=6,
        salary_band="mid",
        last_promotion_months_ago=14,
        sentiment_score=-0.1,
    )

    result = await assess_retention(request)

    assert result.retention_risk == "high"
    assert result.flight_risk_score == 0.9
    assert result.key_reasons == ["High workload", "Recent burnout"]


@pytest.mark.anyio
async def test_ai_endpoints_forbid_employee_role(monkeypatch: pytest.MonkeyPatch):
    def fake_get_user_by_email(email: str):
        return make_user(email, UserRole.EMPLOYEE)

    monkeypatch.setattr(deps, "get_user_by_email", fake_get_user_by_email)

    token = make_token("employee@company.com", UserRole.EMPLOYEE)
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(app=app, base_url="http://test") as client:
        sentiment = await client.post(
            "/api/ai/sentiment",
            json={"employee_id": "emp-1", "texts": ["hi"]},
            headers=headers,
        )
        burnout = await client.post(
            "/api/ai/burnout-risk",
            json={
                "employee_id": "emp-1",
                "overtime_hours": 0,
                "pto_days_unused": 0,
                "sentiment_score": 0,
                "meeting_load_hours": 0,
                "tenure_months": 1,
            },
            headers=headers,
        )
        performance = await client.post(
            "/api/ai/performance-prediction",
            json={
                "employee_id": "emp-1",
                "kpi_completion_rate": 0.5,
                "peer_review_score": 0.5,
                "sentiment_score": 0.0,
                "tenure_months": 12,
                "recent_projects_completed": 2,
            },
            headers=headers,
        )
        retention = await client.post(
            "/api/ai/retention-risk",
            json={
                "employee_id": "emp-1",
                "burnout_risk_score": 0.3,
                "performance_band": "solid",
                "tenure_months": 12,
                "salary_band": "mid",
                "last_promotion_months_ago": 8,
                "sentiment_score": 0.1,
            },
            headers=headers,
        )
        insights = await client.get("/api/ai/insights/emp-1", headers=headers)
        ask = await client.post(
            "/api/ai/ask",
            json={"question": "Hello"},
            headers=headers,
        )

    assert sentiment.status_code == 403
    assert burnout.status_code == 403
    assert performance.status_code == 403
    assert retention.status_code == 403
    assert insights.status_code == 403
    assert ask.status_code == 403
