import { logger } from "@/lib/logger";
import { memo, useState, useEffect, useRef } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { CheckCircle2, Loader2, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderWithPixi } from "@/lib/pixi-renderer";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import { NodeLockToggle } from "../NodeLockToggle";
import { API_ENDPOINTS } from "@/lib/api-config";
import { auth } from "@/lib/firebase";
import { RunNodeButton } from "./RunNodeButton";

export interface PreviewNodeData {
  label: string;
  status?: "ready" | "executing" | "completed" | "error";
  error?: string;
  imageUrl?: string;
  videoUrl?: string;
  textContent?: string;
  outputs?: Record<string, any>;
  locked?: boolean;
  readOnly?: boolean;
}

function PreviewNode({ data, id }: NodeProps<PreviewNodeData>) {
  const [displayContent, setDisplayContent] = useState<{
    type: "image" | "video" | "text" | "none";
    content: string;
  }>({ type: "none", content: "" });
  const [isRendering, setIsRendering] = useState(false);

  // Request sequencing to prevent race conditions
  const renderRequestId = useRef(0);

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing" || isRendering;
  const isCompleted = status === "completed";

  const toggleLock = () => {
    const updateEvent = new CustomEvent("node-update", {
      detail: { id, data: { ...data, locked: !data.locked } },
    });
    window.dispatchEvent(updateEvent);
  };

  useEffect(() => {
    const imageInput = (data as any).image || (data as any).imageUrl;
    const videoInput = (data as any).video || (data as any).videoUrl;
    const textInput = (data as any).text || (data as any).textContent;
    const filters: FilterConfig[] = (data as any).filters || [];

    logger.debug("[PreviewNode] Data update:", {
      nodeId: id,
      hasImage: !!imageInput,
      hasVideo: !!videoInput,
      hasText: !!textInput,
      filterCount: filters.length,
      filters: filters.map((f) => ({ type: f.type, params: f.params })),
    });

    // Handle image with possible filters
    if (imageInput) {
      if (filters.length > 0) {
        // Layer 2: Render with PixiJS filter chain
        // Increment request ID to track this render
        const currentRequestId = ++renderRequestId.current;

        logger.debug(
          "[PreviewNode] Starting PixiJS render with",
          filters.length,
          "filters (request #" + currentRequestId + ")",
        );
        setIsRendering(true);

        renderWithPixi(imageInput, filters)
          .then((rendered) => {
            // Only update if this is still the latest request
            if (currentRequestId === renderRequestId.current) {
              logger.debug(
                "[PreviewNode] Render completed successfully (request #" +
                  currentRequestId +
                  ")",
              );
              setDisplayContent({ type: "image", content: rendered });

              // Dispatch the rendered image as output
              const updateEvent = new CustomEvent("node-update", {
                detail: {
                  id,
                  data: {
                    ...data,
                    outputs: {
                      image: rendered, // The processed image with all filters applied
                    },
                  },
                },
              });
              window.dispatchEvent(updateEvent);
            } else {
              logger.debug(
                "[PreviewNode] Discarding stale render result (request #" +
                  currentRequestId +
                  ", current is #" +
                  renderRequestId.current +
                  ")",
              );
            }
          })
          .catch((error) => {
            // Only handle error if this is still the latest request
            if (currentRequestId === renderRequestId.current) {
              console.error(
                "[PreviewNode] Render failed (request #" +
                  currentRequestId +
                  "):",
                error,
              );
              // Fallback to original image
              setDisplayContent({ type: "image", content: imageInput });
            }
          })
          .finally(() => {
            // Only clear rendering flag if this is still the latest request
            if (currentRequestId === renderRequestId.current) {
              setIsRendering(false);
            }
          });
      } else {
        // No filters, show original
        logger.debug("[PreviewNode] Showing original image (no filters)");
        setDisplayContent({ type: "image", content: imageInput });

        // Dispatch the original image as output
        const updateEvent = new CustomEvent("node-update", {
          detail: {
            id,
            data: {
              ...data,
              outputs: {
                image: imageInput,
              },
            },
          },
        });
        window.dispatchEvent(updateEvent);
      }
    } else if (videoInput) {
      // Handle video with possible filters
      if (filters.length > 0) {
        const currentRequestId = ++renderRequestId.current;
        logger.debug(
          "[PreviewNode] Starting video filter processing with",
          filters.length,
          "filters (request #" + currentRequestId + ")"
        );
        setIsRendering(true);

        // Call backend API to apply filters to video
        (async () => {
          try {
            const user = auth.currentUser;
            const token = await user?.getIdToken();

            // Prepare video data - either URL or base64
            const requestBody: any = {
              filters: filters.map(f => ({ type: f.type, params: f.params })),
            };

            if (videoInput.startsWith("data:")) {
              // Base64 video
              requestBody.video_base64 = videoInput;
            } else {
              // URL
              requestBody.video_url = videoInput;
            }

            const response = await fetch(API_ENDPOINTS.video.applyFilters, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.detail || `Failed to apply filters: ${response.status}`);
            }

            const result = await response.json();
            const filteredVideoUrl = `data:video/mp4;base64,${result.video_base64}`;

            if (currentRequestId === renderRequestId.current) {
              logger.debug("[PreviewNode] Video filter processing complete (request #" + currentRequestId + ")");
              setDisplayContent({ type: "video", content: filteredVideoUrl });

              // Dispatch the filtered video as output
              const updateEvent = new CustomEvent("node-update", {
                detail: {
                  id,
                  data: {
                    ...data,
                    outputs: {
                      video: filteredVideoUrl,
                    },
                  },
                },
              });
              window.dispatchEvent(updateEvent);
            }
          } catch (error) {
            if (currentRequestId === renderRequestId.current) {
              console.error("[PreviewNode] Video filter processing failed:", error);
              // Fallback to original video
              setDisplayContent({ type: "video", content: videoInput });
            }
          } finally {
            if (currentRequestId === renderRequestId.current) {
              setIsRendering(false);
            }
          }
        })();
      } else {
        // No filters, show original video
        setDisplayContent({ type: "video", content: videoInput });

        // Dispatch the original video as output
        const updateEvent = new CustomEvent("node-update", {
          detail: {
            id,
            data: {
              ...data,
              outputs: {
                video: videoInput,
              },
            },
          },
        });
        window.dispatchEvent(updateEvent);
      }
    } else if (textInput) {
      setDisplayContent({ type: "text", content: textInput });
    } else {
      setDisplayContent({ type: "none", content: "" });
    }
  }, [data, id]); // React to any data changes

  const getBorderColor = () => {
    return "border-border";
  };

  const handleDownload = () => {
    if (displayContent.content) {
      const link = document.createElement("a");
      link.href = displayContent.content;
      if (displayContent.type === "image") {
        link.download = "modified-image.png";
      } else if (displayContent.type === "video") {
        link.download = "modified-video.mp4";
      }
      link.click();
    }
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[300px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-accent" />
          <div className="font-semibold text-sm">{data.label || "Preview"}</div>
        </div>
        <div className="flex items-center gap-1">
          <NodeLockToggle locked={!!data.locked} onToggle={toggleLock} disabled={data.readOnly} />
          {isExecuting && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      {/* Input Handles */}
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "25%", transform: "translateY(-50%)" }}
      />
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "40%", transform: "translateY(-50%)" }}
      />
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "60%", transform: "translateY(-50%)" }}
      />
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="text"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "75%", transform: "translateY(-50%)" }}
      />

      <RunNodeButton nodeId={id} disabled={data.readOnly} isExecuting={isExecuting} />

      {/* Output Handles */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "40%", transform: "translateY(-50%)" }}
      />
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "60%", transform: "translateY(-50%)" }}
      />

      {/* Node Content */}
      <div className="space-y-3">
        {displayContent.type === "image" && displayContent.content ? (
          <>
            <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
              <img
                src={displayContent.content}
                alt="Preview"
                className="w-full h-auto max-h-[250px] object-contain"
                crossOrigin={
                  displayContent.content?.startsWith("data:")
                    ? undefined
                    : "anonymous"
                }
                onError={() => {
                  console.error("[PreviewNode] Image failed to load");
                }}
              />
            </div>
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </>
        ) : displayContent.type === "video" && displayContent.content ? (
          <>
            <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
              <video
                src={displayContent.content}
                controls
                className="w-full h-auto max-h-[250px] object-contain bg-black"
                onError={() => {
                  console.error("[PreviewNode] Video failed to load");
                }}
              />
            </div>
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </>
        ) : displayContent.type === "text" && displayContent.content ? (
          <div className="bg-muted border border-border rounded-lg p-3 max-h-[250px] overflow-y-auto">
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {displayContent.content}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <Eye className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {isExecuting ? "Receiving..." : "No content to preview"}
            </p>
            <p className="text-xs text-muted-foreground">
              {!isExecuting && "Connect inputs to display"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PreviewNode);
