import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import PromptInputNode from "./PromptInputNode";

registerNode({
  type: NodeType.Prompt,
  component: PromptInputNode,
  defaultData: () => ({ prompt: "", label: "Text Input", outputs: {} }),
});
