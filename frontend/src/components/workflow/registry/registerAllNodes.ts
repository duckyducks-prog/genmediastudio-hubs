// Side-effect imports that register all node types into the registry.
// Each file calls registerNode() when imported.

// Input nodes
import "../nodes/PromptInputNode.register";
import "../nodes/ImageUploadNode.register";
import "../nodes/VideoUploadNode.register";
import "../nodes/WorkflowQueueNode.register";

// Modifier nodes - text
import "../nodes/PromptConcatenatorNode.register";
import "../nodes/TextIteratorNode.register";

// Modifier nodes - image filters
import "../nodes/BrightnessContrastNode.register";
import "../nodes/BlurNode.register";
import "../nodes/SharpenNode.register";
import "../nodes/HueSaturationNode.register";
import "../nodes/NoiseNode.register";
import "../nodes/FilmGrainNode.register";
import "../nodes/VignetteNode.register";
import "../nodes/CropNode.register";
import "../nodes/ImageCompositeNode.register";

// Modifier nodes - video
import "../nodes/ExtractLastFrameNode.register";
import "../nodes/VideoWatermarkNode.register";
import "../nodes/VideoSegmentReplaceNode.register";

// Action nodes
import "../nodes/GenerateImageNode.register";
import "../nodes/GenerateVideoNode.register";
import "../nodes/GenerateMusicNode.register";
import "../nodes/VoiceChangerNode.register";
import "../nodes/MergeVideosNode.register";
import "../nodes/AddMusicToVideoNode.register";
import "../nodes/LLMNode.register";
import "../nodes/PreviewNode.register";
import "../nodes/DownloadNode.register";

// Output nodes
import "../nodes/ImageOutputNode.register";
import "../nodes/VideoOutputNode.register";
import "../nodes/TextOutputNode.register";

// Utility nodes
import "../nodes/StickyNoteNode.register";

// Compound nodes (data-only, no static component)
import "../nodes/CompoundNode.register";
