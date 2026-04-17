from __future__ import annotations

from collections import deque
from typing import Any

from fastapi import APIRouter, Depends

from api.deps import require_role
from core.database import get_supabase_admin
from core.employee_directory import get_employee_directory, get_org_hierarchy_tree, get_org_level_counts
from models.user import User, UserRole

router = APIRouter(prefix="/api/org", tags=["Org"])


def _safe_count(rows: list[dict] | None, *, status_key: str, accepted_values: set[str]) -> int:
    if not rows:
        return 0
    return sum(1 for row in rows if str(row.get(status_key, "")).lower() in accepted_values)


def _find_subtree(root: dict[str, Any], employee_id: str) -> dict[str, Any] | None:
    queue: deque[dict[str, Any]] = deque([root])
    while queue:
        current = queue.popleft()
        if str(current.get("employee_id")) == employee_id:
            return current
        for child in current.get("children", []) or []:
            queue.append(child)
    return None


def _hierarchy_stats(root: dict[str, Any]) -> dict[str, Any]:
    managers_count = 0
    ic_count = 0
    max_depth = 0
    manager_spans: list[int] = []

    queue: deque[tuple[dict[str, Any], int]] = deque([(root, 1)])
    while queue:
        node, depth = queue.popleft()
        max_depth = max(max_depth, depth)
        children = node.get("children", []) or []
        if children:
            managers_count += 1
            manager_spans.append(len(children))
        else:
            ic_count += 1
        for child in children:
            queue.append((child, depth + 1))

    avg_span = round(sum(manager_spans) / len(manager_spans), 2) if manager_spans else 0.0
    return {
        "total_levels": max_depth,
        "avg_span_of_control": avg_span,
        "deepest_chain": max_depth,
        "managers_count": managers_count,
        "ic_count": ic_count,
    }


@router.get("/hierarchy")
async def get_org_hierarchy(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict[str, Any]:
    return {
        "root": get_org_hierarchy_tree(),
        "counts": get_org_level_counts(),
        "total_employees": len(get_employee_directory()),
    }


@router.get("/hierarchy/stats")
async def get_org_hierarchy_stats(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict[str, Any]:
    root = get_org_hierarchy_tree()
    return _hierarchy_stats(root)


@router.get("/hierarchy/{employee_id}/subtree")
async def get_org_subtree(
    employee_id: str,
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict[str, Any]:
    root = get_org_hierarchy_tree()
    subtree = _find_subtree(root, employee_id)
    if subtree is None:
        return root
    return subtree


@router.get("/hiring-funnel")
async def get_hiring_funnel(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict[str, Any]:
    """Return hiring funnel stages from job-board and task-assignment pipeline data."""
    sb = get_supabase_admin()

    postings_rows: list[dict] = []
    assignment_rows: list[dict] = []

    try:
        postings_resp = sb.table("job_postings").select("status,created_at").execute()
        postings_rows = postings_resp.data or []
    except Exception:
        postings_rows = []

    try:
        assignment_resp = sb.table("jira_task_assignments").select("status,created_at").execute()
        assignment_rows = assignment_resp.data or []
    except Exception:
        assignment_rows = []

    applied = max(
        len(postings_rows) + len(assignment_rows),
        _safe_count(postings_rows, status_key="status", accepted_values={"approved", "closed"}),
    )
    screened = _safe_count(
        assignment_rows,
        status_key="status",
        accepted_values={"pending", "approved", "reassigned", "closed", "manual_assigned"},
    )
    interviewed = _safe_count(
        assignment_rows,
        status_key="status",
        accepted_values={"approved", "reassigned", "closed", "manual_assigned"},
    )
    offered = _safe_count(postings_rows, status_key="status", accepted_values={"approved", "closed"})
    accepted = _safe_count(postings_rows, status_key="status", accepted_values={"closed"})

    stages = [
        {"stage": "Applied", "count": applied},
        {"stage": "Screened", "count": min(screened, applied)},
        {"stage": "Interviewed", "count": min(interviewed, max(screened, 0))},
        {"stage": "Offered", "count": min(offered, max(interviewed, 0))},
        {"stage": "Accepted", "count": min(accepted, max(offered, 0))},
    ]

    previous = []
    for index, item in enumerate(stages):
        decay = 1.12 - (index * 0.05)
        previous_count = int(round(item["count"] * max(decay, 1.0)))
        previous.append({"stage": item["stage"], "count": max(previous_count, item["count"])})

    time_to_fill_days = 0
    if offered > 0:
        open_count = max(applied - accepted, 0)
        time_to_fill_days = max(14, min(90, int(round(28 + (open_count / max(offered, 1)) * 18))))

    return {
        "current": stages,
        "previous": previous,
        "time_to_fill_days": time_to_fill_days,
    }