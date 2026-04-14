"""Org-hierarchy endpoints.

RBAC enforcement summary (CLAUDE.md §3 — do not bypass):
  - Leadership / HR  : see full tree
  - Manager          : see only their own subtree
  - Employee         : see only self + direct manager (a 2-node slice)

The hierarchy is sourced from `scripts.generate_synthetic_data` until the
live employees table (with `manager_id`) is wired. Keeping it behind a
thin seam means the endpoints don't change when the data source flips.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from api.deps import get_current_active_user
from models.user import User, UserRole
from scripts.generate_synthetic_data import (
    build_tree,
    compute_stats,
    find_employee,
    generate_org_hierarchy,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/org", tags=["Org Tree"])


def _roster() -> List[Dict[str, object]]:
    """Load the deterministic org roster. Cached in-module would be ideal;
    kept as a call for now because the generator is cheap and stable."""
    return generate_org_hierarchy()


def _user_employee_anchor(user: User, roster: List[Dict[str, object]]) -> Optional[Dict[str, object]]:
    """Best-effort mapping from an authenticated user to a roster entry.

    Production would resolve via users.employee_id. Until that linkage lands,
    fall back to name/email-prefix matching; if no match, return the CEO as a
    safe anchor for demo accounts (CLAUDE.md §3 — RBAC still holds below).
    """
    prefix = (user.email or "").split("@", 1)[0].lower()
    full_name = (user.full_name or "").lower()
    for emp in roster:
        name = str(emp["name"]).lower()
        if name == full_name or name.replace(" ", ".") == prefix:
            return emp
    return None


def _apply_rbac(
    user: User,
    roster: List[Dict[str, object]],
    requested_root_id: Optional[str],
) -> Optional[str]:
    """Return the effective root ID for this user given the requested root.

    Leadership/HR: whatever they asked for (None means full tree).
    Manager:       clamped to their own subtree.
    Employee:      clamped to self (tree response is further truncated).
    """
    if user.role in (UserRole.LEADERSHIP, UserRole.HR):
        return requested_root_id

    anchor = _user_employee_anchor(user, roster)
    if anchor is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No employee record linked to this account.",
        )

    if user.role == UserRole.MANAGER:
        return str(anchor["id"])

    # Employee: clamp to self; caller must still truncate depth to 1 (self only,
    # with manager as a sibling reference added separately).
    return str(anchor["id"])


def _truncate_to_depth(node: Dict[str, object], max_depth: int) -> Dict[str, object]:
    """Return a copy of `node` with children pruned beyond `max_depth`."""
    if max_depth <= 0:
        return {**node, "children": []}
    return {
        **node,
        "children": [_truncate_to_depth(child, max_depth - 1) for child in node.get("children", [])],
    }


@router.get("/hierarchy")
async def get_hierarchy(current_user: User = Depends(get_current_active_user)) -> Dict[str, object]:
    """Return the org tree scoped to the current user's RBAC role."""
    roster = _roster()
    root_id = _apply_rbac(current_user, roster, requested_root_id=None)

    tree = build_tree(roster, root_id=root_id)
    if tree is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org tree is empty")

    if current_user.role == UserRole.EMPLOYEE:
        # Employee sees self + their direct manager (as a wrapping parent node
        # if one exists). Truncate to depth 0 (just self, no reports).
        anchor = find_employee(roster, tree["id"])
        manager_id = anchor["manager_id"] if anchor else None
        self_only = _truncate_to_depth(tree, 0)
        if manager_id:
            manager_tree = build_tree(roster, root_id=str(manager_id))
            if manager_tree:
                return {
                    **_truncate_to_depth(manager_tree, 0),
                    "children": [self_only],
                }
        return self_only

    return tree


@router.get("/hierarchy/stats")
async def get_hierarchy_stats(
    _current_user: User = Depends(get_current_active_user),
) -> Dict[str, object]:
    return compute_stats(_roster())


@router.get("/hierarchy/{employee_id}/subtree")
async def get_subtree(
    employee_id: str,
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, object]:
    """Return the subtree rooted at `employee_id`, clamped by RBAC."""
    roster = _roster()
    effective_root = _apply_rbac(current_user, roster, requested_root_id=employee_id)

    # For managers/employees, RBAC pins them to their own anchor regardless of
    # the path parameter — preserves the §3 rule that roles cannot peek up or
    # across.
    if current_user.role in (UserRole.MANAGER, UserRole.EMPLOYEE):
        if effective_root != employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You may only view your own subtree.",
            )

    subtree = build_tree(roster, root_id=effective_root)
    if subtree is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    if current_user.role == UserRole.EMPLOYEE:
        return _truncate_to_depth(subtree, 0)

    return subtree
