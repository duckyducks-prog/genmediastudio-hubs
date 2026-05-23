import { logger } from "@/lib/logger";
import { API_ENDPOINTS } from "@/lib/api-config";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import { ExecutionResult, ExecutionContext } from "./types";
import { WorkflowNode, validateMutualExclusion, BurnCaptionsNodeData } from "../types";

/** Load a video URL and return its duration in seconds */
function getVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      video.src = "";
      resolve(duration && isFinite(duration) ? duration : 0);
    };
    video.onerror = () => {
      video.src = "";
      resolve(0);
    };
    video.src = url;
  });
}

export async function executeGenerateVideo(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  logger.debug("[GenerateVideo] Starting execution with inputs:", {
    inputKeys: Object.keys(inputs),
    hasPrompt: !!inputs.prompt,
    hasFirstFrame: !!inputs.first_frame,
    hasLastFrame: !!inputs.last_frame,
    hasReferenceImages: !!inputs.reference_images,
    hasFormat: !!inputs.format,
    hasFilters: !!inputs.filters,
    firstFrameType: typeof inputs.first_frame,
    firstFrameLength: inputs.first_frame?.length || 0,
    firstFramePreview:
      typeof inputs.first_frame === "string"
        ? inputs.first_frame.substring(0, 50) + "..."
        : inputs.first_frame,
  });

  let prompt = inputs.prompt || "";
  let firstFrame = inputs.first_frame || null;
  let lastFrame = inputs.last_frame || null;
  let referenceImages = inputs.reference_images || null;
  const formatData = inputs.format;
  const filters: FilterConfig[] = inputs.filters || [];

  // Validate that at least one input is provided (prompt OR images)
  if (!prompt && !firstFrame && !lastFrame && !referenceImages) {
    return {
      success: false,
      error:
        "Video generation requires at least a prompt or image inputs (first frame, last frame, or reference images)",
    };
  }

  // Get aspect ratio for both prompt enhancement and logging
  const aspectRatio =
    formatData?.aspect_ratio || (node.data as unknown as Record<string, unknown>).aspectRatio || "16:9";

  // Append aspect ratio to prompt if prompt exists
  if (prompt) {
    const aspectRatioLabel =
      aspectRatio === "16:9"
        ? "landscape"
        : aspectRatio === "9:16"
          ? "portrait"
          : "";
    prompt = `${prompt}, ${aspectRatio} aspect ratio${aspectRatioLabel ? ` (${aspectRatioLabel})` : ""}`;
  } else {
    // Use a default prompt when only images are provided
    prompt = "Generate a video from the provided images";
  }

  logger.debug("[GenerateVideo] After variable assignment:", {
    originalPrompt: inputs.prompt,
    finalPrompt: prompt,
    hasFirstFrame: !!firstFrame,
    hasLastFrame: !!lastFrame,
    hasReferenceImages: !!referenceImages,
    firstFrameLength: firstFrame?.length || 0,
    hasFormatData: !!formatData,
    formatData: formatData,
    aspectRatio: aspectRatio,
  });

  // NEW: Apply filters before sending to API (Layer 3 integration)
  if (filters.length > 0) {
    logger.debug(
      "[GenerateVideo] Applying",
      filters.length,
      "filters before API call",
    );

    try {
      // Process first_frame if filters exist
      if (firstFrame && typeof firstFrame === "string") {
        firstFrame = await ctx.renderWithPixi(firstFrame, filters);
      }

      // Process last_frame if filters exist
      if (lastFrame && typeof lastFrame === "string") {
        lastFrame = await ctx.renderWithPixi(lastFrame, filters);
      }

      // Process reference_images if filters exist
      if (referenceImages) {
        if (Array.isArray(referenceImages)) {
          referenceImages = await Promise.all(
            referenceImages.map((img: string) =>
              ctx.renderWithPixi(img, filters),
            ),
          );
        } else if (typeof referenceImages === "string") {
          referenceImages = await ctx.renderWithPixi(
            referenceImages,
            filters,
          );
        }
      }
    } catch (error) {
      console.error(
        "[GenerateVideo] Filter rendering failed:",
        error,
      );
      return {
        success: false,
        error:
          "Failed to apply image filters: " +
          (error instanceof Error ? error.message : "Unknown error"),
      };
    }
  }

  // Strip data URI prefix from image inputs if present
  // and ensure we only have valid base64 strings
  if (firstFrame && typeof firstFrame === "string") {
    if (firstFrame.startsWith("data:")) {
      firstFrame = firstFrame.split(",")[1];
    }
  } else {
    firstFrame = null;
  }

  if (lastFrame && typeof lastFrame === "string") {
    if (lastFrame.startsWith("data:")) {
      lastFrame = lastFrame.split(",")[1];
    }
  } else {
    lastFrame = null;
  }

  if (referenceImages) {
    if (Array.isArray(referenceImages)) {
      // Filter out null/undefined and extract base64
      referenceImages = referenceImages
        .filter((img: any) => img && typeof img === "string")
        .map((img: string) => {
          if (img.startsWith("data:")) {
            return img.split(",")[1];
          }
          return img;
        });

      // If array is empty after filtering, set to null
      if (referenceImages.length === 0) {
        referenceImages = null;
      }
    } else if (typeof referenceImages === "string") {
      if (referenceImages.startsWith("data:")) {
        referenceImages = referenceImages.split(",")[1];
      }
    } else {
      // If not string or array, set to null
      referenceImages = null;
    }
  }

  // Validate reference_images limit (Veo supports max 3)
  if (referenceImages && Array.isArray(referenceImages)) {
    if (referenceImages.length > 3) {
      return {
        success: false,
        error: `Too many reference images (${referenceImages.length}). Veo supports a maximum of 3 reference images. Please disconnect some images.`,
      };
    }

    logger.debug(
      `[GenerateVideo] Reference images count: ${referenceImages.length}/3`,
    );
  }

  // Validate mutual exclusion
  const validation = validateMutualExclusion(node.type as any, {
    first_frame: firstFrame,
    last_frame: lastFrame,
    reference_images: referenceImages,
  });

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    const token = await ctx.getAuthToken();

    logger.debug(
      "[GenerateVideo] Preparing request body (backend API fields: first_frame/last_frame):",
      {
        hasPrompt: !!prompt,
        hasFirstFrame: !!firstFrame,
        hasLastFrame: !!lastFrame,
        hasReferenceImages: !!referenceImages,
        firstFrameLength:
          typeof firstFrame === "string" ? firstFrame.length : 0,
        lastFrameLength:
          typeof lastFrame === "string" ? lastFrame.length : 0,
      },
    );

    // Build request body - only include optional fields if we have valid data
    // Cast node.data for property access since WorkflowNodeData is a union type
    const nodeData = node.data as unknown as Record<string, unknown>;
    const requestBody: any = {
      aspect_ratio:
        formatData?.aspect_ratio || nodeData.aspectRatio || "16:9",
      duration_seconds:
        formatData?.duration_seconds ||
        nodeData.durationSeconds ||
        8,
      generate_audio:
        formatData?.generate_audio ?? nodeData.generateAudio ?? true,
      mode: ctx.mode,
    };

    // Add seed if provided (for consistent voice/style)
    // Priority: node.data.seed (if useConsistentVoice is true) > formatData.seed
    if (
      nodeData.useConsistentVoice &&
      nodeData.seed !== undefined &&
      nodeData.seed !== null
    ) {
      requestBody.seed = nodeData.seed;
      logger.debug(
        "[GenerateVideo] Using seed from node:",
        nodeData.seed,
        "for consistent generation",
      );
    } else if (
      formatData?.seed !== undefined &&
      formatData?.seed !== null
    ) {
      requestBody.seed = formatData.seed;
      logger.debug(
        "[GenerateVideo] Using seed from format:",
        formatData.seed,
        "for consistent generation",
      );
    }

    // Only include prompt if provided
    if (prompt) {
      requestBody.prompt = prompt;
    }

    // Only add image fields if we have valid data (not null or empty)
    // Backend API expects "first_frame" and "last_frame" fields
    if (firstFrame) {
      requestBody.first_frame = firstFrame;
      logger.debug(
        "[GenerateVideo] Including first_frame in request (base64 length:",
        firstFrame.length,
        ")",
      );
    }
    if (lastFrame) {
      requestBody.last_frame = lastFrame;
      logger.debug(
        "[GenerateVideo] Including last_frame in request (base64 length:",
        lastFrame.length,
        ")",
      );
    }
    if (referenceImages) {
      requestBody.reference_images = referenceImages;
      logger.debug(
        "[GenerateVideo] Including reference_images in request (count:",
        Array.isArray(referenceImages) ? referenceImages.length : 1,
        ")",
      );
    }

    logger.debug("[GenerateVideo] Full request body (truncated):", {
      prompt: requestBody.prompt?.substring(0, 50),
      first_frame: requestBody.first_frame
        ? `${typeof requestBody.first_frame} (${requestBody.first_frame.length} chars)`
        : null,
      last_frame: requestBody.last_frame
        ? `${typeof requestBody.last_frame} (${requestBody.last_frame.length} chars)`
        : null,
      reference_images: requestBody.reference_images
        ? Array.isArray(requestBody.reference_images)
          ? `array (${requestBody.reference_images.length} images)`
          : `string (${requestBody.reference_images.length} chars)`
        : null,
      aspect_ratio: requestBody.aspect_ratio,
      duration_seconds: requestBody.duration_seconds,
      generate_audio: requestBody.generate_audio,
    });

    const response = await fetch(API_ENDPOINTS.generate.video, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (response.status === 403) {
      return {
        success: false,
        error: "Access denied. Contact administrator.",
      };
    }

    if (!response.ok) {
      // Try to extract error message from response body
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage =
            typeof errorData.error === "string"
              ? errorData.error
              : JSON.stringify(errorData.error);
        } else if (errorData.detail) {
          errorMessage =
            typeof errorData.detail === "string"
              ? errorData.detail
              : JSON.stringify(errorData.detail);
        } else if (errorData.message) {
          errorMessage =
            typeof errorData.message === "string"
              ? errorData.message
              : JSON.stringify(errorData.message);
        }
        console.error(
          "[GenerateVideo] API error response:",
          errorData,
        );
      } catch (parseError) {
        console.error(
          "[GenerateVideo] Could not parse error response:",
          parseError,
        );
      }
      throw new Error(errorMessage);
    }

    const apiData = await response.json();

    if (!apiData.operation_name) {
      return {
        success: false,
        error: "No operation name returned from API",
      };
    }

    // Prefer SSE streaming for real-time status, fall back to polling
    const onProgress = (attempts: number) => {
      ctx.updateNodeState(node.id, "executing", {
        pollAttempts: attempts,
      });
    };

    let result;
    if (ctx.streamVideoStatus) {
      try {
        result = await ctx.streamVideoStatus(
          apiData.operation_name,
          prompt || "",
          onProgress,
        );
      } catch {
        // SSE failed (e.g. network issue, backend doesn't support it yet)
        // Fall back to polling
        logger.debug("[GenerateVideo] SSE failed, falling back to polling");
        result = await ctx.pollVideoStatus(
          apiData.operation_name,
          prompt || "",
          onProgress,
        );
      }
    } else {
      result = await ctx.pollVideoStatus(
        apiData.operation_name,
        prompt || "",
        onProgress,
      );
    }

    if (result.success && result.videoUrl) {
      // Backend auto-saves videos to library with prompt metadata
      // Notify that an asset was generated to refresh the library
      if (ctx.onAssetGenerated) {
        logger.debug(
          "[useWorkflowExecution] Video generated, triggering asset refresh",
        );
        ctx.onAssetGenerated();
      }

      // Use GCS URL for downstream processing (avoids 32MB limit)
      // Fall back to data URL if GCS URL not available
      const outputUrl = result.gcsUrl || result.videoUrl;
      logger.debug("[GenerateVideo] Output URLs:", {
        gcsUrl: result.gcsUrl ? result.gcsUrl.substring(0, 80) + "..." : null,
        videoUrl: result.videoUrl.substring(0, 50) + "...",
        usingGcsUrl: !!result.gcsUrl,
      });

      return {
        success: true,
        data: {
          video: result.videoUrl,  // Data URL for preview
          videoUrl: result.videoUrl,  // Data URL for preview
          gcsUrl: result.gcsUrl,  // GCS URL for downstream processing
          generatedMode: ctx.mode,
          outputs: {
            video: outputUrl, // Use GCS URL for downstream (merge, etc.)
          },
        },
      };
    } else {
      return {
        success: false,
        error: result.error || "Video generation failed",
      };
    }
  } catch (error) {
    console.error("[GenerateVideo] Error during execution:", error);
    let errorMessage = "Video generation failed";

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    } else if (error && typeof error === "object") {
      // Handle error objects that might have message, error, or detail properties
      const errorObj = error as any;
      errorMessage =
        errorObj.message ||
        errorObj.error ||
        errorObj.detail ||
        JSON.stringify(error);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function executeMergeVideos(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Enhanced logging to debug input gathering
  logger.debug("[MergeVideos] Input analysis:", {
    inputKeys: Object.keys(inputs),
    video1: inputs.video1 ? { type: typeof inputs.video1, length: inputs.video1.length, prefix: inputs.video1.substring(0, 50) } : "MISSING",
    video2: inputs.video2 ? { type: typeof inputs.video2, length: inputs.video2.length, prefix: inputs.video2.substring(0, 50) } : "MISSING",
    video3: inputs.video3 ? { type: typeof inputs.video3, length: inputs.video3.length, prefix: inputs.video3.substring(0, 50) } : "MISSING",
    video4: inputs.video4 ? { type: typeof inputs.video4, length: inputs.video4.length, prefix: inputs.video4.substring(0, 50) } : "MISSING",
    video5: inputs.video5 ? { type: typeof inputs.video5, length: inputs.video5.length, prefix: inputs.video5.substring(0, 50) } : "MISSING",
    video6: inputs.video6 ? { type: typeof inputs.video6, length: inputs.video6.length, prefix: inputs.video6.substring(0, 50) } : "MISSING",
    fullInputsObject: inputs,
  });

  // Get videos from input connectors (support up to 6)
  const video1 = inputs.video1;
  const video2 = inputs.video2;
  const video3 = inputs.video3;
  const video4 = inputs.video4;
  const video5 = inputs.video5;
  const video6 = inputs.video6;

  // Collect all connected videos
  const videos: string[] = [];
  if (video1) videos.push(video1);
  if (video2) videos.push(video2);
  if (video3) videos.push(video3);
  if (video4) videos.push(video4);
  if (video5) videos.push(video5);
  if (video6) videos.push(video6);

  logger.debug("[MergeVideos] Collected videos array:", {
    count: videos.length,
    videoPreviews: videos.map((v, i) => ({
      index: i,
      type: typeof v,
      isUrl: v.startsWith("http"),
      isDataUrl: v.startsWith("data:"),
      prefix: v.substring(0, 60),
    })),
  });

  if (videos.length < 2) {
    logger.error("[MergeVideos] Insufficient videos - only", videos.length, "found");
    return { success: false, error: "At least 2 videos required to merge" };
  }

  // Prepare videos in order using new API format to preserve order
  const orderedVideos: Array<{ base64?: string; url?: string }> = [];

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    if (v.startsWith('https://') || v.startsWith('http://')) {
      // GCS/HTTP URL - backend will download directly
      orderedVideos.push({ url: v });
    } else if (v.startsWith('data:')) {
      // Data URL - extract base64
      const base64Data = v.replace(/^data:video\/[^;]+;base64,/, "")
        .replace(/^data:application\/[^;]+;base64,/, "");
      orderedVideos.push({ base64: base64Data });
    } else {
      logger.error(`[MergeVideos] Video ${i + 1} has invalid format:`, v.substring(0, 50));
      return {
        success: false,
        error: `Video ${i + 1} is not ready. Please run the source node first.`
      };
    }
  }

  logger.debug("[MergeVideos] Ordered videos for API:", {
    count: orderedVideos.length,
    videoTypes: orderedVideos.map((v, i) => ({
      index: i,
      hasUrl: !!v.url,
      hasBase64: !!v.base64,
      urlPreview: v.url ? v.url.substring(0, 60) : null,
      base64Preview: v.base64 ? `base64 (${v.base64.length} chars)` : null,
    })),
  });

  // CRITICAL: Check if we're trying to send 3+ videos as base64
  // This will fail due to Cloud Run's 32MB request limit
  const base64VideoCount = orderedVideos.filter(v => v.base64).length;
  if (base64VideoCount >= 3) {
    logger.error("[MergeVideos] Cannot merge 3+ videos as base64 - would exceed 32MB limit");
    logger.error("[MergeVideos] Videos are data URLs instead of GCS URLs.");
    return {
      success: false,
      error: "Cannot merge 3+ videos: size limit exceeded. Please use videos from your library (not locally uploaded files) which have GCS URLs, or re-generate videos after deploying latest backend."
    };
  }

  try {
    const token = await ctx.getAuthToken();

    // Get options from node data
    const aspectRatio = (node.data as any).aspectRatio || "16:9";
    const trimSilence = (node.data as any).trimSilence || false;

    // Use new ordered API format
    const requestBody = {
      videos: orderedVideos,
      aspect_ratio: aspectRatio,
      trim_silence: trimSilence,
    };

    logger.info(`[MergeVideos] Sending ${orderedVideos.length} videos in order, aspect ratio: ${aspectRatio}, trim silence: ${trimSilence}`);

    const response = await fetch(API_ENDPOINTS.video.merge, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const apiData = await response.json();

    if (apiData.video_base64) {
      const videoUrl = `data:video/mp4;base64,${apiData.video_base64}`;

      if (ctx.onAssetGenerated) {
        ctx.onAssetGenerated();
      }

      ctx.toast({
        title: "Videos Merged",
        description: `Successfully merged ${videos.length} videos`,
      });

      return {
        success: true,
        data: {
          outputVideoUrl: videoUrl,
          outputs: {
            video: videoUrl,
          },
        },
      };
    } else {
      return { success: false, error: "No video returned from API" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Merge failed",
    };
  }
}

export async function executeAddMusicToVideo(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const videoInput = inputs.video;
  const audioInput = inputs.audio;

  if (!videoInput) {
    return { success: false, error: "No video input connected" };
  }

  if (!audioInput) {
    return { success: false, error: "No audio input connected" };
  }

  const musicVolume = (node.data as any).musicVolume ?? 50;
  const originalVolume = (node.data as any).originalVolume ?? 100;

  logger.debug("[AddMusicToVideo] Starting execution:", {
    hasVideo: !!videoInput,
    hasAudio: !!audioInput,
    musicVolume,
    originalVolume,
  });

  try {
    const token = await ctx.getAuthToken();

    // Build request body - handle both URL and base64 inputs
    const requestBody: any = {
      music_volume: musicVolume,
      original_volume: originalVolume,
      fade_out: (node.data as any).fadeOut ?? 3,
    };

    // Handle video input
    if (videoInput.startsWith("data:")) {
      requestBody.video_base64 = videoInput
        .replace(/^data:video\/[^;]+;base64,/, "")
        .replace(/^data:application\/[^;]+;base64,/, "");
    } else {
      requestBody.video_url = videoInput;
    }

    // Handle audio input
    if (audioInput.startsWith("data:")) {
      requestBody.audio_base64 = audioInput
        .replace(/^data:audio\/[^;]+;base64,/, "")
        .replace(/^data:application\/[^;]+;base64,/, "");
    } else {
      requestBody.audio_url = audioInput;
    }

    const response = await fetch(API_ENDPOINTS.video.addMusic, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const apiData = await response.json();

    if (apiData.video_base64) {
      const videoUrl = `data:video/mp4;base64,${apiData.video_base64}`;

      if (ctx.onAssetGenerated) {
        ctx.onAssetGenerated();
      }

      ctx.toast({
        title: "Music Added",
        description: "Music has been added to the video",
      });

      return {
        success: true,
        data: {
          outputVideoUrl: videoUrl,
          outputs: {
            video: videoUrl,
          },
        },
      };
    } else {
      return { success: false, error: "No video returned from API" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Add music failed",
    };
  }
}

export async function executeVoiceChanger(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Get video from input connector
  const videoInput = inputs.video;
  const selectedVoiceId = (node.data as any).selectedVoiceId;

  if (!videoInput) {
    return { success: false, error: "No video input connected" };
  }

  if (!selectedVoiceId) {
    return { success: false, error: "No voice selected" };
  }

  logger.debug("[VoiceChanger] Starting execution:", {
    hasVideo: !!videoInput,
    voiceId: selectedVoiceId,
  });

  try {
    const token = await ctx.getAuthToken();

    // Build request body - handle both URL and base64 video inputs
    const requestBody: any = {
      voice_id: selectedVoiceId,
    };

    if (videoInput.startsWith("data:")) {
      // Base64 data URL - strip the prefix and send as video_base64
      requestBody.video_base64 = videoInput.replace(/^data:video\/[^;]+;base64,/, "");
    } else {
      // Regular URL (GCS, HTTP, etc.) - send as video_url
      requestBody.video_url = videoInput;
    }

    const response = await fetch(API_ENDPOINTS.elevenlabs.voiceChange, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[VoiceChanger] API Error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });

      // Parse error detail if JSON
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorJson.message || errorText;
      } catch {
        // Keep original text
      }

      if (response.status === 403) {
        return {
          success: false,
          error: `Access denied: ${errorDetail}`,
        };
      }

      if (response.status === 401) {
        return {
          success: false,
          error: "Unauthorized. Please sign out and sign in again.",
        };
      }

      throw new Error(`API error: ${response.status} - ${errorDetail}`);
    }

    const apiData = await response.json();

    logger.debug("[VoiceChanger] API Response:", {
      hasVideo: !!apiData.video_base64,
      videoLength: apiData.video_base64?.length || 0,
    });

    if (apiData.video_base64) {
      const videoUrl = `data:video/mp4;base64,${apiData.video_base64}`;

      // Notify that an asset was generated
      if (ctx.onAssetGenerated) {
        logger.debug(
          "[useWorkflowExecution] Voice changed video generated, triggering asset refresh",
        );
        ctx.onAssetGenerated();
      }

      const resultData = {
        outputVideoUrl: videoUrl,
        outputs: {
          video: videoUrl,
        },
      };

      ctx.toast({
        title: "Voice Changed",
        description: "Video voice has been changed successfully",
      });

      return {
        success: true,
        data: resultData,
      };
    } else {
      return { success: false, error: "No video returned from API" };
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Voice change failed",
    };
  }
}

export async function executeVideoWatermark(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const videoInput = inputs.video;
  const watermarkInput = inputs.watermark;

  logger.debug("[VideoWatermark] Input diagnosis:", {
    allInputKeys: Object.keys(inputs),
    videoInput: videoInput ? `${typeof videoInput} (${String(videoInput).substring(0, 80)}...)` : "MISSING/NULL",
    watermarkInput: watermarkInput ? `${typeof watermarkInput} (${String(watermarkInput).substring(0, 80)}...)` : "MISSING/NULL",
    rawInputs: Object.fromEntries(
      Object.entries(inputs).map(([k, v]) => [k, v ? `${typeof v}[${String(v).length}]` : 'null/undefined'])
    ),
  });

  if (!videoInput) {
    return {
      success: false,
      error: "No video connected to Video Compositing node",
    };
  }

  if (!watermarkInput) {
    return {
      success: false,
      error: "No watermark image connected to Video Compositing node",
    };
  }

  try {
    logger.debug("[VideoWatermark] Adding watermark to video");

    const token = await ctx.getAuthToken();

    const requestBody: any = {
      position: (node.data as any).position || "bottom-right",
      opacity: (node.data as any).opacity ?? 1.0,
      scale: (node.data as any).scale ?? 0.15,
      margin: (node.data as any).margin ?? 20,
      mode: (node.data as any).mode || "watermark",
    };

    // Handle video input - URL or base64
    if (videoInput.startsWith("data:")) {
      requestBody.video_base64 = videoInput;
    } else {
      requestBody.video_url = videoInput;
    }

    // Handle watermark input - URL or base64
    if (watermarkInput.startsWith("data:")) {
      requestBody.watermark_base64 = watermarkInput;
    } else {
      requestBody.watermark_url = watermarkInput;
    }

    const response = await fetch(API_ENDPOINTS.video.addWatermark, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to add watermark: ${response.status}`);
    }

    const result = await response.json();
    const outputVideoUrl = `data:video/mp4;base64,${result.video_base64}`;

    logger.debug("[VideoWatermark] Watermark added successfully");

    return {
      success: true,
      data: {
        videoUrl: outputVideoUrl,
        outputs: {
          video: outputVideoUrl,
        },
      },
    };
  } catch (error) {
    console.error("[VideoWatermark] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add watermark",
    };
  }
}

export async function executeVideoSegmentReplace(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const baseVideo = inputs.base;
  const replacementVideo = inputs.replacement;

  if (!baseVideo) {
    return {
      success: false,
      error: "No base video connected to Video Segment Replace node",
    };
  }

  if (!replacementVideo) {
    return {
      success: false,
      error: "No replacement video connected to Video Segment Replace node",
    };
  }

  try {
    logger.debug("[VideoSegmentReplace] Replacing video segment");

    const nodeData = node.data as any;

    const actualDuration = await getVideoDuration(baseVideo);
    if (!actualDuration || actualDuration <= 0) {
      return {
        success: false,
        error: "Could not detect base video duration to convert segment percentages",
      };
    }
    const startPct = nodeData.startPercent ?? 20;
    const endPct = nodeData.endPercent ?? 40;
    const startTime = Math.round((startPct / 100) * actualDuration * 10) / 10;
    const endTime = Math.round((endPct / 100) * actualDuration * 10) / 10;
    logger.debug(
      `[VideoSegmentReplace] ${startPct}%-${endPct}% → ${startTime}s-${endTime}s (duration: ${actualDuration}s)`
    );

    const token = await ctx.getAuthToken();

    const requestBody: any = {
      start_time: startTime,
      end_time: endTime,
      audio_mode: nodeData.audioMode || "keep_base",
      fit_mode: nodeData.fitMode || "trim",
      crop_mode: "center_crop",
    };

    if (baseVideo.startsWith("data:")) {
      requestBody.base_video_base64 = baseVideo;
    } else {
      requestBody.base_video_url = baseVideo;
    }

    if (replacementVideo.startsWith("data:")) {
      requestBody.replacement_video_base64 = replacementVideo;
    } else {
      requestBody.replacement_video_url = replacementVideo;
    }

    const response = await fetch(API_ENDPOINTS.video.segmentReplace, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to replace segment: ${response.status}`);
    }

    const result = await response.json();
    const outputVideoUrl = `data:video/mp4;base64,${result.video_base64}`;

    logger.debug("[VideoSegmentReplace] Segment replaced successfully");

    return {
      success: true,
      data: {
        videoUrl: outputVideoUrl,
        outputs: {
          video: outputVideoUrl,
        },
      },
    };
  } catch (error) {
    console.error("[VideoSegmentReplace] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to replace segment",
    };
  }
}

