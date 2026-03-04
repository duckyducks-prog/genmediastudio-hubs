import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import SharpenNode from "./SharpenNode";

registerNode({
  type: NodeType.Sharpen,
  component: SharpenNode,
  defaultData: () => ({
    gamma: 1.0,
    label: "Sharpen",
    outputs: {},
  }),
});
