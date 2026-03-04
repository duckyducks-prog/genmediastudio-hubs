import { logger } from "@/lib/logger";
import { API_ENDPOINTS } from "@/lib/api-config";
import { ExecutionResult, ExecutionContext } from "./types";
import { WorkflowNode } from "../types";

/**
 * Executor for Prompt (Text Input) nodes.
 * Simply returns the prompt text configured on the node.
 */
export async function executePrompt(
  node: WorkflowNode,
  _inputs: Record<string, any>,
  _ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const prompt = (node.data as any).prompt || "";
  return { success: true, data: { text: prompt } };
}

/**
 * Executor for ScriptQueue nodes.
 * Returns the current script from the queue based on the current index.
 */
export async function executeScriptQueue(
  node: WorkflowNode,
  _inputs: Record<string, any>,
  _ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const scripts = (node.data as any).scripts || [];
  const currentIndex = (node.data as any).currentIndex || 0;
  const currentScript = scripts[currentIndex] || "";

  if (scripts.length === 0) {
    return {
      success: false,
      error: "No scripts loaded. Paste scripts separated by --- into the Script Queue.",
    };
  }

  logger.debug("[ScriptQueue] Returning script", currentIndex + 1, "of", scripts.length);
  return { success: true, data: { text: currentScript } };
}

/**
 * Executor for ImageInput nodes.
 * Resolves the image from a GCS URL, imageRef, or existing data URL.
 */
