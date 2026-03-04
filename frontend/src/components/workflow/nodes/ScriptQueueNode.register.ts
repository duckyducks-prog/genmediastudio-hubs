import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import ScriptQueueNode from "./ScriptQueueNode";

registerNode({
  type: NodeType.ScriptQueue,
  component: ScriptQueueNode,
  defaultData: () => ({
    scripts: [],
    batchInput: "",
    separator: "---",
    currentIndex: 0,
    isProcessing: false,
    label: "Script Queue",
    outputs: {},
  }),
});
