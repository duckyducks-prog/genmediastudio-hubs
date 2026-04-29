import { logger } from "@/lib/logger";
import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Handle, Position, NodeProps, useReactFlow, useEdges, useNodes } from "reactflow";
import { Scissors, Loader2, CheckCircle2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_ENDPOINTS } from "@/lib/api-config";
import { auth } from "@/lib/firebase";
import { NodeLockToggle } from "../NodeLockToggle";
import { VideoSegmentReplaceNodeData } from "../types";
import { RunNodeButton } from "./RunNodeButton";

// Format seconds to MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Format percentage
function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

// Timeline Bar Component
function TimelineBar({
  duration,
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  disabled,
  mode = "seconds",
}: {
  duration: number;
  startTime: number;
  endTime: number;
  onStartChange: (time: number) => void;
  onEndChange: (time: number) => void;
  disabled?: boolean;
  mode?: "seconds" | "percentage";
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const getTimeFromPosition = useCallback(
    (clientX: number) => {
      if (!barRef.current || duration <= 0) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percent = x / rect.width;
      return Math.round(percent * duration * 10) / 10; // Round to 0.1s
    },
    [duration]
  );

  const handleMouseDown = (type: "start" | "end") => (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(type);
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const time = getTimeFromPosition(e.clientX);
      if (dragging === "start") {
        // Start can't go past end - 1 second
        const maxStart = Math.max(0, endTime - 1);
        onStartChange(Math.min(time, maxStart));
      } else {
        // End can't go before start + 1 second or past duration
        const minEnd = Math.min(startTime + 1, duration);
        onEndChange(Math.max(time, minEnd));
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, duration, startTime, endTime, onStartChange, onEndChange, getTimeFromPosition]);

  const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endTime / duration) * 100 : 100;

  const fmt = mode === "percentage" ? formatPercent : formatTime;

  return (
    <div className="space-y-1">
      {/* Time labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{mode === "percentage" ? "0%" : "0:00"}</span>
        <span>{fmt(duration)}</span>
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        className="relative h-6 bg-muted rounded cursor-pointer nodrag"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Background track */}
        <div className="absolute inset-0 rounded bg-muted" />

        {/* Before segment (keep) */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-secondary/50 rounded-l"
          style={{ width: `${startPercent}%` }}
        />

        {/* Replace segment (highlighted) */}
        <div
          className="absolute top-0 bottom-0 bg-primary/30 border-y-2 border-primary"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] text-primary font-medium">REPLACE</span>
          </div>
        </div>

        {/* After segment (keep) */}
        <div
          className="absolute top-0 bottom-0 right-0 bg-secondary/50 rounded-r"
          style={{ width: `${100 - endPercent}%` }}
        />

        {/* Start handle */}
        <div
          className={`absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center ${
            disabled ? "pointer-events-none" : ""
          }`}
          style={{ left: `${startPercent}%` }}
          onMouseDown={handleMouseDown("start")}
        >
          <div
            className={`w-1 h-4 rounded-full ${
              dragging === "start" ? "bg-primary scale-125" : "bg-primary/80"
            } transition-transform`}
          />
        </div>

        {/* End handle */}
        <div
          className={`absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center ${
            disabled ? "pointer-events-none" : ""
          }`}
          style={{ left: `${endPercent}%` }}
          onMouseDown={handleMouseDown("end")}
        >
          <div
            className={`w-1 h-4 rounded-full ${
              dragging === "end" ? "bg-primary scale-125" : "bg-primary/80"
            } transition-transform`}
          />
        </div>
      </div>

      {/* Time indicators */}
      <div className="flex justify-between text-[10px]">
        <span className="text-primary font-medium">
          Start: {fmt(startTime)}
        </span>
        <span className="text-muted-foreground">
          {fmt(endTime - startTime)} segment
        </span>
        <span className="text-primary font-medium">
          End: {fmt(endTime)}
        </span>
      </div>
    </div>
  );
}

