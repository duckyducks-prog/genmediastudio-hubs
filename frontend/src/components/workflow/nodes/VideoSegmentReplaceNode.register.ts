import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import VideoSegmentReplaceNode from "./VideoSegmentReplaceNode";

registerNode({
  type: NodeType.VideoSegmentReplace,
  component: VideoSegmentReplaceNode,
  defaultData: () => ({
    startPercent: 20,
    endPercent: 40,
    audioMode: "keep_base",
    fitMode: "trim",
    baseDuration: 30,
    label: "Video Segment Replace",
    outputs: {},
  }),
});
