import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import BurnCaptionsNode from "./BurnCaptionsNode";

registerNode({
  type: NodeType.BurnCaptions,
  component: BurnCaptionsNode,
  defaultData: () => ({
    label: "Burn Captions",
    fontSize: 48,
    position: "bottom",
    backgroundColor: "teal",
    outputs: {},
  }),
});
