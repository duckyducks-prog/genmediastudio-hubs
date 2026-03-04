import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import ImageUploadNode from "./ImageUploadNode";

registerNode({
  type: NodeType.ImageInput,
  component: ImageUploadNode,
  defaultData: () => ({
    imageUrl: null,
    file: null,
    label: "Image Input",
    outputs: {},
  }),
});
