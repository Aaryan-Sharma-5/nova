"""Anomaly detection module for behavioral shifts and outliers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Literal

import numpy as np


class AnomalyType(str, Enum):
    """Types of detected anomalies."""
    SENTIMENT_CRASH = "sentiment_crash"
    ENGAGEMENT_DROP = "engagement_drop"
    PERFORMANCE_DECLINE = "performance_decline"
    BEHAVIORAL_ISOLATION = "behavioral_isolation"
    MEETING_SPIKE = "meeting_spike"
    AFTER_HOURS_SURGE = "after_hours_surge"
    ABSENCE_PATTERN = "absence_pattern"
    COMMUNICATION_DROP = "communication_drop"


@dataclass
class AnomalyResult:
    """Result of anomaly detection."""
    detected: bool
    anomaly_type: AnomalyType | None
    severity: Literal["low", "medium", "high", "critical"]
    z_score: float
    threshold_z: float = 2.0
    description: str = ""


@dataclass
class CompositeAnomalyResult:
    """Composite anomaly result with temporal weighting metadata."""

    detected: bool
    reason: str
    severity: Literal["low", "medium", "high", "critical"]
    temporal_weight_applied: bool
    recency_boost_reason: str
    score_today: float
    score_7d_ago: float
    weighted_contributions: dict[str, float]
    changed_signals: list[str]


def _calculate_z_score(value: float, historical_mean: float, std_dev: float) -> float:
    """Calculate z-score for a value."""
    if std_dev == 0:
        return 0.0
    return (value - historical_mean) / std_dev


def _is_anomaly(z_score: float, threshold: float = 2.0) -> bool:
    """Check if z-score indicates anomaly (threshold default: 2.0 sigma = 95% confidence)."""
    return abs(z_score) >= threshold


def _get_severity(z_score: float) -> Literal["low", "medium", "high", "critical"]:
    """Map z-score to severity level."""
    abs_z = abs(z_score)
    if abs_z >= 3.5:
        return "critical"
    if abs_z >= 3.0:
        return "high"
    if abs_z >= 2.5:
        return "medium"
    return "low"


def _severity_score(level: Literal["low", "medium", "high", "critical"]) -> float:
    mapping = {
        "low": 0.25,
        "medium": 0.5,
        "high": 0.75,
        "critical": 1.0,
    }
    return mapping[level]


def _days_ago_from_iso(value: str | None) -> int:
    if not value:
        return 14
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        return max((now - dt).days, 0)
    except Exception:
        return 14


def _recency_multiplier(days_ago: int) -> float:
    if days_ago <= 7:
        return 2.0
    if days_ago <= 30:
        return 1.0
    return 0.5


def _time_risk_from_days(days_ago: int) -> float:
    if days_ago <= 7:
        return 1.0
    if days_ago <= 30:
        return 0.6
    return 0.3


def _score_to_severity(score: float) -> Literal["low", "medium", "high", "critical"]:
    if score <= 0.25:
        return "low"
    if score <= 0.5:
        return "medium"
    if score <= 0.75:
        return "high"
    return "critical"


def detect_sentiment_crash(
    current_sentiment: float,
    historical_sentiments: list[float],
    threshold_z: float = 2.5,
) -> AnomalyResult:
    """Detect sudden sentiment crash (negative sentiment shift)."""
    if not historical_sentiments:
        return AnomalyResult(
            detected=False,
            anomaly_type=None,
            severity="low",
            z_score=0.0,
            threshold_z=threshold_z,
        )

    mean = float(np.mean(historical_sentiments))
    std_dev = float(np.std(historical_sentiments)) if len(historical_sentiments) > 1 else 0.1

    z_score = _calculate_z_score(current_sentiment, mean, std_dev)
    detected = _is_anomaly(z_score, threshold_z) and current_sentiment < mean

    return AnomalyResult(
        detected=detected,
        anomaly_type=AnomalyType.SENTIMENT_CRASH if detected else None,
        severity=_get_severity(z_score) if detected else "low",
        z_score=z_score,
        threshold_z=threshold_z,
        description=f"Sentiment dropped significantly: {current_sentiment:.2f} (mean: {mean:.2f})"
        if detected
        else "",
    )


def detect_engagement_drop(
    current_engagement: float,
    historical_engagement: list[float],
    threshold_z: float = 2.0,
) -> AnomalyResult:
    """Detect sudden engagement drop."""
    if not historical_engagement:
        return AnomalyResult(
            detected=False,
            anomaly_type=None,
            severity="low",
            z_score=0.0,
            threshold_z=threshold_z,
        )

    mean = float(np.mean(historical_engagement))
    std_dev = (
        float(np.std(historical_engagement)) if len(historical_engagement) > 1 else 0.1
    )

    z_score = _calculate_z_score(current_engagement, mean, std_dev)
    detected = _is_anomaly(z_score, threshold_z) and current_engagement < mean

    return AnomalyResult(
        detected=detected,
        anomaly_type=AnomalyType.ENGAGEMENT_DROP if detected else None,
        severity=_get_severity(z_score) if detected else "low",
        z_score=z_score,
        threshold_z=threshold_z,
        description=f"Engagement dropped: {current_engagement:.2f} (mean: {mean:.2f})"
        if detected
        else "",
    )


def detect_performance_decline(
    current_performance: float,
    historical_performance: list[float],
    threshold_z: float = 2.0,
) -> AnomalyResult:
    """Detect sudden performance decline (KPI drops)."""
    if not historical_performance:
        return AnomalyResult(
            detected=False,
            anomaly_type=None,
            severity="low",
            z_score=0.0,
            threshold_z=threshold_z,
        )

    mean = float(np.mean(historical_performance))
    std_dev = (
        float(np.std(historical_performance)) if len(historical_performance) > 1 else 0.05
    )

    z_score = _calculate_z_score(current_performance, mean, std_dev)
    detected = _is_anomaly(z_score, threshold_z) and current_performance < mean

    return AnomalyResult(
        detected=detected,
        anomaly_type=AnomalyType.PERFORMANCE_DECLINE if detected else None,
        severity=_get_severity(z_score) if detected else "low",
        z_score=z_score,
        threshold_z=threshold_z,
        description=f"Performance declined: {current_performance:.2f} (mean: {mean:.2f})"
        if detected
        else "",
    )


def detect_after_hours_surge(
    current_after_hours: float,
    historical_after_hours: list[float],
    threshold_z: float = 2.5,
) -> AnomalyResult:
    """Detect sudden increase in after-hours work (burnout signal)."""
    if not historical_after_hours:
        return AnomalyResult(
            detected=False,
            anomaly_type=None,
            severity="low",
            z_score=0.0,
            threshold_z=threshold_z,
        )

    mean = float(np.mean(historical_after_hours))
    std_dev = (
        float(np.std(historical_after_hours)) if len(historical_after_hours) > 1 else 1.0
    )

    z_score = _calculate_z_score(current_after_hours, mean, std_dev)
    detected = _is_anomaly(z_score, threshold_z) and current_after_hours > mean

    return AnomalyResult(
        detected=detected,
        anomaly_type=AnomalyType.AFTER_HOURS_SURGE if detected else None,
        severity=_get_severity(z_score) if detected else "low",
        z_score=z_score,
        threshold_z=threshold_z,
        description=f"After-hours work spiked: {current_after_hours:.1f}h (mean: {mean:.1f}h)"
        if detected
        else "",
    )


def detect_communication_drop(
    current_messages: int,
    historical_messages: list[int],
    threshold_z: float = 2.0,
) -> AnomalyResult:
    """Detect sudden drop in communication (isolation signal)."""
    if not historical_messages:
        return AnomalyResult(
            detected=False,
            anomaly_type=None,
            severity="low",
            z_score=0.0,
            threshold_z=threshold_z,
        )

    mean = float(np.mean(historical_messages))
    std_dev = (
        float(np.std(historical_messages)) if len(historical_messages) > 1 else 5.0
    )

    z_score = _calculate_z_score(float(current_messages), mean, std_dev)
    detected = _is_anomaly(z_score, threshold_z) and current_messages < mean

    return AnomalyResult(
        detected=detected,
        anomaly_type=AnomalyType.COMMUNICATION_DROP if detected else None,
        severity=_get_severity(z_score) if detected else "low",
        z_score=z_score,
        threshold_z=threshold_z,
        description=f"Communication dropped: {current_messages} messages (mean: {mean:.0f})"
        if detected
        else "",
    )


def composite_anomaly_check(
    sentiment_anomaly: AnomalyResult,
    engagement_anomaly: AnomalyResult,
    performance_anomaly: AnomalyResult,
    communication_anomaly: AnomalyResult,
    anomaly_timestamps: dict[str, str] | None = None,
) -> CompositeAnomalyResult:
    """Check anomaly co-occurrence and calculate a temporally weighted composite score.

    Base weighted components:
    - burnout: 35%
    - sentiment: 25%
    - time_at_risk: 20%
    - anomaly: 20%
    """
    anomaly_timestamps = anomaly_timestamps or {}

    signals = {
        "sentiment": sentiment_anomaly,
        "engagement": engagement_anomaly,
        "performance": performance_anomaly,
        "communication": communication_anomaly,
    }

    detected_signals = [name for name, result in signals.items() if result.detected]
    anomalies_count = len(detected_signals)

    if anomalies_count == 0:
        return CompositeAnomalyResult(
            detected=False,
            reason="No significant anomalies detected",
            severity="low",
            temporal_weight_applied=False,
            recency_boost_reason="No anomaly recency boost applied.",
            score_today=0.0,
            score_7d_ago=0.0,
            weighted_contributions={
                "burnout": 0.0,
                "sentiment": 0.0,
                "time_at_risk": 0.0,
                "anomaly": 0.0,
            },
            changed_signals=[],
        )

    days_by_signal: dict[str, int] = {
        name: _days_ago_from_iso(anomaly_timestamps.get(name)) for name in signals
    }

    multipliers_today: dict[str, float] = {
        name: _recency_multiplier(days_by_signal[name]) for name in signals
    }
    multipliers_7d_ago: dict[str, float] = {
        name: _recency_multiplier(days_by_signal[name] + 7) for name in signals
    }

    temporal_weight_applied = any(
        signals[name].detected and multipliers_today[name] != 1.0 for name in signals
    )
    boosted = [
        f"{name} ({days_by_signal[name]}d ago, x{multipliers_today[name]:.1f})"
        for name in detected_signals
        if multipliers_today[name] > 1.0
    ]
    if boosted:
        recency_boost_reason = "Recency boost applied to anomalies: " + ", ".join(boosted)
    else:
        recency_boost_reason = "No recent anomalies within 7 days; standard weighting applied."

    signal_intensity_today: dict[str, float] = {}
    signal_intensity_7d_ago: dict[str, float] = {}
    for name, result in signals.items():
        if not result.detected:
            signal_intensity_today[name] = 0.0
            signal_intensity_7d_ago[name] = 0.0
            continue
        base = _severity_score(result.severity)
        signal_intensity_today[name] = min(1.0, base * multipliers_today[name])
        signal_intensity_7d_ago[name] = min(1.0, base * multipliers_7d_ago[name])

    burnout_signal_today = float(
        np.mean(
            [
                signal_intensity_today["engagement"],
                signal_intensity_today["performance"],
                signal_intensity_today["communication"],
            ]
        )
    )
    burnout_signal_7d = float(
        np.mean(
            [
                signal_intensity_7d_ago["engagement"],
                signal_intensity_7d_ago["performance"],
                signal_intensity_7d_ago["communication"],
            ]
        )
    )

    sentiment_signal_today = signal_intensity_today["sentiment"]
    sentiment_signal_7d = signal_intensity_7d_ago["sentiment"]

    time_at_risk_today = float(
        np.mean([_time_risk_from_days(days_by_signal[name]) for name in detected_signals])
    )
    time_at_risk_7d = float(
        np.mean([_time_risk_from_days(days_by_signal[name] + 7) for name in detected_signals])
    )

    anomaly_signal_today = min(
        1.0,
        float(sum(multipliers_today[name] for name in detected_signals)) / 3.0,
    )
    anomaly_signal_7d = min(
        1.0,
        float(sum(multipliers_7d_ago[name] for name in detected_signals)) / 3.0,
    )

    contributions_today = {
        "burnout": 0.35 * burnout_signal_today,
        "sentiment": 0.25 * sentiment_signal_today,
        "time_at_risk": 0.20 * time_at_risk_today,
        "anomaly": 0.20 * anomaly_signal_today,
    }
    contributions_7d = {
        "burnout": 0.35 * burnout_signal_7d,
        "sentiment": 0.25 * sentiment_signal_7d,
        "time_at_risk": 0.20 * time_at_risk_7d,
        "anomaly": 0.20 * anomaly_signal_7d,
    }

    score_today = min(1.0, sum(contributions_today.values()))
    score_7d_ago = min(1.0, sum(contributions_7d.values()))
    severity = _score_to_severity(score_today)

    changed_signals: list[str] = []
    for name in detected_signals:
        if multipliers_today[name] > multipliers_7d_ago[name]:
            changed_signals.append(f"{name} anomaly gained recency weight")
        elif multipliers_today[name] < multipliers_7d_ago[name]:
            changed_signals.append(f"{name} anomaly lost recency weight")

    if not changed_signals:
        changed_signals.append("No major recency-based signal changes in the last 7 days")

    if anomalies_count >= 3:
        reason = "Multiple critical anomalies detected across sentiment, engagement, performance, and communication"
    elif anomalies_count == 2:
        reason = f"Significant anomalies in: {', '.join(detected_signals)}"
    else:
        reason = "Single anomaly detected, monitor closely"

    return CompositeAnomalyResult(
        detected=True,
        reason=reason,
        severity=severity,
        temporal_weight_applied=temporal_weight_applied,
        recency_boost_reason=recency_boost_reason,
        score_today=round(score_today, 4),
        score_7d_ago=round(score_7d_ago, 4),
        weighted_contributions={
            key: round(value * 100.0, 2) for key, value in contributions_today.items()
        },
        changed_signals=changed_signals,
    )
