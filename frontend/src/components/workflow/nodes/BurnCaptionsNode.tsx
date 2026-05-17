import { memo, useEffect, useState } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Captions, CheckCircle2, Loader2, Power } from "lucide-react";
import { BurnCaptionsNodeData } from "../types";
import { RunNodeButton } from "./RunNodeButton";

const BG_OPTIONS = [
  { value: "teal", label: "Teal", color: "#042729" },
  { value: "magenta", label: "Magenta", color: "#46062B" },
  { value: "neutral", label: "Neutral", color: "#141414" },
] as const;

function BurnCaptionsNode({ data, id }: NodeProps<BurnCaptionsNodeData>) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isEnabled = data.enabled !== false;
  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  useEffect(() => {
    if (data.outputs?.video) setPreviewUrl(data.outputs.video as string);
  }, [(data.outputs as any)?.video, status]);

  const update = (patch: Partial<BurnCaptionsNodeData>) => {
    if (data.readOnly) return;
    window.dispatchEvent(new CustomEvent("node-update", {
      detail: { id, data: { ...data, ...patch } },
    }));
  };

  const handleToggleEnabled = () => {
    if (data.readOnly) return;
    update({ enabled: !isEnabled } as any);
  };

  return (
    <div className={`bg-card border-2 rounded-lg p-4 min-w-[260px] shadow-lg transition-colors border-border ${!isEnabled ? "opacity-50" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Captions className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{data.label || "Burn Captions"}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleEnabled}
            disabled={data.readOnly}
            className={`p-1 rounded transition-colors ${isEnabled ? "text-green-500 hover:bg-green-500/10" : "text-muted-foreground hover:bg-muted"}`}
            title={isEnabled ? "Disable node" : "Enable node"}
          >
            <Power className="w-4 h-4" />
          </button>
          {isExecuting && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mb-3">
        Auto-transcribes audio and burns synced captions into the video.
      </p>

      {/* Controls */}
      <div className="space-y-2.5">

      {/* Position */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-1">Position</p>
        <div className="flex gap-1">
          {(["bottom", "center", "top"] as const).map((p) => (
            <button
              key={p}
              onClick={() => update({ position: p })}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors capitalize ${
                (data.position ?? "bottom") === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Font size */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">Size</span>
        <input
          type="number"
          min={8}
          max={120}
          value={data.fontSize ?? 48}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          className="nodrag w-14 text-xs px-1.5 py-0.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Background color */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-1">Background</p>
        <div className="flex gap-1.5">
          {BG_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ backgroundColor: opt.value })}
              className={`flex items-center gap-1.5 px-2 py-1 text-[10px] rounded border transition-colors ${
                (data.backgroundColor ?? "teal") === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              <span
                className="w-3 h-3 rounded-full border border-white/20 flex-shrink-0"
                style={{ backgroundColor: opt.color }}
              />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      </div>

      {/* Error */}
      {(data as any).error && (
        <p className="mt-2 text-xs text-destructive">{(data as any).error}</p>
      )}

      {/* Video preview */}
      {previewUrl && isCompleted && (
        <div className="mt-3 rounded overflow-hidden border border-border">
          <video src={previewUrl} controls className="w-full" style={{ maxHeight: 160 }} />
        </div>
      )}

      <RunNodeButton nodeId={id} isExecuting={isExecuting} disabled={data.readOnly || !isEnabled} />

      {/* Input handle — video only */}
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%" }}
      />

      {/* Output handle */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%" }}
      />
    </div>
  );
}

export default memo(BurnCaptionsNode);
