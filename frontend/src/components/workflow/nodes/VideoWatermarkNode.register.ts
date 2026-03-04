import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import VideoWatermarkNode from "./VideoWatermarkNode";

registerNode({
  type: NodeType.VideoWatermark,
  component: VideoWatermarkNode,
  defaultData: () => ({
    mode: "watermark",
    position: "bottom-right",
    opacity: 1.0,
    scale: 0.15,
    margin: 20,
    label: "Video Compositing",
    outputs: {},
  }),
});
