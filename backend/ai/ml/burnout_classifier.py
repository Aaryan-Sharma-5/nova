"""Random Forest based burnout classifier with feature importance extraction."""

from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Any

import numpy as np

# Note: In production, use sklearn which provides better serialization and training
# This is a simplified interface for feature engineering


FEATURE_DIRECTION: dict[str, int] = {
    "overtime_hours_normalized": 1,
    "pto_days_unused_normalized": 1,
    "meeting_load_normalized": 1,
    "sentiment_score_normalized": -1,
    "tenure_months_normalized": -1,
    "performance_score": -1,
    "days_since_promotion_normalized": 1,
    "after_hours_ratio": 1,
    "communication_drop_indicator": 1,
    "engagement_score": -1,
}


FEATURE_LABELS: dict[str, str] = {
    "overtime_hours_normalized": "Overtime load",
    "pto_days_unused_normalized": "Unused PTO",
    "meeting_load_normalized": "Meeting load",
    "sentiment_score_normalized": "Sentiment quality",
    "tenure_months_normalized": "Tenure stability",
    "performance_score": "Performance trend",
    "days_since_promotion_normalized": "Promotion gap",
    "after_hours_ratio": "After-hours work",
    "communication_drop_indicator": "Communication drop",
    "engagement_score": "Engagement level",
}


DEFAULT_FEATURE_IMPORTANCE: dict[str, float] = {
    "overtime_hours_normalized": 0.15,
    "pto_days_unused_normalized": 0.10,
    "meeting_load_normalized": 0.11,
    "sentiment_score_normalized": 0.12,
    "tenure_months_normalized": 0.06,
    "performance_score": 0.10,
    "days_since_promotion_normalized": 0.08,
    "after_hours_ratio": 0.12,
    "communication_drop_indicator": 0.08,
    "engagement_score": 0.08,
}


CALIBRATION_BUCKETS = (0.2, 0.4, 0.6, 0.8, 1.0)


class MockRandomForestClassifier:
    """Mock Random Forest classifier for demo/testing.
    Replace with actual sklearn.ensemble.RandomForestClassifier in production."""

    def __init__(self, n_estimators: int = 100, random_state: int = 42):
        self.n_estimators = n_estimators
        self.random_state = random_state
        self.is_trained = False
        self.feature_importances_: dict[str, float] = {}

    def fit(self, X: np.ndarray, y: np.ndarray, feature_names: list[str]) -> MockRandomForestClassifier:
        """Fit the model (simplified for demo)."""
        self.feature_names = feature_names
        self.is_trained = True

        # Simulate feature importance based on variance
        importances = []
        for col_idx in range(X.shape[1]):
            col_data = X[:, col_idx]
            importance = float(np.std(col_data)) / (np.mean(np.abs(col_data)) + 1e-6)
            importances.append(importance)

        # Normalize
        total = sum(importances)
        self.feature_importances_ = {
            name: imp / total for name, imp in zip(feature_names, importances)
        }

        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Make predictions (simplified for demo)."""
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")

        # Simple weighted score for demo
        predictions = []
        for row in X:
            score = np.mean(row)
            predictions.append(1 if score > 0.5 else 0)
        return np.array(predictions)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Predict probabilities."""
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")

        predictions = []
        for row in X:
            score = float(np.mean(row))
            # Clamp to [0, 1]
            prob_burnout = min(max(score, 0.0), 1.0)
            predictions.append([1 - prob_burnout, prob_burnout])
        return np.array(predictions)


