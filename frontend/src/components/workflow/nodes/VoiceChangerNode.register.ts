import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import VoiceChangerNode from "./VoiceChangerNode";

registerNode({
  type: NodeType.VoiceChanger,
  component: VoiceChangerNode,
  defaultData: () => ({
    selectedVoiceId: "",
    selectedVoiceName: "",
    isChanging: false,
    status: "ready",
    label: "Voice Changer",
    outputs: {},
  }),
});
