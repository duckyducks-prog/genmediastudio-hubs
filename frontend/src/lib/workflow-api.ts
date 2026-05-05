import { logger } from "@/lib/logger";
import { auth } from "./firebase";
import { WorkflowNode, WorkflowEdge } from "@/components/workflow/types";
import { API_ENDPOINTS } from "./api-config";
import { parseApiError, parseNetworkError, isApiError } from "./api-error";

// Workflow storage API - now using VEO backend directly
// Previously used Express server at /api, now using VEO API at /v1/workflows


export interface APITestResult {
  available: boolean;
  endpoints: {
    save?: boolean;
    list?: boolean;
    get?: boolean;
  };
  error?: string;
  details?: string;
}

export interface WorkflowMetadata {
  id?: string;
  name: string;
  description: string;
  is_public: boolean;
  thumbnail_ref?: string; // ✅ Asset ID reference (stored in Firestore)
  thumbnail?: string; // ✅ Resolved URL (computed by backend on GET)
  background_image?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
  user_email?: string;
  node_count?: number; // ✅ Metadata field for list views
  edge_count?: number; // ✅ Metadata field for list views
  mode?: "explore" | "project"; // Generation mode (explore = cheap models, project = premium)
}

export interface SavedWorkflow extends WorkflowMetadata {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/**
 * Workflow list item - returned by list endpoints (metadata only, no nodes/edges)
 */
export interface WorkflowListItem extends WorkflowMetadata {
  // ⚠️ list endpoints do NOT include nodes or edges for performance
  // Use loadWorkflow() to get full workflow with nodes/edges
}

/**
 * Check if a value looks like base64 image/video data
 * Detects both data URIs (data:image/...) and raw base64 strings
 */
function isBase64Data(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Data URI format
  if (value.startsWith("data:image/") || value.startsWith("data:video/")) {
    return true;
  }
  // Raw base64: long string with only base64 characters (at least 1000 chars to avoid false positives)
  if (value.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    return true;
  }
  return false;
}

/**
 * Strip resolved URLs, existence flags, and base64 data from node data before saving to backend.
 * The backend will compute URLs when you fetch the workflow.
 *
 * Removes:
 * - *Url, *Exists fields (e.g., imageUrl, imageRefExists, etc.)
 * - outputs.image, outputs.video, outputs.images (can contain base64 data)
 * - Any field containing base64 data (data URIs or raw base64)
 * Keeps: *Ref fields (e.g., imageRef) which store asset IDs
 */
export function stripResolvedUrls(data: any): any {
  if (!data) return data;

  const cleaned = { ...data };

  // Strip execution state — these should never be persisted to the backend
  delete cleaned.status;
  delete cleaned.error;
  delete cleaned.isGenerating;

  // Remove all *Url and *Exists fields (backend computes these from *Ref fields)
  // Also remove any field containing base64 data
  const keysToRemove = Object.keys(cleaned).filter(
    (k) =>
      k.endsWith("Url") ||
      k.endsWith("Exists") ||
      isBase64Data(cleaned[k]),
  );
  keysToRemove.forEach((k) => delete cleaned[k]);

  // Wipe outputs entirely — they are execution results, not configuration.
  // On load, nodes start with empty outputs and a "ready" status.
  cleaned.outputs = {};

  return cleaned;
}

/**
 * Clean workflow data for saving - strip all resolved URLs from all nodes
 */
export function cleanWorkflowForSave(workflow: SavedWorkflow): SavedWorkflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      data: stripResolvedUrls(node.data),
    })),
  };
}

/**
 * Centralized API error handler — parses response into structured ApiError and throws.
 * Handles all backend formats: AppError, HTTPException, Pydantic 422.
 */
export async function handleApiError(response: Response): Promise<never> {
  throw await parseApiError(response);
}

/**
 * Test if workflow API is accessible and which endpoints are working
 */
