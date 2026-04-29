import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import WorkflowQueueNode from "./WorkflowQueueNode";

registerNode({
  type: NodeType.WorkflowQueue,
  component: WorkflowQueueNode,
  defaultData: () => ({
    items: [],
    rawInput: "",
    separator: "---",
    label: "Workflow Queue",
    outputs: {},
  }),
});
