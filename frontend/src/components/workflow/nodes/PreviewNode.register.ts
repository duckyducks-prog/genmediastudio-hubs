import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import PreviewNode from "./PreviewNode";

registerNode({
  type: NodeType.Preview,
  component: PreviewNode,
  defaultData: () => ({}),
});
