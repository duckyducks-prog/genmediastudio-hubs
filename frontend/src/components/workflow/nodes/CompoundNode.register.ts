import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";

// Compound nodes should be added via addCompoundNode() instead.
// This registration exists for completeness but shouldn't typically be reached.
// We register a lazy stub so getDefaultNodeData returns the expected shape.
registerNode({
  type: NodeType.Compound,
  // No component - Compound nodes are added via addCompoundNode() which
  // dynamically creates and registers the component. Setting null here
  // excludes it from the static nodeTypes map.
  component: null,
  defaultData: () => {
    console.warn(
      "[addNode] Compound nodes should be added via addCompoundNode()",
    );
    return {
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
    };
  },
});
