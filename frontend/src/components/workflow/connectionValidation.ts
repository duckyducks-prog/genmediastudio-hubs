import { Connection } from "reactflow";
import {
  WorkflowNode,
  WorkflowEdge,
  NODE_CONFIGURATIONS,
  canConnect,
  ConnectorType,
  NodeType,
} from "./types";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Get the connector type for a given handle on a node
 */
export function getConnectorType(
  node: WorkflowNode,
  handleId: string | null | undefined,
  isSource: boolean,
): ConnectorType | null {
  const config = NODE_CONFIGURATIONS[node.type as NodeType];
  if (!config) return null;

  // Special case: Compound nodes have dynamic connectors defined in node data
  if (node.type === NodeType.Compound) {
    const handle = handleId || "default";
    const connectors = isSource
      ? (node.data as any).outputs
      : (node.data as any).inputs;

    if (Array.isArray(connectors)) {
      const connector = connectors.find((c: any) => c.id === handle);
      return connector ? connector.type : null;
    }
    return null;
  }

  const connectors = isSource
    ? config.outputConnectors
    : config.inputConnectors;
  const handle = handleId || "default";

  // Special case: Text Iterator has dynamic output handles (output_0, output_1, etc.)
  if (
    node.type === NodeType.TextIterator &&
    isSource &&
    handle.startsWith("output_")
  ) {
    return ConnectorType.Text;
  }

  const connector = connectors.find((c) => c.id === handle);
  return connector ? connector.type : null;
}

/**
 * Check if an input handle already has an incoming connection
 */
export function hasExistingConnection(
  nodeId: string,
  handleId: string | null | undefined,
  edges: WorkflowEdge[],
): boolean {
  const handle = handleId || "default";
  return edges.some(
    (edge) =>
      edge.target === nodeId && (edge.targetHandle || "default") === handle,
  );
}

/**
 * Validate a connection attempt between two nodes
 */
export function validateConnection(
  connection: Connection,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): ValidationResult {
  // Find source and target nodes
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (!sourceNode || !targetNode) {
    return { valid: false, reason: "Source or target node not found" };
  }

  // Get node configurations
  const sourceConfig = NODE_CONFIGURATIONS[sourceNode.type as NodeType];
  const targetConfig = NODE_CONFIGURATIONS[targetNode.type as NodeType];

  if (!sourceConfig || !targetConfig) {
    return { valid: false, reason: "Node configuration not found" };
  }

  // Get connector types
  const sourceType = getConnectorType(
    sourceNode,
    connection.sourceHandle,
    true,
  );
  const targetType = getConnectorType(
    targetNode,
    connection.targetHandle,
    false,
  );

  if (!sourceType || !targetType) {
    return { valid: false, reason: "Connector not found" };
  }

  // Check type compatibility
  if (!canConnect(sourceType, targetType)) {
    return {
      valid: false,
      reason: `Cannot connect ${sourceType} to ${targetType}`,
    };
  }

  // Find the input connector configuration
  const targetHandle = connection.targetHandle || "default";

  // Compound nodes have dynamic connectors in node data, not in NODE_CONFIGURATIONS
  let inputConnectorAcceptsMultiple = false;
  if (targetNode.type === NodeType.Compound) {
    const dynamicInputs = (targetNode.data as any).inputs;
    const dynamicConnector = Array.isArray(dynamicInputs)
      ? dynamicInputs.find((c: any) => c.id === targetHandle)
      : null;
    if (!dynamicConnector) {
      return { valid: false, reason: "Input connector not found" };
    }
    inputConnectorAcceptsMultiple = dynamicConnector.acceptsMultiple ?? false;
  } else {
    const inputConnector = targetConfig.inputConnectors.find(
      (c) => c.id === targetHandle,
    );
    if (!inputConnector) {
      return { valid: false, reason: "Input connector not found" };
    }
    inputConnectorAcceptsMultiple = inputConnector.acceptsMultiple;
  }

  // Check if input accepts multiple connections
  if (!inputConnectorAcceptsMultiple) {
    if (hasExistingConnection(targetNode.id, connection.targetHandle, edges)) {
      return {
        valid: false,
        reason: "This input only accepts one connection",
      };
    }
  }

  // NOTE: Mutual exclusion for GenerateVideo (first_frame/last_frame vs reference_images)
  // is now validated at EXECUTION time, not connection time.
  // This allows users to create flexible workflows and only get errors when they try to run.

  return { valid: true };
}
