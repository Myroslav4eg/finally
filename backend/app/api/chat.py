"""AI chat endpoint."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.llm import ChatRequest, ChatResponse, LLMClient, run_chat
from app.state import MarketContext, get_market

router = APIRouter(prefix="/api/chat", tags=["chat"])

Market = Annotated[MarketContext, Depends(get_market)]


def get_llm_client(request: Request) -> LLMClient:
    """FastAPI dependency yielding the application's LLM client."""
    return request.app.state.llm_client


Client = Annotated[LLMClient, Depends(get_llm_client)]


@router.post("", response_model=ChatResponse)
async def chat(body: ChatRequest, market: Market, client: Client) -> ChatResponse:
    """Answer a user message, auto-executing any trades or watchlist changes."""
    return await run_chat(market, client, body.message)
