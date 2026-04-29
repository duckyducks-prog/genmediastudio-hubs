import { logger } from "@/lib/logger";
import { Node, Edge } from "reactflow";

/**
 * Execution result returned by compound node execution
 */
interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Resolve the path from a mapping object.
 * Supports both formats:
 * - buildCompoundDefinition: { nodeId, param: "data.promptText" }
 * - finalizeCompound: { nodeId, inputHandle: "text" } / { nodeId, paramPath: "data.x" } / { nodeId, outputHandle: "video" }
 */
function resolveMappingPath(mapping: any, kind: "input" | "control" | "output"): string | undefined {
  if (mapping.param) return mapping.param;
  if (mapping.paramPath) return mapping.paramPath;
  if (kind === "input" && mapping.inputHandle) {
    // For source nodes marked "__source__", the handle isn't a real path
    if (mapping.inputHandle === "__source__") return undefined;
    return `data.inputs.${mapping.inputHandle}`;
  }
  if (kind === "output" && mapping.outputHandle) {
    return `data.outputs.${mapping.outputHandle}`;
  }
  return undefined;
}

/**
 * Helper function to set a nested value in an object using a path string
 * Example: setNestedValue(node, "data.duration", 8) sets node.data.duration = 8
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Helper function to get a nested value from an object using a path string
 * Example: getNestedValue(node, "data.outputs.video") returns node.data.outputs.video
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((curr, key) => curr?.[key], obj);
}

/**
 * Detect queue inputs from external inputs.
 * Returns the exposedId and items array for the first queue found, or null.
 */
function detectQueueInput(
  externalInputs: Record<string, any>,
): { exposedId: string; items: string[]; count: number } | null {
  for (const [key, value] of Object.entries(externalInputs)) {
    if (value && typeof value === "object" && value._isQueue) {
      // The queue executor returns { text: items[], _isQueue: true, _count: N }
      // But gatherNodeInputs may pass the whole object or just the text field
      const items = Array.isArray(value) ? value : Array.isArray(value.text) ? value.text : [];
      return { exposedId: key, items, count: value._count || items.length };
    }
    // Also check if the value itself is the queue data (when spread by output resolution)
    if (Array.isArray(value)) {
      // Could be a queue that lost its _isQueue flag during resolution
      // We rely on _isQueue being present, so skip plain arrays
      continue;
    }
  }
  return null;
}

/**
 * Run a single iteration of the internal workflow with given inputs.
 */
async function runSingleIteration(
  internalWorkflow: { nodes: Node[]; edges: Edge[] },
  mappings: any,
  controlValues: Record<string, any>,
  externalInputs: Record<string, any>,
  executeWorkflow: (nodes: Node[], edges: Edge[]) => Promise<ExecutionResult>,
): Promise<ExecutionResult> {
  // Deep clone internal workflow for this iteration
  const nodes: Node[] = JSON.parse(JSON.stringify(internalWorkflow.nodes));
  const edges: Edge[] = JSON.parse(JSON.stringify(internalWorkflow.edges));

  // Inject external inputs
  if (mappings.inputs) {
    for (const [exposedId, mapping] of Object.entries(mappings.inputs)) {
      const inputValue = externalInputs[exposedId];
      if (inputValue !== undefined) {
        const node = nodes.find((n) => n.id === (mapping as any).nodeId);
        const path = resolveMappingPath(mapping, "input");
        if (node && path) {
          setNestedValue(node, path, inputValue);
        }
      }
    }
  }

  // Apply control values
  if (mappings.controls) {
    for (const [controlId, mappingList] of Object.entries(mappings.controls)) {
      const value = controlValues[controlId];
      if (value !== undefined && Array.isArray(mappingList)) {
        for (const mapping of mappingList) {
          const node = nodes.find((n) => n.id === (mapping as any).nodeId);
          const path = resolveMappingPath(mapping, "control");
          if (node && path) {
            setNestedValue(node, path, value);
          }
        }
      }
    }
  }

  // Execute
  const result = await executeWorkflow(nodes, edges);
  if (!result.success) {
    return result;
  }

  // Extract outputs
  const outputs: Record<string, any> = {};
  const resultNodes = result.data?.nodes || nodes;
  if (mappings.outputs) {
    for (const [exposedId, mapping] of Object.entries(mappings.outputs)) {
      const node = resultNodes.find(
        (n: Node) => n.id === (mapping as any).nodeId,
      );
      const path = resolveMappingPath(mapping, "output");
      if (node && path) {
        outputs[exposedId] = getNestedValue(node, path);
      }
    }
  }

  return { success: true, data: outputs };
}

