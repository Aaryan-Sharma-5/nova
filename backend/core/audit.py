"""Centralized audit logging helpers."""

from __future__ import annotations

import asyncio
import time
from contextvars import ContextVar
from typing import Any

from core.database import get_supabase_admin

_audit_user_id: ContextVar[str] = ContextVar("audit_user_id", default="anonymous")
_audit_user_role: ContextVar[str] = ContextVar("audit_user_role", default="unknown")
_audit_ip: ContextVar[str] = ContextVar("audit_ip", default="unknown")

_reason_buffer_lock = asyncio.Lock()
_reason_buffer: dict[str, dict[str, Any]] = {}
_REASON_TTL_SECONDS = 15 * 60


def set_audit_context(user_id: str, user_role: str, ip_address: str) -> None:
    _audit_user_id.set(user_id or "anonymous")
    _audit_user_role.set(user_role or "unknown")
    _audit_ip.set(ip_address or "unknown")


def get_audit_context() -> tuple[str, str, str]:
    return (_audit_user_id.get(), _audit_user_role.get(), _audit_ip.get())


def _reason_key(user_id: str, action: str, resource_type: str, resource_id: str) -> str:
    return f"{user_id}|{action}|{resource_type}|{resource_id}"


async def register_access_reason(
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    reason: str,
) -> None:
    now = time.time()
    key = _reason_key(user_id, action, resource_type, resource_id)

    async with _reason_buffer_lock:
        _reason_buffer[key] = {
            "reason": reason,
            "created_at": now,
        }

        # Opportunistic cleanup to keep memory bounded.
        stale_keys = [
            k for k, v in _reason_buffer.items()
            if now - float(v.get("created_at", now)) > _REASON_TTL_SECONDS
        ]
        for stale in stale_keys:
            _reason_buffer.pop(stale, None)


async def consume_access_reason(
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
) -> str | None:
    key = _reason_key(user_id, action, resource_type, resource_id)

    async with _reason_buffer_lock:
        entry = _reason_buffer.pop(key, None)

    if not entry:
        return None

    created_at = float(entry.get("created_at", 0.0))
    if time.time() - created_at > _REASON_TTL_SECONDS:
        return None

    reason = entry.get("reason")
    return str(reason) if isinstance(reason, str) and reason.strip() else None


async def audit_log(
    action: str,
    resource_type: str,
    resource_id: str,
    reason: str | None = None,
) -> None:
    """Persist an audit event to Supabase.

    Context values (user_id, user_role, ip_address) are resolved from request-scoped context vars.
    """
    user_id, user_role, ip_address = get_audit_context()

    payload = {
        "user_id": user_id,
        "user_role": user_role,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "reason": reason,
        "ip_address": ip_address,
    }

    try:
        supabase = get_supabase_admin()
        supabase.table("audit_log").insert(payload).execute()
    except Exception:
        # Audit logging must never break product flows.
        return
