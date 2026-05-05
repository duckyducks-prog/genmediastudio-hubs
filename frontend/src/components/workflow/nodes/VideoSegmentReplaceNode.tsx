import { logger } from "@/lib/logger";
import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Handle, Position, NodeProps, useReactFlow, useEdges, useNodes } from "reactflow";
import { Scissors, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NodeLockToggle } from "../NodeLockToggle";
import { VideoSegmentReplaceNodeData } from "../types";
import { RunNodeButton } from "./RunNodeButton";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Timeline Bar — always operates in percentage space (0–100)
function TimelineBar({
  startPercent,
  endPercent,
  onStartChange,
  onEndChange,
  disabled,
}: {
  startPercent: number;
  endPercent: number;
  onStartChange: (pct: number) => void;
  onEndChange: (pct: number) => void;
  disabled?: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const getPctFromPosition = useCallback((clientX: number) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return Math.round((x / rect.width) * 100);
  }, []);

  const handleMouseDown = (type: "start" | "end") => (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(type);
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const pct = getPctFromPosition(e.clientX);
      if (dragging === "start") {
        onStartChange(Math.min(pct, Math.max(0, endPercent - 1)));
      } else {
        onEndChange(Math.max(pct, Math.min(startPercent + 1, 100)));
      }
    };
    const handleMouseUp = () => setDragging(null);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, startPercent, endPercent, onStartChange, onEndChange, getPctFromPosition]);

  // Clamp visual handle positions so they never escape the bar bounds
  const startPos = Math.max(0, Math.min(startPercent, 98));
  const endPos = Math.max(2, Math.min(endPercent, 100));

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0%</span>
        <span>100%</span>
      </div>

      <div
        ref={barRef}
        className="relative h-6 bg-muted rounded cursor-pointer nodrag overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Before segment */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-secondary/50 rounded-l"
          style={{ width: `${startPercent}%` }}
        />

        {/* Replace segment */}
        <div
          className="absolute top-0 bottom-0 bg-primary/30 border-y-2 border-primary flex items-center justify-center overflow-hidden"
          style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
        >
          {endPercent - startPercent >= 10 && (
            <span className="text-[9px] text-primary font-medium whitespace-nowrap">REPLACE</span>
          )}
        </div>

        {/* After segment */}
        <div
          className="absolute top-0 bottom-0 right-0 bg-secondary/50 rounded-r"
          style={{ width: `${100 - endPercent}%` }}
        />

        {/* Start handle */}
        <div
          className={`absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center ${disabled ? "pointer-events-none" : ""}`}
          style={{ left: `${startPos}%` }}
          onMouseDown={handleMouseDown("start")}
        >
          <div className={`w-1 h-4 rounded-full ${dragging === "start" ? "bg-primary scale-125" : "bg-primary/80"} transition-transform`} />
        </div>

        {/* End handle */}
        <div
          className={`absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center ${disabled ? "pointer-events-none" : ""}`}
          style={{ left: `${endPos}%` }}
          onMouseDown={handleMouseDown("end")}
        >
          <div className={`w-1 h-4 rounded-full ${dragging === "end" ? "bg-primary scale-125" : "bg-primary/80"} transition-transform`} />
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[10px]">
        <span className="text-primary font-medium">Start: {startPercent}%</span>
        <span className="text-muted-foreground">{endPercent - startPercent}% segment</span>
        <span className="text-primary font-medium">End: {endPercent}%</span>
      </div>
    </div>
  );
}

