import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  /** Right-aligned slot in the title bar: counts, legends, small controls. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}

/** Shared panel chrome: a hairline box with a small uppercase channel label. */
export function Panel({ title, aside, children, className = "", testId }: PanelProps) {
  return (
    <section
      data-testid={testId}
      className={`flex min-h-0 flex-col border border-line bg-panel ${className}`}
    >
      <header className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-line px-2.5">
        <h2 className="eyebrow">{title}</h2>
        {aside}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
