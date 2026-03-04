import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import NoiseNode from "./NoiseNode";

registerNode({
  type: NodeType.Noise,
  component: NoiseNode,
  defaultData: () => ({
    noise: 0.5,
    label: "Noise",
    outputs: {},
  }),
});
