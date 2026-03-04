import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import PromptConcatenatorNode from "./PromptConcatenatorNode";

registerNode({
  type: NodeType.PromptConcatenator,
  component: PromptConcatenatorNode,
  defaultData: () => ({
    separator: "Space",
    label: "Prompt Concatenator",
    outputs: {},
  }),
});
