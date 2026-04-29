import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import CompoundNode from "./CompoundNode";

registerNode({
  type: NodeType.Compound,
  component: CompoundNode,
  defaultData: () => ({
    label: "Compound Node",
    name: "Compound Node",
    icon: "\u{1F4E6}",
    description: "",
    inputs: [],
    outputs: [],
    controls: [],
    controlValues: {},
    internalWorkflow: { nodes: [], edges: [] },
    mappings: { inputs: {}, controls: {}, outputs: {} },
    compoundId: "",
  }),
});
