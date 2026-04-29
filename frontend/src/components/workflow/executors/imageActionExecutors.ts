import { logger } from "@/lib/logger";
import { API_ENDPOINTS } from "@/lib/api-config";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import { ExecutionResult, ExecutionContext } from "./types";
import { WorkflowNode } from "../types";

export async function executeImageComposite(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const imageInputs = inputs.images;
  const filters: FilterConfig[] = inputs.filters || [];
  const blendMode = (node.data as any).blendMode || "normal";
  const opacity = (node.data as any).opacity || 1.0;

  logger.debug("[ImageComposite] Execution inputs:", {
    imageInputsType: typeof imageInputs,
    imageInputsIsArray: Array.isArray(imageInputs),
    imageCount: Array.isArray(imageInputs) ? imageInputs.length : 0,
    blendMode,
    opacity,
    filterCount: filters.length,
  });

  // Validate at least 2 images
  if (!Array.isArray(imageInputs) || imageInputs.length < 2) {
    return {
      success: false,
      error: "Composite node requires at least 2 images",
    };
  }

  try {
    // Apply filters to each input image if needed
    let processedImages = imageInputs;
    if (filters.length > 0) {
      logger.debug(
        `[ImageComposite] Applying ${filters.length} filters to ${imageInputs.length} images`,
      );
      processedImages = await Promise.all(
        imageInputs.map((img: string) => ctx.renderWithPixi(img, filters)),
      );
    }

    // Composite images with blend mode
    logger.debug(
      `[ImageComposite] Compositing ${processedImages.length} images with mode: ${blendMode}, opacity: ${opacity}`,
    );
    const compositeResult = await ctx.renderCompositeWithPixi(
      processedImages,
      blendMode,
      opacity,
      [], // Don't apply filters again to composite (already applied to inputs)
    );

    return {
      success: true,
      data: {
        image: compositeResult,
        compositePreview: `${imageInputs.length} layers blended`,
        outputs: { image: compositeResult },
      },
    };
  } catch (error) {
    console.error("[ImageComposite] Composite failed:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Image compositing failed",
    };
  }
}

export async function executeGenerateImage(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  let prompt = inputs.prompt;
  let referenceImages = inputs.reference_images || null;
  const formatData = inputs.format;
  const filters: FilterConfig[] = inputs.filters || [];

  if (!prompt) {
    return { success: false, error: "No prompt connected" };
  }

  // Always append aspect ratio to prompt (from format connector or node dropdown)
  const aspectRatio =
    formatData?.aspect_ratio || (node.data as unknown as Record<string, unknown>).aspectRatio || "1:1";
  const aspectRatioLabel =
    aspectRatio === "16:9"
      ? "landscape"
      : aspectRatio === "9:16"
        ? "portrait"
        : aspectRatio === "1:1"
          ? "square"
          : aspectRatio === "3:4"
            ? "portrait"
            : aspectRatio === "4:3"
              ? "landscape"
              : "";
  prompt = `${prompt}, ${aspectRatio} aspect ratio${aspectRatioLabel ? ` (${aspectRatioLabel})` : ""}`;

  logger.debug("[GenerateImage] Execution inputs:", {
    originalPrompt: inputs.prompt,
    finalPrompt: prompt,
    hasReferenceImages: !!referenceImages,
    referenceImagesType: typeof referenceImages,
    referenceImagesIsArray: Array.isArray(referenceImages),
    hasFormatData: !!formatData,
    formatData: formatData,
    aspectRatio: aspectRatio,
  });

  // NEW: Apply filters before sending to API (Layer 3 integration)
  if (referenceImages && filters.length > 0) {
    logger.debug(
      "[GenerateImage] Applying",
      filters.length,
      "filters before API call",
    );

    try {
      if (Array.isArray(referenceImages)) {
        // Process each reference image
        referenceImages = await Promise.all(
          referenceImages.map((img: string) => ctx.renderWithPixi(img, filters)),
        );
      } else {
        // Single image
        referenceImages = await ctx.renderWithPixi(
          referenceImages,
          filters,
        );
      }
    } catch (error) {
      console.error(
        "[GenerateImage] Filter rendering failed:",
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

  // Strip data URI prefix from reference images if present
  // and ensure we only have valid base64 strings
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

  logger.debug("[GenerateImage] Processed reference images:", {
    hasReferenceImages: !!referenceImages,
    type: typeof referenceImages,
    isArray: Array.isArray(referenceImages),
    count: Array.isArray(referenceImages)
      ? referenceImages.length
      : referenceImages
        ? 1
        : 0,
  });

  try {
    const token = await ctx.getAuthToken();

    // Build request body - include reference_images if available
    const requestBody: any = {
      prompt,
      aspect_ratio:
        formatData?.aspect_ratio || (node.data as unknown as Record<string, unknown>).aspectRatio || "1:1",
      mode: ctx.mode,
    };

    // Add reference_images if we have valid data
    if (referenceImages) {
      requestBody.reference_images = referenceImages;
    }

    logger.debug("[GenerateImage] Request body:", {
      hasPrompt: !!requestBody.prompt,
      aspectRatio: requestBody.aspect_ratio,
      hasReferenceImages: !!requestBody.reference_images,
      referenceImageCount: Array.isArray(requestBody.reference_images)
        ? requestBody.reference_images.length
        : requestBody.reference_images
          ? 1
          : 0,
    });

    const response = await fetch(API_ENDPOINTS.generate.image, {
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
        error: "Access denied. Your email may not be whitelisted.",
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        error: "Unauthorized. Please sign out and sign in again.",
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GenerateImage] API Error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const apiData = await response.json();

    logger.debug("[GenerateImage] API Response:", {
      hasImages: !!apiData.images,
      imageCount: apiData.images?.length || 0,
    });

    if (apiData.images && apiData.images.length > 0) {
      const images = apiData.images.map(
        (img: string) => `data:image/png;base64,${img}`,
      );
      const firstImage = images[0];

      logger.debug("[GenerateImage] Generated images:", {
        imageCount: images.length,
        firstImageLength: firstImage.length,
        firstImagePreview: firstImage.substring(0, 50),
      });

      // Backend auto-saves images to library with prompt metadata
      // Notify that an asset was generated to refresh the library
      if (ctx.onAssetGenerated) {
        logger.debug(
          "[useWorkflowExecution] Image generated, triggering asset refresh",
        );
        ctx.onAssetGenerated();
      }

      const resultData = {
        images,
        image: firstImage,
        imageUrl: firstImage,
        savedAssetId: apiData.saved_asset_id || null,
        generatedMode: ctx.mode,
        outputs: {
          images: images, // For connecting to reference_images (array)
          image: firstImage, // For connecting to first_frame/last_frame (single)
        },
      };

      logger.debug("[GenerateImage] Returning result data:", {
        hasImages: !!resultData.images,
        hasImage: !!resultData.image,
        hasImageUrl: !!resultData.imageUrl,
        hasOutputs: !!resultData.outputs,
        outputsKeys: resultData.outputs
          ? Object.keys(resultData.outputs)
          : [],
        imageUrlLength: resultData.imageUrl?.length || 0,
      });

      // Show success notification
      ctx.toast({
        title: "Image Generated \u2713",
        description: `Data URL: ${resultData.imageUrl.length} chars. Check console for details.`,
      });

      return {
        success: true,
        data: resultData,
      };
    } else {
      return { success: false, error: "No images returned from API" };
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Image generation failed",
    };
  }
}
