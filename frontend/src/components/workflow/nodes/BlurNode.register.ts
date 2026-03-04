import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import BlurNode from "./BlurNode";

registerNode({
  type: NodeType.Blur,
  component: BlurNode,
  defaultData: () => ({
    strength: 8,
    quality: 4,
    label: "Blur",
    outputs: {},
  }),
});
