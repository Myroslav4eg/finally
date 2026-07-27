import type { ConnectionState } from "@/lib/types";

const LABELS: Record<ConnectionState, { text: string; dot: string; ink: string }> = {
  live: { text: "Live", dot: "bg-up", ink: "text-up" },
  connecting: { text: "Reconnecting", dot: "bg-yellow", ink: "text-yellow" },
  offline: { text: "Offline", dot: "bg-down", ink: "text-down" },
};

/** Stream status. Always carries its label, so state never rests on color. */
export function ConnectionDot({ status }: { status: ConnectionState }) {
  const { text, dot, ink } = LABELS[status];
  return (
    <span
      data-testid="connection-status"
      data-status={status}
      className="flex items-center gap-1.5"
      role="status"
      aria-live="polite"
    >
      <span
        data-testid="connection-dot"
        className={`h-1.5 w-1.5 rounded-full ${dot}`}
        aria-hidden="true"
      />
      <span className={`eyebrow ${ink}`}>{text}</span>
    </span>
  );
}
