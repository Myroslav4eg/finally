"""LLM client: the real LiteLLM/OpenRouter/Cerebras call behind a small interface.

`create_client()` returns the mock client when `LLM_MOCK=true`, so the chat
service is identical in both modes.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Protocol

from pydantic import ValidationError

from .schemas import AssistantResponse

logger = logging.getLogger(__name__)

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}
REASONING_EFFORT = "low"

MOCK_ENV_VAR = "LLM_MOCK"
API_KEY_ENV_VAR = "OPENROUTER_API_KEY"


class LLMError(RuntimeError):
    """The model call failed or returned something that is not the expected schema."""


class LLMClient(Protocol):
    """Turns a message list into a validated structured response."""

    async def complete(self, messages: list[dict[str, str]]) -> AssistantResponse:
        """Call the model and return its parsed structured output."""
        ...


class LiteLLMClient:
    """Calls gpt-oss-120b through OpenRouter with Cerebras as the inference provider."""

    def __init__(self, model: str = MODEL) -> None:
        self.model = model

    async def complete(self, messages: list[dict[str, str]]) -> AssistantResponse:
        """Request a structured response, running the blocking call in a thread."""
        content = await asyncio.to_thread(self._call, messages)
        return parse_response(content)

    def _call(self, messages: list[dict[str, str]]) -> str:
        from litellm import completion

        response = completion(
            model=self.model,
            messages=messages,
            response_format=AssistantResponse,
            reasoning_effort=REASONING_EFFORT,
            extra_body=EXTRA_BODY,
        )
        return response.choices[0].message.content


def parse_response(content: str | None) -> AssistantResponse:
    """Validate the model's JSON, raising LLMError on anything unusable."""
    if not content:
        raise LLMError("The model returned an empty response")
    try:
        return AssistantResponse.model_validate_json(content)
    except ValidationError as exc:
        logger.warning("Malformed LLM response: %s", content[:500])
        raise LLMError("The model returned a response that could not be parsed") from exc


def mock_enabled() -> bool:
    """True when LLM_MOCK selects deterministic offline responses."""
    return os.environ.get(MOCK_ENV_VAR, "").strip().lower() == "true"


def create_client() -> LLMClient:
    """Return the mock client under LLM_MOCK, otherwise the real one."""
    if mock_enabled():
        from .mock import MockLLMClient

        logger.info("LLM mock mode enabled")
        return MockLLMClient()
    if not os.environ.get(API_KEY_ENV_VAR, "").strip():
        logger.warning("%s is not set; chat requests will fail", API_KEY_ENV_VAR)
    return LiteLLMClient()
