"""
JIRA API client for NOVA.

Currently handles: assigning an issue to an employee by accountId.
Credentials are read from core.config (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN).
"""

from __future__ import annotations

import base64
import logging

import httpx

logger = logging.getLogger(__name__)


async def assign_jira_issue(issue_key: str, account_id: str) -> bool:
    """
    Assign a JIRA issue to the user identified by `account_id`.

    Uses Basic auth (email:api_token).  Returns True on success, False on
    any error — callers should treat JIRA sync as best-effort and never fail
    the NOVA approval flow because of it.
    """
    from core.config import settings

    base_url = (settings.JIRA_BASE_URL or "").rstrip("/")
    email = settings.JIRA_EMAIL
    api_token = settings.JIRA_API_TOKEN

    if not all([base_url, email, api_token]):
        logger.warning("JIRA assign skipped — JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN not configured")
        return False

    if not account_id:
        logger.warning("JIRA assign skipped — no accountId for issue %s", issue_key)
        return False

    credentials = base64.b64encode(f"{email}:{api_token}".encode()).decode()
    url = f"{base_url}/rest/api/3/issue/{issue_key}/assignee"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.put(
                url,
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json={"accountId": account_id},
            )
        if res.status_code in (200, 204):
            logger.info("JIRA: assigned %s to accountId=%s", issue_key, account_id)
            return True
        logger.warning(
            "JIRA assign failed for %s (accountId=%s): HTTP %s — %s",
            issue_key, account_id, res.status_code, res.text[:200],
        )
        return False
    except Exception as exc:
        logger.error("JIRA assign error for %s: %s", issue_key, exc)
        return False
