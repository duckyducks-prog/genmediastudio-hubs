import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import CropNode from "./CropNode";

registerNode({
  type: NodeType.Crop,
  component: CropNode,
  defaultData: () => ({
    aspectRatio: "custom",
    x: 0,
    y: 0,
    width: 1024,
    height: 1024,
    label: "Crop",
    outputs: {},
  }),
});
