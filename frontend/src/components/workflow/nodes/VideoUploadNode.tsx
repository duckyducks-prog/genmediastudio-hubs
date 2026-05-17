import { logger } from "@/lib/logger";
import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Position, NodeProps, useReactFlow } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Button } from "@/components/ui/button";
import { Upload, X, Film, Play, FolderOpen, Loader2 } from "lucide-react";
import { VideoInputNodeData } from "../types";
import { saveToLibrary } from "@/lib/api-helpers";
import { RunNodeButton } from "./RunNodeButton";

function VideoUploadNode({ data, id }: NodeProps<VideoInputNodeData>) {
  // Initialize from data, which may be pre-populated from library
  const [videoUrl, setVideoUrl] = useState<string | null>(
    data.videoUrl || (data as any).url || null,
  );
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    data.thumbnailUrl || (data as any).thumbnailUrl || null,
  );
  const [showPreview, setShowPreview] = useState(false);
  const [duration, setDuration] = useState<number | null>(
    data.duration || null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setNodes } = useReactFlow();

  // Sync local state with node data on mount
  useEffect(() => {
    if (data.videoUrl && data.videoUrl !== videoUrl) {
      logger.debug(
        "[VideoUploadNode] Syncing videoUrl from data:",
        data.videoUrl,
      );
      setVideoUrl(data.videoUrl);
    }
    if (data.thumbnailUrl && data.thumbnailUrl !== thumbnailUrl) {
      setThumbnailUrl(data.thumbnailUrl);
    }
    if (data.duration && data.duration !== duration) {
      setDuration(data.duration);
    }
  }, [
    data.videoUrl,
    data.thumbnailUrl,
    data.duration,
    videoUrl,
    thumbnailUrl,
    duration,
  ]);

  // Sync local state TO node data when it changes (for library-loaded videos)
  useEffect(() => {
    // If we have video in local state but not in node data, update node data
    if (videoUrl && videoUrl !== data.videoUrl) {
      logger.debug("[VideoUploadNode] Syncing local state to node data:", {
        videoUrl: videoUrl.substring(0, 100),
        hasOutputs: !!data.outputs?.video,
      });

      // For HTTP URLs (library assets), fetch and convert to data URL
      if (videoUrl.startsWith("http")) {
        fetch(videoUrl, { mode: "cors" })
          .then((response) => response.blob())
          .then((blob) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;

              const newData = {
                ...data,
                videoUrl,
                thumbnailUrl,
                duration,
                outputs: { video: dataUrl },
              };

              logger.debug(
                "[VideoUploadNode] Updated node data with library video",
              );

              setNodes((nodes) =>
                nodes.map((node) =>
                  node.id === id ? { ...node, data: newData } : node,
                ),
              );

              window.dispatchEvent(
                new CustomEvent("node-update", {
                  detail: { id, data: newData },
                }),
              );
            };
            reader.readAsDataURL(blob);
          })
          .catch((err) => {
            console.error(
              "[VideoUploadNode] Error converting library video:",
              err,
            );
          });
      }
    }
  }, [videoUrl, thumbnailUrl, duration, data, id, setNodes]);

  // Generate thumbnail from video at 1 second mark
  const generateThumbnail = useCallback(
    (videoElement: HTMLVideoElement): Promise<string> => {
      return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("[VideoUploadNode] Failed to get canvas context");
          resolve("");
          return;
        }

        const captureFrame = () => {
          try {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            ctx.drawImage(videoElement, 0, 0);
            resolve(canvas.toDataURL("image/jpeg", 0.8));
          } catch (err) {
            console.error("[VideoUploadNode] Error capturing frame:", err);
            resolve("");
          }
        };

        const seekAndCapture = () => {
          const seekTime = Math.min(1, videoElement.duration * 0.1);

          const handleSeeked = () => {
            videoElement.removeEventListener("seeked", handleSeeked);
            captureFrame();
          };

          videoElement.addEventListener("seeked", handleSeeked);
          videoElement.currentTime = seekTime;
        };

        // Check if metadata is already loaded
        if (videoElement.readyState >= 1) {
          // Metadata already loaded, seek directly
          seekAndCapture();
        } else {
          // Wait for metadata
          const handleLoadedMetadata = () => {
            videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
            seekAndCapture();
          };
          videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
        }
      });
    },
    [],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith("video/")) {
        console.error("[VideoUploadNode] Invalid file type:", file.type);
        return;
      }

      setIsUploading(true);
      setUploadError(null);

      const url = URL.createObjectURL(file);
      setVideoUrl(url);

      logger.debug("[VideoUploadNode] Starting video upload:", {
        nodeId: id,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });

      // Create temporary video element to extract metadata and thumbnail
      const tempVideo = document.createElement("video");
      tempVideo.src = url;
      tempVideo.muted = true;

      tempVideo.onloadedmetadata = async () => {
        const videoDuration = tempVideo.duration;
        setDuration(videoDuration);

        logger.debug("[VideoUploadNode] Video metadata loaded:", {
          nodeId: id,
          duration: videoDuration,
        });

        // Generate thumbnail
        const thumb = await generateThumbnail(tempVideo);
        setThumbnailUrl(thumb);

        logger.debug(
          "[VideoUploadNode] Thumbnail generated, reading file as data URL...",
        );

        // Read file as data URL for output
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;

          logger.debug("[VideoUploadNode] File read complete:", {
            nodeId: id,
            dataUrlLength: dataUrl.length,
            dataUrlStart: dataUrl.substring(0, 100),
          });

          try {
            // Upload to Asset Library to get a persistent reference
            logger.debug("[VideoUploadNode] Uploading to Asset Library...");
            const assetResult = await saveToLibrary({
              imageUrl: dataUrl, // The API uses imageUrl for both image/video data
              prompt: "User uploaded video",
              assetType: "video",
            });

            const videoRefId = assetResult.id;
            logger.debug("[VideoUploadNode] Asset saved:", { videoRef: videoRefId });

            const newData = {
              ...data,
              videoRef: videoRefId, // Asset ID for persistence
              videoUrl: url, // Object URL for preview
              file,
              duration: videoDuration,
              thumbnailUrl: thumb,
              outputs: { video: dataUrl }, // Data URL for downstream nodes
            };

            logger.debug("[VideoUploadNode] Video loaded with asset ref:", {
              nodeId: id,
              videoRef: videoRefId,
              duration: videoDuration,
              fileSize: file.size,
              fileType: file.type,
            });

            // Update React Flow node
            setNodes((nodes) =>
              nodes.map((node) =>
                node.id === id ? { ...node, data: newData } : node,
              ),
            );

            // Dispatch for propagation
            window.dispatchEvent(
              new CustomEvent("node-update", {
                detail: { id, data: newData },
              }),
            );
          } catch (error) {
            logger.debug("[VideoUploadNode] Failed to save to Asset Library:", error);
            setUploadError("Failed to save video. It won't persist when workflow is saved.");

            // Still update node with base64 for immediate use
            const newData = {
              ...data,
              videoUrl: url,
              file,
              duration: videoDuration,
              thumbnailUrl: thumb,
              outputs: { video: dataUrl },
            };

            setNodes((nodes) =>
              nodes.map((node) =>
                node.id === id ? { ...node, data: newData } : node,
              ),
            );

            window.dispatchEvent(
              new CustomEvent("node-update", {
                detail: { id, data: newData },
              }),
            );
          } finally {
            setIsUploading(false);
          }
        };
        reader.readAsDataURL(file);
      };
    },
    [id, data, setNodes, generateThumbnail],
  );

  const handleRemove = useCallback(() => {
    setVideoUrl(null);
    setThumbnailUrl(null);
    setDuration(null);
    setUploadError(null);

    const newData = {
      ...data,
      videoUrl: null,
      file: null,
      videoRef: undefined,
      duration: undefined,
      thumbnailUrl: null,
      outputs: {},
    };

    setNodes((nodes) =>
      nodes.map((node) => (node.id === id ? { ...node, data: newData } : node)),
    );

    window.dispatchEvent(
      new CustomEvent("node-update", {
        detail: { id, data: newData },
      }),
    );
  }, [id, data, setNodes]);

  // Generate thumbnail and convert video to data URL for pre-loaded videos from library
  useEffect(() => {
    if (videoUrl && (!thumbnailUrl || !data.outputs?.video)) {
      logger.debug("[VideoUploadNode] Processing pre-loaded video:", {
        videoUrl: videoUrl.substring(0, 100),
        hasThumbnail: !!thumbnailUrl,
        hasOutputs: !!data.outputs?.video,
      });

      const tempVideo = document.createElement("video");
      tempVideo.src = videoUrl;
      tempVideo.muted = true;
      tempVideo.crossOrigin = "anonymous";

      // Generate thumbnail if needed
      if (!thumbnailUrl) {
        generateThumbnail(tempVideo)
          .then((thumb) => {
            if (thumb) {
              logger.debug("[VideoUploadNode] Thumbnail generated successfully");
              setThumbnailUrl(thumb);
            }
          })
          .catch((err) => {
            console.error("[VideoUploadNode] Error generating thumbnail:", err);
          });
      }

      // Convert video to data URL if needed
      // Check if we need to convert HTTP URL to data URL
      const outputVideo = data.outputs?.video;
      const needsConversion =
        videoUrl.startsWith("http") &&
        (!outputVideo ||
          (typeof outputVideo === "string" && outputVideo.startsWith("http")));

      logger.debug("[VideoUploadNode] Checking if conversion needed:", {
        videoUrlScheme: videoUrl.substring(0, 20),
        hasOutputVideo: !!outputVideo,
        outputVideoScheme: outputVideo
          ? typeof outputVideo === "string"
            ? outputVideo.substring(0, 20)
            : "not-string"
          : "none",
        needsConversion,
      });

      if (needsConversion) {
        logger.debug(
          "[VideoUploadNode] Converting HTTP video to data URL...",
        );

        fetch(videoUrl, { mode: "cors" })
          .then((response) => response.blob())
          .then((blob) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;

              logger.debug(
                "[VideoUploadNode] Library video converted to data URL:",
                {
                  nodeId: id,
                  dataUrlLength: dataUrl.length,
                },
              );

              const newData = {
                ...data,
                outputs: { video: dataUrl },
              };

              setNodes((nodes) =>
                nodes.map((node) =>
                  node.id === id ? { ...node, data: newData } : node,
                ),
              );

              window.dispatchEvent(
                new CustomEvent("node-update", {
                  detail: { id, data: newData },
                }),
              );
            };
            reader.readAsDataURL(blob);
          })
          .catch((err) => {
            console.error(
              "[VideoUploadNode] Error fetching library video:",
              err,
            );
          });
      }
      // Handle data URLs that don't need conversion
      else if (videoUrl.startsWith("data:") && !data.outputs?.video) {
        logger.debug(
          "[VideoUploadNode] Video is already a data URL, setting outputs directly",
        );

        const newData = {
          ...data,
          outputs: { video: videoUrl },
        };

        setNodes((nodes) =>
          nodes.map((node) => (node.id === id ? { ...node, data: newData } : node)),
        );

        window.dispatchEvent(
          new CustomEvent("node-update", {
            detail: { id, data: newData },
          }),
        );
      }
    }
  }, [videoUrl, thumbnailUrl, data, id, setNodes, generateThumbnail]);

  const handleBrowseLibrary = useCallback(() => {
    // Dispatch event to open Asset Library with video filter
    window.dispatchEvent(
      new CustomEvent("open-asset-library-inline", {
        detail: { nodeId: id, assetType: "video" },
      }),
    );
  }, [id]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[250px] shadow-lg transition-colors border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-accent" />
          <div className="font-semibold text-sm">
            {data.label || "Video Input"}
          </div>
        </div>
        {isExecuting && (
          <span className="w-4 h-4 animate-pulse text-yellow-500">⚡</span>
        )}
        {isCompleted && <span className="text-green-500">✓</span>}
      </div>

      {/* Content */}
      <div className="space-y-2">
        {videoUrl ? (
          <div className="relative group">
            {/* Thumbnail with play overlay */}
            <div
              className="relative rounded-lg overflow-hidden border border-border bg-muted cursor-pointer flex items-center justify-center h-48"
              onMouseEnter={() => setShowPreview(true)}
              onMouseLeave={() => setShowPreview(false)}
            >
              {showPreview ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  autoPlay
                  loop
                  muted
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <>
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt="Video thumbnail"
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        console.error(
                          "[VideoUploadNode] Thumbnail failed to load",
                        );
                        (e.target as HTMLImageElement).src =
                          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="112"%3E%3Crect fill="%23333" width="200" height="112"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%23999" font-size="14" dominant-baseline="middle"%3EVideo Thumbnail%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Film className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-12 h-12 text-white/90" fill="white" />
                  </div>
                </>
              )}
              {/* Upload overlay */}
              {isUploading && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}
            </div>

            {/* Remove button */}
            <Button
              onClick={handleRemove}
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              disabled={isUploading}
            >
              <X className="w-3 h-3" />
            </Button>

            {/* Duration badge */}
            {duration && (
              <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-2 py-0.5 rounded">
                {formatDuration(duration)}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Upload area */}
            <label
              htmlFor={`file-upload-${id}`}
              className={`flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-lg transition-colors ${
                isUploading
                  ? "cursor-wait opacity-50"
                  : "cursor-pointer hover:border-primary hover:bg-accent/10"
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-8 h-8 text-muted-foreground mb-2 animate-spin" />
                  <span className="text-xs text-muted-foreground">
                    Uploading...
                  </span>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-xs text-muted-foreground">
                    Click to upload video
                  </span>
                </>
              )}
              <input
                id={`file-upload-${id}`}
                type="file"
                className="hidden"
                accept="video/*"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </label>

            {/* Browse Library button */}
            <Button
              onClick={handleBrowseLibrary}
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isUploading}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Browse Library
            </Button>
          </div>
        )}
        {uploadError && (
          <p className="text-xs text-destructive">{uploadError}</p>
        )}
        {data.videoRef && !uploadError && (
          <p className="text-xs text-muted-foreground">✓ Saved to library</p>
        )}
      </div>

      <RunNodeButton nodeId={id} isExecuting={isExecuting} disabled={data.readOnly} />

      {/* Output Handle */}
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

export default memo(VideoUploadNode);