export async function executeImageInput(
  node: WorkflowNode,
  _inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  let imageUrl = (node.data as any).imageUrl || null;
  const imageRef = (node.data as any).imageRef;

  // If imageUrl is a GCS URL (not a data URI), we need to fetch and convert it
  // This happens when loading saved workflows where imageUrl is resolved by backend
  if (imageUrl && !imageUrl.startsWith("data:") && imageUrl.startsWith("http")) {
    logger.debug(
      "[ImageInput] imageUrl is a GCS URL, fetching and converting to data URI:",
      imageUrl.substring(0, 80),
    );
    try {
      const response = await fetch(imageUrl, { mode: "cors" });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const blob = await response.blob();
      imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to convert image to data URI"));
        reader.readAsDataURL(blob);
      });
      logger.debug(
        "[ImageInput] ✓ Converted GCS URL to data URL, length:",
        imageUrl.length,
      );

      // Update node with resolved data URL
      ctx.updateNodeState(node.id, node.data.status || "ready", {
        imageUrl,
        outputs: { image: imageUrl },
      });
    } catch (error) {
      console.error("[ImageInput] ❌ Failed to fetch GCS URL:", error);
      // Try falling back to imageRef resolution
      if (imageRef) {
        logger.debug("[ImageInput] Falling back to imageRef resolution");
        imageUrl = null; // Clear to trigger resolution below
      } else {
        return {
          success: false,
          error: `Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }
  }

  // Resolve imageRef if imageUrl is missing or was cleared
  if (!imageUrl && imageRef) {
    logger.debug(
      "[ImageInput] ⚠️ imageUrl missing, resolving imageRef:",
      imageRef,
    );
    try {
      imageUrl = await ctx.resolveAssetToDataUrl(imageRef);
      logger.debug(
        "[ImageInput] ✓ Resolved to data URL, length:",
        imageUrl.length,
      );

      // Update node with resolved URL
      ctx.updateNodeState(node.id, node.data.status || "ready", {
        imageUrl,
        outputs: { image: imageUrl },
      });
    } catch (error) {
      console.error("[ImageInput] ❌ Resolution failed:", error);
      return {
        success: false,
        error: `Failed to load image: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  if (!imageUrl) {
    console.warn("[ImageInput] ⚠️ No imageUrl or imageRef available");
  }

  return { success: true, data: { image: imageUrl } };
}

/**
 * Executor for VideoInput nodes.
 * Resolves the video from a GCS URL, blob URL, videoRef, or existing data URL.
 * Preserves the original GCS URL for downstream processing (e.g., MergeVideos).
 */
export async function executeVideoInput(
  node: WorkflowNode,
  _inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  let videoUrl = (node.data as any).videoUrl || null;
  const videoRef = (node.data as any).videoRef;
  // Preserve the original URL for downstream processing (e.g., MergeVideos)
  // This avoids the 32MB request limit when merging multiple videos
  let originalUrl: string | null = null;

  logger.debug("[VideoInput] Starting execution:", {
    hasVideoUrl: !!videoUrl,
    videoUrlType: videoUrl ? (videoUrl.startsWith('data:') ? 'dataUrl' : videoUrl.startsWith('blob:') ? 'blobUrl' : videoUrl.startsWith('http') ? 'httpUrl' : 'unknown') : 'none',
    hasVideoRef: !!videoRef,
  });

  // If videoUrl is an HTTP URL (GCS), preserve it for downstream AND convert for preview
  if (videoUrl && !videoUrl.startsWith("data:") && videoUrl.startsWith("http")) {
    // Save the original GCS URL for downstream nodes like MergeVideos
    originalUrl = videoUrl;
    logger.debug(
      "[VideoInput] Preserving GCS URL for downstream:",
      originalUrl!.substring(0, 80),
    );

    // Also convert to data URL for preview (but keep original for processing)
    try {
      const response = await fetch(videoUrl, { mode: "cors" });
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`);
      }
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to convert video to data URI"));
        reader.readAsDataURL(blob);
      });
      videoUrl = dataUrl;  // Use data URL for preview
      logger.debug(
        "[VideoInput] ✓ Also converted to data URL for preview, length:",
        videoUrl.length,
      );
    } catch (error) {
      // If fetch fails, we can still use the HTTP URL directly
      logger.warn("[VideoInput] Failed to convert to data URL, will use HTTP URL:", error);
    }
  } else if (videoUrl && videoUrl.startsWith("blob:")) {
    // Blob URLs need to be converted
    logger.debug(
      "[VideoInput] videoUrl is a blob URL, converting to data URI:",
      videoUrl.substring(0, 80),
    );
    try {
      const response = await fetch(videoUrl, { mode: "cors" });
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`);
      }
      const blob = await response.blob();
      videoUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to convert video to data URI"));
        reader.readAsDataURL(blob);
      });
      logger.debug(
        "[VideoInput] ✓ Converted blob to data URL, length:",
        videoUrl.length,
      );
    } catch (error) {
      console.error("[VideoInput] ❌ Failed to fetch blob URL:", error);
      if (videoRef) {
        videoUrl = null;
      } else {
        return {
          success: false,
          error: `Failed to load video: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }
  }

  // Resolve videoRef if videoUrl is missing or was cleared
  if (!videoUrl && videoRef) {
    logger.debug(
      "[VideoInput] ⚠️ videoUrl missing, resolving videoRef:",
      videoRef,
    );
    try {
      // Get the asset info to get the GCS URL
      const token = await ctx.getAuthToken();

      const response = await fetch(API_ENDPOINTS.library.list(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const assets = await response.json();
        const asset = assets.find((a: any) => a.id === videoRef);
        if (asset?.url) {
          // Preserve the GCS URL for downstream
          originalUrl = asset.url;
          logger.debug("[VideoInput] Got GCS URL from asset:", originalUrl!.substring(0, 80));
        }
      }

      // Still resolve to data URL for preview
      videoUrl = await ctx.resolveAssetToDataUrl(videoRef);
      logger.debug(
        "[VideoInput] ✓ Resolved to data URL, length:",
        videoUrl.length,
      );
    } catch (error) {
      console.error("[VideoInput] ❌ Resolution failed:", error);
      return {
        success: false,
        error: `Failed to load video: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  if (!videoUrl) {
    console.warn("[VideoInput] ⚠️ No videoUrl or videoRef available");
    return {
      success: false,
      error: "No video selected. Please upload a video or select from library.",
    };
  }

  // Output the GCS URL if available (for downstream processing like MergeVideos)
  // Fall back to data URL if no GCS URL available
  const outputUrl = originalUrl || videoUrl;
  logger.debug("[VideoInput] Output URL type:", originalUrl ? "GCS URL" : "data URL");

  // Update node state
  ctx.updateNodeState(node.id, node.data.status || "ready", {
    videoUrl,  // Data URL for preview
    gcsUrl: originalUrl,  // GCS URL for downstream
    outputs: { video: outputUrl },  // Use GCS URL for downstream if available
  });

  return {
    success: true,
    data: {
      video: videoUrl,  // Data URL for preview
      gcsUrl: originalUrl,  // GCS URL for downstream
      outputs: { video: outputUrl },  // Use GCS URL for downstream if available
    },
  };
}
