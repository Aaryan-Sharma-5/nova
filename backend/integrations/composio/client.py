import logging
from typing import Any

import requests
try:
    from composio import ComposioToolSet as _ComposioToolSet
except (ImportError, AttributeError):
    _ComposioToolSet = None

from core.config import settings


_admin_toolset: Any | None = None
logger = logging.getLogger(__name__)

_CONNECTED_ACCOUNTS_URL = "https://backend.composio.dev/api/v1/connectedAccounts"
_ACTIVE_CONNECTION_STATUSES = {"ACTIVE", "CONNECTED", "AUTHORIZED"}
_PENDING_CONNECTION_STATUSES = {"INITIATED", "PENDING", "IN_PROGRESS"}


def is_composio_available() -> bool:
    return _ComposioToolSet is not None


def _require_composio_package() -> None:
    if _ComposioToolSet is None:
        raise RuntimeError(
            "Composio integration is unavailable because the 'composio' package is not installed. "
            "Install it in the existing environment and restart the server."
        )


def _get_api_key() -> str:
    api_key = (settings.COMPOSIO_API_KEY or "").strip()
    if not api_key:
        raise RuntimeError("COMPOSIO_API_KEY is not configured")
    return api_key


def get_toolset(entity_id: str):
    """Return a per-tenant toolset scoped to entity_id (= org_id)."""
    _require_composio_package()
    return _ComposioToolSet(
        api_key=_get_api_key(),
        entity_id=entity_id,
    )


def get_admin_toolset():
    """Platform-level toolset for connection management."""
    global _admin_toolset
    _require_composio_package()
    if _admin_toolset is None:
        _admin_toolset = _ComposioToolSet(api_key=_get_api_key())
    return _admin_toolset


def list_connected_accounts(
    *,
    entity_id: str | None = None,
    app_name: str | None = None,
    timeout_seconds: int = 15,
) -> list[dict[str, Any]]:
    """Return Composio connected accounts filtered by entity and app."""
    response = requests.get(
        _CONNECTED_ACCOUNTS_URL,
        headers={"x-api-key": _get_api_key()},
        timeout=timeout_seconds,
    )
    response.raise_for_status()

    payload = response.json() if response.content else {}
    items = payload.get("items") if isinstance(payload, dict) else []
    if not isinstance(items, list):
        return []

    entity_norm = (entity_id or "").strip()
    app_norm = (app_name or "").strip().lower()

    filtered: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if entity_norm and item.get("clientUniqueUserId") != entity_norm:
            continue
        if app_norm:
            item_app = (item.get("appName") or item.get("appUniqueId") or "").strip().lower()
            if item_app != app_norm:
                continue
        filtered.append(item)

    filtered.sort(
        key=lambda item: (item.get("updatedAt") or item.get("createdAt") or ""),
        reverse=True,
    )
    return filtered


def get_connection_state(entity_id: str, app_name: str) -> dict[str, Any]:
    """Return normalized connection state for an app scoped to entity_id."""
    try:
        items = list_connected_accounts(entity_id=entity_id, app_name=app_name)
    except requests.RequestException as exc:
        logger.warning(
            "[Composio] connectedAccounts lookup failed entity=%s app=%s error=%s",
            entity_id,
            app_name,
            exc,
        )
        return {
            "exists": False,
            "is_active": False,
            "is_pending": False,
            "status": "UNKNOWN",
            "connection_id": None,
            "redirect_url": None,
            "lookup_error": str(exc),
        }

    if not items:
        return {
            "exists": False,
            "is_active": False,
            "is_pending": False,
            "status": "MISSING",
            "connection_id": None,
            "redirect_url": None,
            "lookup_error": None,
        }

    def _status_of(item: dict[str, Any]) -> str:
        return (item.get("status") or "").strip().upper()

    def _is_active_item(item: dict[str, Any]) -> bool:
        status = _status_of(item)
        return (
            status in _ACTIVE_CONNECTION_STATUSES
            and bool(item.get("enabled", True))
            and not bool(item.get("deleted"))
            and not bool(item.get("isDisabled"))
        )

    def _is_pending_item(item: dict[str, Any]) -> bool:
        return _status_of(item) in _PENDING_CONNECTION_STATUSES

    # Prefer ACTIVE connection if any exists. This avoids false "expired/pending"
    # when a newer stale record appears after a successful OAuth connection.
    active_items = [item for item in items if _is_active_item(item)]
    if active_items:
        connection = active_items[0]
    else:
        pending_items = [item for item in items if _is_pending_item(item)]
        connection = pending_items[0] if pending_items else items[0]

    status = _status_of(connection)
    is_active = _is_active_item(connection)
    is_pending = _is_pending_item(connection)
    params = connection.get("connectionParams")
    redirect_url = params.get("redirectUrl") if isinstance(params, dict) else None

    return {
        "exists": True,
        "is_active": is_active,
        "is_pending": is_pending,
        "status": status or "UNKNOWN",
        "connection_id": connection.get("id"),
        "redirect_url": redirect_url,
        "lookup_error": None,
    }
