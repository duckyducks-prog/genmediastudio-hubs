import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import AddMusicToVideoNode from "./AddMusicToVideoNode";

registerNode({
  type: NodeType.AddMusicToVideo,
  component: AddMusicToVideoNode,
  defaultData: () => ({
    isMixing: false,
    musicVolume: 50,
    track2Volume: 100,
    originalVolume: 100,
    fadeOut: 3,
    status: "ready",
    label: "Merge Audio",
    outputs: {},
  }),
});
