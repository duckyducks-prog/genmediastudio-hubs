import { NodeType } from "@/components/workflow/types";
import { ExposableParam } from "./types";

/**
 * Defines which parameters can be exposed as controls for each node type
 * This configuration determines what appears in the "Expose as Controls" section
 * when creating a compound node.
 */
export const EXPOSABLE_PARAMS: Record<NodeType, ExposableParam[]> = {
  // ============================================================================
  // ACTION NODES
  // ============================================================================

  [NodeType.GenerateVideo]: [
    {
      name: "Duration",
      path: "data.durationSeconds",
      controlType: "dropdown",
      config: {
        options: ["4", "6", "8"],
      },
    },
    {
      name: "Aspect Ratio",
      path: "data.aspectRatio",
      controlType: "dropdown",
      config: {
        options: ["16:9", "9:16"],
      },
    },
    {
      name: "Generate Audio",
      path: "data.generateAudio",
      controlType: "toggle",
      config: {},
    },
    {
      name: "Use Consistent Voice",
      path: "data.useConsistentVoice",
      controlType: "toggle",
      config: {},
    },
  ],

  [NodeType.GenerateImage]: [
    {
      name: "Aspect Ratio",
      path: "data.aspectRatio",
      controlType: "dropdown",
      config: {
        options: ["1:1", "16:9", "9:16", "3:4", "4:3"],
      },
    },
  ],

  [NodeType.LLM]: [
    {
      name: "Temperature",
      path: "data.temperature",
      controlType: "slider",
      config: {
        min: 0,
        max: 1,
        step: 0.1,
      },
    },
    {
      name: "System Prompt",
      path: "data.systemPrompt",
      controlType: "text",
      config: {},
    },
  ],

  // ============================================================================
  // MODIFIER NODES - TEXT
  // ============================================================================

  [NodeType.PromptConcatenator]: [
    {
      name: "Separator",
      path: "data.separator",
      controlType: "dropdown",
      config: {
        options: ["Space", "Comma", "Newline", "Period"],
      },
    },
  ],

  [NodeType.TextIterator]: [
    {
      name: "Fixed Section",
      path: "data.fixedSection",
      controlType: "text",
      config: {},
    },
    {
      name: "Separator",
      path: "data.separator",
      controlType: "dropdown",
      config: {
        options: ["Newline", "Custom"],
      },
    },
  ],

  // ============================================================================
  // MODIFIER NODES - IMAGE FILTERS
  // ============================================================================

  [NodeType.BrightnessContrast]: [
    {
      name: "Brightness",
      path: "data.brightness",
      controlType: "slider",
      config: {
        min: -1,
        max: 1,
        step: 0.1,
      },
    },
    {
      name: "Contrast",
      path: "data.contrast",
      controlType: "slider",
      config: {
        min: -1,
        max: 1,
        step: 0.1,
      },
    },
  ],

  [NodeType.Blur]: [
    {
      name: "Blur Amount",
      path: "data.blur",
      controlType: "slider",
      config: {
        min: 0,
        max: 20,
        step: 1,
      },
    },
  ],

  [NodeType.Sharpen]: [
    {
      name: "Sharpen Amount",
      path: "data.amount",
      controlType: "slider",
      config: {
        min: 0,
        max: 10,
        step: 0.5,
      },
    },
  ],

  [NodeType.HueSaturation]: [
    {
      name: "Hue",
      path: "data.hue",
      controlType: "slider",
      config: {
        min: -180,
        max: 180,
        step: 1,
      },
    },
    {
      name: "Saturation",
      path: "data.saturation",
      controlType: "slider",
      config: {
        min: -1,
        max: 1,
        step: 0.1,
      },
    },
  ],

  [NodeType.Noise]: [
    {
      name: "Noise Amount",
      path: "data.noise",
      controlType: "slider",
      config: {
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
  ],

  [NodeType.FilmGrain]: [
    {
      name: "Grain Intensity",
      path: "data.intensity",
      controlType: "slider",
      config: {
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
  ],

  [NodeType.Vignette]: [
    {
      name: "Vignette Size",
      path: "data.size",
      controlType: "slider",
      config: {
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
    {
      name: "Vignette Amount",
      path: "data.amount",
      controlType: "slider",
      config: {
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
  ],

  [NodeType.ImageComposite]: [
    {
      name: "Opacity",
      path: "data.opacity",
      controlType: "slider",
      config: {
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
    {
      name: "Blend Mode",
      path: "data.blendMode",
      controlType: "dropdown",
      config: {
        options: ["normal", "multiply", "screen", "overlay", "add"],
      },
    },
  ],

  // ============================================================================
  // INPUT NODES - No exposable params (these are data sources)
  // ============================================================================

  [NodeType.ImageInput]: [],
  [NodeType.VideoInput]: [],
  [NodeType.Prompt]: [],

  // ============================================================================
  // VIDEO MODIFIER NODES
  // ============================================================================

  [NodeType.ExtractLastFrame]: [],
  [NodeType.BurnCaptions]: [],

  // ============================================================================
  // OUTPUT/UTILITY NODES - No exposable params
  // ============================================================================

  [NodeType.Crop]: [],
  [NodeType.Preview]: [],
  [NodeType.Download]: [],
  [NodeType.ImageOutput]: [],
  [NodeType.VideoOutput]: [],
  [NodeType.StickyNote]: [],
  [NodeType.Compound]: [],
  [NodeType.WorkflowQueue]: [],
  [NodeType.TextOutput]: [],
  [NodeType.VideoWatermark]: [],
  [NodeType.VideoSegmentReplace]: [],
  [NodeType.GenerateMusic]: [],
  [NodeType.VoiceChanger]: [],
  [NodeType.MergeVideos]: [],
  [NodeType.AddMusicToVideo]: [],
};

/**
 * Helper function to get exposable parameters for a specific node type
 */
export function getExposableParams(nodeType: NodeType): ExposableParam[] {
  return EXPOSABLE_PARAMS[nodeType] || [];
}

/**
 * Helper function to check if a node type has any exposable parameters
 */
export function hasExposableParams(nodeType: NodeType): boolean {
  const params = EXPOSABLE_PARAMS[nodeType];
  return params !== undefined && params.length > 0;
}