export async function testWorkflowAPI(): Promise<APITestResult> {
  const user = auth.currentUser;

  if (!user) {
    return {
      available: false,
      endpoints: {},
      error: "Not authenticated",
      details: "User must be signed in to test API",
    };
  }

  const token = await user.getIdToken();
  const results: APITestResult = {
    available: false,
    endpoints: {},
  };

  logger.debug("[testWorkflowAPI] Starting API connectivity test...");

  // Test 1: List public workflows (GET /v1/workflows?scope=public)
  try {
    const url = API_ENDPOINTS.workflows.list("public");
    logger.debug("[testWorkflowAPI] Testing:", url);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    logger.debug("[testWorkflowAPI] List endpoint response:", {
      status: response.status,
      ok: response.ok,
    });

    results.endpoints.list = response.ok;

    if (!response.ok) {
      const body = await response.text();
      logger.debug("[testWorkflowAPI] List endpoint error body:", body);

      if (response.status === 404) {
        results.details =
          "404 Not Found - Endpoint may not be deployed or router not mounted at /workflows";
      } else if (response.status === 401) {
        results.details = "401 Unauthorized - Firebase token may be invalid";
      } else if (response.status === 403) {
        results.details = "403 Forbidden - User may not have access";
      } else if (response.status >= 500) {
        results.details = `${response.status} Server Error - Backend may be experiencing issues`;
      } else {
        results.details = `${response.status} ${response.statusText}`;
      }
    }
  } catch (error) {
    results.endpoints.list = false;

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        results.error = "Request timeout - Backend not responding";
        results.details = "The API did not respond within 10 seconds";
      } else if (error.message.includes("Failed to fetch")) {
        results.error = "Network error - Cannot reach backend";
        results.details = "CORS error, network failure, or backend is down";
      } else {
        results.error = error.message;
      }
    }
    console.error("[testWorkflowAPI] List endpoint test failed:", error);
  }

  // Test 2: Try to list my workflows (GET /v1/workflows?scope=my)
  try {
    const url = API_ENDPOINTS.workflows.list("my");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      results.endpoints.list = true;
    }
  } catch (error) {
    // Already logged above
  }

  // Determine overall availability
  results.available = Object.values(results.endpoints).some((v) => v === true);

  logger.debug("[testWorkflowAPI] Test complete:", results);
  return results;
}

/**
 * Validate workflow data before sending to API
 */
function validateWorkflowData(workflow: SavedWorkflow): {
  valid: boolean;
  error?: string;
} {
  // Validate name
  if (!workflow.name || typeof workflow.name !== "string") {
    return {
      valid: false,
      error: "Workflow name is required and must be a string",
    };
  }

  const trimmedName = workflow.name.trim();
  if (trimmedName.length === 0) {
    return { valid: false, error: "Workflow name cannot be empty" };
  }

  if (trimmedName.length > 100) {
    return {
      valid: false,
      error: "Workflow name cannot exceed 100 characters",
    };
  }

  // Validate description
  if (
    workflow.description !== undefined &&
    typeof workflow.description !== "string"
  ) {
    return { valid: false, error: "Workflow description must be a string" };
  }

  // Validate is_public
  if (typeof workflow.is_public !== "boolean") {
    return { valid: false, error: "is_public must be a boolean" };
  }

  // Validate nodes
  if (!Array.isArray(workflow.nodes)) {
    return { valid: false, error: "Nodes must be an array" };
  }

  if (workflow.nodes.length === 0) {
    return { valid: false, error: "Workflow must have at least one node" };
  }

  if (workflow.nodes.length > 100) {
    return { valid: false, error: "Workflow cannot exceed 100 nodes" };
  }

  // Validate each node has required properties
  for (let i = 0; i < workflow.nodes.length; i++) {
    const node = workflow.nodes[i];
    if (!node.id || !node.type || !node.position || !node.data) {
      return {
        valid: false,
        error: `Node at index ${i} is missing required properties (id, type, position, data)`,
      };
    }
  }

  // Validate edges
  if (!Array.isArray(workflow.edges)) {
    return { valid: false, error: "Edges must be an array" };
  }

  // Validate each edge has required properties
  for (let i = 0; i < workflow.edges.length; i++) {
    const edge = workflow.edges[i];
    if (!edge.source || !edge.target) {
      return {
        valid: false,
        error: `Edge at index ${i} is missing required properties (source, target)`,
      };
    }
  }

  return { valid: true };
}

/**
 * Save a workflow to the backend
 */
