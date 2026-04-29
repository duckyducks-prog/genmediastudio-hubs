import { logger } from "@/lib/logger";
import { useCallback, useState, useMemo, useRef } from "react";
import {
  WorkflowNode,
  WorkflowEdge,
  NodeType,
} from "./types";
import { toast } from "@/hooks/use-toast";
import {
  gatherNodeInputs,
  validateNodeInputs,
  executeConcatenator,
  executeTextIterator,
  pollVideoStatus,
  streamVideoStatus,
  groupNodesByLevel,
  findUpstreamDependencies,
  resolveAssetToDataUrl,
  extractLastFrameFromVideo,
} from "./executionHelpers";
import { auth } from "@/lib/firebase";
import { renderWithPixi, renderCompositeWithPixi } from "@/lib/pixi-renderer";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import { API_ENDPOINTS } from "@/lib/api-config";
import { executeCompoundNode } from "@/lib/compound-nodes/executeCompound";
import { executorMap, ExecutionContext, ExecutionResult } from "./executors";
import { executePassThrough } from "./executors/outputExecutors";

/**
 * Apply filters to a video using the backend FFmpeg endpoint.
 */
async function applyFiltersToVideo(
  videoInput: string,
  filters: FilterConfig[],
): Promise<string> {
  try {
    // Get auth token
    const user = auth.currentUser;
    if (!user) {
      throw new Error("User not authenticated");
    }
    const token = await user.getIdToken();

    // Build request body - handle both URL and base64 video inputs
    const requestBody: any = {
      filters: filters,
    };

    if (videoInput.startsWith("data:")) {
      // Base64 data URL - extract the base64 portion
      const commaIndex = videoInput.indexOf(",");
      requestBody.video_base64 = commaIndex !== -1
        ? videoInput.substring(commaIndex + 1)
        : videoInput;
    } else {
      // Regular URL (GCS, HTTP, etc.) - send as video_url
      requestBody.video_url = videoInput;
    }

    logger.debug("[applyFiltersToVideo] Sending request:", {
      filterCount: filters.length,
      hasUrl: !!requestBody.video_url,
      hasBase64: !!requestBody.video_base64,
    });

    const response = await fetch(API_ENDPOINTS.video.applyFilters, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const result = await response.json();
    return `data:video/mp4;base64,${result.video_base64}`;
  } catch (error) {
    logger.error("[applyFiltersToVideo] Failed:", error);
    throw error;
  }
}

export function useWorkflowExecution(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  setNodes: (
    nodes: WorkflowNode[] | ((nodes: WorkflowNode[]) => WorkflowNode[]),
  ) => void,
  setEdges: (
    edges: WorkflowEdge[] | ((edges: WorkflowEdge[]) => WorkflowEdge[]),
  ) => void,
  onAssetGenerated?: () => void,
  parallelExecution = false,
) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<
    Map<string, string>
  >(new Map());
  const [totalNodes, setTotalNodes] = useState(0);
  const [abortRequested, setAbortRequested] = useState(false);

  // Batch execution state

  // Ref to executeNode so we can use it in executeSubWorkflow without circular deps
  const executeNodeRef = useRef<(node: WorkflowNode, inputs: any) => Promise<ExecutionResult>>();

  // Helper to animate edges connected to a node
  const setEdgeAnimated = useCallback(
    (nodeId: string, animated: boolean, isCompleted: boolean = false) => {
      setEdges((eds) =>
        eds.map((edge) => {
          // Animate edges going INTO this node (target)
          if (edge.target === nodeId) {
            let className = edge.className || "";

            // Remove existing animation classes
            className = className
              .replace(/\s*animated\s*/g, " ")
              .replace(/\s*edge-completed\s*/g, " ")
              .trim();

            // Add appropriate class
            if (animated) {
              className = `${className} animated`.trim();
            } else if (isCompleted) {
              className = `${className} edge-completed`.trim();
            }

            return {
              ...edge,
              animated, // React Flow built-in animated property
              className,
            };
          }
          return edge;
        }),
      );
    },
    [setEdges],
  );

  // Build adjacency list for the graph
  const buildGraph = useCallback(() => {
    const adjacencyList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize
    nodes.forEach((node) => {
      adjacencyList.set(node.id, []);
      inDegree.set(node.id, 0);
    });

    // Build graph from edges
    edges.forEach((edge) => {
      const from = edge.source;
      const to = edge.target;
      adjacencyList.get(from)?.push(to);
      inDegree.set(to, (inDegree.get(to) || 0) + 1);
    });

    return { adjacencyList, inDegree };
  }, [nodes, edges]);

  // Topological sort to determine execution order
  const getExecutionOrder = useCallback((): string[] | null => {
    const { adjacencyList, inDegree } = buildGraph();
    const queue: string[] = [];
    const result: string[] = [];

    // Find all nodes with no incoming edges (start nodes)
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });

    if (queue.length === 0 && nodes.length > 0) {
      toast({
        title: "Workflow Error",
        description:
          "No start nodes found. Add a node with no incoming connections.",
        variant: "destructive",
      });
      return null;
    }

    // Process nodes
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // Process neighbors
      const neighbors = adjacencyList.get(current) || [];
      neighbors.forEach((neighbor) => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    // Check for cycles
    if (result.length !== nodes.length) {
      toast({
        title: "Workflow Error",
        description: "Circular dependencies detected in workflow.",
        variant: "destructive",
      });
      return null;
    }

    return result;
  }, [buildGraph, nodes.length]);

  // Get input data for a node from connected nodes (using new helper)
  const getNodeInputs = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return {};
      return gatherNodeInputs(node, nodes, edges);
    },
    [nodes, edges],
  );

  // Update node visual state
  const updateNodeState = useCallback(
    (nodeId: string, status: string, data?: any) => {
      logger.debug("[updateNodeState] Updating node:", {
        nodeId,
        status,
        dataKeys: data ? Object.keys(data) : [],
        hasImageUrl: !!data?.imageUrl,
        imageUrlLength: data?.imageUrl?.length || 0,
      });

      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (node.id === nodeId) {
            const updatedData = {
              ...node.data,
              status,
              isGenerating: status === "executing",
              ...data,
            };

            logger.debug("[updateNodeState] Updated node data:", {
              nodeId,
              nodeType: node.type,
              oldDataKeys: Object.keys(node.data),
              newDataKeys: Object.keys(updatedData),
              hasOutputs: !!updatedData.outputs,
              outputsKeys: updatedData.outputs
                ? Object.keys(updatedData.outputs)
                : [],
              topLevelHasImage: !!updatedData.image,
              topLevelHasImageUrl: !!updatedData.imageUrl,
              outputsHasImage: !!updatedData.outputs?.image,
              outputsHasImageUrl: !!updatedData.outputs?.imageUrl,
              imageUrlPreview: updatedData.imageUrl
                ? updatedData.imageUrl.substring(0, 50)
                : "none",
            });

            // Dispatch node-update event to trigger output propagation to downstream nodes
            // This is crucial for nodes like ImageComposite to propagate their outputs to Preview nodes
            if (status === "completed" && updatedData.outputs) {
              logger.debug(
                "[updateNodeState] Dispatching node-update event for output propagation",
              );
              setTimeout(() => {
                const event = new CustomEvent("node-update", {
                  detail: {
                    id: nodeId,
                    data: updatedData,
                  },
                });
                window.dispatchEvent(event);
              }, 0);
            }

            return {
              ...node,
              data: updatedData,
            };
          }
          return node;
        }),
      );
    },
    [setNodes],
  );

  // Build execution context for node executors
  const executionContext: ExecutionContext = useMemo(
    () => ({
      updateNodeState,
      onAssetGenerated,
      toast,
      renderWithPixi,
      renderCompositeWithPixi,
      applyFiltersToVideo,
      resolveAssetToDataUrl,
      extractLastFrameFromVideo,
      getAuthToken: async () => {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");
        return user.getIdToken();
      },
      pollVideoStatus: pollVideoStatus as ExecutionContext["pollVideoStatus"],
      streamVideoStatus: streamVideoStatus as ExecutionContext["streamVideoStatus"],
      executeConcatenator,
      executeTextIterator,
      executeCompoundNode,
      executeSubWorkflow: async (
        subNodes: WorkflowNode[],
        subEdges: WorkflowEdge[],
      ) => {
        const execNode = executeNodeRef.current;
        if (!execNode) {
          return { success: false, error: "executeNode not available" };
        }

        // Simple topological sort for the sub-workflow
        const inDegree = new Map<string, number>();
        const adj = new Map<string, string[]>();
        for (const n of subNodes) {
          inDegree.set(n.id, 0);
          adj.set(n.id, []);
        }
        for (const e of subEdges) {
          inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
          adj.get(e.source)?.push(e.target);
        }

        const queue: string[] = [];
        for (const [id, deg] of inDegree) {
          if (deg === 0) queue.push(id);
        }

        let trackedNodes = [...subNodes];
        const order: string[] = [];

        while (queue.length > 0) {
          const nodeId = queue.shift()!;
          order.push(nodeId);
          for (const neighbor of adj.get(nodeId) || []) {
            const newDeg = (inDegree.get(neighbor) || 1) - 1;
            inDegree.set(neighbor, newDeg);
            if (newDeg === 0) queue.push(neighbor);
          }
        }

        // Execute nodes in topological order
        for (const nodeId of order) {
          const node = trackedNodes.find((n) => n.id === nodeId);
          if (!node) continue;

          const inputs = gatherNodeInputs(node, trackedNodes, subEdges);
          const result = await execNode(node, inputs);

          if (result.success && result.data) {
            const updatedOutputs = result.data.outputs || result.data;
            trackedNodes = trackedNodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, outputs: updatedOutputs, ...updatedOutputs } }
                : n,
            );
          } else if (!result.success) {
            return { success: false, error: result.error, nodes: trackedNodes };
          }
        }

        return { success: true, data: {}, nodes: trackedNodes };
      },
    }),
    [updateNodeState, onAssetGenerated],
  );

  // Execute a single node
  const executeNode = useCallback(
    async (node: WorkflowNode, inputs: any): Promise<ExecutionResult> => {
      // Skip disabled nodes - they pass through inputs unchanged
      if (node.data.enabled === false) {
        logger.debug(`[executeNode] Skipping disabled node: ${node.id} (${node.type})`);
        return { success: true, data: inputs, skipped: true };
      }

      try {
        const executor = executorMap.get(node.type as NodeType);
        if (executor) {
          return executor(node, inputs, executionContext);
        }
        // Fallback: pass through inputs for unknown/display nodes
        return executePassThrough(node, inputs, executionContext);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    [executionContext],
  );

  // Keep ref in sync for use by executeSubWorkflow
  executeNodeRef.current = executeNode;

  // Abort workflow execution
  const abortWorkflow = useCallback(() => {
    setAbortRequested(true);
    toast({
      title: "Aborting Workflow",
      description: "Stopping execution after current node...",
    });
  }, []);

  // Main execution function
  const executeWorkflow = useCallback(async () => {
    if (isExecuting) {
      toast({
        title: "Already Executing",
        description: "Workflow is already running.",
      });
      return;
    }

    if (nodes.length === 0) {
      toast({
        title: "Empty Workflow",
        description: "Add nodes to the workflow before running.",
      });
      return;
    }

    setIsExecuting(true);
    setAbortRequested(false);

    // Generate unique execution ID to track outputs from this run
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.info(`[executeWorkflow] Starting execution ${executionId}`);

    const executionOrder = getExecutionOrder();

    if (!executionOrder) {
      setIsExecuting(false);
      return;
    }

    // Track total nodes for progress calculation
    setTotalNodes(executionOrder.length);

    // Helper function to run the workflow execution
    const runWorkflowExecution = async (): Promise<{ completed: number; failed: number }> => {
      const currentNodes: WorkflowNode[] = nodes;

      // Store executed node data
      const progress = new Map<string, string>();

      // Track nodes with their outputs during this iteration
      // This is crucial - we need to update this as nodes complete so downstream nodes can read outputs
      let trackedNodes = [...currentNodes];

      // Helper to get inputs using tracked nodes (not stale React state)
      const getTrackedInputs = (nodeId: string) => {
        const node = trackedNodes.find((n) => n.id === nodeId);
        if (!node) {
          logger.warn(`[getTrackedInputs] Node ${nodeId} not found in trackedNodes`);
          return {};
        }

        // Log the state of upstream nodes for debugging
        const incomingEdges = edges.filter((e) => e.target === nodeId);
        logger.debug(`[getTrackedInputs] Getting inputs for ${node.type} (${nodeId}):`, {
          incomingEdgeCount: incomingEdges.length,
          edges: incomingEdges.map((e) => ({
            sourceId: e.source,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
        });

        // Check upstream node outputs - enhanced debugging
        incomingEdges.forEach((edge) => {
          const sourceNode = trackedNodes.find((n) => n.id === edge.source);
          if (sourceNode) {
            const sourceHandle = edge.sourceHandle || 'default';
            const outputsObj = sourceNode.data.outputs as Record<string, unknown> | undefined;
            const outputValue = outputsObj?.[sourceHandle];
            const topLevelValue = (sourceNode.data as unknown as Record<string, unknown>)[sourceHandle];

            logger.debug(`[getTrackedInputs] 🔍 Upstream node ${sourceNode.type} (${edge.source}):`, {
              sourceHandle,
              outputsState: {
                exists: outputsObj !== undefined,
                isEmpty: outputsObj ? Object.keys(outputsObj).length === 0 : true,
                keys: outputsObj ? Object.keys(outputsObj) : [],
                hasRequestedKey: outputValue !== undefined,
              },
              topLevelState: {
                hasRequestedKey: topLevelValue !== undefined,
                valueType: topLevelValue !== undefined ? typeof topLevelValue : 'undefined',
              },
              resolution: outputValue !== undefined
                ? `✓ Found in outputs.${sourceHandle}`
                : topLevelValue !== undefined
                  ? `⚠️ Fallback to data.${sourceHandle}`
                  : `❌ Not found anywhere`,
              valuePreview: (outputValue || topLevelValue)
                ? String(outputValue || topLevelValue).substring(0, 60) + "..."
                : "NONE",
            });
          } else {
            logger.warn(`[getTrackedInputs] ❌ Source node ${edge.source} not found in trackedNodes!`);
          }
        });

        const inputs = gatherNodeInputs(node, trackedNodes, edges, { executionId });
        logger.debug(`[getTrackedInputs] Final inputs for ${node.type}:`, {
          inputKeys: Object.keys(inputs),
        });
        return inputs;
      };

      // Group nodes by execution level for parallel execution
      const levels = groupNodesByLevel(executionOrder, trackedNodes, edges);

      let totalCompleted = 0;
      let totalFailed = 0;

      // Execute each level in sequence
      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        // Check if abort was requested
        if (abortRequested) {
          toast({
            title: "Workflow Aborted",
            description: "Execution stopped by user",
            variant: "destructive",
          });
          break;
        }

        const levelNodes = levels[levelIndex];

        // Log tracked nodes state at the start of each level
        logger.debug(`[Execution] 📊 Starting Level ${levelIndex}/${levels.length - 1}:`, {
          nodesInLevel: levelNodes.map((n) => ({ id: n.id, type: n.type })),
          trackedNodesWithOutputs: trackedNodes
            .filter((n) => n.data.outputs && Object.keys(n.data.outputs as object).length > 0)
            .map((n) => ({
              id: n.id,
              type: n.type,
              outputKeys: Object.keys(n.data.outputs as object),
              hasVideo: !!(n.data.outputs as any)?.video,
            })),
        });

        // Separate API-calling nodes from others
        // These nodes make backend HTTP calls and need sequential execution
        const apiNodes = levelNodes.filter((node) =>
          [
            NodeType.GenerateImage as string,
            NodeType.GenerateVideo as string,
            NodeType.LLM as string,
            NodeType.MergeVideos as string,
            NodeType.AddMusicToVideo as string,
            NodeType.VoiceChanger as string,
            NodeType.VideoWatermark as string,
            NodeType.VideoSegmentReplace as string,
            NodeType.GenerateMusic as string,
          ].includes(node.type as string),
        );
        const otherNodes = levelNodes.filter(
          (node) => !apiNodes.includes(node),
        );

        // Execute non-API nodes in parallel (they're fast)
        const otherResults = await Promise.allSettled(
          otherNodes.map(async (node) => {
            progress.set(node.id, "executing");
            setEdgeAnimated(node.id, true, false);
            updateNodeState(node.id, "executing");

            const inputs = getTrackedInputs(node.id);
            const validation = validateNodeInputs(node, inputs);
            if (!validation.valid) {
              return {
                nodeId: node.id,
                success: false,
                error: validation.error,
              };
            }

            const result = await executeNode(node, inputs);

            // ✅ CRITICAL FIX: Update trackedNodes array synchronously
            // This ensures downstream nodes see the latest outputs immediately
            if (result.success && result.data) {
              const updatedOutputs = result.data.outputs || result.data;

              trackedNodes = trackedNodes.map((n) =>
                n.id === node.id
                  ? {
                    ...n,
                    data: {
                      ...n.data,
                      outputs: updatedOutputs,
                      // Also set top-level fields for backward compatibility
                      ...updatedOutputs,
                    },
                  }
                  : n,
              );

              logger.debug(
                "[Execution] ✓ Synchronously updated non-API node outputs:",
                {
                  nodeId: node.id,
                  nodeType: node.type,
                  outputKeys: Object.keys(updatedOutputs),
                },
              );
            }

            return {
              nodeId: node.id,
              ...result,
            };
          }),
        );

        // Execute API nodes - sequential by default, parallel when toggled on
        let apiResults: PromiseSettledResult<any>[];

        if (parallelExecution) {
          // Parallel mode with concurrency limit
          const MAX_CONCURRENT_API_CALLS = 3;
          let activeCount = 0;
          const waiting: (() => void)[] = [];

          const acquireSlot = (): Promise<void> => {
            if (activeCount < MAX_CONCURRENT_API_CALLS) {
              activeCount++;
              return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
              waiting.push(() => { activeCount++; resolve(); });
            });
          };

          const releaseSlot = () => {
            activeCount--;
            if (waiting.length > 0) {
              const next = waiting.shift()!;
              next();
            }
          };

          apiResults = await Promise.allSettled(
            apiNodes.map(async (node) => {
              progress.set(node.id, "executing");
              setEdgeAnimated(node.id, true, false);
              updateNodeState(node.id, "executing");
              setExecutionProgress(new Map(progress));

              const inputs = getTrackedInputs(node.id);
              const validation = validateNodeInputs(node, inputs);
              if (!validation.valid) {
                return { nodeId: node.id, success: false, error: validation.error };
              }

              await acquireSlot();
              let execResult;
              try {
                execResult = await executeNode(node, inputs);
              } finally {
                releaseSlot();
              }

              if (execResult.success && execResult.data) {
                const updatedOutputs = execResult.data.outputs || execResult.data;
                trackedNodes = trackedNodes.map((n) =>
                  n.id === node.id
                    ? { ...n, data: { ...n.data, outputs: updatedOutputs, ...updatedOutputs } }
                    : n,
                );
              }

              return { nodeId: node.id, ...execResult };
            }),
          );
        } else {
          // Sequential mode (default) - ensures proper data propagation
          const sequentialResults: PromiseSettledResult<any>[] = [];
          for (const node of apiNodes) {
            progress.set(node.id, "executing");
            setEdgeAnimated(node.id, true, false);
            updateNodeState(node.id, "executing");
            setExecutionProgress(new Map(progress));

            const inputs = getTrackedInputs(node.id);
            const validation = validateNodeInputs(node, inputs);

            let result: PromiseSettledResult<any>;
            if (!validation.valid) {
              result = {
                status: "fulfilled" as const,
                value: { nodeId: node.id, success: false, error: validation.error },
              };
            } else {
              try {
                const execResult = await executeNode(node, inputs);

                if (execResult.success && execResult.data) {
                  const updatedOutputs = execResult.data.outputs || execResult.data;
                  trackedNodes = trackedNodes.map((n) =>
                    n.id === node.id
                      ? { ...n, data: { ...n.data, outputs: updatedOutputs, ...updatedOutputs } }
                      : n,
                  );
                }

                result = {
                  status: "fulfilled" as const,
                  value: { nodeId: node.id, ...execResult },
                };
              } catch (error) {
                result = {
                  status: "rejected" as const,
                  reason: error,
                };
              }
            }

            sequentialResults.push(result);
          }
          apiResults = sequentialResults;
        }

        // Process results from both non-API and API execution
        const allResults = [
          ...otherResults.map((result, index) => ({
            result,
            node: otherNodes[index],
          })),
          ...apiResults.map((result, index) => ({
            result,
            node: apiNodes[index],
          })),
        ];

        allResults.forEach(({ result, node }) => {
          if (result.status === "fulfilled") {
            if (result.value.success) {
              progress.set(node.id, "completed");

              // CRITICAL FIX: Preserve the outputs structure from result.value.data
              // If the execution result already has an outputs property (like GenerateImage does),
              // use that. Otherwise, use the entire data object as outputs for backward compatibility.
              const updateData = {
                ...result.value.data,
                outputs: result.value.data.outputs || result.value.data,
                error: undefined, // Clear any previous errors on success
              };

              logger.debug("[Workflow] Updating node state:", {
                nodeId: node.id,
                nodeType: node.type,
                resultData: result.value.data,
                updateData: {
                  topLevel: {
                    hasImageUrl: !!updateData.imageUrl,
                    hasImage: !!updateData.image,
                    hasImages: !!updateData.images,
                  },
                  outputs: {
                    hasOutputs: !!updateData.outputs,
                    outputsKeys: updateData.outputs
                      ? Object.keys(updateData.outputs)
                      : [],
                    outputsHasImage: !!updateData.outputs?.image,
                    outputsHasImages: !!updateData.outputs?.images,
                    outputsHasImageUrl: !!updateData.outputs?.imageUrl,
                    outputsImagePreview: updateData.outputs?.image
                      ? updateData.outputs.image.substring(0, 50)
                      : "none",
                  },
                },
              });

              // Flash completion, then stop animation
              setEdgeAnimated(node.id, false, true);
              updateNodeState(node.id, "completed", updateData);

              // Clear validation errors on downstream nodes when this node completes successfully
              // This fixes the issue where downstream nodes show "Required input not connected" 
              // errors even after upstream nodes have generated outputs
              const downstreamNodes = edges
                .filter((e) => e.source === node.id)
                .map((e) => e.target);

              downstreamNodes.forEach((downstreamNodeId) => {
                const downstreamNode = nodes.find((n) => n.id === downstreamNodeId);
                if (downstreamNode?.data?.error) {
                  // Only clear validation-type errors, not execution errors
                  const isValidationError = downstreamNode.data.error.includes("not connected") ||
                    downstreamNode.data.error.includes("has no value");
                  if (isValidationError) {
                    logger.debug("[Workflow] Clearing validation error on downstream node:", {
                      upstreamNode: node.id,
                      downstreamNode: downstreamNodeId,
                      clearedError: downstreamNode.data.error
                    });
                    updateNodeState(downstreamNodeId, downstreamNode.data.status || "ready", {
                      error: undefined,
                    });
                  }
                }
              });

              // Clear completion flash after 500ms
              setTimeout(() => {
                setEdgeAnimated(node.id, false, false);
              }, 500);

              // Verify state update timing
              logger.debug("[Execution] State update timing check:", {
                nodeId: node.id,
                immediateNodeData: nodes.find((n) => n.id === node.id)?.data
                  ?.outputs,
                updateDataOutputs: updateData.outputs,
                areEqual:
                  JSON.stringify(
                    nodes.find((n) => n.id === node.id)?.data?.outputs,
                  ) === JSON.stringify(updateData.outputs),
              });

              // Diagnostic log for data flow verification
              logger.debug(`[Execution] ✓ Node completed:`, {
                nodeId: node.id,
                nodeType: node.type,
                hasOutputs: !!updateData.outputs,
                outputKeys: updateData.outputs
                  ? Object.keys(updateData.outputs)
                  : [],
                outputSample:
                  updateData.outputs?.image?.substring(0, 50) ||
                  updateData.outputs?.video?.substring(0, 50) ||
                  updateData.outputs?.images?.[0]?.substring(0, 50) ||
                  "No image/video output",
              });

              totalCompleted++;
            } else {
              progress.set(node.id, "error");
              setEdgeAnimated(node.id, false, false);
              updateNodeState(node.id, "error", { error: result.value.error });
              totalFailed++;

              toast({
                title: "Node Execution Failed",
                description: `${node.data.label || node.type}: ${result.value.error}`,
                variant: "destructive",
              });
            }
          } else {
            // Promise rejected
            progress.set(node.id, "error");
            setEdgeAnimated(node.id, false, false);
            updateNodeState(node.id, "error", { error: String(result.reason) });
            totalFailed++;

            toast({
              title: "Node Execution Error",
              description: `${node.data.label || node.type}: ${result.reason}`,
              variant: "destructive",
            });
          }
        });

        setExecutionProgress(new Map(progress));
      }

      return { completed: totalCompleted, failed: totalFailed };
    };

    try {
      const result = await runWorkflowExecution();

      if (result.failed === 0) {
        toast({
          title: "Workflow Completed",
          description: `All ${result.completed} nodes executed successfully!`,
        });
      } else {
        toast({
          title: "Workflow Completed with Errors",
          description: `${result.completed} succeeded, ${result.failed} failed`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Workflow Error",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
      setAbortRequested(false);
    }
  }, [
    isExecuting,
    nodes,
    edges,
    getExecutionOrder,
    getNodeInputs,
    executeNode,
    updateNodeState,
    abortRequested,
    setNodes,
    parallelExecution,
  ]);

  // Reset workflow state
  const resetWorkflow = useCallback(() => {
    setExecutionProgress(new Map());
    setTotalNodes(0);
    setNodes((prevNodes) =>
      prevNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          status: "ready",
          isGenerating: false,
        },
      })),
    );
  }, [setNodes]);

  // Execute a single node with automatic dependency resolution
  const executeSingleNode = useCallback(
    async (nodeId: string) => {
      // ✅ CRITICAL FIX: Create a local mutable copy of nodes
      // This allows us to synchronously update node outputs so downstream nodes
      // can see them immediately, without waiting for React state to update
      let currentNodes = [...nodes];

      const targetNode = currentNodes.find((n) => n.id === nodeId);

      if (!targetNode) {
        toast({
          title: "Node Not Found",
          description: "The selected node could not be found.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Executing Node",
        description: `Running ${targetNode.data.label || targetNode.type}...`,
      });

      try {
        // Find upstream dependencies
        const dependencies = findUpstreamDependencies(nodeId, currentNodes, edges);

        logger.debug(
          `[Single Node Execution] Target: ${nodeId}, Dependencies: ${dependencies.join(", ") || "none"}`,
        );

        // Execute dependencies first (only if they don't have outputs already)
        for (const depNodeId of dependencies) {
          const depNode = currentNodes.find((n) => n.id === depNodeId);
          if (!depNode) continue;

          // Check if this dependency already has outputs - if so, skip execution
          const hasExistingOutputs =
            depNode.data.outputs &&
            Object.keys(depNode.data.outputs).length > 0;
          const isCompleted = depNode.data.status === "completed";
          const isInputNode =
            depNode.type === NodeType.Prompt ||
            depNode.type === NodeType.ImageInput;

          logger.debug(
            `[Single Node Execution] Checking dependency ${depNodeId}:`,
            {
              nodeType: depNode.type,
              status: depNode.data.status,
              hasOutputsProperty: !!depNode.data.outputs,
              outputsKeys: depNode.data.outputs
                ? Object.keys(depNode.data.outputs)
                : [],
              hasExistingOutputs,
              isCompleted,
              isInputNode,
              willSkip: hasExistingOutputs && (isCompleted || isInputNode),
              allDataKeys: Object.keys(depNode.data),
            },
          );

          // Skip if: (1) has outputs AND completed, OR (2) has outputs AND is an input node
          // Input nodes (Prompt, ImageInput) set outputs when user enters data, but don't have "completed" status
          if (hasExistingOutputs && (isCompleted || isInputNode)) {
            logger.debug(
              `[Single Node Execution] ✓ Skipping ${depNodeId} - already has outputs`,
              {
                outputs: depNode.data.outputs,
                reason: isInputNode ? "input node with data" : "completed node",
              },
            );
            continue; // Skip this dependency, use existing outputs
          }

          logger.debug(
            `[Single Node Execution] ⚠️ Re-executing dependency ${depNodeId}`,
            {
              reason: !hasExistingOutputs
                ? "no outputs"
                : "not completed and not input node",
              hasOutputs: hasExistingOutputs,
              isCompleted,
              isInputNode,
            },
          );

          setEdgeAnimated(depNodeId, true, false);
          updateNodeState(depNodeId, "executing");

          // ✅ Use gatherNodeInputs directly with currentNodes (not stale closure)
          const inputs = gatherNodeInputs(depNode, currentNodes, edges);
          const validation = validateNodeInputs(depNode, inputs);

          if (!validation.valid) {
            setEdgeAnimated(depNodeId, false, false);
            updateNodeState(depNodeId, "error", { error: validation.error });
            throw new Error(`Dependency failed: ${validation.error}`);
          }

          const result = await executeNode(depNode, inputs);

          if (!result.success) {
            setEdgeAnimated(depNodeId, false, false);
            updateNodeState(depNodeId, "error", { error: result.error });
            throw new Error(`Dependency failed: ${result.error}`);
          }

          // Preserve outputs structure (same as main workflow execution)
          const updateData = {
            ...result.data,
            outputs: result.data.outputs || result.data,
          };

          // ✅ CRITICAL FIX: Synchronously update currentNodes so downstream nodes
          // can see this dependency's outputs immediately
          currentNodes = currentNodes.map((n) =>
            n.id === depNodeId
              ? {
                ...n,
                data: {
                  ...n.data,
                  ...updateData,
                  outputs: updateData.outputs,
                  status: "completed",
                },
              }
              : n,
          );

          logger.debug(
            "[Single Node Execution] ✓ Synchronously updated dependency outputs:",
            {
              nodeId: depNodeId,
              nodeType: depNode.type,
              outputKeys: Object.keys(updateData.outputs || {}),
            },
          );

          setEdgeAnimated(depNodeId, false, true);
          updateNodeState(depNodeId, "completed", updateData);
          setTimeout(() => {
            setEdgeAnimated(depNodeId, false, false);
          }, 500);
        }

        // Execute target node
        // Get the latest version of the target node from currentNodes
        // (in case it was updated during dependency resolution)
        const latestTargetNode = currentNodes.find((n) => n.id === nodeId) || targetNode;

        setEdgeAnimated(nodeId, true, false);
        updateNodeState(nodeId, "executing");

        // ✅ Use gatherNodeInputs directly with currentNodes (not stale closure)
        const inputs = gatherNodeInputs(latestTargetNode, currentNodes, edges);
        const validation = validateNodeInputs(latestTargetNode, inputs);

        if (!validation.valid) {
          setEdgeAnimated(nodeId, false, false);
          updateNodeState(nodeId, "error", { error: validation.error });
          toast({
            title: "Validation Error",
            description: validation.error,
            variant: "destructive",
          });
          return;
        }

        const result = await executeNode(latestTargetNode, inputs);

        if (!result.success) {
          setEdgeAnimated(nodeId, false, false);
          updateNodeState(nodeId, "error", { error: result.error });
          toast({
            title: "Execution Failed",
            description: result.error,
            variant: "destructive",
          });
          return;
        }

        // Preserve outputs structure (same as main workflow execution)
        const updateData = {
          ...result.data,
          outputs: result.data.outputs || result.data,
        };

        setEdgeAnimated(nodeId, false, true);
        updateNodeState(nodeId, "completed", updateData);
        setTimeout(() => {
          setEdgeAnimated(nodeId, false, false);
        }, 500);

        toast({
          title: "Success",
          description: `${latestTargetNode.data.label || latestTargetNode.type} executed successfully!`,
        });
      } catch (error) {
        console.error("[Single Node Execution] Error:", error);
        toast({
          title: "Execution Error",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [nodes, edges, executeNode, updateNodeState, setEdgeAnimated],
  );

  return {
    executeWorkflow,
    abortWorkflow,
    resetWorkflow,
    executeSingleNode,
    isExecuting,
    executionProgress,
    totalNodes,
  };
}
