import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import ExtractLastFrameNode from "./ExtractLastFrameNode";

registerNode({
  type: NodeType.ExtractLastFrame,
  component: ExtractLastFrameNode,
  defaultData: () => ({}),
});
