import { memo } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Button } from "@/components/ui/button";
import { GenerateVideoNodeData, NODE_CONFIGURATIONS, NodeType } from "../types";
import {
  Sparkles,
  Loader2,
  Video as VideoIcon,
  CheckCircle2,
  AlertCircle,
  Download,
  AlertTriangle,
  ChevronDown,
  Power,
} from "lucide-react";
import { RunNodeButton } from "./RunNodeButton";

function GenerateVideoNode({ data, id }: NodeProps<GenerateVideoNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.GenerateVideo];
  const status = data.status || "ready";
  const isGenerating = data.isGenerating || status === "executing";
  const isCompleted = status === "completed";
  const isError = status === "error";
  const videoUrl = (data as any).videoUrl;
  const isEnabled = data.enabled !== false; // Default to enabled
  // Note: Mutual exclusion (first_frame/last_frame vs reference_images) is validated
  // at execution time, not in the UI. All inputs are always enabled.

  const handleUpdate = (field: keyof GenerateVideoNodeData, value: any) => {
    // Block updates in read-only mode
    if (data.readOnly) return;

    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          [field]: value,
        },
      },
    });
    window.dispatchEvent(event);
  };

  const handleToggleEnabled = () => {
    if (data.readOnly) return;
    handleUpdate("enabled", !isEnabled);
  };

  const getBorderColor = () => {
    if (!isEnabled) return "border-muted";
    if (isError) return "border-red-500";
    return "border-border";
  };

  const getStatusText = () => {
    if (isGenerating) {
      if (data.pollAttempts) {
        return `Generating... (${data.pollAttempts * 10}s)`;
      }
      return "Generating...";
    }
    if (isCompleted) return "Completed";
    if (isError) return "Error";
    return "Ready";
  };

  const handleDownload = async () => {
    if (!videoUrl) return;

    try {
      if (videoUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = videoUrl;
        link.download = `generated-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      try {
        const response = await fetch(videoUrl, { mode: "cors" });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `generated-video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (fetchError) {
        window.open(videoUrl, "_blank");
      }
    } catch (error) {
      console.error("Download failed:", error);
      window.open(videoUrl, "_blank");
    }
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[320px] shadow-lg transition-colors ${getBorderColor()} ${!isEnabled ? "opacity-50" : ""}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <VideoIcon className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Generate Video"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Enable/Disable Toggle */}
          <button
            onClick={handleToggleEnabled}
            disabled={data.readOnly}
            className={`p-1 rounded transition-colors ${
              isEnabled
                ? "text-green-500 hover:bg-green-500/10"
                : "text-muted-foreground hover:bg-muted"
            }`}
            title={isEnabled ? "Disable node" : "Enable node"}
          >
            <Power className="w-4 h-4" />
          </button>
          {isGenerating && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          {isError && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-3 mb-4">
        {config.inputConnectors.map((input) => {
          const isRequired = input.required;
          const isMultiple = input.acceptsMultiple;

          return (
            <div
              key={input.id}
              className="flex items-center gap-2 relative h-6"
            >
              <ConnectedHandle
                type="target"
                position={Position.Left}
                id={input.id}
                data-connector-type={input.type}
                className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
              />
              <div className="text-xs font-medium text-muted-foreground">
                {input.label}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
                {isMultiple && (
                  <span className="text-blue-500 ml-1">(multi)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Node Content */}
      <div className="space-y-3">
        {/* Aspect Ratio Dropdown */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Aspect Ratio
          </label>
          <div className="relative">
            <select
              value={data.aspectRatio}
              onChange={(e) => handleUpdate("aspectRatio", e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md appearance-none pr-8"
              disabled={isGenerating || data.readOnly || !isEnabled}
            >
              <option value="16:9">16:9 (Landscape)</option>
              <option value="9:16">9:16 (Portrait)</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Duration Dropdown */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Duration
          </label>
          <div className="relative">
            <select
              value={data.durationSeconds}
              onChange={(e) =>
                handleUpdate("durationSeconds", parseInt(e.target.value))
              }
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md appearance-none pr-8"
              disabled={isGenerating || data.readOnly || !isEnabled}
            >
              <option value="4">4 seconds</option>
              <option value="6">6 seconds</option>
              <option value="8">8 seconds</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Generate Audio Checkbox */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.generateAudio}
              onChange={(e) => handleUpdate("generateAudio", e.target.checked)}
              disabled={isGenerating || data.readOnly || !isEnabled}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs font-medium text-muted-foreground">
              Generate Audio
            </span>
          </label>
        </div>

        {/* Status */}
        <div className="text-xs text-muted-foreground">
          Status: <span className="font-medium">{getStatusText()}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-3 h-3" />
          <span>Veo 3.1</span>
          {data.generatedMode && (
            <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-semibold ${
              data.generatedMode === "project"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {data.generatedMode === "project" ? "Project" : "Explore"}
            </span>
          )}
        </div>

        {/* Mutual Exclusion Warning */}
        {data.error?.includes("mutual exclusion") && (
          <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <div>{data.error}</div>
          </div>
        )}

        {/* Video Preview */}
        {isCompleted && videoUrl && (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
              <video
                src={videoUrl}
                controls
                className="w-full h-auto max-h-[200px]"
              />
            </div>
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Download className="w-3 h-3 mr-1" />
              Download Video
            </Button>

            {/* Run Node Button */}
            <RunNodeButton nodeId={id} isExecuting={isGenerating} disabled={data.readOnly || !isEnabled} label="Regenerate" loadingLabel="Generating..." />
          </div>
        )}

        {/* No Video Yet */}
        {!isCompleted && !videoUrl && (
          <div className="space-y-2">
            <div className="flex flex-col items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
              <VideoIcon className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">
                {isGenerating ? "Generating..." : "No video yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {!isGenerating && "Run workflow to generate"}
              </p>
            </div>

            {/* Run Node Button */}
            <RunNodeButton nodeId={id} isExecuting={isGenerating} disabled={data.readOnly || !isEnabled} label="Generate Video" loadingLabel="Generating..." />
          </div>
        )}

        {/* Error Display */}
        {isError && data.error && !data.error.includes("mutual exclusion") && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}
      </div>

      {/* Output Handle - Right side */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="video"
        data-connector-type={config.outputConnectors[0]?.type}
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(GenerateVideoNode);
