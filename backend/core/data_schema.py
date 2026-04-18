"""Canonical employee dataset schema with validation and data quality scoring."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, computed_field, field_validator


def _strip_string(value: Any) -> Any:
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return value


def _normalize_role_family(value: Any) -> Any:
    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized or None
    return value


class EmployeeDataInput(BaseModel):
    """Structured employee telemetry input for burnout and attrition analytics.

    Each parameter captures a known signal related to employee wellbeing, workload pressure,
    manager/team dynamics, or growth trajectory. Together these inputs improve early detection
    of burnout and flight-risk patterns while making model behavior auditable.
    """

    employee_id: str = Field(
        ...,
        min_length=1,
        description="Unique employee identifier used to join telemetry across HR systems and timelines.",
    )
    role_family: Literal["tech", "non_tech", "manager", "hr", "leadership"] | None = Field(
        default=None,
        description="Work context category. Role family changes expected behavior baselines and burnout risk thresholds.",
    )
    lines_of_code_14d: int | None = Field(
        default=None,
        ge=0,
        le=50000,
        description="Code volume over 14 days for technical roles. Extreme spikes can indicate crunch-time overload.",
    )
    pull_requests_merged_14d: int | None = Field(
        default=None,
        ge=0,
        le=500,
        description="Merged PR count over 14 days. Delivery volatility can signal stress and unstable workload.",
    )
    leave_count_90d: int | None = Field(
        default=None,
        ge=0,
        le=90,
        description="Total leave days in the last 90 days. Low leave with high load can indicate recovery deficit.",
    )
    kpi_score: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Normalized KPI performance score. Sharp performance drops can correlate with burnout and disengagement.",
    )
    after_hours_hours_14d: float | None = Field(
        default=None,
        ge=0.0,
        le=300.0,
        description="After-hours work in the last 14 days. Persistent overtime is a strong burnout predictor.",
    )
    meeting_load_hours_weekly: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Weekly meeting load. High meeting burden can reduce deep-work capacity and increase fatigue.",
    )
    sentiment_score: float | None = Field(
        default=None,
        ge=-1.0,
        le=1.0,
        description="Sentiment polarity from feedback channels. Sustained negative tone is a leading attrition signal.",
    )
    engagement_score: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Engagement index from behavioral and feedback signals. Downtrends often precede voluntary exits.",
    )
    manager_relationship_score: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Relationship quality with immediate manager. Poor manager alignment is a common flight-risk driver.",
    )
    team_dynamics_score: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Collaboration and trust signal within the team. Social friction can elevate stress and attrition risk.",
    )
    growth_satisfaction_score: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Perceived growth and support adequacy. Stagnation perception often correlates with exit intent.",
    )
    tenure_months: int | None = Field(
        default=None,
        ge=0,
        le=600,
        description="Tenure in months. Early-tenure and late-tenure cohorts can have different burnout/retention dynamics.",
    )
    absenteeism_days_90d: int | None = Field(
        default=None,
        ge=0,
        le=90,
        description="Absence days in 90 days. Rising unplanned absence can indicate stress, health burden, or disengagement.",
    )

    @field_validator("employee_id")
    @classmethod
    def _normalize_employee_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("employee_id cannot be empty")
        return normalized

    @field_validator("role_family", mode="before")
    @classmethod
    def _normalize_role_family(cls, value: Any) -> Any:
        return _normalize_role_family(value)

    @field_validator(
        "kpi_score",
        "sentiment_score",
        "engagement_score",
        "manager_relationship_score",
        "team_dynamics_score",
        "growth_satisfaction_score",
        mode="before",
    )
    @classmethod
    def _normalize_numeric_values(cls, value: Any) -> Any:
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return None
            try:
                return float(normalized)
            except ValueError:
                return value
        return value

    def model_post_init(self, __context: Any) -> None:
        if self.sentiment_score is not None and -1.0 <= self.sentiment_score <= 1.0:
            self.sentiment_score = round(float(self.sentiment_score), 4)
        if self.manager_relationship_score is not None:
            self.manager_relationship_score = round(float(self.manager_relationship_score), 4)
        if self.team_dynamics_score is not None:
            self.team_dynamics_score = round(float(self.team_dynamics_score), 4)
        if self.growth_satisfaction_score is not None:
            self.growth_satisfaction_score = round(float(self.growth_satisfaction_score), 4)

    def normalized_model_payload(self) -> dict[str, Any]:
        """Return a canonical payload with string values trimmed and numeric fields bounded."""
        payload = self.model_dump()
        payload["employee_id"] = self.employee_id
        payload["role_family"] = self.role_family
        return payload

    @computed_field(return_type=float)
    @property
    def data_quality_score(self) -> float:
        """Percent completeness across predictor fields (excluding identifier)."""
        fields = [
            "role_family",
            "lines_of_code_14d",
            "pull_requests_merged_14d",
            "leave_count_90d",
            "kpi_score",
            "after_hours_hours_14d",
            "meeting_load_hours_weekly",
            "sentiment_score",
            "engagement_score",
            "manager_relationship_score",
            "team_dynamics_score",
            "growth_satisfaction_score",
            "tenure_months",
            "absenteeism_days_90d",
        ]
        present = sum(1 for name in fields if getattr(self, name) is not None)
        return round((present / len(fields)) * 100, 2)


def parameter_definitions() -> list[dict[str, Any]]:
    """Return field definitions for API consumers and UI data-source panels."""
    definitions: list[dict[str, Any]] = []
    for name, field in EmployeeDataInput.model_fields.items():
        if name == "data_quality_score":
            continue

        constraints: dict[str, Any] = {}
        for key in ("ge", "gt", "le", "lt", "min_length", "max_length"):
            value = getattr(field, key, None)
            if value is not None:
                constraints[key] = value

        definitions.append(
            {
                "name": name,
                "required": field.is_required(),
                "description": field.description or "",
                "annotation": str(field.annotation),
                "constraints": constraints,
            }
        )
    return definitions