/**
 * Execute a compound node by running its internal workflow.
 * Supports batch mode: if any input is a queue (_isQueue flag),
 * the workflow runs N times with each queue item, producing indexed outputs.
 *
 * @param compoundNode The compound node instance on the canvas
 * @param externalInputs Values from connections to the compound node's inputs
 * @param executeWorkflow Function to execute a workflow (recursive call)
 * @param onIterationProgress Optional callback for progress updates
 * @returns ExecutionResult with success status and output data
 */
export async function executeCompoundNode(
  compoundNode: Node,
  externalInputs: Record<string, any>,
  executeWorkflow: (nodes: Node[], edges: Edge[]) => Promise<ExecutionResult>,
  onIterationProgress?: (current: number, total: number) => void,
): Promise<ExecutionResult> {
  const {
    internalWorkflow,
    mappings,
    controlValues = {},
  } = compoundNode.data as any;

  logger.debug("[executeCompoundNode] Starting execution:", {
    nodeId: compoundNode.id,
    name: compoundNode.data.name,
    externalInputs: Object.keys(externalInputs),
    controlValues: Object.keys(controlValues),
  });

  try {
    // ====================================================================
    // Check for queue inputs (batch mode)
    // ====================================================================
    const queueInput = detectQueueInput(externalInputs);

    if (queueInput) {
      // =================================================================
      // BATCH MODE: Run N iterations
      // =================================================================
      const { exposedId, items, count } = queueInput;
      logger.debug(`[executeCompoundNode] Batch mode: ${count} iterations via "${exposedId}"`);

      const allOutputs: Record<string, any> = {
        _isBatchResult: true,
        _count: count,
      };
      let successCount = 0;

      for (let i = 0; i < count; i++) {
        logger.debug(`[executeCompoundNode] Iteration ${i + 1}/${count}`);
        onIterationProgress?.(i + 1, count);

        // Build inputs for this iteration: replace queue with single item
        const iterationInputs = { ...externalInputs };
        iterationInputs[exposedId] = items[i];

        const result = await runSingleIteration(
          internalWorkflow,
          mappings,
          controlValues,
          iterationInputs,
          executeWorkflow,
        );

        if (result.success && result.data) {
          // Store each output with an indexed key (e.g., video_1, video_2)
          for (const [outputKey, outputValue] of Object.entries(result.data)) {
            allOutputs[`${outputKey}_${i + 1}`] = outputValue;
          }
          successCount++;
        } else {
          logger.warn(`[executeCompoundNode] Iteration ${i + 1} failed:`, result.error);
          allOutputs[`_error_${i + 1}`] = result.error;
        }
      }

      logger.debug(`[executeCompoundNode] Batch complete: ${successCount}/${count} succeeded`);

      return {
        success: successCount > 0,
        data: allOutputs,
        error: successCount === 0 ? "All iterations failed" : undefined,
      };
    }

    // ====================================================================
    // SINGLE MODE: Run once (original behavior)
    // ====================================================================
    logger.debug("[executeCompoundNode] Single execution mode");
    return await runSingleIteration(
      internalWorkflow,
      mappings,
      controlValues,
      externalInputs,
      executeWorkflow,
    );
  } catch (error) {
    console.error("[executeCompoundNode] Execution error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}
