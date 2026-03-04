import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import VideoOutputNode from "./VideoOutputNode";

registerNode({
  type: NodeType.VideoOutput,
  component: VideoOutputNode,
  defaultData: () => ({
    result: null,
    type: "video",
    label: "Video Output",
  }),
});
