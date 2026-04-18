import json

import numpy as np
import pytest
from httpx import AsyncClient

from ai.burnout import assess_burnout
from ai.ml.burnout_classifier import BurnoutClassifier
from ai.retention import assess_retention
from ai.schemas import BurnoutRequest, RetentionRequest
from core.data_schema import EmployeeDataInput
from core.security import create_access_token
from main import app
from models.user import UserInDB, UserRole
from api import deps
from api.routes import integrations as integrations_api
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
                "summary": "Tone appears balanced with mild caution. No critical distress language appears in recent entries.",
                "key_signals": ["Stable tone", "Low escalation language", "Mixed positive and neutral phrases"],
                "recommended_action": "Continue weekly check-ins and monitor sentiment drift.",
                "confidence": "medium",
                "urgency": "monitor",
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
    assert set(data.keys()) >= {"score", "label", "summary", "confidence", "structured_insight"}


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


def test_employee_data_input_normalizes_boundary_values():
    payload = EmployeeDataInput(
        employee_id="  emp-7  ",
        role_family="  TECH  ",
        kpi_score=" 82.5 ",
        sentiment_score=" -0.25 ",
        engagement_score=" 91.0 ",
        manager_relationship_score=" 0.8 ",
        team_dynamics_score=" 0.7 ",
        growth_satisfaction_score=" 0.6 ",
        tenure_months=18,
        absenteeism_days_90d=2,
    )

    normalized = payload.normalized_model_payload()

    assert normalized["employee_id"] == "emp-7"
    assert normalized["role_family"] == "tech"
    assert normalized["kpi_score"] == 82.5
    assert normalized["sentiment_score"] == -0.25
    assert payload.data_quality_score > 0


def test_burnout_classifier_rejects_bad_labels_and_reports_calibration():
    classifier = BurnoutClassifier()
    X = np.array([[0.1, 0.2], [0.8, 0.9], [0.3, 0.4]], dtype=float)
    y = np.array([0, 1, 2], dtype=int)

    with pytest.raises(ValueError, match="binary labels"):
        classifier.fit(X, y, ["load", "sentiment"])

    classifier.fit(
        X=np.array([[0.1, 0.2], [0.8, 0.9], [0.3, 0.4]], dtype=float),
        y=np.array([0, 1, 1], dtype=int),
        feature_names=["load", "sentiment"],
    )

    report = classifier.get_training_quality_report()

    assert report["sample_count"] == 3
    assert report["training_accuracy"] >= 0.0
    assert "bucket_summary" in report


def test_google_calendar_status_helpers_handle_expiry_and_active_tokens(monkeypatch: pytest.MonkeyPatch):
    future = "2099-01-01T00:00:00+00:00"
    past = "2000-01-01T00:00:00+00:00"

    assert integrations_api._is_live_google_calendar_config({"access_token": "abc", "expires_at": future}) is True
    assert integrations_api._is_live_google_calendar_config({"access_token": "abc", "expires_at": past}) is False

    status = integrations_api._google_calendar_status_from_row(
        {
            "is_active": True,
            "last_sync_at": "2026-04-18T00:00:00+00:00",
            "config": {"access_token": "abc", "expires_at": future, "calendar_count": 2, "scope": "calendar.readonly"},
        }
    )

    assert status["connected"] is True
    assert status["calendar_count"] == 2
    assert status["scope"] == "calendar.readonly"


@pytest.mark.anyio
async def test_google_calendar_connect_validates_and_saves(monkeypatch: pytest.MonkeyPatch):
    class FakeGoogleResponse:
        status_code = 200

        def json(self):
            return {"items": [{"id": "primary"}]}

    class FakeInsertResult:
        data = []

        def execute(self):
            return self

    class FakeTable:
        def __init__(self):
            self.saved_row = None

        def insert(self, row):
            self.saved_row = row
            return FakeInsertResult()

    class FakeSupabase:
        def __init__(self):
            self.table_instance = FakeTable()

        def table(self, name: str):
            assert name == "integration_configs"
            return self.table_instance

    fake_supabase = FakeSupabase()
    monkeypatch.setattr(integrations_api.requests, "get", lambda *args, **kwargs: FakeGoogleResponse())
    monkeypatch.setattr(integrations_api, "get_supabase_admin", lambda: fake_supabase)

    user = make_user("hr@company.com", UserRole.HR)
    payload = integrations_api.GoogleCalendarConnectRequest(
        org_id="demo-org",
        access_token="google-access-token",
        expires_in=3600,
        scope="https://www.googleapis.com/auth/calendar.readonly",
        token_type="Bearer",
    )

    result = await integrations_api.connect_google_calendar(payload, current_user=user)

    assert result["integration"] == "google_calendar"
    assert result["calendar_count"] == 1
    assert fake_supabase.table_instance.saved_row["integration_type"] == "google_calendar"
    assert fake_supabase.table_instance.saved_row["config"]["access_token"] == "google-access-token"


@pytest.mark.anyio
async def test_retention_prefilter_forces_high_risk(monkeypatch: pytest.MonkeyPatch):
    async def fake_groq_chat(*_args, **_kwargs):
        payload = json.dumps(
            {
                "summary": "Risk factors indicate possible turnover pressure. Burnout and workload remain the strongest concerns.",
                "key_signals": ["High workload", "Recent burnout", "Early-tenure fragility"],
                "recommended_action": "Offer immediate workload rebalance and a retention-focused 1:1.",
                "confidence": "high",
                "urgency": "immediate",
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
    assert result.key_reasons == ["High workload", "Recent burnout", "Early-tenure fragility"]


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
