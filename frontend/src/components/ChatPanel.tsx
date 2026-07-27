"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChatMessage } from "@/lib/api";
import { nextId } from "@/lib/id";
import { price as fmtPrice, shares } from "@/lib/format";
import type { ChatMessage, TradeOutcome, WatchlistOutcome } from "@/lib/types";

const OPENER: ChatMessage = {
  id: "opener",
  role: "assistant",
  content:
    "I am FinAlly. Ask me about your positions, or tell me what to trade and I will place the order.",
};

interface ChatPanelProps {
  /** Called after the assistant acts, so portfolio and watchlist re-read. */
  onActions: () => Promise<void>;
}

export function ChatPanel({ onActions }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([OPENER]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, pending]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;

    setMessages((current) => [
      ...current,
      { id: nextId("user"), role: "user", content: text },
    ]);
    setDraft("");
    setPending(true);

    try {
      const response = await sendChatMessage(text);
      const { trades, watchlist_changes: watchlistChanges } = response.actions;
      setMessages((current) => [
        ...current,
        {
          id: nextId("assistant"),
          role: "assistant",
          content: response.message,
          actions: response.actions,
        },
      ]);
      if (trades.length > 0 || watchlistChanges.length > 0) await onActions();
    } catch (cause) {
      setMessages((current) => [
        ...current,
        {
          id: nextId("assistant"),
          role: "assistant",
          content: `The assistant is unreachable. ${(cause as Error).message}`,
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <aside
      data-testid="chat-panel"
      className="flex h-full min-h-0 w-[340px] shrink-0 flex-col border border-line bg-panel"
    >
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-line px-2.5">
        <h2 className="eyebrow">Assistant</h2>
        <span className="eyebrow text-purple">FinAlly</span>
      </header>

      <div
        ref={scroller}
        data-testid="chat-messages"
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5"
      >
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
        {pending && (
          <p data-testid="chat-loading" className="eyebrow animate-pulse text-blue">
            Thinking
          </p>
        )}
      </div>

      <form onSubmit={submit} className="flex shrink-0 gap-1.5 border-t border-line p-2">
        <input
          data-testid="chat-input"
          aria-label="Message the assistant"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about your portfolio"
          className="min-w-0 flex-1 border border-line bg-bg px-2 py-1.5 text-xs text-ink placeholder:text-ink-3 focus:border-blue focus:outline-none"
        />
        <button
          type="submit"
          data-testid="chat-send"
          disabled={pending}
          className="bg-purple px-3 py-1.5 font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-ink hover:brightness-115 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </aside>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div data-testid={`chat-message-${message.role}`} data-role={message.role}>
      <p
        className={`border-l-2 px-2 py-1 text-xs leading-relaxed ${
          isUser ? "border-blue text-ink-2" : "border-purple text-ink"
        }`}
      >
        {message.content}
      </p>
      {message.actions?.trades.map((trade, index) => (
        <TradeReceipt key={`${trade.ticker}-${index}`} trade={trade} />
      ))}
      {message.actions?.watchlist_changes.map((change, index) => (
        <WatchlistReceipt key={`${change.ticker}-${index}`} change={change} />
      ))}
    </div>
  );
}

function TradeReceipt({ trade }: { trade: TradeOutcome }) {
  const failed = trade.status === "failed";
  return (
    <p
      data-testid={`chat-trade-${trade.ticker}`}
      data-status={trade.status}
      className={`mt-1 ml-2 border px-2 py-1 text-[11px] tabular-nums ${
        failed ? "border-down/50 text-down" : "border-line-hi text-ink-2"
      }`}
    >
      <span className={failed ? "" : trade.side === "buy" ? "text-up" : "text-down"}>
        {trade.side.toUpperCase()}
      </span>{" "}
      {shares(trade.quantity)} {trade.ticker}
      {trade.price != null && ` at ${fmtPrice(trade.price)}`}
      {failed && ` — ${trade.error}`}
    </p>
  );
}

function WatchlistReceipt({ change }: { change: WatchlistOutcome }) {
  const failed = change.status === "failed";
  return (
    <p
      data-testid={`chat-watchlist-${change.ticker}`}
      data-status={change.status}
      className={`mt-1 ml-2 border px-2 py-1 text-[11px] ${
        failed ? "border-down/50 text-down" : "border-line-hi text-ink-2"
      }`}
    >
      Watchlist {change.action} {change.ticker}
      {failed && ` — ${change.error}`}
    </p>
  );
}
