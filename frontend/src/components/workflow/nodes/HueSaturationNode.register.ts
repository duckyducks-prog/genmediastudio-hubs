import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import HueSaturationNode from "./HueSaturationNode";

registerNode({
  type: NodeType.HueSaturation,
  component: HueSaturationNode,
  defaultData: () => ({
    hue: 0,
    saturation: 0,
    label: "Hue/Saturation",
    outputs: {},
  }),
});
