import { NodeType } from "../types";
import { NodeExecutor } from "./types";

// Input executors
import {
  executePrompt,
  executeWorkflowQueue,
  executeImageInput,
  executeVideoInput,
} from "./inputExecutors";

// Filter executors (factory-based)
import {
  executeBrightnessContrast,
  executeBlur,
  executeSharpen,
  executeHueSaturation,
  executeNoise,
  executeFilmGrain,
  executeVignette,
  executeCrop,
} from "./filterExecutors";

// Text executors
import {
  executePromptConcatenator,
  executeTextIterator,
  executeLLM,
} from "./textExecutors";

// Image action executors
import {
  executeImageComposite,
  executeGenerateImage,
} from "./imageActionExecutors";

// Video action executors
import {
  executeGenerateVideo,
  executeMergeVideos,
  executeAddMusicToVideo,
  executeVoiceChanger,
  executeVideoWatermark,
  executeVideoSegmentReplace,
  executeExtractLastFrame,
  executeBurnCaptions,
} from "./videoActionExecutors";

// Audio executors
import { executeGenerateMusic } from "./audioExecutors";

// Output executors
import {
  executeImageOutput,
  executeVideoOutput,
  executeDownload,
  executeCompound,
} from "./outputExecutors";

export const executorMap = new Map<NodeType, NodeExecutor>([
  // Input nodes
  [NodeType.Prompt, executePrompt],
  [NodeType.WorkflowQueue, executeWorkflowQueue],
  [NodeType.ImageInput, executeImageInput],
  [NodeType.VideoInput, executeVideoInput],

  // Filter modifier nodes
  [NodeType.BrightnessContrast, executeBrightnessContrast],
  [NodeType.Blur, executeBlur],
  [NodeType.Sharpen, executeSharpen],
  [NodeType.HueSaturation, executeHueSaturation],
  [NodeType.Noise, executeNoise],
  [NodeType.FilmGrain, executeFilmGrain],
  [NodeType.Vignette, executeVignette],
  [NodeType.Crop, executeCrop],

  // Text modifier nodes
  [NodeType.PromptConcatenator, executePromptConcatenator],
  [NodeType.TextIterator, executeTextIterator],

  // Image action nodes
  [NodeType.ImageComposite, executeImageComposite],
  [NodeType.GenerateImage, executeGenerateImage],

  // Video action nodes
  [NodeType.GenerateVideo, executeGenerateVideo],
  [NodeType.MergeVideos, executeMergeVideos],
  [NodeType.AddMusicToVideo, executeAddMusicToVideo],
  [NodeType.VoiceChanger, executeVoiceChanger],
  [NodeType.VideoWatermark, executeVideoWatermark],
  [NodeType.VideoSegmentReplace, executeVideoSegmentReplace],
  [NodeType.ExtractLastFrame, executeExtractLastFrame],
  [NodeType.BurnCaptions, executeBurnCaptions],

  // Audio action nodes
  [NodeType.GenerateMusic, executeGenerateMusic],

  // Text action nodes
  [NodeType.LLM, executeLLM],

  // Output nodes
  [NodeType.ImageOutput, executeImageOutput],
  [NodeType.VideoOutput, executeVideoOutput],
  [NodeType.Download, executeDownload],

  // Compound nodes
  [NodeType.Compound, executeCompound],

  // Moodboard — merge drag-dropped images (node.data) with connection-sourced images (inputs)
  [NodeType.Moodboard, async (node, inputs) => {
    const nodeImages: string[] = (node.data as any).images ?? [];
    const connectedImages: string[] = Array.isArray(inputs["images"]) ? inputs["images"] : [];
    const images = [...new Set([...nodeImages, ...connectedImages])];
    return { success: true, data: { outputs: { images } } };
  }],
]);
