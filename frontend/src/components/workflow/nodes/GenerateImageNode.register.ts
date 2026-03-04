import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import GenerateImageNode from "./GenerateImageNode";

registerNode({
  type: NodeType.GenerateImage,
  component: GenerateImageNode,
  defaultData: () => ({
    isGenerating: false,
    status: "ready",
    label: "Generate Image",
    aspectRatio: "1:1",
    outputs: {},
  }),
});
