import { Node, Edge } from "reactflow";
import { BaseNodeData, ConnectorType } from "@/components/workflow/types";

// ============================================================================
// COMPOUND NODE INTERFACES
// ============================================================================

/**
 * Defines an exposed input connection point on a compound node
 */
export interface CompoundInput {
  id: string; // Derived from exposedName (slugified)
  name: string; // Display name shown on the node
  type: ConnectorType; // Type of data this input accepts
}

/**
 * Defines an exposed output connection point on a compound node
 */
export interface CompoundOutput {
  id: string; // Derived from exposedName (slugified)
  name: string; // Display name shown on the node
  type: ConnectorType; // Type of data this output provides
}

/**
 * Defines an exposed control (slider/dropdown/text/toggle) on a compound node
 */
export interface CompoundControl {
  id: string; // Derived from exposedName (slugified)
  name: string; // Display name shown on the node
  type: "slider" | "dropdown" | "text" | "toggle";

  // Type-specific configuration
  min?: number; // For slider
  max?: number; // For slider
  step?: number; // For slider
  options?: string[]; // For dropdown
  default: any; // Default value for the control
}

/**
 * Maps an exposed input to an internal node parameter
 */
export interface InputMapping {
  nodeId: string; // Internal node ID
  param: string; // Path to the parameter (e.g., "data.inputs.text")
}

/**
 * Maps an exposed control to one or more internal node parameters
 */
export interface ControlMapping {
  nodeId: string; // Internal node ID
  param: string; // Path to the parameter (e.g., "data.duration")
}

/**
 * Maps an exposed output to an internal node output
 */
export interface OutputMapping {
  nodeId: string; // Internal node ID
  param: string; // Path to the output (e.g., "data.outputs.video")
}

/**
 * Complete definition of a compound node template
 * This is what gets saved to localStorage
 */
export interface CompoundNodeDefinition {
  // Identity
  id: string; // Unique ID (e.g., "compound_tiktok_broll_1703001234567")
  type: "compound"; // Always "compound"
  name: string; // Display name (e.g., "TikTok B-Roll Generator")
  icon: string; // Emoji icon (e.g., "🎬")
  description: string; // User-facing description

  // What appears on the compound node
  inputs: CompoundInput[]; // Exposed input connection points
  outputs: CompoundOutput[]; // Exposed output connection points
  controls: CompoundControl[]; // Exposed controls (sliders/dropdowns/etc)

  // The hidden workflow
  internalWorkflow: {
    nodes: Node[]; // Deep copy of all nodes in the workflow
    edges: Edge[]; // Deep copy of all edges
  };

  // How exposed items map to internal nodes
  mappings: {
    inputs: Record<string, InputMapping>; // exposedId -> internal mapping
    controls: Record<string, ControlMapping[]>; // exposedId -> internal mappings (can map to multiple)
    outputs: Record<string, OutputMapping>; // exposedId -> internal mapping
  };

  // Metadata
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  sourceWorkflowId?: string; // ID of the saved workflow this was imported from
}

/**
 * Runtime data for a compound node instance on the canvas
 * Extends the base compound definition with instance-specific state
 */
export interface CompoundNodeData extends BaseNodeData {
  // Reference to the template this instance is based on
  compoundId: string; // ID of the CompoundNodeDefinition

  // Template metadata (copied from definition for quick access)
  name: string;
  icon: string;
  description: string;
  inputs: CompoundInput[];
  outputs: CompoundOutput[];
  controls: CompoundControl[];

  // Internal workflow and mappings (copied from definition)
  internalWorkflow: {
    nodes: Node[];
    edges: Edge[];
  };
  mappings: {
    inputs: Record<string, InputMapping>;
    controls: Record<string, ControlMapping[]>;
    outputs: Record<string, OutputMapping>;
  };

  // Current values of controls (user-adjustable at runtime)
  controlValues: Record<string, any>;
}

// ============================================================================
// WORKFLOW ANALYSIS INTERFACES
// ============================================================================

/**
 * Represents an available input that can be exposed from the workflow
 * For Input nodes (Prompt, ImageInput, VideoInput), this represents the node itself
 */
export interface AvailableInput {
  id: string; // Unique ID: "nodeId-inputHandle" or "nodeId-input" for input nodes
  nodeId: string; // ID of the node
  nodeName: string; // Display name of the node
  inputHandle: string; // Handle ID (e.g., "text", "first_frame") - not used for input nodes
  inputName: string; // Display name of the input (e.g., "Text", "First Frame")
  type: ConnectorType | "text" | "image" | "video"; // Connector type or input type
  isConnected: boolean; // Already has incoming connection?
  suggestedName: string; // Default exposed name
  paramPath?: string; // Path to inject value (e.g., "data.promptText") - for input nodes
}

/**
 * Represents an available parameter that can be exposed as a control
 */
export interface AvailableControl {
  id: string; // Unique ID: "nodeId-paramPath"
  nodeId: string; // ID of the node
  nodeName: string; // Display name of the node
  paramPath: string; // Path to parameter (e.g., "data.duration")
  paramName: string; // Display name (e.g., "Duration")
  currentValue: any; // Current value in the node
  suggestedControlType: "slider" | "dropdown" | "text" | "toggle";
  config: {
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
  };
  suggestedName: string; // Default exposed name
}

/**
 * Represents an available output that can be exposed from the workflow
 */
export interface AvailableOutput {
  id: string; // Unique ID: "nodeId-outputHandle"
  nodeId: string; // ID of the node
  nodeName: string; // Display name of the node
  outputHandle: string; // Handle ID (e.g., "image", "video")
  outputName: string; // Display name (e.g., "Image", "Video")
  type: ConnectorType; // Connector type
  suggestedName: string; // Default exposed name
}

/**
 * Result of analyzing a workflow for exposable items
 */
export interface WorkflowAnalysis {
  availableInputs: AvailableInput[];
  availableControls: AvailableControl[];
  availableOutputs: AvailableOutput[];
}

/**
 * Definition of a parameter that can be exposed as a control
 */
export interface ExposableParam {
  name: string; // Display name (e.g., "Duration")
  path: string; // Path to the parameter (e.g., "data.duration")
  controlType: "slider" | "dropdown" | "text" | "toggle";
  config: {
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
  };
}

/**
 * Input for building a compound node definition
 */
export interface BuildCompoundInput {
  name: string;
  icon: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
  exposedInputs: Record<
    string,
    {
      id: string;
      nodeId: string;
      inputHandle: string;
      exposedName: string;
      type: ConnectorType | "text" | "image" | "video";
      paramPath?: string;
    }
  >;
  exposedControls: Record<
    string,
    {
      id: string;
      nodeId: string;
      paramPath: string;
      exposedName: string;
      controlType: "slider" | "dropdown" | "text" | "toggle";
      config: any;
    }
  >;
  exposedOutputs?: Record<
    string,
    {
      id: string;
      nodeId: string;
      outputHandle: string;
      exposedName: string;
      type: ConnectorType;
    }
  >; // Optional - outputs are auto-generated from GenerateImage/GenerateVideo nodes
}