class BurnoutClassifier:
    """Burnout risk classifier using Random Forest."""

    def __init__(self, model_path: str | None = None):
        """Initialize classifier, optionally loading from file."""
        self.model = MockRandomForestClassifier()
        self.scaler_params: dict[str, tuple[float, float]] = {}  # mean, std
        self.feature_names: list[str] = []
        self.model_path = model_path
        self.calibration_report: dict[str, Any] = {}

        if model_path and Path(model_path).exists():
            self.load(model_path)

    def fit(
        self,
        X: np.ndarray,
        y: np.ndarray,
        feature_names: list[str],
    ) -> BurnoutClassifier:
        """Train the model on burnout data."""
        if len(feature_names) == 0:
            raise ValueError("feature_names must not be empty")
        if X.shape[0] != len(y):
            raise ValueError("X and y must contain the same number of rows")
        if X.shape[1] != len(feature_names):
            raise ValueError("feature_names length must match X columns")
        if not np.isin(y, [0, 1]).all():
            raise ValueError("y must contain binary labels 0 or 1")

        self.feature_names = feature_names

        # Compute scaling parameters for later normalization
        self.scaler_params = {
            name: (float(np.mean(X[:, i])), float(np.std(X[:, i])))
            for i, name in enumerate(feature_names)
        }

        # Normalize features
        X_normalized = self._normalize(X)

        # Train model
        self.model.fit(X_normalized, y, feature_names)
        self.calibration_report = self._build_calibration_report(X_normalized, y)

        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Predict burnout probability for samples."""
        X_normalized = self._normalize(X)
        return self.model.predict_proba(X_normalized)

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Predict burnout class (0: no burnout, 1: burnout risk)."""
        X_normalized = self._normalize(X)
        return self.model.predict(X_normalized)

    def get_feature_importance(self) -> dict[str, float]:
        """Get feature importance scores."""
        if not self.model.is_trained:
            raise ValueError("Model must be trained first")
        return self.model.feature_importances_

    def _normalize(self, X: np.ndarray) -> np.ndarray:
        """Normalize features using stored parameters."""
        X_norm = X.copy()
        for i, name in enumerate(self.feature_names):
            if name in self.scaler_params:
                mean, std = self.scaler_params[name]
                if std > 0:
                    X_norm[:, i] = (X[:, i] - mean) / std
        return X_norm

    def save(self, path: str) -> None:
        """Save model to disk."""
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        data = {
            "feature_names": self.feature_names,
            "scaler_params": self.scaler_params,
            "importances": self.model.feature_importances_,
            "calibration_report": self.calibration_report,
        }
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    def load(self, path: str) -> None:
        """Load model from disk."""
        with open(path) as f:
            data = json.load(f)
        self.feature_names = data["feature_names"]
        self.scaler_params = data["scaler_params"]
        self.model.feature_importances_ = data["importances"]
        self.calibration_report = data.get("calibration_report", {})
        self.model.is_trained = True

    def get_training_quality_report(self) -> dict[str, Any]:
        """Return the most recent calibration and label-quality summary."""
        return dict(self.calibration_report)

    def _build_calibration_report(self, X: np.ndarray, y: np.ndarray) -> dict[str, Any]:
        predictions = self.model.predict_proba(X)[:, 1]
        predicted_labels = (predictions >= 0.5).astype(int)
        y_int = y.astype(int)

        accuracy = float(np.mean(predicted_labels == y_int)) if len(y_int) else 0.0
        base_rate = float(np.mean(y_int)) if len(y_int) else 0.0
        predicted_rate = float(np.mean(predictions)) if len(predictions) else 0.0

        buckets: list[dict[str, Any]] = []
        lower = 0.0
        for upper in CALIBRATION_BUCKETS:
            mask = (predictions > lower) & (predictions <= upper)
            count = int(mask.sum())
            if count:
                bucket_labels = y_int[mask]
                bucket_predictions = predictions[mask]
                buckets.append(
                    {
                        "range": [round(lower, 2), round(upper, 2)],
                        "count": count,
                        "mean_prediction": round(float(bucket_predictions.mean()), 4),
                        "observed_rate": round(float(bucket_labels.mean()), 4),
                    }
                )
            lower = upper

        return {
            "sample_count": int(len(y_int)),
            "positive_rate": round(base_rate, 4),
            "predicted_positive_rate": round(predicted_rate, 4),
            "training_accuracy": round(accuracy, 4),
            "bucket_summary": buckets,
        }