export async function executeExtractLastFrame(
  _node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const videoInput = inputs.video;

  if (!videoInput) {
    return {
      success: false,
      error: "No video connected to Extract Last Frame node",
    };
  }

  try {
    logger.debug(
      "[ExtractLastFrame] Extracting last frame from video, length:",
      typeof videoInput === "string"
        ? videoInput.length
        : "not a string",
    );

    // Extract last frame from video
    const extractedFrame =
      await ctx.extractLastFrameFromVideo(videoInput);

    logger.debug(
      "[ExtractLastFrame] Frame extracted, length:",
      extractedFrame.length,
    );

    return {
      success: true,
      data: {
        videoUrl: videoInput, // Pass through input video
        extractedFrameUrl: extractedFrame,
        outputs: {
          image: extractedFrame, // Output extracted frame
        },
      },
    };
  } catch (error) {
    console.error("[ExtractLastFrame] Failed:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to extract frame",
    };
  }
}

export async function executeBurnCaptions(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const videoInput = inputs.video;

  if (!videoInput) {
    return { success: false, error: "No video connected to Burn Captions node" };
  }

  const data = node.data as BurnCaptionsNodeData;

  try {
    logger.debug("[BurnCaptions] Burning captions into video");

    const token = await ctx.getAuthToken();

    const requestBody: Record<string, unknown> = {
      font_size: data.fontSize ?? 48,
      position: data.position ?? "bottom",
      background_color: data.backgroundColor ?? "teal",
    };

    if (videoInput.startsWith("data:")) {
      requestBody.video_base64 = videoInput;
    } else {
      requestBody.video_url = videoInput;
    }

    const response = await fetch(API_ENDPOINTS.video.burnCaptions, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Burn captions failed: ${response.status}`);
    }

    const result = await response.json();
    const outputVideoUrl = `data:video/mp4;base64,${result.video_base64}`;

    logger.debug("[BurnCaptions] Captions burned successfully");

    return {
      success: true,
      data: {
        videoUrl: outputVideoUrl,
        srtData: result.srt_data ?? null,   // stored for Premiere SRT export
        outputs: { video: outputVideoUrl },
      },
    };
  } catch (error) {
    console.error("[BurnCaptions] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to burn captions",
    };
  }
}
