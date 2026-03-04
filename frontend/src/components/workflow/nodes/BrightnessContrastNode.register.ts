import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import BrightnessContrastNode from "./BrightnessContrastNode";

registerNode({
  type: NodeType.BrightnessContrast,
  component: BrightnessContrastNode,
  defaultData: () => ({
    brightness: 0,
    contrast: 0,
    label: "Brightness/Contrast",
    outputs: {},
  }),
});
