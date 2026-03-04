import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import ImageOutputNode from "./ImageOutputNode";

registerNode({
  type: NodeType.ImageOutput,
  component: ImageOutputNode,
  defaultData: () => ({
    result: null,
    type: "image",
    label: "Image Output",
  }),
});
