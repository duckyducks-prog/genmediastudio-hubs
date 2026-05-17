import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: React.ReactNode;
}

export function SidePanel({ isOpen, onClose, title, subtitle, width = 400, children }: SidePanelProps) {
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Focus close button on open; Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => firstFocusRef.current?.focus(), 280);
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => { clearTimeout(t); document.removeEventListener("keydown", handler); };
  }, [isOpen, onClose]);

  const content = (
    <div
      className={`side-panel-host${isOpen ? " is-open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ "--panel-width": `${width}px` } as React.CSSProperties}
    >
      {/* Layer 1: Backdrop */}
      <div className="side-panel-backdrop" aria-hidden="true" onClick={onClose} />

      {/* Layer 2: Edge vignette */}
      <div className="side-panel-vignette" aria-hidden="true" />

      {/* Layer 3: Panel */}
      <aside className="side-panel" style={{ width }}>
        <header className="panel-header">
          <h2 className="panel-title">{title}</h2>
          <button
            ref={firstFocusRef}
            className="panel-close"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </header>
        {subtitle && (
          <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: "-10px 0 0", paddingLeft: 2, flexShrink: 0 }}>
            {subtitle}
          </p>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </aside>
    </div>
  );

  return createPortal(content, document.body);
}
