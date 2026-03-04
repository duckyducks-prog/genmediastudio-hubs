import { NodeTypes } from "reactflow";
import { getAllRegistrations } from "./nodeRegistry";
import { withNodeErrorBoundary } from "./withNodeErrorBoundary";
import "./registerAllNodes";

function buildNodeTypes(): NodeTypes {
  const types: NodeTypes = {};
  for (const [nodeType, reg] of getAllRegistrations()) {
    if (reg.component) {
      types[nodeType] = withNodeErrorBoundary(reg.component, nodeType);
    }
  }
  return types;
}

// Built once at module scope - React Flow expects a stable reference
export const nodeTypes: NodeTypes = buildNodeTypes();
