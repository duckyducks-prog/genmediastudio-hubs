import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import MergeVideosNode from "./MergeVideosNode";

registerNode({
  type: NodeType.MergeVideos,
  component: MergeVideosNode,
  defaultData: () => ({
    isMerging: false,
    aspectRatio: "16:9",
    status: "ready",
    label: "Merge Videos",
    outputs: {},
  }),
});
