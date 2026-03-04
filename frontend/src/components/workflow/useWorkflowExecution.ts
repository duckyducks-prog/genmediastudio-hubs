import { logger } from "@/lib/logger";
import { useCallback, useState, useMemo } from "react";
import {
  WorkflowNode,
  WorkflowEdge,
  NodeType,
  BatchIterationResult,
} from "./types";
import { toast } from "@/hooks/use-toast";
import {
  gatherNodeInputs,
  validateNodeInputs,
  executeConcatenator,
  executeTextIterator,
  pollVideoStatus,
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
) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<
    Map<string, string>
  >(new Map());
  const [totalNodes, setTotalNodes] = useState(0);
  const [abortRequested, setAbortRequested] = useState(false);

  // Batch execution state (for ScriptQueue)
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchResults, setBatchResults] = useState<Array<{ index: number; success: boolean; outputs?: any }>>([]);

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
      executeConcatenator,
      executeTextIterator,
      executeCompoundNode,
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

    // Check for ScriptQueue node (batch mode)
    const scriptQueueNode = nodes.find((n) => n.type === NodeType.ScriptQueue);
    const scripts = scriptQueueNode ? (scriptQueueNode.data as any).scripts || [] : [];
    const batchMode = scriptQueueNode && scripts.length > 1;

    // Identify post-batch aggregator nodes - these should run AFTER all batch iterations complete
    // A post-batch node is one that:
    // 1. Is an aggregator type (MergeVideos, AddMusicToVideo, VoiceChanger)
    // 2. Has inputs that come from nodes IN THE BATCH ITERATION CHAIN
    // The batch iteration chain: ScriptQueue → ... → GenerateVideo/GenerateImage
    // These nodes need ALL iteration outputs, not just the current iteration's output
    const postBatchNodeIds = new Set<string>();

    // Track the actual batch iteration node (the one connected to ScriptQueue's output chain)
    let batchIterationVideoNodeId: string | undefined;

    if (batchMode && scriptQueueNode) {
      // Find the node that receives ScriptQueue's text output (usually Prompt or GenerateVideo via chain)
      // Then trace to find the video-producing node in the batch chain
      const scriptQueueOutEdges = edges.filter(e => e.source === scriptQueueNode.id);

      // Trace the chain from ScriptQueue to find GenerateVideo/GenerateImage
      const findBatchVideoNode = (startNodeId: string, visited = new Set<string>()): string | undefined => {
        if (visited.has(startNodeId)) return undefined;
        visited.add(startNodeId);

        const node = nodes.find(n => n.id === startNodeId);
        if (!node) return undefined;

        // Found a video-producing node
        if (node.type === NodeType.GenerateVideo || node.type === NodeType.GenerateImage) {
          return node.id;
        }

        // Continue tracing downstream
        const outEdges = edges.filter(e => e.source === startNodeId);
        for (const edge of outEdges) {
          const result = findBatchVideoNode(edge.target, visited);
          if (result) return result;
        }

        return undefined;
      };

      // Find the batch iteration video node starting from ScriptQueue
      for (const edge of scriptQueueOutEdges) {
        batchIterationVideoNodeId = findBatchVideoNode(edge.target);
        if (batchIterationVideoNodeId) break;
      }

      logger.info(`[Batch] Batch iteration video node:`, {
        nodeId: batchIterationVideoNodeId,
        nodeType: batchIterationVideoNodeId ? nodes.find(n => n.id === batchIterationVideoNodeId)?.type : 'not found'
      });

      // Aggregator types that should run after batch completes
      const aggregatorTypes = new Set([
        NodeType.MergeVideos,
        NodeType.AddMusicToVideo,
        NodeType.VoiceChanger,
      ]);

      // Now identify post-batch nodes: aggregators that receive from the batch iteration video node
      // OR any aggregator node that's downstream of the batch video node
      if (batchIterationVideoNodeId) {
        // Helper to check if a node is reachable from the batch video node
        const isDownstreamOfBatchVideo = (nodeId: string, visited = new Set<string>()): boolean => {
          if (visited.has(nodeId)) return false;
          visited.add(nodeId);

          if (nodeId === batchIterationVideoNodeId) return true;

          // Check incoming edges
          const inEdges = edges.filter(e => e.target === nodeId);
          for (const edge of inEdges) {
            if (isDownstreamOfBatchVideo(edge.source, visited)) return true;
          }
          return false;
        };

        for (const node of nodes) {
          if (!aggregatorTypes.has(node.type as NodeType)) continue;

          // Check if this aggregator is downstream of the batch video node
          const isDownstream = isDownstreamOfBatchVideo(node.id);

          logger.debug(`[Batch] Checking aggregator ${node.type} (${node.id}):`, {
            isDownstreamOfBatchVideo: isDownstream,
          });

          if (isDownstream) {
            postBatchNodeIds.add(node.id);
            logger.info(`[Batch] Marked ${node.type} (${node.id}) as post-batch node`);

            // Also add any nodes downstream of this post-batch node
            const findDownstream = (nodeId: string) => {
              const outEdges = edges.filter(e => e.source === nodeId);
              for (const edge of outEdges) {
                if (!postBatchNodeIds.has(edge.target)) {
                  const downstreamNode = nodes.find(n => n.id === edge.target);
                  postBatchNodeIds.add(edge.target);
                  logger.info(`[Batch] Marked downstream ${downstreamNode?.type} (${edge.target}) as post-batch node`);
                  findDownstream(edge.target);
                }
              }
            };
            findDownstream(node.id);
          }
        }
      }

      if (postBatchNodeIds.size > 0) {
        logger.info(`[Batch] Total ${postBatchNodeIds.size} post-batch nodes identified`);
      } else {
        logger.warn(`[Batch] No post-batch nodes identified. Aggregator nodes will run during each iteration.`);
      }
    }

    if (batchMode) {
      setIsBatchMode(true);
      setBatchProgress({ current: 0, total: scripts.length });
      setBatchResults([]);
      logger.info(`[Batch] Starting batch execution with ${scripts.length} scripts`);
    }

    // Track total nodes for progress calculation
    setTotalNodes(executionOrder.length);

    // Helper function to run a single workflow iteration
    const runSingleIteration = async (iterationIndex: number = 0): Promise<{ completed: number; failed: number }> => {
      // Update ScriptQueue node's currentIndex for this iteration and reset other nodes
      // Use a Promise to get the latest state after update
      let currentNodes: WorkflowNode[] = [];

      if (scriptQueueNode && batchMode) {
        logger.info(`[Batch] Starting iteration ${iterationIndex + 1} - clearing stale outputs from previous iteration`);
        await new Promise<void>((resolve) => {
          setNodes((prevNodes) => {
            currentNodes = prevNodes.map((n) =>
              n.id === scriptQueueNode.id
                ? {
                  ...n,
                  data: {
                    ...n.data,
                    currentIndex: iterationIndex,
                    isProcessing: true,
                  },
                }
                : {
                  ...n,
                  data: {
                    ...n.data,
                    status: "ready", // Reset status for re-execution
                    // Preserve outputs for static input nodes that don't change between iterations
                    // These nodes provide constant data (like reference images) used by all iterations
                    // Tag with execution ID to prevent stale data from previous runs being used
                    outputs: [NodeType.ScriptQueue, NodeType.ImageInput, NodeType.VideoInput, NodeType.Prompt].includes(n.type as NodeType)
                      ? {
                        ...n.data.outputs,
                        _executionId: executionId,
                        _preservedAt: Date.now()
                      }
                      : {}, // Clear outputs for nodes that need re-execution
                    error: undefined, // Clear any previous errors
                    // CRITICAL: Clear stale execution results from previous iteration
                    // These top-level fields can cause "Mixed URL and base64 formats" errors
                    // when downstream nodes read old data via fallback instead of fresh outputs
                    // BUT: Preserve them for static input nodes (ImageInput, VideoInput, Prompt)
                    ...([NodeType.ImageInput, NodeType.VideoInput, NodeType.Prompt].includes(n.type as NodeType) ? {} : {
                      video: undefined,
                      videoUrl: undefined,
                      gcsUrl: undefined,
                      image: undefined,
                      imageUrl: undefined,
                      images: undefined,
                      text: undefined,
                      response: undefined,
                      audio: undefined,
                      audioUrl: undefined,
                    }),
                  },
                }
            );
            // Schedule resolve after state update is processed
            setTimeout(resolve, 100);
            return currentNodes;
          });
        });
      } else {
        // Non-batch mode: use nodes directly
        currentNodes = nodes;
      }

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

        // Filter out post-batch nodes during batch iterations - they run after all iterations
        const levelNodes = levels[levelIndex].filter(n => !postBatchNodeIds.has(n.id));

        // Skip this level if all nodes were filtered out
        if (levelNodes.length === 0) {
          logger.debug(`[Execution] Skipping level ${levelIndex} - all nodes are post-batch`);
          continue;
        }

        // Log tracked nodes state at the start of each level
        logger.debug(`[Execution] 📊 Starting Level ${levelIndex}/${levels.length - 1}:`, {
          nodesInLevel: levelNodes.map((n) => ({ id: n.id, type: n.type })),
          skippedPostBatchNodes: levels[levelIndex].filter(n => postBatchNodeIds.has(n.id)).map(n => ({ id: n.id, type: n.type })),
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

        // Execute API nodes sequentially (no delays)
        const apiResults = [];
        for (const node of apiNodes) {
          progress.set(node.id, "executing");
          setEdgeAnimated(node.id, true, false);
          updateNodeState(node.id, "executing");
          setExecutionProgress(new Map(progress));

          const inputs = getTrackedInputs(node.id);

          // Diagnostic log for input gathering verification
          logger.debug(`[Execution] Gathered inputs for ${node.type}:`, {
            nodeId: node.id,
            inputKeys: Object.keys(inputs),
            first_frame: inputs.first_frame
              ? {
                type: typeof inputs.first_frame,
                length: inputs.first_frame?.length || 0,
                preview:
                  typeof inputs.first_frame === "string"
                    ? inputs.first_frame.substring(0, 50) + "..."
                    : inputs.first_frame,
                isDataUrl:
                  typeof inputs.first_frame === "string" &&
                  inputs.first_frame.startsWith("data:"),
              }
              : "MISSING",
            last_frame: inputs.last_frame ? "present" : "missing",
            reference_images: inputs.reference_images
              ? Array.isArray(inputs.reference_images)
                ? `array[${inputs.reference_images.length}]`
                : "single"
              : "missing",
            video: inputs.video
              ? {
                type: typeof inputs.video,
                length: inputs.video?.length || 0,
                isDataUrl:
                  typeof inputs.video === "string" &&
                  inputs.video.startsWith("data:"),
              }
              : "missing",
          });

          const validation = validateNodeInputs(node, inputs);

          let result;
          if (!validation.valid) {
            result = {
              status: "fulfilled" as const,
              value: {
                nodeId: node.id,
                success: false,
                error: validation.error,
              },
            };
          } else {
            try {
              const execResult = await executeNode(node, inputs);

              // ✅ CRITICAL FIX: Update trackedNodes array synchronously for API nodes
              // This ensures downstream nodes see the latest outputs immediately
              if (execResult.success && execResult.data) {
                const updatedOutputs =
                  execResult.data.outputs || execResult.data;

                // Enhanced logging to trace output structure
                logger.debug(
                  "[Execution] 📦 execResult.data structure:",
                  {
                    nodeId: node.id,
                    nodeType: node.type,
                    hasNestedOutputs: !!execResult.data.outputs,
                    nestedOutputsKeys: execResult.data.outputs ? Object.keys(execResult.data.outputs) : [],
                    topLevelDataKeys: Object.keys(execResult.data),
                    videoInOutputs: !!execResult.data.outputs?.video,
                    videoInTopLevel: !!execResult.data.video,
                    videoValuePreview: (execResult.data.outputs?.video || execResult.data.video)
                      ? String(execResult.data.outputs?.video || execResult.data.video).substring(0, 80) + "..."
                      : "NONE",
                  },
                );

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

                // Verify the update was applied correctly
                const updatedNode = trackedNodes.find((n) => n.id === node.id);
                logger.debug(
                  "[Execution] ✓ Verified trackedNodes update:",
                  {
                    nodeId: node.id,
                    nodeType: node.type,
                    updatedOutputKeys: updatedNode?.data.outputs ? Object.keys(updatedNode.data.outputs) : [],
                    hasVideoInOutputs: !!updatedNode?.data.outputs?.video,
                    hasVideoTopLevel: !!(updatedNode?.data as any)?.video,
                    trackedNodesCount: trackedNodes.length,
                  },
                );
              }

              result = {
                status: "fulfilled" as const,
                value: {
                  nodeId: node.id,
                  ...execResult,
                },
              };
            } catch (error) {
              result = {
                status: "rejected" as const,
                reason: error,
              };
            }
          }

          apiResults.push(result);
        }

        // Process results from both parallel and sequential execution
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
                    updateNodeState(downstreamNodeId, downstreamNode.data.status, {
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
    }; // End of runSingleIteration

    try {
      // Execute workflow (with batch mode if ScriptQueue exists)
      if (batchMode && scripts.length > 0) {
        // Batch execution mode
        let batchCompleted = 0;
        let batchFailed = 0;
        const results: Array<{ index: number; success: boolean }> = [];
        const collectedResults: BatchIterationResult[] = [];

        // Find terminal nodes (nodes with no outgoing edges) for collecting outputs
        const nodesWithOutgoingEdges = new Set(edges.map(e => e.source));
        const terminalNodes = nodes.filter(n =>
          !nodesWithOutgoingEdges.has(n.id) &&
          n.id !== scriptQueueNode?.id &&
          n.data.enabled !== false
        );
        logger.info(`[Batch] Terminal nodes for output collection:`, terminalNodes.map(n => ({ id: n.id, type: n.type })));

        // Clear any previous collected results
        if (scriptQueueNode) {
          setNodes((prevNodes) =>
            prevNodes.map((n) =>
              n.id === scriptQueueNode.id
                ? { ...n, data: { ...n.data, collectedResults: [] } }
                : n
            )
          );
        }

        // Circuit breaker: stop batch if too many consecutive failures
        const MAX_CONSECUTIVE_FAILURES = 3;
        let consecutiveFailures = 0;

        for (let i = 0; i < scripts.length; i++) {
          // Check if abort was requested
          if (abortRequested) {
            toast({
              title: "Batch Aborted",
              description: `Stopped after ${i} of ${scripts.length} scripts`,
              variant: "destructive",
            });
            break;
          }

          // Circuit breaker check
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            logger.error(`[Batch] Circuit breaker triggered: ${consecutiveFailures} consecutive failures`);
            toast({
              title: "Batch Stopped",
              description: `Stopped after ${consecutiveFailures} consecutive failures. There may be a persistent issue. Completed ${batchCompleted} of ${scripts.length} scripts.`,
              variant: "destructive",
            });
            break;
          }

          setBatchProgress({ current: i + 1, total: scripts.length });
          logger.info(`[Batch] Running script ${i + 1} of ${scripts.length}`);

          toast({
            title: `Batch Progress`,
            description: `Processing script ${i + 1} of ${scripts.length}...`,
          });

          // Add delay between iterations to avoid rate limiting (except for first iteration)
          if (i > 0) {
            logger.debug(`[Batch] Waiting 2s before next iteration to avoid rate limits`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }

          const result = await runSingleIteration(i);

          // Collect output from the batch iteration video node after iteration completes
          // This is the node that produces video for each iteration (e.g., GenerateVideo)
          let collectedVideoUrl: string | undefined;
          let iterationError: string | undefined;

          if (result.failed === 0) {
            batchCompleted++;
            consecutiveFailures = 0; // Reset circuit breaker on success
            results.push({ index: i, success: true });

            // Get current nodes state to find the batch iteration video node's output
            await new Promise<void>((resolve) => {
              setNodes((currentNodes) => {
                // CRITICAL FIX: Look for video output from the batch iteration video node specifically
                // This is the node that's connected to ScriptQueue and produces videos each iteration
                if (batchIterationVideoNodeId) {
                  const batchVideoNode = currentNodes.find(n => n.id === batchIterationVideoNodeId);
                  if (batchVideoNode?.data) {
                    const nodeData = batchVideoNode.data as any;
                    // Prefer GCS URL for downstream processing (avoids 32MB limit)
                    // Fall back to data URL or outputs.video
                    const videoUrl = nodeData.gcsUrl || nodeData.outputs?.video || nodeData.videoUrl || nodeData.video;
                    if (videoUrl) {
                      collectedVideoUrl = videoUrl;
                      logger.info(`[Batch] ✓ Collected video from batch node ${batchVideoNode.type}:`, {
                        iteration: i + 1,
                        urlPreview: videoUrl.substring(0, 100),
                        isGcsUrl: videoUrl.startsWith('https://storage.googleapis.com'),
                      });
                    } else {
                      logger.warn(`[Batch] ⚠️ No video output found in batch node ${batchVideoNode.type}`, {
                        iteration: i + 1,
                        availableKeys: Object.keys(nodeData),
                        outputsKeys: nodeData.outputs ? Object.keys(nodeData.outputs) : [],
                      });
                    }
                  }
                }

                // Fallback: If no batch video node or no output, check terminal nodes
                if (!collectedVideoUrl) {
                  const priorityOrder = [NodeType.GenerateVideo, NodeType.AddMusicToVideo, NodeType.MergeVideos];

                  for (const nodeType of priorityOrder) {
                    // Look in all nodes, not just terminalNodes (which might exclude post-batch nodes)
                    const videoNode = currentNodes.find(n =>
                      n.type === nodeType &&
                      !postBatchNodeIds.has(n.id) // Skip post-batch nodes
                    );
                    if (videoNode?.data) {
                      const nodeData = videoNode.data as any;
                      const videoUrl = nodeData.gcsUrl || nodeData.outputs?.video || nodeData.outputVideoUrl || nodeData.videoUrl;
                      if (videoUrl) {
                        collectedVideoUrl = videoUrl;
                        logger.info(`[Batch] Collected video from fallback ${nodeType}:`, videoUrl.substring(0, 100));
                        break;
                      }
                    }
                  }
                }

                resolve();
                return currentNodes; // Return unchanged
              });
            });
          } else {
            batchFailed++;
            consecutiveFailures++; // Increment circuit breaker counter
            results.push({ index: i, success: false });
            iterationError = `${result.failed} node(s) failed`;
            logger.warn(`[Batch] Iteration ${i + 1} failed (consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
          }

          // Add to collected results
          const iterationResult: BatchIterationResult = {
            index: i,
            scriptPreview: scripts[i].substring(0, 50) + (scripts[i].length > 50 ? "..." : ""),
            success: result.failed === 0,
            videoUrl: collectedVideoUrl,
            error: iterationError,
            timestamp: Date.now(),
          };
          collectedResults.push(iterationResult);

          // Update ScriptQueue with collected results (incrementally)
          if (scriptQueueNode) {
            setNodes((prevNodes) =>
              prevNodes.map((n) =>
                n.id === scriptQueueNode.id
                  ? { ...n, data: { ...n.data, collectedResults: [...collectedResults] } }
                  : n
              )
            );
          }

          setBatchResults([...results]);

          // Small delay between iterations to avoid overwhelming APIs
          if (i < scripts.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        // Mark ScriptQueue as done (keep collectedResults)
        if (scriptQueueNode) {
          setNodes((prevNodes) =>
            prevNodes.map((n) =>
              n.id === scriptQueueNode.id
                ? { ...n, data: { ...n.data, isProcessing: false, collectedResults } }
                : n
            )
          );
        }

        // ========== POST-BATCH NODE EXECUTION ==========
        // Execute aggregator nodes (MergeVideos, AddMusicToVideo, VoiceChanger) that were skipped
        // during batch iterations. These nodes need outputs from ALL iterations.

        // Debug: Log the state before post-batch execution
        logger.info(`[Batch] 🔍 Post-batch check:`, {
          postBatchNodeIds: Array.from(postBatchNodeIds),
          postBatchNodeCount: postBatchNodeIds.size,
          collectedResultsCount: collectedResults.length,
          batchIterationVideoNodeId,
          collectedVideos: collectedResults.map(r => ({
            index: r.index,
            success: r.success,
            hasVideo: !!r.videoUrl,
          })),
        });

        // FALLBACK: If no post-batch nodes were detected but we have aggregator nodes
        // and collected videos, try to find and add them now
        if (postBatchNodeIds.size === 0 && collectedResults.length > 0) {
          const aggregatorTypes = new Set([
            NodeType.MergeVideos,
            NodeType.AddMusicToVideo,
            NodeType.VoiceChanger,
          ]);

          const aggregatorNodes = nodes.filter(n => aggregatorTypes.has(n.type as NodeType));

          if (aggregatorNodes.length > 0) {
            logger.warn(`[Batch] ⚠️ No post-batch nodes detected but found ${aggregatorNodes.length} aggregator node(s). Adding them as post-batch.`);

            // Add all aggregators and their downstream nodes
            for (const aggNode of aggregatorNodes) {
              postBatchNodeIds.add(aggNode.id);

              const findDownstream = (nodeId: string) => {
                const outEdges = edges.filter(e => e.source === nodeId);
                for (const edge of outEdges) {
                  if (!postBatchNodeIds.has(edge.target)) {
                    postBatchNodeIds.add(edge.target);
                    findDownstream(edge.target);
                  }
                }
              };
              findDownstream(aggNode.id);
            }

            logger.info(`[Batch] Added ${postBatchNodeIds.size} nodes as post-batch (fallback)`);
          }
        }

        if (postBatchNodeIds.size > 0 && collectedResults.length > 0) {
          logger.info(`[Batch] Starting post-batch execution for ${postBatchNodeIds.size} nodes`);

          // Collect video URLs from successful iterations, PRESERVING SCRIPT ORDER
          // Sort by index to ensure videos are merged in the same order as scripts
          const batchVideoUrls = collectedResults
            .filter(r => r.success && r.videoUrl)
            .sort((a, b) => a.index - b.index)  // Ensure script order is preserved
            .map(r => r.videoUrl as string);

          logger.info(`[Batch] Collected ${batchVideoUrls.length} video URLs in script order:`,
            collectedResults
              .filter(r => r.success && r.videoUrl)
              .sort((a, b) => a.index - b.index)
              .map(r => ({ index: r.index, scriptPreview: r.scriptPreview }))
          );

          if (batchVideoUrls.length >= 2) {
            // Find and execute post-batch nodes in dependency order
            const postBatchNodes = nodes.filter(n => postBatchNodeIds.has(n.id));

            // Sort by dependency order (nodes with no post-batch dependencies first)
            const sortedPostBatchNodes = [...postBatchNodes].sort((a, b) => {
              const aHasPostBatchInput = edges.some(e => e.target === a.id && postBatchNodeIds.has(e.source));
              const bHasPostBatchInput = edges.some(e => e.target === b.id && postBatchNodeIds.has(e.source));
              return (aHasPostBatchInput ? 1 : 0) - (bHasPostBatchInput ? 1 : 0);
            });

            // Get the CURRENT state of all nodes (including outputs from iteration nodes like GenerateMusic)
            // This is critical for post-batch nodes that need non-video inputs (e.g., audio for AddMusicToVideo)
            let postBatchTrackedNodes: WorkflowNode[] = [];
            await new Promise<void>((resolve) => {
              setNodes((currentNodes) => {
                postBatchTrackedNodes = [...currentNodes];
                resolve();
                return currentNodes;
              });
            });

            logger.info(`[Batch] Post-batch tracked nodes state:`,
              postBatchTrackedNodes
                .filter(n => n.data.outputs && Object.keys(n.data.outputs as object).length > 0)
                .map(n => ({
                  id: n.id,
                  type: n.type,
                  outputKeys: Object.keys(n.data.outputs as object),
                }))
            );

            for (const postBatchNode of sortedPostBatchNodes) {
              logger.info(`[Batch] Executing post-batch node: ${postBatchNode.type} (${postBatchNode.id})`);

              // Update node state to executing
              updateNodeState(postBatchNode.id, "executing");
              setEdgeAnimated(postBatchNode.id, true, false);

              // Build inputs for this post-batch node
              let postBatchInputs: Record<string, any> = {};

              if (postBatchNode.type === NodeType.MergeVideos) {
                // MergeVideos gets video URLs from batch iterations
                // Map video1, video2, video3... to the collected URLs
                batchVideoUrls.forEach((url, idx) => {
                  if (idx < 6) {
                    postBatchInputs[`video${idx + 1}`] = url;
                  }
                });
                logger.info(`[Batch] MergeVideos inputs:`, {
                  videoCount: Object.keys(postBatchInputs).length,
                  firstVideoPreview: batchVideoUrls[0]?.substring(0, 80),
                });
              } else {
                // Other post-batch nodes (AddMusicToVideo, VoiceChanger) get inputs from
                // their connected upstream nodes (which might be other post-batch nodes)
                postBatchInputs = gatherNodeInputs(postBatchNode, postBatchTrackedNodes, edges, { executionId });

                logger.info(`[Batch] ${postBatchNode.type} gathered inputs:`, {
                  inputKeys: Object.keys(postBatchInputs),
                  hasVideo: !!postBatchInputs.video,
                  hasAudio: !!postBatchInputs.audio,
                  hasAudioTrack1: !!postBatchInputs.audioTrack1,
                });
              }

              try {
                const result = await executeNode(postBatchNode, postBatchInputs);

                if (result.success && result.data) {
                  const updatedOutputs = result.data.outputs || result.data;

                  // Update tracked nodes with this output
                  postBatchTrackedNodes = postBatchTrackedNodes.map(n =>
                    n.id === postBatchNode.id
                      ? { ...n, data: { ...n.data, outputs: updatedOutputs, ...updatedOutputs } }
                      : n
                  );

                  // Update React state
                  updateNodeState(postBatchNode.id, "completed", { ...result.data, outputs: updatedOutputs });
                  setEdgeAnimated(postBatchNode.id, false, true);
                  setTimeout(() => setEdgeAnimated(postBatchNode.id, false, false), 500);

                  logger.info(`[Batch] ✓ Post-batch node ${postBatchNode.type} completed successfully`);
                } else {
                  updateNodeState(postBatchNode.id, "error", { error: result.error });
                  setEdgeAnimated(postBatchNode.id, false, false);
                  logger.error(`[Batch] ✗ Post-batch node ${postBatchNode.type} failed:`, result.error);
                }
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : "Unknown error";
                updateNodeState(postBatchNode.id, "error", { error: errorMsg });
                setEdgeAnimated(postBatchNode.id, false, false);
                logger.error(`[Batch] ✗ Post-batch node ${postBatchNode.type} threw error:`, errorMsg);
              }
            }

            // Find the final output from the last post-batch node
            const lastPostBatchNode = sortedPostBatchNodes[sortedPostBatchNodes.length - 1];
            const finalNode = postBatchTrackedNodes.find(n => n.id === lastPostBatchNode?.id);
            const finalVideoUrl = (finalNode?.data as any)?.outputVideoUrl ||
              (finalNode?.data as any)?.outputs?.video ||
              (finalNode?.data as any)?.videoUrl;

            if (finalVideoUrl) {
              logger.info(`[Batch] 🎬 Final output from ${lastPostBatchNode?.type}:`, finalVideoUrl.substring(0, 100));

              // Store the final merged video in ScriptQueue for easy access
              if (scriptQueueNode) {
                setNodes((prevNodes) =>
                  prevNodes.map((n) =>
                    n.id === scriptQueueNode.id
                      ? { ...n, data: { ...n.data, finalVideoUrl, finalVideoNodeType: lastPostBatchNode?.type } }
                      : n
                  )
                );
              }
            }

            toast({
              title: "Post-Batch Processing Complete",
              description: `Merged ${batchVideoUrls.length} videos → ${sortedPostBatchNodes.map(n => n.type).join(' → ')}`,
            });
          } else {
            // Not enough videos collected - provide helpful error message
            const failedIterations = collectedResults.filter(r => !r.success).length;
            const iterationsWithVideo = collectedResults.filter(r => r.videoUrl).length;

            logger.warn(`[Batch] Skipping post-batch nodes:`, {
              totalIterations: collectedResults.length,
              failedIterations,
              iterationsWithVideo,
              videosCollected: batchVideoUrls.length,
              collectedResultsDetail: collectedResults.map(r => ({
                index: r.index,
                success: r.success,
                hasVideo: !!r.videoUrl,
                videoUrlPreview: r.videoUrl ? r.videoUrl.substring(0, 60) : 'none',
              })),
            });

            // Mark post-batch nodes as skipped with detailed error
            const errorMessage = batchVideoUrls.length === 0
              ? `No videos collected from ${collectedResults.length} iteration(s). Check if GenerateVideo completed successfully.`
              : batchVideoUrls.length === 1
                ? `Only 1 video collected (need at least 2 to merge). ${failedIterations} iteration(s) failed.`
                : `Only ${batchVideoUrls.length} video(s) collected from batch.`;

            postBatchNodeIds.forEach(nodeId => {
              updateNodeState(nodeId, "error", { error: errorMessage });
            });
          }
        }

        // Show batch completion summary
        toast({
          title: "Batch Completed",
          description: `${batchCompleted} of ${scripts.length} scripts succeeded${batchFailed > 0 ? `, ${batchFailed} failed` : ""}`,
          variant: batchFailed > 0 ? "destructive" : "default",
        });

        setIsBatchMode(false);
      } else {
        // Normal single execution mode
        const result = await runSingleIteration(0);

        // Show completion summary
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
      setIsBatchMode(false);
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
    // Batch execution state
    isBatchMode,
    batchProgress,
    batchResults,
  };
}
