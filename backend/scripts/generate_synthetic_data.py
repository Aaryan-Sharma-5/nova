"""Deterministic org-hierarchy helpers backed by the canonical employee directory.

This module intentionally reuses `core.employee_directory` so every surface
(Employees pages, profile APIs, and Org Tree) resolves to the same Indian-only
roster and NOVA IDs.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
import random
import sys
from typing import Dict, List, Optional

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from core.employee_directory import get_employee_directory


def _seeded_rng(key: str) -> random.Random:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return random.Random(int(digest[:12], 16))


def _score_fields(employee_id: str) -> Dict[str, object]:
    rng = _seeded_rng(f"org::{employee_id}")

    burnout = round(rng.uniform(0.15, 0.80), 3)
    engagement = round(rng.uniform(0.30, 0.95), 3)
    sentiment = round(rng.uniform(0.25, 0.90), 3)
    attrition = round(rng.uniform(0.10, 0.75), 3)
    tenure_months = rng.randint(4, 84)

    return {
        "tenure_months": tenure_months,
        "burnout_score": burnout,
        "engagement_score": engagement,
        "sentiment_score": sentiment,
        "attrition_risk": attrition,
        "is_at_risk": burnout > 0.6 or attrition > 0.5,
    }


def generate_org_hierarchy() -> List[Dict[str, object]]:
    """Return a flat list of employees with stable manager references."""
    employees: List[Dict[str, object]] = []

    for index, record in enumerate(get_employee_directory()):
        employee_id = str(record["employee_id"])
        manager_id = str(record.get("reports_to") or "") or None
        role = str(record.get("title") or record.get("role") or "Employee")

        employee: Dict[str, object] = {
            "id": employee_id,
            "index": index,
            "name": str(record["name"]),
            "role": role,
            "department": str(record["department"]),
            "org_level": int(record["org_level"]),
            "manager_id": manager_id,
        }
        employee.update(_score_fields(employee_id))
        employees.append(employee)

    return employees


def find_employee(employees: List[Dict[str, object]], employee_id: str) -> Optional[Dict[str, object]]:
    for emp in employees:
        if emp["id"] == employee_id:
            return emp
    return None


def build_tree(
    employees: List[Dict[str, object]],
    root_id: Optional[str] = None,
) -> Optional[Dict[str, object]]:
    """Build a nested tree from an adjacency list."""
    by_manager: Dict[Optional[str], List[Dict[str, object]]] = {}
    for emp in employees:
        by_manager.setdefault(emp["manager_id"], []).append(emp)

    if root_id is None:
        roots = by_manager.get(None, [])
        if not roots:
            return None
        root = roots[0]
    else:
        root = find_employee(employees, root_id)
        if root is None:
            return None

    def _expand(node: Dict[str, object]) -> Dict[str, object]:
        children = by_manager.get(node["id"], [])
        return {
            "id": node["id"],
            "name": node["name"],
            "role": node["role"],
            "department": node["department"],
            "org_level": node["org_level"],
            "tenure_months": node["tenure_months"],
            "burnout_score": node["burnout_score"],
            "engagement_score": node["engagement_score"],
            "sentiment_score": node["sentiment_score"],
            "attrition_risk": node["attrition_risk"],
            "is_at_risk": node["is_at_risk"],
            "children": [_expand(child) for child in children],
        }

    return _expand(root)


def compute_stats(employees: List[Dict[str, object]]) -> Dict[str, object]:
    total_levels = max(int(emp["org_level"]) for emp in employees)
    direct_report_counts: Dict[str, int] = {}
    for emp in employees:
        mgr = emp["manager_id"]
        if mgr:
            direct_report_counts[mgr] = direct_report_counts.get(mgr, 0) + 1

    managers = [emp for emp in employees if direct_report_counts.get(emp["id"], 0) > 0]
    managers_count = len(managers)
    ic_count = sum(1 for emp in employees if emp["org_level"] == 4)
    spans = [direct_report_counts[m["id"]] for m in managers] or [0]
    avg_span = sum(spans) / len(spans) if spans else 0.0

    return {
        "total_levels": total_levels,
        "avg_span_of_control": round(avg_span, 2),
        "deepest_chain": total_levels,
        "managers_count": managers_count,
        "ic_count": ic_count,
    }


if __name__ == "__main__":
    import json

    roster = generate_org_hierarchy()
    tree = build_tree(roster)
    stats = compute_stats(roster)
    print(json.dumps({"stats": stats, "root": tree["name"] if tree else None}, indent=2))
