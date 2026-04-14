"""Deterministic synthetic org-hierarchy generator.

Produces a stable 100-employee tree:
    - Level 1 (C-Suite):               1 CEO
    - Level 2 (VPs / Directors):       5
    - Level 3 (Managers):             15
    - Level 4 (Individual Contribs):  79

Determinism matters because the rest of the app (drilldowns, org tree
endpoints, anomaly checks) reference employees by stable IDs. The live
Supabase seeding path is a TODO (CLAUDE.md §10 — mock-to-live transition);
for now this module is the single source of truth for the org hierarchy.
"""

from __future__ import annotations

import hashlib
import random
from typing import Dict, List, Optional

DEPARTMENTS = ["Engineering", "Sales", "HR", "Design", "Finance"]

FIRST_NAMES = [
    "Mila", "Ari", "Noah", "Zara", "Rhea", "Dev", "Ivy", "Owen", "Kai", "Leo",
    "Maya", "Nia", "Omar", "Pia", "Ravi", "Sana", "Theo", "Uma", "Vik", "Wren",
    "Xia", "Yara", "Aiden", "Bea", "Cyrus", "Dara", "Eli", "Fay", "Gus", "Hana",
    "Isa", "Jai", "Kian", "Lia", "Mars", "Nell", "Oren", "Pax", "Quinn", "Rio",
    "Sage", "Tara", "Ulla", "Vera", "Wes", "Xena", "Yuri", "Zane", "Aria", "Bodhi",
    "Cleo", "Dax", "Echo", "Finn", "Greta", "Hugo", "Indy", "Jules", "Knox", "Luna",
    "Milo", "Nova", "Otto", "Piper", "Quill", "Rene", "Skye", "Tate", "Uri", "Vale",
    "Wade", "Xan", "Yale", "Zed", "Ada", "Bree", "Cato", "Dena", "Eve", "Fox",
    "Glen", "Hale", "Iris", "Jade", "Kit", "Lane", "Mako", "Nora", "Oak", "Pearl",
    "Quip", "Rex", "Sol", "Tess", "Umi", "Vic", "Will", "Xio", "Yule", "Zara",
]

LAST_NAMES = [
    "Chen", "Wilson", "Garcia", "Lee", "Thomas", "Brown", "Clark", "Scott",
    "Patel", "Kim", "Morales", "Okafor", "Singh", "Nakamura", "Cohen",
]

ROLE_BY_LEVEL_AND_DEPT: Dict[int, Dict[str, str]] = {
    1: {dept: "Chief Executive Officer" for dept in DEPARTMENTS},
    2: {
        "Engineering": "VP Engineering",
        "Sales": "VP Sales",
        "HR": "VP People",
        "Design": "Head of Design",
        "Finance": "CFO",
    },
    3: {
        "Engineering": "Engineering Manager",
        "Sales": "Sales Manager",
        "HR": "HR Manager",
        "Design": "Design Manager",
        "Finance": "Finance Manager",
    },
    4: {
        "Engineering": "Software Engineer",
        "Sales": "Account Executive",
        "HR": "People Partner",
        "Design": "Product Designer",
        "Finance": "Financial Analyst",
    },
}


def _seeded_rng(key: str) -> random.Random:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return random.Random(int(digest[:12], 16))


def _deterministic_uuid(seed: str) -> str:
    """Stable pseudo-UUID string so IDs match across process runs."""
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    return f"{digest[0:8]}-{digest[8:12]}-{digest[12:16]}-{digest[16:20]}-{digest[20:32]}"


def _employee(
    index: int,
    level: int,
    department: str,
    manager_id: Optional[str],
) -> Dict[str, object]:
    rng = _seeded_rng(f"org::{index}")
    first = FIRST_NAMES[index % len(FIRST_NAMES)]
    last = LAST_NAMES[index % len(LAST_NAMES)]
    employee_id = _deterministic_uuid(f"employee::{index}")
    role = ROLE_BY_LEVEL_AND_DEPT[level][department]

    # Score fields match the Employee contract used across the app.
    burnout = round(rng.uniform(0.15, 0.80), 3)
    engagement = round(rng.uniform(0.30, 0.95), 3)
    sentiment = round(rng.uniform(0.25, 0.90), 3)
    attrition = round(rng.uniform(0.10, 0.75), 3)
    tenure_months = rng.randint(4, 84)

    is_at_risk = burnout > 0.6 or attrition > 0.5

    return {
        "id": employee_id,
        "index": index,
        "name": f"{first} {last}",
        "role": role,
        "department": department,
        "org_level": level,
        "manager_id": manager_id,
        "tenure_months": tenure_months,
        "burnout_score": burnout,
        "engagement_score": engagement,
        "sentiment_score": sentiment,
        "attrition_risk": attrition,
        "is_at_risk": is_at_risk,
    }


def generate_org_hierarchy() -> List[Dict[str, object]]:
    """Return a flat list of 100 employees with manager_id references.

    Structure is deterministic: given the same code, the same IDs, names, and
    reporting lines are produced every call.
    """
    employees: List[Dict[str, object]] = []

    # Level 1: CEO
    ceo = _employee(index=0, level=1, department="Engineering", manager_id=None)
    ceo["role"] = "Chief Executive Officer"
    employees.append(ceo)

    # Level 2: 5 VPs, one per department, all reporting to CEO.
    vp_ids: List[str] = []
    for i, dept in enumerate(DEPARTMENTS):
        vp = _employee(index=1 + i, level=2, department=dept, manager_id=ceo["id"])
        employees.append(vp)
        vp_ids.append(vp["id"])

    # Level 3: 15 managers (3 per department), reporting to their VP.
    manager_ids_by_dept: Dict[str, List[str]] = {d: [] for d in DEPARTMENTS}
    for i in range(15):
        dept = DEPARTMENTS[i % len(DEPARTMENTS)]
        vp_index = DEPARTMENTS.index(dept)
        manager = _employee(
            index=6 + i,
            level=3,
            department=dept,
            manager_id=vp_ids[vp_index],
        )
        employees.append(manager)
        manager_ids_by_dept[dept].append(manager["id"])

    # Level 4: 79 ICs distributed round-robin across managers within
    # their department so each manager has ~5–6 reports.
    manager_queue: Dict[str, int] = {d: 0 for d in DEPARTMENTS}
    for i in range(79):
        dept = DEPARTMENTS[i % len(DEPARTMENTS)]
        managers = manager_ids_by_dept[dept]
        assigned_manager = managers[manager_queue[dept] % len(managers)]
        manager_queue[dept] += 1
        ic = _employee(
            index=21 + i,
            level=4,
            department=dept,
            manager_id=assigned_manager,
        )
        employees.append(ic)

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
    """Build a nested tree from an adjacency list.

    If `root_id` is None, the tree is rooted at whoever has manager_id=None.
    """
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
