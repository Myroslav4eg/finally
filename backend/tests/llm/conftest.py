"""Fixtures for the LLM tests. No test in this package touches the network."""

import pytest

from app.llm import AssistantResponse


class StubClient:
    """An LLMClient that returns canned responses and records the prompts it saw."""

    def __init__(self, *responses: AssistantResponse | Exception) -> None:
        self.responses = list(responses) or [AssistantResponse(message="ok")]
        self.calls: list[list[dict[str, str]]] = []

    async def complete(self, messages):
        self.calls.append(messages)
        response = self.responses[min(len(self.calls) - 1, len(self.responses) - 1)]
        if isinstance(response, Exception):
            raise response
        return response

    @property
    def last_prompt(self) -> list[dict[str, str]]:
        return self.calls[-1]


@pytest.fixture
def stub_client():
    """Factory for a StubClient with the given canned responses."""
    return StubClient


@pytest.fixture
def priced_market(market):
    """A market context with deterministic prices for the tickers tests trade."""
    market.cache.update("AAPL", 100.0)
    market.cache.update("MSFT", 200.0)
    return market
