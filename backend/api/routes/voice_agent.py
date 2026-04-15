"""Voice/chat endpoint that routes a turn to the right NOVA agent."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ai.agents.agent_registry import get_agent, list_agents, resolve_agent_id
from api.deps import require_role
from models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["Voice Agent"])


class ConversationTurn(BaseModel):
    role: str
    content: str


class AgentChatRequest(BaseModel):
    message: str
    agent_id: str = "auto"
    conversation_history: list[ConversationTurn] = Field(default_factory=list)
    current_page: str | None = None
    context_data: dict[str, Any] = Field(default_factory=dict)


class SuggestedAction(BaseModel):
    label: str
    route: str
    action_type: str


class AgentChatResponse(BaseModel):
    reply: str
    agent_id: str
    suggested_actions: list[SuggestedAction] = Field(default_factory=list)
    data_referenced: dict[str, Any] = Field(default_factory=dict)


_ALLOWED_ROLES = [UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP]


@router.post("/chat", response_model=AgentChatResponse)
async def agent_chat(
    request: AgentChatRequest,
    current_user: User = Depends(require_role(_ALLOWED_ROLES)),
) -> AgentChatResponse:
    resolved_id = resolve_agent_id(request.agent_id, request.current_page)
    agent = get_agent(resolved_id)

    logger.info(
        "voice-agent chat user=%s role=%s page=%s requested_agent=%s resolved=%s",
        current_user.email,
        current_user.role.value,
        request.current_page,
        request.agent_id,
        resolved_id,
    )

    history = [turn.model_dump() for turn in request.conversation_history]
    enriched_context = {
        **request.context_data,
        "current_page": request.current_page,
        "user_role": current_user.role.value,
    }

    result = await agent.respond(
        message=request.message,
        history=history,
        context_data=enriched_context,
    )

    return AgentChatResponse(
        reply=result.get("reply", ""),
        agent_id=result.get("agent_id", resolved_id),
        suggested_actions=[
            SuggestedAction(**action) for action in result.get("suggested_actions", [])
        ],
        data_referenced=result.get("data_referenced", {}) or {},
    )


@router.get("/agents")
async def agents_index(
    _current_user: User = Depends(require_role(_ALLOWED_ROLES)),
) -> dict[str, Any]:
    return {"agents": list_agents()}
