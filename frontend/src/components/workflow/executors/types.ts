import { WorkflowNode, WorkflowEdge } from "../types";
import { FilterConfig } from "@/lib/pixi-filter-configs";

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  skipped?: boolean;
}

export interface ExecutionContext {
  // State updaters
  updateNodeState: (
    nodeId: string,
    status: string,
    additionalData?: any,
  ) => void;
  onAssetGenerated?: () => void;
  toast: (opts: any) => any;

  // Rendering utilities
  renderWithPixi: (
    imageDataUrl: string,
    filters: FilterConfig[],
  ) => Promise<string>;
  renderCompositeWithPixi: (
    images: string[],
    blendMode: string,
    opacity: number,
    filters: FilterConfig[],
  ) => Promise<string>;
  applyFiltersToVideo: (
    videoInput: string,
    filters: FilterConfig[],
  ) => Promise<string>;

  // Data resolution
  resolveAssetToDataUrl: (assetRef: string) => Promise<string>;
  extractLastFrameFromVideo: (videoDataUrl: string) => Promise<string>;

  // API utilities
  getAuthToken: () => Promise<string>;
  pollVideoStatus: (
    operationName: string,
    prompt?: string,
    onProgress?: (attempts: number) => void,
  ) => Promise<{ success: boolean; videoUrl?: string; gcsUrl?: string; error?: string }>;
  streamVideoStatus?: (
    operationName: string,
    prompt?: string,
    onProgress?: (attempts: number) => void,
  ) => Promise<{ success: boolean; videoUrl?: string; gcsUrl?: string; error?: string }>;

  // Execution utilities
  executeConcatenator: (
    inputs: Record<string, any>,
    separator: "Space" | "Comma" | "Newline" | "Period",
  ) => string;
  executeTextIterator: (
    inputs: Record<string, any>,
    nodeData: any,
  ) => Record<string, any>;
  executeCompoundNode: (
    node: WorkflowNode,
    inputs: Record<string, any>,
    internalWorkflowExecutor: (
      nodes: WorkflowNode[],
      edges: WorkflowEdge[],
    ) => Promise<{ success: boolean; data?: any; error?: string }>,
  ) => Promise<{ success: boolean; data?: any; error?: string }>;
  executeSubWorkflow: (
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
  ) => Promise<{ success: boolean; data?: any; nodes?: WorkflowNode[]; error?: string }>;
}

export type NodeExecutor = (
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
) => Promise<ExecutionResult>;
