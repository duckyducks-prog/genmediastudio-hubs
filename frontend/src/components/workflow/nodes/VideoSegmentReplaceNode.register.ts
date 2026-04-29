import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import VideoSegmentReplaceNode from "./VideoSegmentReplaceNode";

registerNode({
  type: NodeType.VideoSegmentReplace,
  component: VideoSegmentReplaceNode,
  defaultData: () => ({
    startTime: 5,
    endTime: 15,
    audioMode: "keep_base",
    fitMode: "trim",
    baseDuration: 30,
    timelineMode: "percentage",
    startPercent: 0,
    endPercent: 100,
    label: "Video Segment Replace",
    outputs: {},
  }),
});
