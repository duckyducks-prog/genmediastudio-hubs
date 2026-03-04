import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import LLMNode from "./LLMNode";

registerNode({
  type: NodeType.LLM,
  component: LLMNode,
  defaultData: () => ({
    systemPrompt: "",
    temperature: 0.7,
    isGenerating: false,
    status: "ready",
    label: "LLM",
    outputs: {},
  }),
});