def create_burnout_features(employee_data: dict[str, Any]) -> tuple[np.ndarray, list[str]]:
    """Extract and normalize burnout features from employee data.
    
    Feature engineering: Creates 10 key features for burnout prediction.
    """
    features = []
    feature_names = []

    # 1. Overtime hours (normalized to 0-1 scale, typical: 0-70 hours/month)
    overtime = min(max(float(employee_data.get("overtime_hours", 0.0)), 0.0) / 70.0, 1.0)
    features.append(overtime)
    feature_names.append("overtime_hours_normalized")

    # 2. Unused PTO days (normalized, typical: 0-25 days/year)
    pto_unused = min(max(float(employee_data.get("pto_days_unused", 0.0)), 0.0) / 25.0, 1.0)
    features.append(pto_unused)
    feature_names.append("pto_days_unused_normalized")

    # 3. Meeting load hours (normalized to 0-1, typical: 0-40 hours/week → /40)
    meeting_load = min(max(float(employee_data.get("meeting_load_hours", 0.0)), 0.0) / 40.0, 1.0)
    features.append(meeting_load)
    feature_names.append("meeting_load_normalized")

    # 4. Sentiment score (-1 to 1 → 0 to 1)
    sentiment = (max(min(float(employee_data.get("sentiment_score", 0.0)), 1.0), -1.0) + 1.0) / 2.0
    features.append(max(min(sentiment, 1.0), 0.0))
    feature_names.append("sentiment_score_normalized")

    # 5. Tenure months (normalized, typical: 0-360 months)
    tenure = min(max(float(employee_data.get("tenure_months", 0.0)), 0.0) / 360.0, 1.0)
    features.append(tenure)
    feature_names.append("tenure_months_normalized")

    # 6. Performance score (if available, 0-1)
    performance = float(employee_data.get("performance_score", 0.5))
    features.append(max(min(performance, 1.0), 0.0))
    feature_names.append("performance_score")

    # 7. Days since last promotion (normalized, typical: 0-1825 days / 1825)
    days_since_promo = min(max(float(employee_data.get("days_since_promotion", 0.0)), 0.0) / 1825.0, 1.0)
    features.append(days_since_promo)
    feature_names.append("days_since_promotion_normalized")

    # 8. After-hours email ratio (0-1, how much work happens outside 9-5)
    after_hours_ratio = float(employee_data.get("after_hours_ratio", 0.0))
    features.append(max(min(after_hours_ratio, 1.0), 0.0))
    feature_names.append("after_hours_ratio")

    # 9. Communication frequency drop (0-1, where 1 = significant drop)
    comm_drop = float(employee_data.get("communication_drop_indicator", 0.0))
    features.append(max(min(comm_drop, 1.0), 0.0))
    feature_names.append("communication_drop_indicator")

    # 10. Engagement score (0-1, inverse relationship with burnout)
    engagement = float(employee_data.get("engagement_score", 0.5))
    features.append(max(min(engagement, 1.0), 0.0))
    feature_names.append("engagement_score")

    return np.array([features]), feature_names


def get_feature_contributions(
    employee_data: dict[str, Any],
    importances: dict[str, float] | None = None,
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """Compute signed feature contributions for explainability.

    Positive contribution increases burnout risk.
    Negative contribution reduces burnout risk.
    """
    feature_matrix, feature_names = create_burnout_features(employee_data)
    values = feature_matrix[0]
    importance_map = importances or DEFAULT_FEATURE_IMPORTANCE

    contributions: list[dict[str, Any]] = []
    for idx, feature_name in enumerate(feature_names):
        value = float(values[idx])
        weight = float(importance_map.get(feature_name, 0.0))
        direction = FEATURE_DIRECTION.get(feature_name, 1)

        # For protective features, high value should reduce risk.
        if direction < 0:
            signed_raw = -(weight * value)
        else:
            signed_raw = weight * value

        contribution_pct = round(signed_raw * 100.0, 2)
        plain_label = FEATURE_LABELS.get(feature_name, feature_name.replace("_", " ").title())
        contribution_word = "increases" if contribution_pct >= 0 else "reduces"

        contributions.append(
            {
                "feature": feature_name,
                "label": plain_label,
                "value": round(value, 4),
                "weight": round(weight, 4),
                "contribution": contribution_pct,
                "direction": "positive" if contribution_pct >= 0 else "negative",
                "explanation": f"{plain_label}: {contribution_pct:+.1f}% risk ({contribution_word} burnout risk)",
            }
        )

    contributions.sort(key=lambda item: abs(float(item["contribution"])), reverse=True)
    return contributions[:top_k]
