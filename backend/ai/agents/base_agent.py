"""Base class for NOVA voice agents."""

from __future__ import annotations

import logging
import re
from typing import Any, Iterable

from ai.groq_client import groq_chat

logger = logging.getLogger(__name__)

_ACTION_PATTERN = re.compile(r"\[ACTION:\s*([^\]]+)\]")
_MAX_HISTORY_TURNS = 6


class BaseAgent:
    """Minimal Groq-backed conversational agent.

    Subclasses provide an agent_id and a system prompt. `respond` builds a
    messages array from the system prompt plus the last few turns of history
    and the new user message, calls Groq, then parses the reply for
    [ACTION: /route] tags which become suggested UI actions.
    """

    def __init__(
        self,
        agent_id: str,
        system_prompt: str,
        display_name: str | None = None,
        tools: list[Any] | None = None,
    ) -> None:
        self.agent_id = agent_id
        self.system_prompt = system_prompt
        self.display_name = display_name or agent_id.replace("_", " ").title()
        self.tools = tools or []

    async def respond(
        self,
        message: str,
        history: Iterable[dict[str, str]] | None = None,
        context_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        messages = self._build_messages(message, history or [], context_data or {})

        data_referenced: dict[str, Any] = {}
        try:
            extra = await self.gather_context(message, context_data or {})
        except Exception:  # noqa: BLE001 - agent data should never break reply
            logger.exception("agent %s gather_context failed", self.agent_id)
            extra = None

        if extra:
            data_referenced.update(extra)
            messages.insert(
                1,
                {
                    "role": "system",
                    "content": f"Reference data (JSON):\n{extra}",
                },
            )

        try:
            completion = await groq_chat(messages=messages, max_tokens=350)
            raw_reply = (
                completion.choices[0].message.content
                if completion and completion.choices
                else ""
            ) or ""
        except Exception:  # noqa: BLE001 - fallback keeps voice UX intact
            logger.exception("agent %s groq call failed", self.agent_id)
            raw_reply = (
                "I'm having trouble reaching the language model right now. "
                "Please try again in a moment."
            )

        clean_reply, actions = self._parse_actions(raw_reply)

        return {
            "reply": clean_reply.strip(),
            "agent_id": self.agent_id,
            "suggested_actions": actions,
            "data_referenced": data_referenced,
        }

    async def gather_context(
        self,
        message: str,  # noqa: ARG002
        context_data: dict[str, Any],  # noqa: ARG002
    ) -> dict[str, Any] | None:
        """Override in subclasses to fetch agent-specific data."""
        return None

    def _build_messages(
        self,
        message: str,
        history: Iterable[dict[str, str]],
        context_data: dict[str, Any],
    ) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = [
            {"role": "system", "content": self.system_prompt}
        ]
        if context_data:
            messages.append(
                {
                    "role": "system",
                    "content": f"Page/user context (JSON): {context_data}",
                }
            )

        trimmed = list(history)[-_MAX_HISTORY_TURNS * 2 :]
        for turn in trimmed:
            role = turn.get("role")
            content = turn.get("content")
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": str(content)})

        messages.append({"role": "user", "content": message})
        return messages

    @staticmethod
    def _parse_actions(reply: str) -> tuple[str, list[dict[str, str]]]:
        actions: list[dict[str, str]] = []
        for match in _ACTION_PATTERN.finditer(reply):
            token = match.group(1).strip()
            if not token:
                continue
            if token.startswith("schedule-1on1:"):
                employee_id = token.split(":", 1)[1].strip()
                actions.append(
                    {
                        "label": f"Schedule 1:1 with {employee_id}",
                        "route": employee_id,
                        "action_type": "schedule-1on1",
                    }
                )
            else:
                actions.append(
                    {
                        "label": f"Go to {token}",
                        "route": token,
                        "action_type": "navigate",
                    }
                )
        cleaned = _ACTION_PATTERN.sub("", reply).strip()
        return cleaned, actions
