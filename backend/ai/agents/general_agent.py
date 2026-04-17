"""General-purpose NOVA assistant used as the fallback agent."""

from __future__ import annotations

import logging
from typing import Any

from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are NOVA Assistant, an AI guide for the NOVA HR Analytics platform. "
    "You help HR professionals and managers navigate the platform, understand "
    "metrics, and take action on workforce insights. You have access to "
    "org-level summary data. Keep responses concise — under 3 sentences for "
    "voice output. When suggesting navigation, use [ACTION: /route] tags. Do "
    "not make up specific employee data unless it is provided in context_data. "
    "The current user's role is {role}. Adjust your responses: HR and Leadership "
    "get specific org-wide figures; Manager gets team-level only; Employee gets "
    "personal-only responses with no peer comparisons."
)


class GeneralNovaAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            agent_id="general_nova_agent",
            system_prompt=SYSTEM_PROMPT,
            display_name="NOVA Assistant",
        )

    async def gather_context(
        self,
        message: str,
        context_data: dict[str, Any],
    ) -> dict[str, Any] | None:
        lowered = (message or "").lower()
        # Only pull the org summary when the question is clearly org-wide;
        # keeps routine nav questions fast.
        triggers = ("workforce wellbeing", "org wellbeing", "org info", "overall", "company", "organization")
        if not any(t in lowered for t in triggers):
            return None

        try:
            from ai.insights import summarize_org_health

            summary = await summarize_org_health()
            return {"org_summary": summary}
        except Exception:  # noqa: BLE001
            logger.debug("org summary unavailable; continuing without it")
            return None
