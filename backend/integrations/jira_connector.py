from __future__ import annotations

import hashlib
import random

from pydantic import BaseModel, Field


class JiraMetrics(BaseModel):
    employee_id: str
    sprint_velocity: float = Field(..., ge=0)
    tickets_closed_7d: int = Field(..., ge=0)
    tickets_overdue: int = Field(..., ge=0)
    avg_ticket_resolution_hours: float = Field(..., ge=0)
    blocked_tickets_count: int = Field(..., ge=0)
    last_commit_days_ago: int = Field(..., ge=0)
    pr_review_participation_rate: float = Field(..., ge=0, le=1)


class JiraConnectionConfig(BaseModel):
    jira_base_url: str
    api_token: str
    project_keys: list[str]
    sync_frequency_hours: int = Field(default=24, ge=1, le=168)


def _seed_from_employee(employee_id: str) -> int:
    digest = hashlib.sha256(employee_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def fetch_jira_metrics(employee_id: str) -> JiraMetrics:
    # TODO: Replace with real Jira REST API v3 call using org's Jira API token — endpoint: /rest/api/3/issue/search
    random.seed(_seed_from_employee(employee_id))
    return JiraMetrics(
      employee_id=employee_id,
      sprint_velocity=round(random.uniform(12, 34), 1),
      tickets_closed_7d=random.randint(2, 22),
      tickets_overdue=random.randint(0, 6),
      avg_ticket_resolution_hours=round(random.uniform(6, 72), 1),
      blocked_tickets_count=random.randint(0, 5),
      last_commit_days_ago=random.randint(0, 9),
      pr_review_participation_rate=round(random.uniform(0.2, 0.98), 2),
    )
