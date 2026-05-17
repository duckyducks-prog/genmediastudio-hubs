import { logger } from "@/lib/logger";
import { memo, useState, useEffect } from "react";
import { Position, NodeProps, useEdges, useNodes } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { DownloadNodeData } from "../types";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { createMediaZip, downloadBlob } from "@/lib/zip-utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RunNodeButton } from "./RunNodeButton";

function DownloadNode({ data, id }: NodeProps<DownloadNodeData>) {
  const edges = useEdges();
  const nodes = useNodes();
  const [isDownloading, setIsDownloading] = useState(false);
  const [connectedMedia, setConnectedMedia] = useState<
    Array<{ type: "image" | "video"; url: string }>
  >([]);

  // Detect connected media from incoming edges
  useEffect(() => {
    const incomingEdges = edges.filter((edge) => edge.target === id);
    const media: Array<{ type: "image" | "video"; url: string }> = [];

    logger.debug(
      `[DownloadNode] Updating media for ${id}:`,
      incomingEdges.length,
      "incoming edges",
    );

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode || !sourceNode.data) {
        logger.debug(`[DownloadNode] No source node found for edge`, edge);
        continue;
      }

      const nodeData = sourceNode.data as any;
      const nodeType = sourceNode.type;
      const allDataKeys = Object.keys(nodeData);

      logger.debug(
        `[DownloadNode] Processing source node ${edge.source} (type: ${nodeType}):`,
        {
          hasImageUrl: !!nodeData.imageUrl,
          hasVideoUrl: !!nodeData.videoUrl,
          hasImage: !!nodeData.image,
          hasVideo: !!nodeData.video,
          hasOutputs: !!nodeData.outputs,
          outputsKeys: nodeData.outputs ? Object.keys(nodeData.outputs) : [],
          allDataKeys,
          fullNodeData: nodeData,
        },
      );

      // Helper function to detect if a URL is a video
      const isVideoUrl = (url: string): boolean => {
        if (url.startsWith("data:")) {
          return (
            url.includes("video/") || url.includes("application/octet-stream") // Sometimes videos come as octet-stream
          );
        }
        // Check file extensions for blob/object URLs
        return (
          url.includes(".mp4") ||
          url.includes(".webm") ||
          url.includes(".mov") ||
          url.includes(".avi")
        );
      };

      // Helper function to detect if a URL is an image
      const isImageUrl = (url: string): boolean => {
        if (url.startsWith("data:")) {
          return url.includes("image/");
        }
        return (
          url.includes(".png") ||
          url.includes(".jpg") ||
          url.includes(".jpeg") ||
          url.includes(".webp") ||
          url.includes(".gif")
        );
      };

      // Extract from various sources in priority order
      // 1. Try explicit top-level fields
      let imageUrl =
        nodeData.imageUrl || nodeData.image || nodeData.outputs?.image;
      let videoUrl =
        nodeData.videoUrl || nodeData.video || nodeData.outputs?.video;

      // 2. Try arrays
      if (!imageUrl && Array.isArray(nodeData.outputs?.images)) {
        imageUrl = nodeData.outputs.images[0];
      }
      if (!videoUrl && Array.isArray(nodeData.outputs?.videos)) {
        videoUrl = nodeData.outputs.videos[0];
      }

      // 3. If we have a videoUrl that's actually a blob URL, prefer the data URL from outputs
      if (
        videoUrl &&
        videoUrl.startsWith("blob:") &&
        nodeData.outputs?.video &&
        nodeData.outputs.video.startsWith("data:")
      ) {
        logger.debug(
          `[DownloadNode] Preferring data URL over blob URL for video`,
        );
        videoUrl = nodeData.outputs.video;
      }

      // 4. Scan outputs object for any video/image URLs by MIME type
      if (nodeData.outputs && typeof nodeData.outputs === "object") {
        for (const [key, value] of Object.entries(nodeData.outputs)) {
          if (typeof value === "string" && value.startsWith("data:")) {
            if (!videoUrl && isVideoUrl(value)) {
              logger.debug(
                `[DownloadNode] Found video in outputs.${key} by MIME type`,
              );
              videoUrl = value;
            } else if (!imageUrl && isImageUrl(value)) {
              logger.debug(
                `[DownloadNode] Found image in outputs.${key} by MIME type`,
              );
              imageUrl = value;
            }
          }
        }
      }

      const textContent =
        nodeData.textContent || nodeData.outputs?.text || nodeData.text;

      logger.debug(`[DownloadNode] Extracted media:`, {
        hasImageUrl: !!imageUrl,
        hasVideoUrl: !!videoUrl,
        imageUrlStart: imageUrl?.substring(0, 50),
        videoUrlStart: videoUrl?.substring(0, 50),
      });

      if (imageUrl && typeof imageUrl === "string") {
        logger.debug(
          `[DownloadNode] ✓ Adding image URL:`,
          imageUrl.substring(0, 80),
        );
        media.push({ type: "image", url: imageUrl });
      } else if (videoUrl && typeof videoUrl === "string") {
        logger.debug(
          `[DownloadNode] ✓ Adding video URL:`,
          videoUrl.substring(0, 80),
        );
        media.push({ type: "video", url: videoUrl });
      } else if (
        textContent &&
        typeof textContent === "string" &&
        textContent.startsWith("data:")
      ) {
        // Handle text that's been converted to data URL
        logger.debug(`[DownloadNode] ✓ Adding text as data URL`);
        media.push({ type: "image", url: textContent });
      } else {
        logger.debug(
          `[DownloadNode] ✗ No media found in node ${edge.source} (type: ${nodeType}).`,
        );
      }

      // Handle arrays of images - ONLY if we didn't already add an image from this node
      if (
        !imageUrl &&
        (Array.isArray(nodeData.images) ||
          Array.isArray(nodeData.outputs?.images))
      ) {
        const images = nodeData.images || nodeData.outputs?.images;
        logger.debug(`[DownloadNode] Found ${images.length} images in array`);
        for (const img of images) {
          if (typeof img === "string") {
            media.push({ type: "image", url: img });
          }
        }
      }

      // Handle arrays of videos - ONLY if we didn't already add a video from this node
      if (
        !videoUrl &&
        (Array.isArray(nodeData.videos) ||
          Array.isArray(nodeData.outputs?.videos))
      ) {
        const videos = nodeData.videos || nodeData.outputs?.videos;
        logger.debug(`[DownloadNode] Found ${videos.length} videos in array`);
        for (const vid of videos) {
          if (typeof vid === "string") {
            media.push({ type: "video", url: vid });
          }
        }
      }
    }

    logger.debug(`[DownloadNode] Total media found:`, media.length);
    setConnectedMedia(media);
  }, [id, edges, nodes]);

  const handleDownload = async () => {
    if (connectedMedia.length === 0) {
      toast.error("No media connected to download");
      return;
    }

    setIsDownloading(true);

    try {
      if (connectedMedia.length === 1) {
        // Single file: download directly without ZIP
        const media = connectedMedia[0];
        const link = document.createElement("a");

        // Get file extension from data URL
        const mimeMatch = media.url.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : "application/octet-stream";

        const ext = mimeType.includes("image")
          ? mimeType.split("/")[1] || "png"
          : mimeType.split("/")[1] || "mp4";

        link.href = media.url;
        link.download = `${media.type}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success("File downloaded!");
      } else {
        // Multiple files: create ZIP
        const filesToZip = connectedMedia.map((media, index) => ({
          ...media,
          index,
        }));

        const zipBlob = await createMediaZip(filesToZip);
        downloadBlob(zipBlob, "media-export.zip");

        toast.success(`Downloaded ${connectedMedia.length} files in ZIP`);
      }
    } catch (error) {
      console.error("[DownloadNode] Download error:", error);
      toast.error(
        `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const isEmpty = connectedMedia.length === 0;

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[250px] shadow-lg transition-colors ${
        isEmpty ? "border-border" : "border-primary/30"
      }`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Download"}
          </div>
        </div>
        {isDownloading && (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
        )}
      </div>

      {/* Input Handle */}
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="media-input"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />

      {/* Node Content */}
      <div className="space-y-3">
        {isEmpty ? (
          <div className="flex items-start gap-2 p-2 bg-muted/50 rounded border border-border">
            <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Connect image or video nodes to download media
            </p>
          </div>
        ) : (
          <>
            {/* Connected Media List */}
            <div className="space-y-1 p-2 bg-background/50 rounded border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Connected media ({connectedMedia.length}):
              </p>
              <div className="space-y-1">
                {connectedMedia.map((media, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    <span className="capitalize">{media.type}</span>
                    <span className="text-muted-foreground">#{index + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Download Button */}
            <Button
              onClick={handleDownload}
              disabled={isDownloading}
              variant="default"
              size="sm"
              className="w-full"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  Downloading...
                </>
              ) : connectedMedia.length === 1 ? (
                <>
                  <Download className="w-3 h-3 mr-2" />
                  Download File
                </>
              ) : (
                <>
                  <Download className="w-3 h-3 mr-2" />
                  Download ZIP ({connectedMedia.length})
                </>
              )}
            </Button>

            {/* Info Text */}
            <p className="text-[10px] text-muted-foreground leading-tight px-1">
              {connectedMedia.length === 1
                ? "Click to download the file in full quality"
                : "Multiple files will be packaged in a ZIP archive"}
            </p>
          </>
        )}
      </div>

      <RunNodeButton nodeId={id} disabled={data.readOnly} />
    </div>
  );
}

export default memo(DownloadNode);