function formatAspectRatio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function VideoSegmentReplaceNode({ data, id }: NodeProps<VideoSegmentReplaceNodeData>) {
  useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();
  const [previewUrl] = useState<string | null>(null);
  const [baseDuration, setBaseDuration] = useState(data.baseDuration || 30);
  const [replacementDuration, setReplacementDuration] = useState(0);
  const [baseDurationFailed, setBaseDurationFailed] = useState(false);
  const [baseVideoUrl, setBaseVideoUrl] = useState<string | null>(null);
  const [replacementVideoUrl, setReplacementVideoUrl] = useState<string | null>(null);
  const [baseDimensions, setBaseDimensions] = useState<{ w: number; h: number } | null>(null);
  const [replacementDimensions, setReplacementDimensions] = useState<{ w: number; h: number } | null>(null);

  const status = data.status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  // Convert old startTime/endTime fields to percentages for workflows saved before the percentage format
  const savedDuration = (data as any).baseDuration || baseDuration;
  const startPct = Number.isFinite(data.startPercent)
    ? data.startPercent
    : savedDuration > 0 && Number.isFinite((data as any).startTime)
      ? Math.round(((data as any).startTime / savedDuration) * 100)
      : 20;
  const endPct = Number.isFinite(data.endPercent)
    ? data.endPercent
    : savedDuration > 0 && Number.isFinite((data as any).endTime)
      ? Math.round(((data as any).endTime / savedDuration) * 100)
      : 80;

  const segmentDurationSec = baseDuration > 0
    ? ((endPct - startPct) / 100) * baseDuration
    : 0;

  const getVideoUrlFromNode = useCallback((nodeData: any): string | null => {
    if (nodeData.outputs?.video) return nodeData.outputs.video;
    if (nodeData.videoUrl) return nodeData.videoUrl;
    if (nodeData.video) return nodeData.video;
    if (nodeData.generatedVideoUrl) return nodeData.generatedVideoUrl;
    if (nodeData.url && typeof nodeData.url === "string" &&
        (nodeData.url.includes("video") || nodeData.url.includes(".mp4"))) {
      return nodeData.url;
    }
    return null;
  }, []);

  // Detect connected video URLs from edges
  useEffect(() => {
    const incomingEdges = edges.filter((edge) => edge.target === id);
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode?.data) continue;
      const videoUrl = getVideoUrlFromNode(sourceNode.data);
      if (edge.targetHandle === "base" && videoUrl && videoUrl !== baseVideoUrl) {
        logger.debug(`[VideoSegmentReplace] Base video detected from ${sourceNode.type}`);
        setBaseVideoUrl(videoUrl);
      } else if (edge.targetHandle === "replacement" && videoUrl && videoUrl !== replacementVideoUrl) {
        logger.debug(`[VideoSegmentReplace] Replacement video detected from ${sourceNode.type}`);
        setReplacementVideoUrl(videoUrl);
      }
    }
  }, [edges, nodes, id, baseVideoUrl, replacementVideoUrl, getVideoUrlFromNode]);

  const handleUpdate = useCallback(
    (field: string, value: any) => {
      if (data.readOnly) return;
      window.dispatchEvent(new CustomEvent("node-update", {
        detail: { id, data: { ...data, [field]: value } },
      }));
    },
    [id, data]
  );

  // Detect base video duration + dimensions
  useEffect(() => {
    if (!baseVideoUrl) {
      setBaseDuration(data.baseDuration || 30);
      setBaseDurationFailed(false);
      setBaseDimensions(null);
      return;
    }
    setBaseDurationFailed(false);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (duration && isFinite(duration)) {
        logger.debug(`[VideoSegmentReplace] Base duration: ${duration}s`);
        setBaseDuration(duration);
        handleUpdate("baseDuration", duration);
      }
      if (video.videoWidth && video.videoHeight) {
        setBaseDimensions({ w: video.videoWidth, h: video.videoHeight });
      }
    };
    video.onerror = () => {
      logger.warn("[VideoSegmentReplace] Could not load base video metadata");
      setBaseDurationFailed(true);
    };
    video.src = baseVideoUrl;
    return () => { video.src = ""; };
  }, [baseVideoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect replacement video duration + dimensions, auto-select fitMode
  useEffect(() => {
    if (!replacementVideoUrl) {
      setReplacementDuration(0);
      setReplacementDimensions(null);
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (duration && isFinite(duration)) {
        logger.debug(`[VideoSegmentReplace] Replacement duration: ${duration}s`);
        setReplacementDuration(duration);
        const segSec = baseDuration > 0
          ? ((endPct - startPct) / 100) * baseDuration
          : 0;
        if (segSec > 0) {
          const diff = Math.abs(duration - segSec);
          if (diff < 0.3) {
            handleUpdate("fitMode", "trim");
          } else if (duration < segSec) {
            handleUpdate("fitMode", "loop");
          } else {
            handleUpdate("fitMode", "trim");
          }
        }
      }
      if (video.videoWidth && video.videoHeight) {
        setReplacementDimensions({ w: video.videoWidth, h: video.videoHeight });
      }
    };
    video.onerror = () => {
      logger.warn("[VideoSegmentReplace] Could not load replacement video metadata");
    };
    video.src = replacementVideoUrl;
    return () => { video.src = ""; };
  }, [replacementVideoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const getBorderColor = () => {
    if (status === "error") return "border-red-500";
    return "border-border";
  };

  // Replacement vs segment mismatch label
  const getMismatchLabel = () => {
    if (!replacementDuration || !segmentDurationSec) return null;
    const diff = replacementDuration - segmentDurationSec;
    if (Math.abs(diff) < 0.3) return null;
    if (diff > 0) return { text: `Replacement +${diff.toFixed(1)}s over segment — will trim`, color: "text-yellow-500" };
    return { text: `Replacement ${Math.abs(diff).toFixed(1)}s under segment — will loop`, color: "text-blue-400" };
  };

  const mismatch = getMismatchLabel();

  const aspectRatioWarning = (() => {
    if (!baseDimensions || !replacementDimensions) return null;
    const baseRatio = baseDimensions.w / baseDimensions.h;
    const replRatio = replacementDimensions.w / replacementDimensions.h;
    if (Math.abs(baseRatio - replRatio) <= 0.05) return null;
    return {
      base: formatAspectRatio(baseDimensions.w, baseDimensions.h),
      replacement: formatAspectRatio(replacementDimensions.w, replacementDimensions.h),
    };
  })();

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[320px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Video Segment Replace"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NodeLockToggle
            locked={!!data.locked}
            onToggle={() => handleUpdate("locked", !data.locked)}
            disabled={data.readOnly}
          />
          {isExecuting && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
          {isCompleted && !isExecuting && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      {/* Input handle labels */}
      <div className="absolute left-0 flex items-center" style={{ top: "25%", transform: "translate(-100%, -50%)" }}>
        <span className="text-[9px] text-blue-400 mr-1 whitespace-nowrap">Base Video →</span>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="base"
        data-connector-type="video"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
        style={{ top: "25%", transform: "translateY(-50%)" }}
      />
      <div className="absolute left-0 flex items-center" style={{ top: "45%", transform: "translate(-100%, -50%)" }}>
        <span className="text-[9px] text-purple-400 mr-1 whitespace-nowrap">Replacement →</span>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="replacement"
        data-connector-type="video"
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-background"
        style={{ top: "45%", transform: "translateY(-50%)" }}
      />

      {/* Timeline */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground">
            Timeline
            {baseDuration > 0 && !baseDurationFailed && (
              <span className="text-primary ml-1">({formatTime(baseDuration)} base)</span>
            )}
          </label>
          {baseDurationFailed && (
            <span className="flex items-center gap-1 text-[10px] text-yellow-500">
              <AlertTriangle className="w-3 h-3" />
              Duration unknown
            </span>
          )}
        </div>

        <TimelineBar
          startPercent={startPct}
          endPercent={endPct}
          onStartChange={(pct) => handleUpdate("startPercent", pct)}
          onEndChange={(pct) => handleUpdate("endPercent", pct)}
          disabled={data.readOnly}
        />

        {/* Segment info row */}
        <div className="mt-2 text-[10px] text-muted-foreground">
          {baseDuration > 0 && !baseDurationFailed ? (
            <span className="text-primary">
              ~{formatTime(segmentDurationSec)} segment
              ({endPct - startPct}% of video)
            </span>
          ) : (
            <span>{endPct - startPct}% of video</span>
          )}
          {replacementDuration > 0 && (
            <span className="text-purple-400 ml-2">
              | Replacement: {formatTime(replacementDuration)}
            </span>
          )}
        </div>

        {/* Duration mismatch warning */}
        {mismatch && (
          <div className={`mt-1 text-[10px] ${mismatch.color}`}>
            {mismatch.text}
          </div>
        )}

        {/* Aspect ratio mismatch warning */}
        {aspectRatioWarning && (
          <div className="mt-1 flex items-start gap-1 text-[10px] text-yellow-500">
            <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
            <span>
              Aspect ratio mismatch ({aspectRatioWarning.replacement} → {aspectRatioWarning.base}) — replacement will be auto center-cropped. Add a Crop node upstream for precise control.
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-3 mb-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Audio</label>
          <Select
            value={data.audioMode}
            onValueChange={(value) => handleUpdate("audioMode", value)}
            disabled={data.readOnly}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Audio mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep_base">Keep Base Audio</SelectItem>
              <SelectItem value="keep_replacement">Use Replacement Audio</SelectItem>
              <SelectItem value="mix">Mix Both</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Fit Mode
            {replacementDuration > 0 && <span className="text-muted-foreground/60 ml-1">(auto)</span>}
          </label>
          <Select
            value={data.fitMode}
            onValueChange={(value) => handleUpdate("fitMode", value)}
            disabled={data.readOnly}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Fit mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trim">Trim</SelectItem>
              <SelectItem value="stretch">Stretch to fit</SelectItem>
              <SelectItem value="loop">Loop if shorter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="mb-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">Preview:</div>
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            <video
              src={previewUrl}
              controls
              className="w-full h-auto max-h-[100px] object-contain bg-black"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {data.error && status === "error" && (
        <div className="bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          <div className="text-xs text-red-500">{data.error}</div>
        </div>
      )}

      {/* Legend */}
      <div className="text-[9px] text-muted-foreground mt-3 pt-2 border-t border-border">
        <div className="font-medium mb-1">Inputs:</div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span>Base = video with audio to preserve</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span>Replacement = video to insert at segment</span>
        </div>
      </div>

      <RunNodeButton nodeId={id} disabled={data.readOnly} isExecuting={isExecuting} />

      <Handle
        type="source"
        position={Position.Right}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(VideoSegmentReplaceNode);
