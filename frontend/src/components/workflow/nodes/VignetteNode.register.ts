import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import VignetteNode from "./VignetteNode";

registerNode({
  type: NodeType.Vignette,
  component: VignetteNode,
  defaultData: () => ({
    size: 0.5,
    amount: 0.5,
    label: "Vignette",
    outputs: {},
  }),
});