export async function saveWorkflow(
  workflow: SavedWorkflow,
): Promise<{ id: string }> {
  // Validate workflow data before sending
  const validation = validateWorkflowData(workflow);
  if (!validation.valid) {
    console.error("[saveWorkflow] Validation failed:", validation.error);
    throw new Error(`Invalid workflow data: ${validation.error}`);
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();
  const url = API_ENDPOINTS.workflows.save;

  logger.debug("[saveWorkflow] Request:", {
    method: "POST",
    url,
    hasAuth: !!token,
    tokenPreview: token.substring(0, 20) + "...",
    workflowName: workflow.name,
    nodeCount: workflow.nodes.length,
    edgeCount: workflow.edges.length,
    isPublic: workflow.is_public,
  });

  try {
    // ✅ Strip resolved URLs before sending (keep asset refs)
    const cleanWorkflow = cleanWorkflowForSave(workflow);
    const payload = JSON.stringify(cleanWorkflow);
    const payloadSize = new Blob([payload]).size;
    const payloadSizeMB = (payloadSize / (1024 * 1024)).toFixed(2);

    logger.debug(
      "[saveWorkflow] Payload size:",
      `${payloadSizeMB} MB (${payloadSize} bytes)`,
    );

    // Warn if payload is suspiciously large (after sanitization, should be small)
    if (payloadSize > 5 * 1024 * 1024) {
      console.warn(
        "[saveWorkflow] WARNING: Large payload detected. This may fail or timeout.",
      );
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: payload,
    });

    logger.debug("[saveWorkflow] Response:", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    const result = await response.json();
    logger.debug("[saveWorkflow] Success:", result);

    if (!result.id) {
      console.error("[saveWorkflow] Invalid response - missing id:", result);
      throw new Error("Backend returned invalid response: missing workflow ID");
    }

    return result;
  } catch (error) {
    if (isApiError(error)) throw error;
    throw parseNetworkError(error);
  }
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(
  workflowId: string,
  workflow: SavedWorkflow,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  // ✅ Strip resolved URLs before sending (keep asset refs)
  const cleanWorkflow = cleanWorkflowForSave(workflow);

  try {
    const response = await fetch(API_ENDPOINTS.workflows.update(workflowId), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cleanWorkflow),
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }
  } catch (error) {
    if (isApiError(error)) throw error;
    throw parseNetworkError(error);
  }
}

/**
 * Load a specific workflow by ID
 */
export async function loadWorkflow(workflowId: string): Promise<SavedWorkflow> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  let workflow: any;
  try {
    const response = await fetch(API_ENDPOINTS.workflows.get(workflowId), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    workflow = await response.json();
  } catch (error) {
    if (isApiError(error)) throw error;
    throw parseNetworkError(error);
  }

  // Parse nodes/edges if they're stringified JSON
  let nodes = workflow.nodes;
  let edges = workflow.edges;

  if (typeof nodes === "string") {
    try {
      nodes = JSON.parse(nodes);
    } catch (e) {
      console.error("[loadWorkflow] Failed to parse nodes:", e);
      nodes = [];
    }
  }

  if (typeof edges === "string") {
    try {
      edges = JSON.parse(edges);
    } catch (e) {
      console.error("[loadWorkflow] Failed to parse edges:", e);
      edges = [];
    }
  }

  // Reset all execution state when loading so nodes open in a clean "ready" position.
  // Execution results (outputs, status, error) should not carry over across sessions.
  const cleanedNodes = (nodes || []).map((node: WorkflowNode) => {
    const { error: _error, isGenerating: _ig, ...restData } = node.data as any;
    return {
      ...node,
      data: {
        ...restData,
        status: "ready",
        outputs: {},
      },
    };
  });

  return {
    ...workflow,
    nodes: cleanedNodes,
    edges: edges || [],
  };
}

/**
 * List user's workflows - returns metadata only (no nodes/edges)
 * ⚠️ To get full workflow with nodes/edges, use loadWorkflow()
 */
export async function listMyWorkflows(): Promise<WorkflowListItem[]> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();
  const url = API_ENDPOINTS.workflows.list("my");

  logger.debug("[listMyWorkflows] Request:", { url });

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    logger.debug("[listMyWorkflows] Response:", {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    const data = await response.json();
    const workflows = (data.workflows || []) as WorkflowListItem[];

    logger.debug("[listMyWorkflows] Loaded", workflows.length, "workflows");
    return workflows;
  } catch (error) {
    if (isApiError(error)) throw error;
    throw parseNetworkError(error);
  }
}

/**
 * List public workflow templates - returns metadata only (no nodes/edges)
 * ⚠️ To get full workflow with nodes/edges, use loadWorkflow()
 */
export async function listPublicWorkflows(): Promise<WorkflowListItem[]> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();
  const url = API_ENDPOINTS.workflows.list("public");

  logger.debug("[listPublicWorkflows] Request:", { url });

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    logger.debug("[listPublicWorkflows] Response:", {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    const data = await response.json();
    const workflows = (data.workflows || []) as WorkflowListItem[];

    logger.debug("[listPublicWorkflows] Loaded", workflows.length, "templates");
    return workflows;
  } catch (error) {
    if (isApiError(error)) throw error;
    throw parseNetworkError(error);
  }
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(workflowId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  try {
    const response = await fetch(API_ENDPOINTS.workflows.delete(workflowId), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }
  } catch (error) {
    if (isApiError(error)) throw error;
    throw parseNetworkError(error);
  }
}

/**
 * Clone a workflow (creates a copy for the current user)
 */
export async function cloneWorkflow(
  workflowId: string,
): Promise<{ id: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const token = await user.getIdToken();

  try {
    const response = await fetch(API_ENDPOINTS.workflows.clone(workflowId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw await parseApiError(response);
    }

    return await response.json();
  } catch (error) {
    if (isApiError(error)) throw error;
    throw parseNetworkError(error);
  }
}
