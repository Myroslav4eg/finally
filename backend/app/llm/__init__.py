"""AI chat assistant: prompt building, structured LLM calls, and action execution.

See planning/PLAN.md section 9 for the flow and planning/LLM_MOCK.md for the
deterministic mock contract.
"""

from .client import LiteLLMClient, LLMClient, LLMError, create_client, mock_enabled, parse_response
from .mock import MockLLMClient
from .prompts import SYSTEM_PROMPT, build_messages, format_portfolio_context
from .schemas import (
    AssistantResponse,
    ChatActions,
    ChatRequest,
    ChatResponse,
    ProposedTrade,
    ProposedWatchlistChange,
    TradeOutcome,
    WatchlistOutcome,
)
from .service import execute_actions, run_chat

__all__ = [
    "AssistantResponse",
    "ChatActions",
    "ChatRequest",
    "ChatResponse",
    "LLMClient",
    "LLMError",
    "LiteLLMClient",
    "MockLLMClient",
    "ProposedTrade",
    "ProposedWatchlistChange",
    "SYSTEM_PROMPT",
    "TradeOutcome",
    "WatchlistOutcome",
    "build_messages",
    "create_client",
    "execute_actions",
    "format_portfolio_context",
    "mock_enabled",
    "parse_response",
    "run_chat",
]
