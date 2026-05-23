import { Play, Loader2 } from "lucide-react";

interface RunNodeButtonProps {
  nodeId: string;
  isExecuting?: boolean;
  disabled?: boolean;
  label?: string;
  loadingLabel?: string;
  compact?: boolean; // icon-only pill for toolbar use
}

export function RunNodeButton({
  nodeId,
  isExecuting = false,
  disabled = false,
  label = "Run node",
  loadingLabel = "Running…",
  compact = false,
}: RunNodeButtonProps) {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("node-execute", { detail: { nodeId } }));
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={isExecuting || disabled}
        title={isExecuting ? loadingLabel : label}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          padding: "0 10px", height: 28, borderRadius: 7, border: "none",
          background: isExecuting ? "rgba(185,205,190,0.18)" : "rgba(185,205,190,0.1)",
          color: "#B9CDBE", fontSize: 11, fontWeight: 500, fontFamily: "inherit",
          cursor: disabled || isExecuting ? "not-allowed" : "pointer",
          opacity: disabled && !isExecuting ? 0.4 : 1,
          boxShadow: "-2px -2px 4px rgba(30,100,105,0.2), 2px 2px 5px rgba(0,0,0,0.45)",
          transition: "background 130ms",
          pointerEvents: isExecuting ? "none" : "auto",
          flexShrink: 0,
        }}
        onMouseEnter={e => { if (!disabled && !isExecuting) (e.currentTarget as HTMLButtonElement).style.background = "rgba(185,205,190,0.18)"; }}
        onMouseLeave={e => { if (!disabled && !isExecuting) (e.currentTarget as HTMLButtonElement).style.background = "rgba(185,205,190,0.1)"; }}
      >
        {isExecuting
          ? <><Loader2 className="w-3 h-3 animate-spin" /><span>{loadingLabel.replace("…","")}</span></>
          : <><Play className="w-3 h-3" fill="currentColor" /><span>{label.replace(" node","")}</span></>}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isExecuting || disabled}
      style={{
        width: "100%",
        background: isExecuting ? "rgba(185,205,190,0.18)" : "rgba(185,205,190,0.1)",
        color: "#B9CDBE",
        border: "1px solid rgba(185,205,190,0.22)",
        padding: "7px 11px",
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled || isExecuting ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: disabled && !isExecuting ? 0.4 : 1,
        transition: "background 150ms ease-out",
        marginTop: 8,
        pointerEvents: isExecuting ? "none" : "auto",
      }}
      onMouseEnter={e => { if (!disabled && !isExecuting) (e.currentTarget as HTMLButtonElement).style.background = "rgba(185,205,190,0.18)"; }}
      onMouseLeave={e => { if (!disabled && !isExecuting) (e.currentTarget as HTMLButtonElement).style.background = "rgba(185,205,190,0.1)"; }}
    >
      {isExecuting ? (
        <><Loader2 className="w-3 h-3 animate-spin" />{loadingLabel}</>
      ) : (
        <><Play className="w-3 h-3" />{label}</>
      )}
    </button>
  );
}
