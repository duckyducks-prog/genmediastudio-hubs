import { memo, useEffect } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { ExtractLastFrameNodeData, NODE_CONFIGURATIONS, NodeType } from "../types";
import { Film, CheckCircle2, Loader2, Image as ImageIcon } from "lucide-react";
import { RunNodeButton } from "./RunNodeButton";

function ExtractLastFrameNode({ data, id }: NodeProps<ExtractLastFrameNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.ExtractLastFrame];
  const status = data.status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";
  const videoUrl = data.videoUrl;
  const extractedFrameUrl = data.extractedFrameUrl;

  const getBorderColor = () => {
    if (status === "error") return "border-red-500";
    return "border-border";
  };

  // Extract last frame when video is loaded
  useEffect(() => {
    if (!videoUrl || extractedFrameUrl) return;

    const extractFrame = async () => {
      try {
        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.src = videoUrl;
        video.muted = true;

        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = reject;
        });

        // Seek to the last frame (duration - 0.1 seconds to ensure we get a valid frame)
        video.currentTime = Math.max(0, video.duration - 0.1);

        await new Promise((resolve) => {
          video.onseeked = resolve;
        });

        // Draw the frame to canvas
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          throw new Error("Could not get canvas context");
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to data URL
        const frameDataUrl = canvas.toDataURL("image/png");

        // Update node data with extracted frame
        const event = new CustomEvent("node-update", {
          detail: {
            id,
            data: {
              ...data,
              extractedFrameUrl: frameDataUrl,
              outputs: {
                image: frameDataUrl,
              },
            },
          },
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.error("Failed to extract last frame:", error);
        const event = new CustomEvent("node-update", {
          detail: {
            id,
            data: {
              ...data,
              status: "error",
              error: error instanceof Error ? error.message : "Failed to extract frame",
            },
          },
        });
        window.dispatchEvent(event);
      }
    };

    extractFrame();
  }, [videoUrl, extractedFrameUrl, id, data]);

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[240px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">{data.label || "Extract Last Frame"}</div>
        </div>
        <div className="flex items-center gap-1">
          {isExecuting && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      {/* Input Handle - Left side */}
      <div className="space-y-3 mb-4">
        {config.inputConnectors.map((input) => (
          <div key={input.id} className="flex items-center gap-2 relative h-6">
            <ConnectedHandle
              type="target"
              position={Position.Left}
              id={input.id}
              data-connector-type={input.type}
              className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
            />
            <div className="text-xs font-medium text-muted-foreground">
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Node Content */}
      <div className="space-y-3">
        {extractedFrameUrl ? (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
              <img
                src={extractedFrameUrl}
                alt="Last frame"
                className="w-full h-auto max-h-[120px] object-contain"
              />
            </div>
            <div className="text-xs text-green-500 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Last frame extracted
            </div>
          </div>
        ) : videoUrl ? (
          <div className="flex flex-col items-center justify-center h-[100px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <Loader2 className="w-6 h-6 text-muted-foreground mb-2 animate-spin" />
            <p className="text-xs text-muted-foreground">Extracting last frame...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[100px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <ImageIcon className="w-6 h-6 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">Connect a video</p>
          </div>
        )}

        {status === "error" && data.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}
      </div>

      <RunNodeButton nodeId={id} disabled={data.readOnly} isExecuting={isExecuting} />

      {/* Output Handle - Right side */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="image"
        data-connector-type={config.outputConnectors[0]?.type}
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(ExtractLastFrameNode);
