import { Play, Loader2 } from "lucide-react";

interface RunNodeButtonProps {
  nodeId: string;
  isExecuting?: boolean;
  disabled?: boolean;
  label?: string;
  loadingLabel?: string;
}

export function RunNodeButton({
  nodeId,
  isExecuting = false,
  disabled = false,
  label = "Run node",
  loadingLabel = "Running…",
}: RunNodeButtonProps) {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("node-execute", { detail: { nodeId } }));
  };

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
