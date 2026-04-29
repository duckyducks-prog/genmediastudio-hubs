import { logger } from "@/lib/logger";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import { ExecutionResult, ExecutionContext } from "./types";
import { WorkflowNode, WorkflowEdge } from "../types";

export async function executeImageOutput(
  _node: WorkflowNode,
  inputs: Record<string, any>,
  _ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Get image from input - support both "image" and legacy names
  const imageUrl = inputs["image-input"] || inputs.image || null;
  return {
    success: true,
    data: {
      imageUrl,
      image: imageUrl,
      type: "image",
      outputs: {
        image: imageUrl,
      },
    },
  };
}

export async function executeVideoOutput(
  _node: WorkflowNode,
  inputs: Record<string, any>,
  _ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Get video from input - support both "video" and legacy names
  const videoUrl = inputs["video-input"] || inputs.video || null;
  logger.debug("[VideoOutput] Execution diagnosis:", {
    allInputKeys: Object.keys(inputs),
    hasVideoInput: !!inputs["video-input"],
    hasVideo: !!inputs.video,
    resolvedVideoUrl: videoUrl ? `${typeof videoUrl}[${String(videoUrl).length}] ${String(videoUrl).substring(0, 80)}...` : "NULL",
  });
  return {
    success: true,
    data: {
      videoUrl,
      video: videoUrl,
      type: "video",
      outputs: {
        video: videoUrl,
        "media-output": videoUrl, // Match the source handle ID used by VideoOutput
      },
    },
  };
}

export async function executeDownload(
  _node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Get media from input
  const mediaData = inputs["media-input"] || inputs || {};
  let mediaUrl =
    mediaData.image ||
    mediaData.video ||
    mediaData.imageUrl ||
    mediaData.videoUrl ||
    null;
  const isVideo = !!(mediaData.video || mediaData.videoUrl);
  const filters: FilterConfig[] =
    inputs.filters || mediaData.filters || [];

  // Apply filters before downloading
  if (mediaUrl && filters.length > 0) {
    if (!isVideo) {
      // Apply filters to images using PixiJS (client-side)
      logger.debug(
        "[Download] Applying",
        filters.length,
        "filters to image before download",
      );
      try {
        mediaUrl = await ctx.renderWithPixi(mediaUrl, filters);
      } catch (error) {
        console.error("[Download] Image filter rendering failed:", error);
        ctx.toast({
          title: "Filter Error",
          description:
            "Failed to apply filters. Downloading original image.",
          variant: "destructive",
        });
      }
    } else {
      // Apply filters to videos using backend FFmpeg
      logger.debug(
        "[Download] Applying",
        filters.length,
        "filters to video before download",
      );
      try {
        mediaUrl = await ctx.applyFiltersToVideo(mediaUrl, filters);
      } catch (error) {
        console.error("[Download] Video filter rendering failed:", error);
        ctx.toast({
          title: "Filter Error",
          description:
            "Failed to apply filters. Downloading original video.",
          variant: "destructive",
        });
      }
    }
  }

  if (mediaUrl) {
    try {
      // Determine file extension
      const extension = isVideo ? "mp4" : "png";
      const fileName = `generated-${isVideo ? "video" : "image"}-${Date.now()}.${extension}`;

      // Notify user about download attempt
      ctx.toast({
        title: "Download Started",
        description: `Downloading ${fileName}. If blocked by browser, use the download button on the output node.`,
      });

      // For base64 data URIs, download directly
      if (mediaUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = mediaUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // For external URLs, open in new tab (avoid CORS issues)
        const link = document.createElement("a");
        link.href = mediaUrl;
        link.download = fileName;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error("Download failed:", error);
      ctx.toast({
        title: "Download Failed",
        description:
          "Opening file in new tab instead. You can save it manually.",
        variant: "destructive",
      });
      // Fallback: open URL in new tab
      window.open(mediaUrl, "_blank");
    }
  }

  return { success: true, data: { downloaded: !!mediaUrl } };
}

export async function executeCompound(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  logger.debug("[Compound] Executing compound node:", node.id);

  // Use the real sub-workflow executor from the execution context
  const internalWorkflowExecutor = async (
    internalNodes: WorkflowNode[],
    internalEdges: WorkflowEdge[],
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    return ctx.executeSubWorkflow(internalNodes, internalEdges);
  };

  // Execute the compound node's internal workflow
  const result = await ctx.executeCompoundNode(
    node,
    inputs,
    internalWorkflowExecutor,
  );

  if (!result.success) {
    return {
      success: false,
      error: result.error || "Compound node execution failed",
    };
  }

  // Return the outputs from the compound node
  return {
    success: true,
    data: {
      outputs: result.data,
      ...result.data, // Also spread to top level for compatibility
    },
  };
}

export async function executePassThrough(
  _node: WorkflowNode,
  inputs: Record<string, any>,
  _ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Pass through all inputs as outputs (covers Preview, Download, and other display nodes)
  // This ensures video+filters data flows through to the node's data for useEffect to pick up
  const passThrough: Record<string, any> = {};
  if (inputs.image) passThrough.image = inputs.image;
  if (inputs.video) passThrough.video = inputs.video;
  if (inputs.text) passThrough.text = inputs.text;
  if (inputs.filters) passThrough.filters = inputs.filters;

  return {
    success: true,
    data: {
      ...passThrough,
      outputs: passThrough,
    },
  };
}
