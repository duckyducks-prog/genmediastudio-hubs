import { logger } from "@/lib/logger";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import { NodeExecutor } from "./types";

/**
 * Factory for creating filter node executors.
 * All filter nodes follow the same pattern: they receive an image/video input,
 * collect upstream filters, append their own filter config, and pass everything through.
 */
function createFilterExecutor(
  filterType: FilterConfig["type"],
  extractParams: (nodeData: any) => Record<string, any>,
): NodeExecutor {
  return async (node, inputs) => {
    const imageInput = inputs.image || null;
    const videoInput = inputs.video || null;
    const upstreamFilters: FilterConfig[] = inputs.filters || [];

    const params = extractParams(node.data);

    logger.debug(`[${filterType}] Execution:`, {
      hasImage: !!imageInput,
      hasVideo: !!videoInput,
      upstreamFilterCount: upstreamFilters.length,
      ...params,
    });

    if (!imageInput && !videoInput) {
      return { success: false, error: "No image or video connected" };
    }

    const thisFilter: FilterConfig = {
      type: filterType,
      params,
    };

    const outputFilters = [...upstreamFilters, thisFilter];

    return {
      success: true,
      data: {
        image: imageInput,
        video: videoInput,
        filters: outputFilters,
        outputs: {
          image: imageInput,
          video: videoInput,
          filters: outputFilters,
        },
      },
    };
  };
}

export const executeBrightnessContrast = createFilterExecutor(
  "brightness",
  (d) => ({
    brightness: d.brightness ?? 1.0,
    contrast: d.contrast ?? 1.0,
  }),
);

export const executeBlur = createFilterExecutor("blur", (d) => ({
  strength: d.strength ?? 8,
  quality: d.quality ?? 4,
}));

export const executeSharpen = createFilterExecutor("sharpen", (d) => ({
  gamma: d.gamma ?? 0,
}));

export const executeHueSaturation = createFilterExecutor(
  "hueSaturation",
  (d) => ({
    hue: d.hue ?? 0,
    saturation: d.saturation ?? 0,
  }),
);

export const executeNoise = createFilterExecutor("noise", (d) => ({
  noise: d.noise ?? 0.5,
}));

export const executeFilmGrain = createFilterExecutor("filmGrain", (d) => ({
  intensity: d.intensity ?? 50,
  size: d.size ?? 1,
  shadows: d.shadows ?? 30,
  highlights: d.highlights ?? 30,
  midtonesBias: d.midtonesBias ?? 80,
}));

export const executeVignette = createFilterExecutor("vignette", (d) => ({
  size: d.size ?? 0.5,
  amount: d.amount ?? 0.5,
}));

export const executeCrop = createFilterExecutor("crop", (d) => ({
  x: d.x ?? 0,
  y: d.y ?? 0,
  width: d.width ?? 512,
  height: d.height ?? 512,
}));
