import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import VideoUploadNode from "./VideoUploadNode";

registerNode({
  type: NodeType.VideoInput,
  component: VideoUploadNode,
  defaultData: () => ({
    videoUrl: null,
    file: null,
    label: "Video Input",
    outputs: {},
  }),
});