function VideoSegmentReplaceNode({ data, id }: NodeProps<VideoSegmentReplaceNodeData>) {
  const { setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [baseDuration, setBaseDuration] = useState(data.baseDuration || 30);
  const [replacementDuration, setReplacementDuration] = useState(0);
  const timelineMode = data.timelineMode || "seconds";
  const [baseVideoUrl, setBaseVideoUrl] = useState<string | null>(null);
  const [replacementVideoUrl, setReplacementVideoUrl] = useState<string | null>(null);
  const renderRequestId = useRef(0);

  const status = data.status || "ready";
  const isExecuting = status === "executing" || isProcessing;
  const isCompleted = status === "completed";

  // Helper to extract video URL from a source node's data
  const getVideoUrlFromNode = useCallback((nodeData: any): string | null => {
    // Check various places where video URL might be stored
    if (nodeData.outputs?.video) return nodeData.outputs.video;
    if (nodeData.videoUrl) return nodeData.videoUrl;
    if (nodeData.video) return nodeData.video;
    if (nodeData.generatedVideoUrl) return nodeData.generatedVideoUrl;
    if (nodeData.url && typeof nodeData.url === 'string' && 
        (nodeData.url.includes('video') || nodeData.url.includes('.mp4'))) {
      return nodeData.url;
    }
    return null;
  }, []);

  // Detect connected videos from incoming edges
  useEffect(() => {
    const incomingEdges = edges.filter((edge) => edge.target === id);
    
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode?.data) continue;

      const videoUrl = getVideoUrlFromNode(sourceNode.data);
      
      if (edge.targetHandle === 'base' && videoUrl) {
        if (videoUrl !== baseVideoUrl) {
          logger.debug(`[VideoSegmentReplace] Base video URL detected from ${sourceNode.type}`);
          setBaseVideoUrl(videoUrl);
        }
      } else if (edge.targetHandle === 'replacement' && videoUrl) {
        if (videoUrl !== replacementVideoUrl) {
          logger.debug(`[VideoSegmentReplace] Replacement video URL detected from ${sourceNode.type}`);
          setReplacementVideoUrl(videoUrl);
        }
      }
    }
  }, [edges, nodes, id, baseVideoUrl, replacementVideoUrl, getVideoUrlFromNode]);

  const handleUpdate = useCallback(
    (field: string, value: any) => {
      if (data.readOnly) return;
      const event = new CustomEvent("node-update", {
        detail: {
          id,
          data: { ...data, [field]: value },
        },
      });
      window.dispatchEvent(event);
    },
    [id, data]
  );

  const toggleLock = () => {
    handleUpdate("locked", !data.locked);
  };

  // Detect base video duration when URL changes
  useEffect(() => {
    if (!baseVideoUrl) {
      // Reset to default if no base connected
      if (baseDuration !== 30) setBaseDuration(30);
      return;
    }

    // Try to get duration via video element - works for any URL type
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous"; // Needed for GCS URLs
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (duration && isFinite(duration) && duration !== baseDuration) {
        logger.debug(`[VideoSegmentReplace] Base video duration detected: ${duration}s`);
        setBaseDuration(duration);
        handleUpdate("baseDuration", duration);
        // Adjust endTime if it exceeds duration
        if (data.endTime > duration) {
          handleUpdate("endTime", duration);
        }
        // Adjust startTime if it exceeds duration
        if (data.startTime >= duration) {
          handleUpdate("startTime", 0);
        }
      }
    };
    video.onerror = () => {
      logger.warn(`[VideoSegmentReplace] Could not load base video metadata`);
    };
    video.src = baseVideoUrl;

    return () => {
      video.src = ""; // Clean up
    };
  }, [baseVideoUrl, baseDuration, data.endTime, data.startTime, handleUpdate]);

  // Detect replacement video duration
  useEffect(() => {
    if (!replacementVideoUrl) {
      setReplacementDuration(0);
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (duration && isFinite(duration)) {
        logger.debug(`[VideoSegmentReplace] Replacement video duration: ${duration}s`);
        setReplacementDuration(duration);
      }
    };
    video.onerror = () => {
      logger.warn(`[VideoSegmentReplace] Could not load replacement video metadata`);
    };
    video.src = replacementVideoUrl;

    return () => {
      video.src = "";
    };
  }, [replacementVideoUrl]);

  const getBorderColor = () => {
    if (status === "error") return "border-red-500";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[320px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
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
            onToggle={toggleLock}
            disabled={data.readOnly}
          />
          {isExecuting && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && !isExecuting && (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          )}
        </div>
      </div>

      {/* Input Handles with Labels */}
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

      {/* Timeline Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground">
            Timeline {timelineMode === "seconds" && baseDuration > 0 && <span className="text-primary">({formatTime(baseDuration)} base)</span>}
          </label>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              className={`px-2 py-0.5 text-[10px] transition-colors ${
                timelineMode === "percentage"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => handleUpdate("timelineMode", "percentage")}
              disabled={data.readOnly}
            >
              %
            </button>
            <button
              className={`px-2 py-0.5 text-[10px] transition-colors ${
                timelineMode === "seconds"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => handleUpdate("timelineMode", "seconds")}
              disabled={data.readOnly}
            >
              sec
            </button>
          </div>
        </div>
        {timelineMode === "percentage" ? (
          <TimelineBar
            duration={100}
            startTime={data.startPercent}
            endTime={data.endPercent}
            onStartChange={(val) => handleUpdate("startPercent", Math.round(val))}
            onEndChange={(val) => handleUpdate("endPercent", Math.round(val))}
            disabled={data.readOnly}
            mode="percentage"
          />
        ) : (
          <TimelineBar
            duration={baseDuration}
            startTime={data.startTime}
            endTime={data.endTime}
            onStartChange={(time) => handleUpdate("startTime", time)}
            onEndChange={(time) => handleUpdate("endTime", time)}
            disabled={data.readOnly}
            mode="seconds"
          />
        )}
        {/* Replacement video info */}
        {replacementDuration > 0 && timelineMode === "seconds" && (
          <div className="mt-2 text-[10px] text-purple-400">
            Replacement video: {formatTime(replacementDuration)} |
            Segment: {formatTime(data.endTime - data.startTime)}
            {replacementDuration > (data.endTime - data.startTime) && (
              <span className="text-yellow-500 ml-1">(will be trimmed)</span>
            )}
            {replacementDuration < (data.endTime - data.startTime) && data.fitMode === "loop" && (
              <span className="text-blue-400 ml-1">(will loop)</span>
            )}
            {replacementDuration < (data.endTime - data.startTime) && data.fitMode === "stretch" && (
              <span className="text-blue-400 ml-1">(will stretch)</span>
            )}
          </div>
        )}
        {timelineMode === "percentage" && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            Segment: {formatPercent(data.endPercent - data.startPercent)} of base video
            {baseDuration > 0 && (
              <span className="text-primary ml-1">
                (~{formatTime((data.endPercent - data.startPercent) / 100 * baseDuration)})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-3 mb-3">
        {/* Audio Mode */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Audio
          </label>
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

        {/* Fit Mode */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Fit Mode
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
              <SelectItem value="trim">Trim (use as-is)</SelectItem>
              <SelectItem value="stretch">Stretch to fit</SelectItem>
              <SelectItem value="loop">Loop if shorter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="mb-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Preview:
          </div>
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            <video
              src={previewUrl}
              controls
              className="w-full h-auto max-h-[100px] object-contain bg-black"
            />
          </div>
        </div>
      )}

      {/* Error Display - only show if status is error, not if we've completed successfully */}
      {data.error && status === "error" && (
        <div className="bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          <div className="text-xs text-red-500">{data.error}</div>
        </div>
      )}

      {/* Input Legend */}
      <div className="text-[9px] text-muted-foreground mt-3 pt-2 border-t border-border">
        <div className="font-medium mb-1">Inputs:</div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span>Base = video with audio to preserve</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
          <span>Replacement = video to insert at segment</span>
        </div>
      </div>

      <RunNodeButton nodeId={id} disabled={data.readOnly} isExecuting={isExecuting} />

      {/* Output Handle */}
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
