import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import GenerateMusicNode from "./GenerateMusicNode";

registerNode({
  type: NodeType.GenerateMusic,
  component: GenerateMusicNode,
  defaultData: () => ({
    prompt: "",
    isGenerating: false,
    status: "ready",
    label: "Generate Music",
    selectedDuration: "auto",
    outputs: {},
  }),
});
