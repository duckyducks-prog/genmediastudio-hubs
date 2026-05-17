import { logger } from "@/lib/logger";
import {
  WorkflowNode,
  WorkflowEdge,
  NODE_CONFIGURATIONS,
  NodeType,
} from "./types";
import { API_ENDPOINTS } from "@/lib/api-config";
import { calculateBackoff } from "@/lib/retry";

/**
 * Resolve an asset reference (imageRef, videoRef) to a data URL
 * Fetches from asset library API and converts to base64 data URI
 */
export async function resolveAssetToDataUrl(assetRef: string): Promise<string> {
  logger.debug("[resolveAssetToDataUrl] Resolving asset:", assetRef);

  try {
    // Import dynamically to avoid circular dependencies
    const { auth } = await import("@/lib/firebase");

    // Get asset metadata from library
    const user = auth.currentUser;
    const token = await user?.getIdToken();

    const response = await fetch(API_ENDPOINTS.library.list(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch assets: ${response.status}`);
    }

    const data = await response.json();
    // Backend returns { assets: [...], count: N }
    const assets = data.assets || data;
    const asset = assets.find((a: any) => a.id === assetRef);

    if (!asset?.url) {
      throw new Error(`Asset not found: ${assetRef}`);
    }

    logger.debug("[resolveAssetToDataUrl] Asset URL:", asset.url);

    // If already a data URL, return as-is
    if (asset.url.startsWith("data:")) {
      return asset.url;
    }

    // Fetch the asset content and convert to data URL
    const assetResponse = await fetch(asset.url, { mode: "cors" });
    if (!assetResponse.ok) {
      throw new Error(`Failed to fetch asset content: ${assetResponse.status}`);
    }

    const blob = await assetResponse.blob();

    // Convert blob to data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        logger.debug(
          "[resolveAssetToDataUrl] Converted to data URL, length:",
          dataUrl.length,
        );
        resolve(dataUrl);
      };
      reader.onerror = () =>
        reject(new Error("Failed to convert blob to data URL"));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[resolveAssetToDataUrl] Failed:", error);
    throw error;
  }
}

/**
 * Extract the last frame from a video as a data URL
 */
export async function extractLastFrameFromVideo(
  videoDataUrl: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = videoDataUrl;
    video.muted = true;

    video.onloadedmetadata = () => {
      // Seek to last frame (duration - 0.1s for safety)
      video.currentTime = Math.max(0, video.duration - 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameDataUrl = canvas.toDataURL("image/png");
        resolve(frameDataUrl);
      } catch (error) {
        reject(error);
      }
    };

    video.onerror = () => reject(new Error("Failed to load video"));
  });
}

/**
 * Gather inputs for a node by following connections backwards
 */
export function gatherNodeInputs(
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  executionContext?: { executionId?: string }
): Record<string, any> {
  const inputs: Record<string, any> = {};
  if (!node.type) {
    logger.warn(`[gatherNodeInputs] Node ${node.id} has no type`);
    return inputs;
  }
  const nodeConfig = NODE_CONFIGURATIONS[node.type as NodeType];

  logger.debug(`[gatherNodeInputs] Processing node ${node.id} (${node.type})`);

  // Find all edges that connect TO this node
  const incomingEdges = edges.filter((edge) => edge.target === node.id);
  logger.debug(
    `[gatherNodeInputs] Found ${incomingEdges.length} incoming edges`,
  );

  incomingEdges.forEach((edge) => {
    const sourceNode = allNodes.find((n) => n.id === edge.source);

    logger.debug(`[gatherNodeInputs] Processing edge:`, {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || "DEFAULT", // ⚠️ Should NOT be default
      targetHandle: edge.targetHandle || "DEFAULT", // ⚠️ Should NOT be default
      hasSourceNode: !!sourceNode,
      sourceNodeType: sourceNode?.type,
      sourceNodeHasOutputs: !!sourceNode?.data?.outputs,
      sourceNodeOutputKeys: sourceNode?.data?.outputs
        ? Object.keys(sourceNode.data.outputs)
        : [],
      sourceNodeTopLevelKeys: sourceNode?.data
        ? Object.keys(sourceNode.data).filter(
          (k) => !["label", "status", "isGenerating"].includes(k),
        )
        : [],
    });

    if (!sourceNode) {
      console.warn(
        `[gatherNodeInputs] ⚠️ Skipping edge - source node not found`,
      );
      return;
    }

    let targetHandle = edge.targetHandle || "default";
    const sourceHandle = edge.sourceHandle || "default";

    // ✅ CRITICAL FIX: If targetHandle is "default", resolve it to the actual input connector ID
    // This happens when React Flow doesn't capture the handle ID on edge creation
    if (targetHandle === "default" && nodeConfig.inputConnectors.length > 0) {
      // If there's only one input connector, use that
      if (nodeConfig.inputConnectors.length === 1) {
        targetHandle = nodeConfig.inputConnectors[0].id;
        logger.debug(`[gatherNodeInputs] Resolved default targetHandle to "${targetHandle}"`);
      } else {
        // Multiple connectors - try to find the first required one, or first text type
        const requiredConnector = nodeConfig.inputConnectors.find((c: { required?: boolean }) => c.required);
        const textConnector = nodeConfig.inputConnectors.find((c: { type?: string }) => c.type === "text");
        if (requiredConnector) {
          targetHandle = requiredConnector.id;
          logger.debug(`[gatherNodeInputs] Resolved default targetHandle to required input "${targetHandle}"`);
        } else if (textConnector) {
          targetHandle = textConnector.id;
          logger.debug(`[gatherNodeInputs] Resolved default targetHandle to text input "${targetHandle}"`);
        }
      }
    }

    // First, try to get from outputs object
    const outputs = sourceNode.data.outputs as Record<string, unknown> | undefined;
    let outputValue = outputs?.[sourceHandle];

    // Validate outputs are from current execution (not stale from previous run)
    if (outputValue !== undefined && outputs) {
      const outputExecutionId = outputs._executionId;
      const currentExecutionId = executionContext?.executionId;

      if (outputExecutionId && currentExecutionId && outputExecutionId !== currentExecutionId) {
        logger.warn(
          `[gatherNodeInputs] Discarding stale output from ${sourceNode.id} ` +
          `(execution ${outputExecutionId} vs ${currentExecutionId})`
        );
        outputValue = undefined;  // Discard stale output, will fallback to top-level fields
      }
    }

    logger.debug(`[gatherNodeInputs] Looking for outputs["${sourceHandle}"]`, {
      found: outputValue !== undefined,
      valueType: typeof outputValue,
      isArray: Array.isArray(outputValue),
      valueLength: (outputValue as string | unknown[] | undefined)?.length || 0,
      valuePreview:
        typeof outputValue === "string"
          ? outputValue.substring(0, 50) + "..."
          : outputValue,
      fullOutputsObject: sourceNode.data.outputs,
    });

    // FALLBACK: If not found in outputs, try top-level data
    if (outputValue === undefined && sourceNode.data) {
      const dataRecord = sourceNode.data as unknown as Record<string, unknown>;
      outputValue = dataRecord[sourceHandle];
      if (outputValue !== undefined) {
        console.warn(
          `[gatherNodeInputs] ⚠️ Using fallback from node.data["${sourceHandle}"] (not in outputs)`,
          {
            valueType: typeof outputValue,
            valueLength: (outputValue as string | unknown[])?.length || 0,
          },
        );
      }
    }

    // If still not found, check common aliases
    // Use type assertion since we're checking properties that exist on specific node types
    const nodeData = sourceNode.data as unknown as Record<string, unknown>;
    if (outputValue === undefined && sourceHandle === "image") {
      outputValue =
        outputs?.image ||
        outputs?.imageUrl ||
        nodeData.image ||
        nodeData.imageUrl;
      if (outputValue !== undefined) {
        console.warn(`[gatherNodeInputs] ⚠️ Found via image/imageUrl alias`);
      } else if (nodeData.imageRef) {
        console.error(
          `[gatherNodeInputs] ❌ CRITICAL: Node has imageRef but no imageUrl!`,
          {
            nodeId: sourceNode.id,
            imageRef: nodeData.imageRef,
            suggestion:
              "Asset resolution needed - workflow was likely saved/reloaded",
          },
        );
      }
    }

    // Images handle alias (for array of images)
    if (outputValue === undefined && sourceHandle === "images") {
      outputValue =
        outputs?.images ||
        nodeData.images;
      if (outputValue !== undefined) {
        console.warn(`[gatherNodeInputs] ⚠️ Found via images alias`);
      }
    }

    // Video handle alias
    if (outputValue === undefined && sourceHandle === "video") {
      outputValue =
        outputs?.video ||
        outputs?.videoUrl ||
        outputs?.gcsUrl ||
        nodeData.video ||
        nodeData.videoUrl ||
        nodeData.gcsUrl;
      if (outputValue !== undefined) {
        console.warn(`[gatherNodeInputs] ⚠️ Found via video/videoUrl/gcsUrl alias`);
      } else if (nodeData.videoRef) {
        console.error(
          `[gatherNodeInputs] ❌ CRITICAL: Node has videoRef but no videoUrl!`,
          {
            nodeId: sourceNode.id,
            videoRef: nodeData.videoRef,
            suggestion: "Asset resolution needed",
          },
        );
      }
    }

    // Media-output handle alias (used by VideoOutput/ImageOutput for chaining)
    if (outputValue === undefined && sourceHandle === "media-output") {
      outputValue =
        outputs?.video ||
        outputs?.image ||
        outputs?.videoUrl ||
        outputs?.imageUrl ||
        nodeData.video ||
        nodeData.videoUrl ||
        nodeData.image ||
        nodeData.imageUrl;
      if (outputValue !== undefined) {
        console.warn(`[gatherNodeInputs] ⚠️ Found via media-output alias (video/image)`);
      }
    }

    // Audio handle alias
    if (outputValue === undefined && sourceHandle === "audio") {
      outputValue =
        outputs?.audio ||
        outputs?.audioUrl ||
        nodeData.audio ||
        nodeData.audioUrl;
      if (outputValue !== undefined) {
        console.warn(`[gatherNodeInputs] ⚠️ Found via audio/audioUrl alias`);
      }
    }

    // Text handle alias - Prompt nodes store value in data.prompt, not data.text
    // Also handle case where sourceHandle might be "default" due to missing handle ID
    const isPromptNode = sourceNode.type === NodeType.Prompt;
    if (outputValue === undefined && (sourceHandle === "text" || (sourceHandle === "default" && isPromptNode))) {
      const outputs = sourceNode.data.outputs as Record<string, unknown> | undefined;
      // Try outputs.text first, then data.prompt (for Prompt nodes)
      outputValue = outputs?.text || (isPromptNode ? nodeData.prompt : undefined);
      if (outputValue !== undefined) {
        logger.debug(`[gatherNodeInputs] ✓ Found text via prompt alias`, {
          sourceHandle,
          sourceNodeType: sourceNode.type,
          foundIn: outputs?.text ? 'outputs.text' : 'data.prompt',
        });
      }
    }

    if (outputValue !== undefined) {
      // Check if this input accepts multiple connections
      const inputConnector = nodeConfig.inputConnectors.find(
        (c: { id: string }) => c.id === targetHandle,
      );

      if (inputConnector?.acceptsMultiple) {
        // Collect multiple values into an array
        if (!inputs[targetHandle]) {
          inputs[targetHandle] = [];
        }

        // FIXED: Flatten if the output value is itself an array
        if (Array.isArray(outputValue)) {
          // Source outputs an array (e.g., GenerateImage outputs.images)
          // Flatten it into the target array
          inputs[targetHandle].push(...outputValue);
          logger.debug(
            `[gatherNodeInputs] ✓ Flattened array into inputs["${targetHandle}"]`,
            {
              sourceOutputWasArray: true,
              itemsAdded: outputValue.length,
              totalItemsNow: inputs[targetHandle].length,
              exampleItem:
                typeof outputValue[0] === "string"
                  ? outputValue[0]?.substring(0, 50) + "..."
                  : outputValue[0],
            },
          );
        } else {
          // Source outputs a single value
          inputs[targetHandle].push(outputValue);
          logger.debug(
            `[gatherNodeInputs] ✓ Added single item to inputs["${targetHandle}"]`,
            {
              sourceOutputWasArray: false,
              itemType: typeof outputValue,
              totalItemsNow: inputs[targetHandle].length,
            },
          );
        }
      } else {
        // Single value
        inputs[targetHandle] = outputValue;
        logger.debug(
          `[gatherNodeInputs] ✓ Set inputs["${targetHandle}"] = ${typeof outputValue}`,
        );
      }
    } else {
      console.error(`[gatherNodeInputs] ❌ No value found for edge`, {
        sourceNode: sourceNode.id,
        sourceHandle,
        targetHandle,
        availableOutputKeys: sourceNode.data.outputs
          ? Object.keys(sourceNode.data.outputs)
          : [],
        availableDataKeys: Object.keys(sourceNode.data).filter(
          (k) => !["label", "status", "isGenerating", "error"].includes(k),
        ),
      });
    }
  });

  // ELEMENT CHIPS: For GenerateImage nodes, collect reference images from active scene-element chips
  // attached to any connected PromptInputNode. Also clean @token → plain name in the prompt so
  // Gemini receives "Paul" not "@paul". Video generation intentionally excluded.
  if (node.type === NodeType.GenerateImage) {
    incomingEdges.forEach((edge) => {
      const sourceNode = allNodes.find((n) => n.id === edge.source);
      if (!sourceNode || sourceNode.type !== NodeType.Prompt) return;
      const activeElements: { name: string; elementType: string; referenceImageUrls: string[] }[] = (sourceNode.data as any).activeElements ?? [];
      for (const el of activeElements) {
        // Add reference images
        if (el.referenceImageUrls?.length) {
          if (!inputs["reference_images"]) inputs["reference_images"] = [];
          inputs["reference_images"].push(...el.referenceImageUrls);
        }
        // Replace @token with a gender-agnostic reference descriptor the model can act on
        if (el.name && inputs["prompt"] && typeof inputs["prompt"] === "string") {
          const token = el.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          const descriptor =
            el.elementType === "character" ? "the character in the reference images" :
            el.elementType === "location"  ? "the location in the reference images" :
            el.elementType === "prop"      ? "the prop in the reference images" :
            el.name;
          inputs["prompt"] = inputs["prompt"].replace(
            new RegExp(`@${token}\\b`, "gi"),
            descriptor
          );
        }
      }
    });
  }

  // AUTO-INCLUDE FILTERS: When a source node provides video/image but filters travel on a separate handle,
  // automatically include filters from that source node if no explicit filters edge exists.
  // This allows a single wire (e.g., Noise video → Preview video) to carry both video and filters.
  if (!inputs.filters) {
    incomingEdges.forEach((edge) => {
      const sourceNode = allNodes.find((n) => n.id === edge.source);
      if (!sourceNode) return;
      const sourceHandle = edge.sourceHandle || "default";
      // Only auto-include filters when the edge carries video or image
      if (sourceHandle === "video" || sourceHandle === "image") {
        const sourceOutputs = sourceNode.data.outputs as Record<string, unknown> | undefined;
        const sourceFilters = sourceOutputs?.filters || (sourceNode.data as unknown as Record<string, unknown>).filters;
        if (Array.isArray(sourceFilters) && sourceFilters.length > 0) {
          inputs.filters = sourceFilters;
          logger.debug(`[gatherNodeInputs] ✓ Auto-included ${sourceFilters.length} filters from source node ${sourceNode.id} (via ${sourceHandle} edge)`);
        }
      }
    });
  }

  logger.debug(`[gatherNodeInputs] Final inputs keys:`, Object.keys(inputs));
  return inputs;
}

/**
 * Validate that all required inputs are connected and have values
 */
export function validateNodeInputs(
  node: WorkflowNode,
  inputs: Record<string, any>,
): { valid: boolean; error?: string } {
  if (!node.type) {
    return { valid: false, error: `Node ${node.id} has no type` };
  }
  const nodeConfig = NODE_CONFIGURATIONS[node.type as NodeType];

  for (const inputConnector of nodeConfig.inputConnectors) {
    if (inputConnector.required) {
      const value = inputs[inputConnector.id];

      if (value === undefined || value === null || value === "") {
        return {
          valid: false,
          error: `Required input "${inputConnector.label}" is not connected or has no value`,
        };
      }

      // For multi-input, check that array is not empty
      if (
        inputConnector.acceptsMultiple &&
        Array.isArray(value) &&
        value.length === 0
      ) {
        return {
          valid: false,
          error: `Required input "${inputConnector.label}" needs at least one connection`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Find all upstream dependencies for a node (recursive)
 * Returns array of node IDs in execution order (topologically sorted)
 */
export function findUpstreamDependencies(
  nodeId: string,
  __nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): string[] {
  const visited = new Set<string>();
  const dependencies: string[] = [];

  function traverse(currentNodeId: string) {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    // Find all edges that connect TO this node
    const incomingEdges = edges.filter((edge) => edge.target === currentNodeId);

    // Recursively visit source nodes
    incomingEdges.forEach((edge) => {
      traverse(edge.source);
    });

    // Add current node AFTER its dependencies (post-order traversal)
    if (currentNodeId !== nodeId) {
      dependencies.push(currentNodeId);
    }
  }

  traverse(nodeId);
  return dependencies;
}

/**
 * Execute prompt concatenator logic (frontend only, no API call)
 */
export function executeConcatenator(
  inputs: Record<string, any>,
  separator: "Space" | "Comma" | "Newline" | "Period",
): string {
  const separators = {
    Space: " ",
    Comma: ", ",
    Newline: "\n",
    Period: ". ",
  };

  const sep = separators[separator];
  const prompts = [
    inputs.prompt_1,
    inputs.prompt_2,
    inputs.prompt_3,
    inputs.prompt_4,
  ].filter(Boolean);

  return prompts.join(sep);
}

/**
 * Parse batch input text into array based on separator
 */
function parseBatchInput(input: string, separator: string): string[] {
  if (!input?.trim()) return [];

  const sep = separator === "Newline" ? "\n" : separator;
  return input
    .split(sep)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Execute text iterator logic (frontend only, no API call)
 * Combines fixed section with multiple variable items to create array of prompts
 */
export function executeTextIterator(
  inputs: Record<string, any>,
  nodeData: {
    fixedSection: string;
    batchInput: string;
    separator: string;
    customSeparator?: string;
  },
): Record<string, string> {
  const fixedSection = inputs.fixed_section || nodeData.fixedSection || "";

  // Resolve separator first (needed for both connected items and batch input)
  const separator =
    nodeData.separator === "Custom"
      ? nodeData.customSeparator || ","
      : nodeData.separator || "Newline";

  // Get variable items from connected nodes and split if they're text strings
  const connectedItems = inputs.variable_items || [];
  let connectedItemsArray: string[] = [];

  logger.debug("[executeTextIterator] Processing connected items:", {
    connectedItemsType: typeof connectedItems,
    isArray: Array.isArray(connectedItems),
    connectedItems: connectedItems,
    separator: separator,
  });

  if (typeof connectedItems === "string") {
    // Single connected text - split it using the separator
    connectedItemsArray = parseBatchInput(connectedItems, separator);
    logger.debug(
      "[executeTextIterator] Split single string into",
      connectedItemsArray.length,
      "items",
    );
  } else if (Array.isArray(connectedItems)) {
    // Multiple connections - split each string and flatten
    connectedItemsArray = connectedItems.flatMap((item) =>
      typeof item === "string" ? parseBatchInput(item, separator) : [item],
    );
    logger.debug(
      "[executeTextIterator] Split array into",
      connectedItemsArray.length,
      "items",
    );
  }

  // Parse batch input
  const batchItems = parseBatchInput(nodeData.batchInput || "", separator);

  // Batch input takes precedence if not empty
  const variableItems =
    batchItems.length > 0 ? batchItems : connectedItemsArray;

  // Combine fixed + each variable to create outputs
  const outputs: Record<string, string> = {};

  variableItems.forEach((item: string, index: number) => {
    const combined =
      `${fixedSection}${fixedSection && item ? " " : ""}${item}`.trim();
    outputs[`output_${index}`] = combined;
  });

  return outputs;
}

/**
 * Group nodes by execution level for parallel execution
 * Level 0: nodes with no dependencies
 * Level N: nodes whose all dependencies are in levels < N
 */
export function groupNodesByLevel(
  executionOrder: string[],
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNode[][] {
  const levels: WorkflowNode[][] = [];
  const nodeDepth = new Map<string, number>();

  // Calculate depth for each node
  executionOrder.forEach((nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Find all incoming edges
    const incomingEdges = edges.filter((e) => e.target === nodeId);

    if (incomingEdges.length === 0) {
      // No dependencies - level 0
      nodeDepth.set(nodeId, 0);
    } else {
      // Find max depth of all dependencies
      let maxDepth = 0;
      incomingEdges.forEach((edge) => {
        const sourceDepth = nodeDepth.get(edge.source) ?? 0;
        maxDepth = Math.max(maxDepth, sourceDepth);
      });
      // This node is one level deeper than its deepest dependency
      nodeDepth.set(nodeId, maxDepth + 1);
    }
  });

  // Group nodes by level
  executionOrder.forEach((nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const depth = nodeDepth.get(nodeId) ?? 0;

    // Ensure level array exists
    while (levels.length <= depth) {
      levels.push([]);
    }

    levels[depth].push(node);
  });

  return levels;
}

/**
 * Collect all FilterConfig objects from upstream nodes recursively
 */
export function collectFilterConfigs(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): any[] {
  const filters: any[] = [];
  const visited = new Set<string>();

  function traverse(currentNodeId: string) {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);

    const currentNode = nodes.find((n) => n.id === currentNodeId);
    if (!currentNode) return;

    // Find incoming edges
    const incomingEdges = edges.filter((e) => e.target === currentNodeId);

    // Recursively collect from source nodes
    incomingEdges.forEach((edge) => {
      traverse(edge.source);

      // Check if this edge carries filters
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const outputs = sourceNode?.data?.outputs as Record<string, unknown> | undefined;
      if (outputs?.filters) {
        const sourceFilters = outputs.filters;
        if (Array.isArray(sourceFilters)) {
          filters.push(...sourceFilters);
        }
      }
    });
  }

  traverse(nodeId);
  return filters;
}

/**
 * Check if a node has upstream modifier nodes
 */
export function hasUpstreamModifiers(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): boolean {
  const filters = collectFilterConfigs(nodeId, nodes, edges);
  return filters.length > 0;
}

/**
 * Poll video status endpoint
 */
export async function pollVideoStatus(
  operationName: string,
  prompt: string = "",
  onProgress?: (attempts: number) => void,
): Promise<{ success: boolean; videoUrl?: string; gcsUrl?: string; error?: string }> {
  const maxAttempts = 30; // 5 minutes (30 * 10 seconds)

  // Fatal errors that should stop polling immediately (don't retry)
  const FATAL_STATUS_CODES = [401, 403, 404];

  // Track consecutive 500 errors to detect persistent backend issues
  let consecutive500Errors = 0;
  const MAX_CONSECUTIVE_500 = 5;

  // Import auth dynamically to avoid circular dependencies
  const { auth } = await import("@/lib/firebase");

  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    // Wait with exponential backoff + jitter (5s → 20s)
    const delay = calculateBackoff(attempts - 1, {
      baseDelayMs: 5000,
      maxDelayMs: 20000,
      jitterFactor: 0.3,
    });
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (onProgress) {
      onProgress(attempts);
    }

    try {
      const user = auth.currentUser;
      const token = await user?.getIdToken();

      const statusUrl = API_ENDPOINTS.generate.videoStatus(
        operationName,
        prompt,
      );
      const statusResponse = await fetch(statusUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!statusResponse.ok) {
        // Try to extract error details from response body
        let errorDetail = "";
        try {
          const errorBody = await statusResponse.json();
          errorDetail = errorBody.detail || errorBody.error || JSON.stringify(errorBody);
        } catch {
          errorDetail = await statusResponse.text().catch(() => "");
        }

        // Check for fatal errors that won't resolve with retries
        if (FATAL_STATUS_CODES.includes(statusResponse.status)) {
          const errorMsg = statusResponse.status === 401
            ? "Authentication failed. Please sign in again."
            : statusResponse.status === 403
              ? "Access denied. You may not have permission to check this video."
              : statusResponse.status === 404
                ? "Video operation not found. It may have expired or been deleted."
                : `Request failed with status ${statusResponse.status}`;

          console.error(
            `[pollVideoStatus] Fatal error (${statusResponse.status}): ${errorMsg}`,
            errorDetail
          );
          return {
            success: false,
            error: `${errorMsg}${errorDetail ? ` Details: ${errorDetail}` : ""}`,
          };
        }

        // Track consecutive 500 errors
        if (statusResponse.status >= 500) {
          consecutive500Errors++;
          console.warn(
            `[pollVideoStatus] Server error ${statusResponse.status} (attempt ${attempts}/${maxAttempts}, consecutive: ${consecutive500Errors}/${MAX_CONSECUTIVE_500}):`,
            errorDetail
          );

          // If we get too many consecutive 500s, the backend is likely broken
          if (consecutive500Errors >= MAX_CONSECUTIVE_500) {
            console.error(
              `[pollVideoStatus] Aborting after ${MAX_CONSECUTIVE_500} consecutive server errors`
            );
            return {
              success: false,
              error: `Video status check failed repeatedly (${consecutive500Errors} server errors). Backend may be experiencing issues. Last error: ${errorDetail || statusResponse.statusText}`,
            };
          }
        } else {
          // Non-5xx error, reset counter
          consecutive500Errors = 0;
          console.warn(
            `Status check failed (attempt ${attempts}/${maxAttempts}): ${statusResponse.status}`,
            errorDetail
          );
        }

        continue;
      }

      // Success - reset error counter
      consecutive500Errors = 0;

      const statusData = await statusResponse.json();

      // Check if video is ready
      if (statusData.status === "complete") {
        logger.debug(
          "[pollVideoStatus] Video generation complete! Response data:",
          {
            hasVideo_base64: !!statusData.video_base64,
            hasVideoBase64: !!statusData.videoBase64,
            hasVideo_url: !!statusData.video_url,
            hasVideoUrl: !!statusData.videoUrl,
            hasVideo: !!statusData.video,
            allKeys: Object.keys(statusData),
            fullResponse: statusData,
          },
        );

        // Get the GCS URL for downstream processing (merge videos, etc.)
        // This avoids 32MB request limit by letting backend download from URL
        // storage_uri is the gs:// fallback — backend now converts it to an HTTPS URL in video_url,
        // but we keep it as a final safety net here in case of older backend versions
        const gcsUrl =
          statusData.video_url ||
          statusData.videoUrl ||
          (typeof statusData.storage_uri === "string" && !statusData.storage_uri.startsWith("gs://")
            ? statusData.storage_uri
            : null);

        // Try multiple possible field names for the video data (base64)
        const videoData =
          statusData.video_base64 ||
          statusData.videoBase64 ||
          statusData.video;

        if (videoData) {
          // If it's already a data URI, use it directly
          if (typeof videoData === "string" && videoData.startsWith("data:")) {
            return {
              success: true,
              videoUrl: videoData,
              gcsUrl: gcsUrl,  // Include GCS URL for downstream use
            };
          }
          // If it's base64, convert to data URI
          if (typeof videoData === "string") {
            return {
              success: true,
              videoUrl: `data:video/mp4;base64,${videoData}`,
              gcsUrl: gcsUrl,  // Include GCS URL for downstream use
            };
          }
          // Unknown format
          console.error(
            "[pollVideoStatus] Video data is not a string:",
            typeof videoData,
            videoData,
          );
        }

        // Fallback: if we only have a URL (no base64), still return success
        if (gcsUrl) {
          logger.info("[pollVideoStatus] No base64 data, using URL directly");
          return {
            success: true,
            videoUrl: gcsUrl,
            gcsUrl: gcsUrl,
          };
        }

        console.error("[pollVideoStatus] Complete but no usable video data:", {
          keys: Object.keys(statusData),
          video_url: statusData.video_url,
          storage_uri: statusData.storage_uri,
          save_error: statusData.save_error,
        });
        return {
          success: false,
          error: statusData.save_error
            ? `Video generated but could not be saved: ${statusData.save_error}`
            : "Video generation completed but no video data returned",
        };
      }

      // Check for errors
      if (statusData.status === "error" || statusData.error) {
        // Properly extract error message from various formats
        let errorMsg = "Unknown error";
        if (statusData.error) {
          if (typeof statusData.error === "string") {
            errorMsg = statusData.error;
          } else if (statusData.error.message) {
            errorMsg = statusData.error.message;
          } else {
            errorMsg = JSON.stringify(statusData.error);
          }
        }
        console.error("[pollVideoStatus] Video generation error:", statusData);
        return {
          success: false,
          error: `Video generation failed: ${errorMsg}`,
        };
      }

      // Still processing, continue polling
      logger.debug(
        `Video generation in progress... (attempt ${attempts}/${maxAttempts})`,
      );
    } catch (pollError) {
      console.warn(
        `Poll error (attempt ${attempts}/${maxAttempts}):`,
        pollError,
      );
      // Continue polling on errors
    }
  }

  // Timeout reached
  return {
    success: false,
    error:
      "Video generation timed out after 5 minutes. The operation may still be processing.",
  };
}

/**
 * Stream video status via SSE (Server-Sent Events).
 * Uses fetch + ReadableStream (not EventSource) because we need Authorization headers.
 * Falls back gracefully — callers should catch errors and use pollVideoStatus instead.
 */
export async function streamVideoStatus(
  operationName: string,
  prompt: string = "",
  onProgress?: (attempts: number) => void,
): Promise<{ success: boolean; videoUrl?: string; gcsUrl?: string; error?: string }> {
  const { auth } = await import("@/lib/firebase");
  const user = auth.currentUser;
  const token = await user?.getIdToken();

  const url = API_ENDPOINTS.generate.videoStream(operationName, prompt);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`SSE connection failed: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let attemptCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";

      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const data = JSON.parse(chunk.slice(6));

        if (data.status === "processing") {
          attemptCount++;
          onProgress?.(attemptCount);
          continue;
        }

        if (data.status === "complete") {
          const gcsUrl =
            data.video_url ||
            data.videoUrl ||
            (typeof data.storage_uri === "string" && !data.storage_uri.startsWith("gs://")
              ? data.storage_uri
              : null);
          const videoData = data.video_base64 || data.videoBase64 || data.video;
          if (videoData) {
            const videoUrl =
              typeof videoData === "string" && videoData.startsWith("data:")
                ? videoData
                : `data:video/mp4;base64,${videoData}`;
            return { success: true, videoUrl, gcsUrl };
          }
          if (gcsUrl) {
            return { success: true, videoUrl: gcsUrl, gcsUrl };
          }
          return {
            success: false,
            error: data.save_error
              ? `Video generated but could not be saved: ${data.save_error}`
              : "Video complete but no data returned",
          };
        }

        if (data.status === "error") {
          return { success: false, error: data.error || "Video generation failed" };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { success: false, error: "SSE stream ended unexpectedly" };
}
