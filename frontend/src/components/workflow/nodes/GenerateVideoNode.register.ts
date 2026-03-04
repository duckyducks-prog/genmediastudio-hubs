import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import GenerateVideoNode from "./GenerateVideoNode";

registerNode({
  type: NodeType.GenerateVideo,
  component: GenerateVideoNode,
  defaultData: () => ({
    isGenerating: false,
    status: "ready",
    label: "Generate Video",
    aspectRatio: "16:9",
    generateAudio: true,
    durationSeconds: 8,
    useConsistentVoice: false,
    seed: 42,
    outputs: {},
  }),
});
