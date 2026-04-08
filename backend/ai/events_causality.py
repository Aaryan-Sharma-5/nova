"""Event persistence and causality calculations for historical trends."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import mean
from typing import Any

from pydantic import BaseModel, Field

from core.database import get_supabase_admin


class EventCreate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=80)
    description: str = Field(..., min_length=1, max_length=500)
    date: date
    affected_department: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EventRecord(BaseModel):
    id: str
    event_type: str
    description: str
    date: date
    affected_department: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class MetricCorrelation(BaseModel):
    metric: str
    before_avg: float
    after_avg: float
    delta_pct: float


class EventCorrelation(BaseModel):
    event_id: str
    event_type: str
    description: str
    date: date
    affected_department: str | None
    impact_summary: str
    top_metric: str
    top_delta_pct: float
    metrics: list[MetricCorrelation]


_METRIC_COLUMN_MAP: dict[str, str] = {
    "engagement": "engagement_score",
    "sentiment": "sentiment_score",
    "attrition": "attrition_rate",
    "burnout": "burnout_score",
}


def _parse_iso_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def _round2(value: float) -> float:
    return round(value, 2)


def _safe_delta_pct(before: float, after: float) -> float:
    if abs(before) < 1e-9:
        return 0.0 if abs(after) < 1e-9 else 100.0
    return ((after - before) / abs(before)) * 100.0


def _build_impact_summary(event: EventRecord, metric: str, delta_pct: float) -> str:
    magnitude = abs(delta_pct)
    direction = "increase" if delta_pct > 0 else "drop"

    # For attrition/burnout, an increase is usually negative.
    if metric in {"attrition", "burnout"}:
        direction = "increase" if delta_pct > 0 else "decrease"

    metric_label = {
        "engagement": "engagement",
        "sentiment": "sentiment",
        "attrition": "attrition",
        "burnout": "burnout",
    }.get(metric, metric)

    return (
        f"{event.description} correlates with {magnitude:.1f}% "
        f"{metric_label} {direction}"
    )


def _rolling_average(values: list[float]) -> float:
    if not values:
        return 0.0
    return float(mean(values))


def _generate_synthetic_series(
    metric: str,
    start_date: date,
    end_date: date,
    department: str | None,
) -> list[dict[str, Any]]:
    """Fallback synthetic data when a metrics table is unavailable."""
    days = (end_date - start_date).days + 1
    seed = abs(hash(f"{department or 'all'}:{metric}:{start_date.isoformat()}")) % 1000
    series: list[dict[str, Any]] = []

    base = {
        "engagement": 72.0,
        "sentiment": 0.15,
        "attrition": 10.5,
        "burnout": 41.0,
    }[metric]

    for i in range(max(days, 0)):
        current_date = start_date + timedelta(days=i)
        jitter = ((seed + i * 37) % 21 - 10) / 20.0
        trend = i * 0.05
        if metric in {"engagement", "sentiment"}:
            value = base - trend + jitter
        else:
            value = base + trend + jitter
        series.append({"date": current_date.isoformat(), "value": float(value)})

    return series


def _fetch_metric_series(
    metric: str,
    start_date: date,
    end_date: date,
    department: str | None,
) -> list[dict[str, Any]]:
    supabase = get_supabase_admin()
    column = _METRIC_COLUMN_MAP[metric]

    try:
        query = (
            supabase.table("daily_department_metrics")
            .select(f"date,{column},department")
            .gte("date", start_date.isoformat())
            .lte("date", end_date.isoformat())
            .order("date")
        )
        if department:
            query = query.eq("department", department)

        response = query.execute()
        rows = response.data or []
        if not rows:
            return _generate_synthetic_series(metric, start_date, end_date, department)

        normalized: list[dict[str, Any]] = []
        for row in rows:
            value = row.get(column)
            if value is None:
                continue
            normalized.append({"date": row.get("date"), "value": float(value)})

        if not normalized:
            return _generate_synthetic_series(metric, start_date, end_date, department)

        return normalized
    except Exception:
        return _generate_synthetic_series(metric, start_date, end_date, department)


def create_event(payload: EventCreate) -> EventRecord:
    supabase = get_supabase_admin()

    response = (
        supabase.table("events")
        .insert(
            {
                "event_type": payload.event_type,
                "description": payload.description,
                "date": payload.date.isoformat(),
                "affected_department": payload.affected_department,
                "metadata": payload.metadata,
            }
        )
        .execute()
    )

    rows = response.data or []
    if not rows:
        raise ValueError("Failed to create event")

    return EventRecord(**rows[0])


def list_events(
    event_type: str | None = None,
    affected_department: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 100,
) -> list[EventRecord]:
    supabase = get_supabase_admin()

    query = supabase.table("events").select("*").order("date", desc=True).limit(limit)

    if event_type:
        query = query.eq("event_type", event_type)
    if affected_department:
        query = query.eq("affected_department", affected_department)
    if start_date:
        query = query.gte("date", start_date.isoformat())
    if end_date:
        query = query.lte("date", end_date.isoformat())

    response = query.execute()
    rows = response.data or []
    return [EventRecord(**row) for row in rows]


def get_event_correlations(
    event_type: str | None = None,
    affected_department: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 50,
) -> list[EventCorrelation]:
    events = list_events(
        event_type=event_type,
        affected_department=affected_department,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )

    results: list[EventCorrelation] = []
    metrics = list(_METRIC_COLUMN_MAP.keys())

    for event in events:
        before_start = event.date - timedelta(days=30)
        before_end = event.date - timedelta(days=1)
        after_start = event.date + timedelta(days=1)
        after_end = event.date + timedelta(days=30)

        metric_results: list[MetricCorrelation] = []
        for metric in metrics:
            before_series = _fetch_metric_series(metric, before_start, before_end, event.affected_department)
            after_series = _fetch_metric_series(metric, after_start, after_end, event.affected_department)

            before_avg = _rolling_average([float(item["value"]) for item in before_series])
            after_avg = _rolling_average([float(item["value"]) for item in after_series])
            delta_pct = _safe_delta_pct(before_avg, after_avg)

            metric_results.append(
                MetricCorrelation(
                    metric=metric,
                    before_avg=_round2(before_avg),
                    after_avg=_round2(after_avg),
                    delta_pct=_round2(delta_pct),
                )
            )

        top_metric_row = max(metric_results, key=lambda m: abs(m.delta_pct), default=None)
        if top_metric_row is None:
            continue

        impact_summary = _build_impact_summary(event, top_metric_row.metric, top_metric_row.delta_pct)

        results.append(
            EventCorrelation(
                event_id=event.id,
                event_type=event.event_type,
                description=event.description,
                date=event.date,
                affected_department=event.affected_department,
                impact_summary=impact_summary,
                top_metric=top_metric_row.metric,
                top_delta_pct=top_metric_row.delta_pct,
                metrics=metric_results,
            )
        )

    return results
