import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import ImageCompositeNode from "./ImageCompositeNode";

registerNode({
  type: NodeType.ImageComposite,
  component: ImageCompositeNode,
  defaultData: () => ({
    blendMode: "normal",
    opacity: 1.0,
    label: "Image Composite",
    outputs: {},
  }),
});
