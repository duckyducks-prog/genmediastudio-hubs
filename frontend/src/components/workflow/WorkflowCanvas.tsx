import { logger } from "@/lib/logger";
import {
  useCallback,
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  Connection,
  Edge,
  ConnectionMode,
  ReactFlowProvider,
  ReactFlowInstance,
  getNodesBounds,
  getViewportForBounds,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import "./workflow.css";
import html2canvas from "html2canvas";
import {
  WorkflowNode,
  WorkflowEdge,
  NodeType,
} from "./types";
import NodePalette from "./NodePalette";
import WorkflowToolbar from "./WorkflowToolbar";
import SaveWorkflowDialog from "./SaveWorkflowDialog";
import WorkflowLoadDialog from "./WorkflowLoadDialog";
import CreateWizardModal from "./CreateWizardModal";
import { useWorkflowExecution } from "./useWorkflowExecution";
import { validateConnection, getConnectorType } from "./connectionValidation";
import { useToast } from "@/hooks/use-toast";
import { SavedWorkflow, cloneWorkflow } from "@/lib/workflow-api";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { NodeContextMenu } from "./NodeContextMenu";
import { FloatingLabels } from "./FloatingLabels";
import { NodeSearchDialog } from "./NodeSearchDialog";
import { TextEditSidePanel } from "./TextEditSidePanel";
import {
  useWorkflowNodes,
  useWorkflowEdges,
  useWorkflow,
} from "@/contexts/WorkflowContext";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { nodeTypes, getDefaultNodeData } from "./registry";

export interface WorkflowCanvasRef {
  loadWorkflow: (
    workflow: SavedWorkflow,
    options?: { readOnly?: boolean },
  ) => void;
  captureThumbnail: () => Promise<string | null>;
}

interface WorkflowCanvasProps {
  onAssetGenerated?: () => void;
  onLoadWorkflowRequest?: () => void;
}

const WorkflowCanvasInner = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
  ({ onAssetGenerated, onLoadWorkflowRequest: _onLoadWorkflowRequest }, ref) => {
    // Use context for workflow state persistence
    const { state: workflowState, dispatch } = useWorkflow();
    const [nodes, setNodes] = useWorkflowNodes();
    const [edges, setEdges] = useWorkflowEdges();

    // Warn user before losing unsaved changes
    useUnsavedChangesWarning();
    const [reactFlowInstance, setReactFlowInstance] =
      useState<ReactFlowInstance | null>(null);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
    const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(
      null,
    );
    const [copiedNodes, setCopiedNodes] = useState<WorkflowNode[]>([]);
    const [copiedEdges, setCopiedEdges] = useState<WorkflowEdge[]>([]);
    const [copiedConfig, setCopiedConfig] = useState<{
      nodeType: NodeType;
      config: any;
    } | null>(null);
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Text edit side panel state
    const [textEditPanel, setTextEditPanel] = useState<{
      isOpen: boolean;
      nodeId: string;
      title: string;
      value: string;
      readOnly: boolean;
      field: string;
    }>({ isOpen: false, nodeId: "", title: "", value: "", readOnly: false, field: "prompt" });

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      nodeId: string;
    } | null>(null);
    const hasInitialized = useRef(false);
    const { toast } = useToast();

    // Custom onNodesChange handler that respects locked state
    const onNodesChange = useCallback(
      (changes: NodeChange[]) => {
        setNodes((nds) => applyNodeChanges(changes, nds));
      },
      [setNodes],
    );

    // Custom onEdgesChange handler
    const onEdgesChange = useCallback(
      (changes: EdgeChange[]) => {
        setEdges((eds) => applyEdgeChanges(changes, eds));
      },
      [setEdges],
    );

    // Ensure nodes have draggable property set based on locked state
    useEffect(() => {
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          draggable: !node.data.locked && !isReadOnly,
        })),
      );
    }, [setNodes, isReadOnly]);

    // Listen for node update events from node components
    useEffect(() => {
      const handleNodeUpdate = (event: any) => {
        const { id, data } = event.detail;

        // Block updates if in read-only mode (except status updates from execution)
        const isStatusUpdate =
          data &&
          ("status" in data || "isGenerating" in data || "error" in data);
        if (isReadOnly && !isStatusUpdate) {
          logger.debug("[WorkflowCanvas] Ignoring node update - read-only mode");
          return;
        }

        logger.debug("[WorkflowCanvas] node-update received:", {
          nodeId: id,
          hasOutputs: !!data?.outputs,
          outputs: data?.outputs,
        });

        setNodes((nds) => {
          // Update the source node
          const updatedNodes = nds.map((node) =>
            node.id === id ? { ...node, data } : node,
          );

          // Propagate outputs to downstream nodes
          const sourceNode = updatedNodes.find((n) => n.id === id);
          if (sourceNode?.data?.outputs) {
            // Find all edges going OUT from this node
            const outgoingEdges = edges.filter((e) => e.source === id);

            logger.debug(
              "[WorkflowCanvas] Propagating to",
              outgoingEdges.length,
              "downstream nodes",
            );

            outgoingEdges.forEach((edge) => {
              const targetNodeIndex = updatedNodes.findIndex(
                (n) => n.id === edge.target,
              );
              if (targetNodeIndex !== -1) {
                const targetNode = updatedNodes[targetNodeIndex];

                // For modifier nodes, propagate ALL outputs, not just the connected handle
                // This ensures both 'image' and 'filters' are passed to downstream nodes
                const allOutputs = sourceNode.data.outputs;

                logger.debug("[WorkflowCanvas] Propagating to node:", {
                  targetId: edge.target,
                  targetType: targetNode.type,
                  propagatedData: {
                    hasImage: !!allOutputs.image,
                    hasVideo: !!allOutputs.video,
                    filterCount: allOutputs.filters?.length || 0,
                  },
                });

                // Update the target node's data with ALL outputs
                // Set BOTH top-level properties (for direct access) AND data.outputs (for execution helpers)
                updatedNodes[targetNodeIndex] = {
                  ...targetNode,
                  data: {
                    ...targetNode.data,
                    ...allOutputs, // Merge all outputs into target node data (top-level)
                    outputs: {
                      // Also set outputs property for consistency
                      ...(targetNode.data?.outputs || {}),
                      ...allOutputs,
                    },
                  },
                };
              }
            });
          }

          return updatedNodes;
        });
      };

      window.addEventListener("node-update", handleNodeUpdate);
      return () => window.removeEventListener("node-update", handleNodeUpdate);
    }, [setNodes, edges]);

    // Listen for text edit panel open requests
    useEffect(() => {
      const handleOpenTextEditPanel = (event: Event) => {
        const customEvent = event as CustomEvent<{
          nodeId: string;
          title: string;
          value: string;
          readOnly: boolean;
          field?: string;
        }>;
        setTextEditPanel({
          isOpen: true,
          nodeId: customEvent.detail.nodeId,
          title: customEvent.detail.title,
          value: customEvent.detail.value,
          readOnly: customEvent.detail.readOnly,
          field: customEvent.detail.field || "prompt",
        });
      };

      window.addEventListener("open-text-edit-panel", handleOpenTextEditPanel);
      return () => window.removeEventListener("open-text-edit-panel", handleOpenTextEditPanel);
    }, []);

    // Handle text edit panel save
    const handleTextEditPanelSave = useCallback(
      (newValue: string) => {
        if (!textEditPanel.nodeId) return;
        const field = textEditPanel.field || "prompt";
        setNodes((nodes) =>
          nodes.map((node) => {
            if (node.id !== textEditPanel.nodeId) return node;

            // Build the update based on the field
            const dataUpdate: Record<string, any> = {
              ...node.data,
              [field]: newValue,
            };

            // For prompt field, also update outputs for Text Input nodes
            if (field === "prompt") {
              dataUpdate.outputs = { text: newValue };
            }

            return {
              ...node,
              data: dataUpdate,
            };
          })
        );
      },
      [textEditPanel.nodeId, textEditPanel.field, setNodes]
    );

    // Listen for asset updates to specific nodes (from inline library)
    useEffect(() => {
      const handleUpdateNodeAsset = (event: Event) => {
        const customEvent = event as CustomEvent<{
          nodeId: string;
          assetType: "image" | "video";
          assetId: string;
          url: string;
          mimeType: string;
        }>;
        const { nodeId, assetType, url, assetId } = customEvent.detail;

        logger.debug("[WorkflowCanvas] Updating node with asset:", {
          nodeId,
          assetType,
          url,
        });

        // Update the target node with the asset
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              const newData =
                assetType === "video"
                  ? {
                    ...node.data,
                    videoUrl: url,
                    videoRef: assetId,
                    thumbnailUrl: url,
                    outputs: { video: url },
                  }
                  : {
                    ...node.data,
                    imageUrl: url,
                    imageRef: assetId,
                    outputs: { image: url },
                  };

              // Dispatch node update event
              setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent("node-update", {
                    detail: { id: nodeId, data: newData },
                  })
                );
              }, 0);

              return { ...node, data: newData };
            }
            return node;
          })
        );
      };

      window.addEventListener("update-node-asset", handleUpdateNodeAsset);
      return () =>
        window.removeEventListener("update-node-asset", handleUpdateNodeAsset);
    }, [setNodes]);

    // Keyboard zoom controls (Cmd+/Cmd- or Ctrl+/Ctrl-)
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (!reactFlowInstance) return;

        const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

        if (!cmdOrCtrl) return;

        // Cmd/Ctrl + = or + (zoom in)
        if (event.key === "=" || event.key === "+") {
          event.preventDefault();
          event.stopPropagation();
          const currentZoom = reactFlowInstance.getZoom();
          reactFlowInstance.setViewport(
            {
              x: reactFlowInstance.getViewport().x,
              y: reactFlowInstance.getViewport().y,
              zoom: currentZoom * 1.2,
            },
            { duration: 200 },
          );
        }
        // Cmd/Ctrl + - (zoom out)
        else if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          event.stopPropagation();
          const currentZoom = reactFlowInstance.getZoom();
          reactFlowInstance.setViewport(
            {
              x: reactFlowInstance.getViewport().x,
              y: reactFlowInstance.getViewport().y,
              zoom: currentZoom / 1.2,
            },
            { duration: 200 },
          );
        }
        // Cmd/Ctrl + 0 (reset zoom to 100%)
        else if (event.key === "0") {
          event.preventDefault();
          event.stopPropagation();
          reactFlowInstance.setViewport(
            {
              x: reactFlowInstance.getViewport().x,
              y: reactFlowInstance.getViewport().y,
              zoom: 1,
            },
            { duration: 200 },
          );
        }
      };

      document.addEventListener("keydown", handleKeyDown, true);
      return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [reactFlowInstance]);

    // Node search shortcut (/ or Cmd+K)
    useEffect(() => {
      const handleSearchShortcut = (event: KeyboardEvent) => {
        // Don't trigger if typing in an input/textarea
        const target = event.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }

        // "/" key or Cmd/Ctrl + K
        const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

        if (event.key === "/" || (cmdOrCtrl && event.key === "k")) {
          event.preventDefault();
          setIsSearchOpen(true);
        }
      };

      document.addEventListener("keydown", handleSearchShortcut);
      return () => document.removeEventListener("keydown", handleSearchShortcut);
    }, []);

    // Handle new connections between nodes
    const onConnect = useCallback(
      (params: Connection | Edge) => {
        // Block connections in read-only mode
        if (isReadOnly) {
          toast({
            title: "Read-Only Template",
            description: "Clone this template to make edits",
            variant: "destructive",
          });
          return;
        }

        logger.debug("[onConnect] Creating edge:", {
          source: params.source,
          target: params.target,
          sourceHandle: params.sourceHandle,
          targetHandle: params.targetHandle,
        });

        // Get the source node to determine connector type
        const sourceNode = nodes.find((n) => n.id === params.source);
        logger.debug("[onConnect] Source node:", {
          found: !!sourceNode,
          type: sourceNode?.type,
          hasOutputs: !!sourceNode?.data?.outputs,
          outputKeys: sourceNode?.data?.outputs
            ? Object.keys(sourceNode.data.outputs)
            : [],
        });

        if (sourceNode) {
          const connectorType = getConnectorType(
            sourceNode,
            params.sourceHandle,
            true,
          );
          // Add connector type class and data for styling
          const newEdge = {
            ...params,
            className: `connector-type-${connectorType || "any"}`,
            data: { connectorType: connectorType || "any" },
          };
          logger.debug("[onConnect] ✓ Edge created:", {
            id: (newEdge as { id?: string }).id,
            source: newEdge.source,
            target: newEdge.target,
            sourceHandle: newEdge.sourceHandle, // Should be "image", "video", etc.
            targetHandle: newEdge.targetHandle, // Should be "first_frame", "video", etc.
            sourceHasOutputs: !!sourceNode?.data?.outputs,
            sourceOutputKeys: sourceNode?.data?.outputs
              ? Object.keys(sourceNode.data.outputs)
              : [],
          });
          setEdges((eds) => addEdge(newEdge, eds));

          // Immediately propagate ALL outputs through the new connection
          if (sourceNode.data?.outputs && params.target) {
            const allOutputs = sourceNode.data.outputs;

            // Update target node with ALL source outputs
            setNodes((nds) =>
              nds.map((node) =>
                node.id === params.target
                  ? {
                    ...node,
                    data: {
                      ...node.data,
                      ...allOutputs, // Merge all outputs
                      error: undefined, // Clear any validation errors when connection is made
                    },
                  }
                  : node,
              ),
            );
          } else if (params.target) {
            // Even if source has no outputs yet, clear target's validation errors
            setNodes((nds) =>
              nds.map((node) =>
                node.id === params.target
                  ? {
                    ...node,
                    data: {
                      ...node.data,
                      error: undefined, // Clear validation errors
                    },
                  }
                  : node,
              ),
            );
          }
        } else {
          setEdges((eds) => addEdge(params, eds));
        }
      },
      [setEdges, setNodes, nodes],
    );

    // Validate connections based on handle data types
    const isValidConnection = useCallback(
      (connection: Connection) => {
        const validation = validateConnection(connection, nodes, edges);

        if (!validation.valid) {
          console.warn("Connection rejected:", validation.reason);
        }

        return validation.valid;
      },
      [nodes, edges],
    );

    // Add a new node to the canvas
    const addNode = useCallback(
      (type: NodeType, position?: { x: number; y: number }) => {
        // Block adding nodes in read-only mode
        if (isReadOnly) {
          toast({
            title: "Read-Only Template",
            description: "Clone this template to make edits",
            variant: "destructive",
          });
          return;
        }

        const nodePosition = position || {
          x: Math.random() * 400 + 100,
          y: Math.random() * 200 + 100,
        };

        const data: any = getDefaultNodeData(type as NodeType);

        const newNode: WorkflowNode = {
          id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type,
          position: nodePosition,
          data,
        };

        setNodes((nds) => [...nds, newNode]);
      },
      [setNodes, isReadOnly, toast],
    );


    // Validate image file type and size
    const validateImageFile = (
      file: File,
    ): { valid: boolean; error?: string } => {
      const validTypes = ["image/jpeg", "image/png"];
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (!validTypes.includes(file.type)) {
        return {
          valid: false,
          error: "Only JPG and PNG images are supported",
        };
      }

      if (file.size > maxSize) {
        return {
          valid: false,
          error: `Image size exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(2)}MB)`,
        };
      }

      return { valid: true };
    };

    // Convert file to data URI
    const readFileAsDataURL = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          resolve(result);
        };
        reader.onerror = () => {
          reject(new Error("Failed to read image file"));
        };
        reader.readAsDataURL(file);
      });
    };

    // Handle drag over for drop zone
    const onDragOver = useCallback(
      (event: React.DragEvent) => {
        event.preventDefault();

        // Block drag-drop in read-only mode
        if (isReadOnly) {
          event.dataTransfer.dropEffect = "none";
          return;
        }

        // Check if dragging files, nodes, or assets
        const hasFiles = event.dataTransfer.types.includes("Files");
        const hasReactFlow = event.dataTransfer.types.includes(
          "application/reactflow",
        );
        const hasAsset = event.dataTransfer.types.includes("application/asset");

        if (hasFiles || hasAsset) {
          event.dataTransfer.dropEffect = "copy";
        } else if (hasReactFlow) {
          event.dataTransfer.dropEffect = "move";
        }
      },
      [isReadOnly],
    );

    // Handle drop to add node or create image input nodes from files
    const onDrop = useCallback(
      async (event: React.DragEvent) => {
        event.preventDefault();

        // Block drops in read-only mode
        if (isReadOnly) {
          toast({
            title: "Read-Only Template",
            description: "Clone this template to make edits",
            variant: "destructive",
          });
          return;
        }

        if (!reactFlowWrapper.current || !reactFlowInstance) return;

        // First, try to handle React Flow node drops
        const type = event.dataTransfer.getData(
          "application/reactflow",
        ) as NodeType;

        if (type) {
          // Use screenToFlowPosition (replaces deprecated project method)
          const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });

          addNode(type, position);
          return;
        }


        // Handle asset drops from library
        const assetData = event.dataTransfer.getData("application/asset");
        if (assetData) {
          try {
            const asset = JSON.parse(assetData);
            const position = reactFlowInstance.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });

            // Create appropriate input node based on asset type
            const nodeType =
              asset.assetType === "video"
                ? NodeType.VideoInput
                : NodeType.ImageInput;
            const newNode: WorkflowNode = {
              id: `${nodeType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: nodeType,
              position,
              data: {
                ...(asset.assetType === "video"
                  ? { videoUrl: asset.url }
                  : { imageUrl: asset.url }),
                label:
                  asset.assetType === "video" ? "Video Input" : "Image Input",
                outputs: { [asset.assetType]: asset.url },
              },
            };

            setNodes((nds) => [...nds, newNode]);

            toast({
              title: "Asset added",
              description: `${asset.assetType === "video" ? "Video" : "Image"} input node created from library`,
            });

            logger.debug("[WorkflowCanvas] Asset dropped:", asset);
            return;
          } catch (error) {
            console.error("Failed to parse asset data:", error);
            toast({
              title: "Error",
              description: "Failed to add asset from library",
              variant: "destructive",
            });
            return;
          }
        }

        // Handle file drops
        const files = event.dataTransfer.files;
        if (files.length === 0) return;

        const imageFiles: File[] = [];
        const errors: string[] = [];

        // Validate all files
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const validation = validateImageFile(file);

          if (validation.valid) {
            imageFiles.push(file);
          } else if (validation.error) {
            errors.push(`${file.name}: ${validation.error}`);
          }
        }

        // Show error toasts for invalid files
        errors.forEach((error) => {
          toast({
            title: "Invalid image",
            description: error,
            variant: "destructive",
          });
        });

        // Process valid image files
        if (imageFiles.length > 0) {
          try {
            // Calculate base position for stacking nodes
            const basePosition = reactFlowInstance.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });

            // Read all files in parallel
            const imageDataPromises = imageFiles.map((file) =>
              readFileAsDataURL(file).catch((error) => {
                toast({
                  title: "Failed to read image",
                  description: `${file.name}: ${error.message}`,
                  variant: "destructive",
                });
                return null;
              }),
            );

            const imageDataArray = await Promise.all(imageDataPromises);

            // Create nodes for valid image data
            let nodeCount = 0;
            imageDataArray.forEach((imageUrl, index) => {
              if (!imageUrl) return;

              // Stack nodes slightly offset from drop position
              const offsetY = index * 50;
              const position = {
                x: basePosition.x,
                y: basePosition.y + offsetY,
              };

              // Create image input node with image data
              const newNode: WorkflowNode = {
                id: `${NodeType.ImageInput}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: NodeType.ImageInput,
                position,
                data: {
                  imageUrl,
                  file: imageFiles[index],
                  label: "Image Input",
                  outputs: { image: imageUrl },
                },
              };

              setNodes((nds) => [...nds, newNode]);
              nodeCount++;
            });

            // Show success toast
            if (nodeCount > 0) {
              toast({
                title: "Images loaded",
                description: `Created ${nodeCount} image input node${nodeCount > 1 ? "s" : ""}`,
              });
            }
          } catch (error) {
            toast({
              title: "Error loading images",
              description:
                error instanceof Error ? error.message : "Unknown error",
              variant: "destructive",
            });
          }
        }
      },
      [
        reactFlowInstance,
        addNode,
        setNodes,
        toast,
        validateImageFile,
        readFileAsDataURL,
      ],
    );

    // Clear canvas
    const clearCanvas = useCallback(() => {
      // Block clearing in read-only mode
      if (isReadOnly) {
        toast({
          title: "Read-Only Template",
          description: "Clone this template to make edits",
          variant: "destructive",
        });
        return;
      }

      setNodes([]);
      setEdges([]);
      setCurrentWorkflowId(null);

      // Mark as saved since we're starting fresh
      dispatch({ type: "MARK_SAVED" });
    }, [setNodes, setEdges, isReadOnly, toast, dispatch]);

    // Load a workflow
    const loadWorkflow = useCallback(
      (workflow: SavedWorkflow, options?: { readOnly?: boolean }) => {
        logger.debug("[WorkflowCanvas] Loading workflow:", {
          id: workflow.id,
          name: workflow.name,
          nodeCount: workflow.nodes?.length || 0,
          edgeCount: workflow.edges?.length || 0,
        });

        // Determine if workflow should be read-only
        const readOnly = Boolean(options?.readOnly || workflow.is_public);
        setIsReadOnly(readOnly);

        // Propagate readOnly to all nodes
        const nodesWithReadOnly = (workflow.nodes || []).map((node) => ({
          ...node,
          data: { ...node.data, readOnly },
        }));

        setNodes(nodesWithReadOnly);
        setEdges(workflow.edges || []);
        setCurrentWorkflowId(workflow.id || null);

        // Mark as saved since we just loaded it
        dispatch({ type: "MARK_SAVED" });

        toast({
          title: readOnly ? "Template loaded (Read-Only)" : "Workflow loaded",
          description: readOnly
            ? `"${workflow.name}" opened as read-only template. Clone to edit.`
            : `"${workflow.name}" has been loaded`,
        });

        // Fit view after loading workflow
        setTimeout(() => {
          if (reactFlowInstance && workflow.nodes.length > 0) {
            reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
          }
        }, 50);
      },
      [setNodes, setEdges, toast, reactFlowInstance, dispatch],
    );

    // Handle ReactFlow initialization
    const handleInit = useCallback(
      (instance: ReactFlowInstance) => {
        setReactFlowInstance(instance);
        // Restore viewport from context if available
        if (workflowState.viewport && workflowState.viewport.zoom !== 1) {
          setTimeout(() => {
            instance.setViewport(workflowState.viewport);
          }, 50);
        } else if (!hasInitialized.current && nodes.length > 0) {
          // Only fit view on initial load if there are nodes
          setTimeout(() => {
            instance.fitView({ padding: 0.2, duration: 300 });
          }, 50);
        }
        hasInitialized.current = true;
      },
      [nodes.length, workflowState.viewport],
    );

    // Handle viewport changes (pan/zoom) to save to context
    const handleMoveEnd = useCallback(
      (_event: unknown) => {
        if (reactFlowInstance) {
          const viewport = reactFlowInstance.getViewport();
          dispatch({ type: "SET_VIEWPORT", payload: viewport });
        }
      },
      [reactFlowInstance, dispatch],
    );

    // Save workflow handler
    const handleSaveWorkflow = useCallback(() => {
      setIsSaveDialogOpen(true);
    }, []);

    // Load workflow handler
    const handleLoadWorkflow = useCallback(() => {
      setIsLoadDialogOpen(true);
    }, []);

    // Workflow execution
    const {
      executeWorkflow,
      abortWorkflow,
      resetWorkflow,
      executeSingleNode,
      isExecuting,
      executionProgress,
      totalNodes,
      isBatchMode,
      batchProgress,
    } = useWorkflowExecution(
      nodes,
      edges,
      setNodes,
      setEdges,
      onAssetGenerated,
    );

    // Copy selected nodes
    const copySelectedNodes = useCallback(() => {
      const selectedNodes = nodes.filter((node) => (node as any).selected);
      if (selectedNodes.length === 0) {
        toast({
          title: "No nodes selected",
          description: "Select one or more nodes to copy",
        });
        return;
      }

      // Get IDs of selected nodes
      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));

      // Copy edges that connect selected nodes
      const relevantEdges = edges.filter(
        (edge) =>
          selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
      );

      setCopiedNodes(selectedNodes);
      setCopiedEdges(relevantEdges);

      toast({
        title: "Copied",
        description: `${selectedNodes.length} node${selectedNodes.length > 1 ? "s" : ""} copied to clipboard`,
      });
    }, [nodes, edges, toast]);

    // Paste copied nodes
    const pasteNodes = useCallback(() => {
      // Block pasting in read-only mode
      if (isReadOnly) {
        toast({
          title: "Read-Only Template",
          description: "Clone this template to make edits",
          variant: "destructive",
        });
        return;
      }

      if (copiedNodes.length === 0) {
        toast({
          title: "Nothing to paste",
          description: "Copy some nodes first",
        });
        return;
      }

      // Generate new IDs and offset positions
      const idMap = new Map<string, string>();
      const PASTE_OFFSET = 50;

      const newNodes = copiedNodes.map((node) => {
        const newId = `${node.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        idMap.set(node.id, newId);

        return {
          ...node,
          id: newId,
          position: {
            x: node.position.x + PASTE_OFFSET,
            y: node.position.y + PASTE_OFFSET,
          },
          selected: true, // Select the pasted nodes
          data: {
            ...node.data,
            outputs: {}, // Clear outputs
          },
        };
      });

      // Update edges with new IDs
      const newEdges = copiedEdges
        .map((edge) => {
          const newSource = idMap.get(edge.source);
          const newTarget = idMap.get(edge.target);

          if (!newSource || !newTarget) return null;

          return {
            ...edge,
            id: `e-${newSource}-${newTarget}-${Date.now()}`,
            source: newSource,
            target: newTarget,
          };
        })
        .filter((edge): edge is WorkflowEdge => edge !== null);

      // Deselect existing nodes
      setNodes((nds) =>
        nds
          .map((node) => ({ ...node, selected: false }))
          .concat(newNodes as any),
      );
      setEdges((eds) => eds.concat(newEdges));

      toast({
        title: "Pasted",
        description: `${newNodes.length} node${newNodes.length > 1 ? "s" : ""} pasted`,
      });
    }, [copiedNodes, copiedEdges, setNodes, setEdges, toast, isReadOnly]);

    // Copy configuration from selected node
    const copyNodeConfig = useCallback(() => {
      const selectedNodes = nodes.filter((node) => (node as any).selected);

      if (selectedNodes.length === 0) {
        toast({
          title: "No node selected",
          description: "Select a node to copy its configuration",
        });
        return;
      }

      if (selectedNodes.length > 1) {
        toast({
          title: "Multiple nodes selected",
          description: "Select only one node to copy configuration",
          variant: "destructive",
        });
        return;
      }

      const node = selectedNodes[0];

      // Extract configuration (exclude runtime state)
      const { outputs, status, error, isGenerating, ...config } = node.data;

      setCopiedConfig({
        nodeType: node.type as NodeType,
        config,
      });

      toast({
        title: "Configuration copied",
        description: `Copied settings from ${node.data.label || node.type}`,
      });
    }, [nodes, toast]);

    // Paste configuration to selected nodes
    const pasteNodeConfig = useCallback(() => {
      if (!copiedConfig) {
        toast({
          title: "Nothing to paste",
          description: "Copy a node configuration first",
        });
        return;
      }

      const selectedNodes = nodes.filter((node) => (node as any).selected);

      if (selectedNodes.length === 0) {
        toast({
          title: "No nodes selected",
          description: "Select one or more nodes to paste configuration",
        });
        return;
      }

      // Filter nodes that match the copied type
      const compatibleNodes = selectedNodes.filter(
        (node) => node.type === copiedConfig.nodeType
      );

      if (compatibleNodes.length === 0) {
        toast({
          title: "Incompatible nodes",
          description: `Selected nodes must be of type "${copiedConfig.nodeType}"`,
          variant: "destructive",
        });
        return;
      }

      // Apply configuration to compatible nodes
      setNodes((nds) =>
        nds.map((node) => {
          if (compatibleNodes.some((cn) => cn.id === node.id)) {
            return {
              ...node,
              data: {
                ...node.data,
                ...copiedConfig.config,
                // Preserve node-specific properties
                label: node.data.label,
                customLabel: node.data.customLabel,
                outputs: node.data.outputs,
                status: node.data.status,
                error: node.data.error,
              },
            };
          }
          return node;
        })
      );

      toast({
        title: "Configuration pasted",
        description: `Applied to ${compatibleNodes.length} node${compatibleNodes.length > 1 ? "s" : ""}`,
      });
    }, [copiedConfig, nodes, setNodes, toast]);

    // Keyboard shortcuts for copy/paste
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        // Check if we're in an input/textarea to avoid conflicts
        const target = event.target as HTMLElement;
        const isInputField =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

        if (isInputField) return;

        const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        const modifier = isMac ? event.metaKey : event.ctrlKey;

        if (modifier && event.shiftKey && event.key === "C") {
          event.preventDefault();
          copyNodeConfig();
        } else if (modifier && event.shiftKey && event.key === "V") {
          event.preventDefault();
          pasteNodeConfig();
        } else if (modifier && event.key === "c") {
          event.preventDefault();
          copySelectedNodes();
        } else if (modifier && event.key === "v") {
          event.preventDefault();
          pasteNodes();
        } else if (event.key === "Delete" || event.key === "Backspace") {
          // Block deletion in read-only mode
          if (isReadOnly) {
            event.preventDefault();
            toast({
              title: "Read-Only Template",
              description: "Clone this template to make edits",
              variant: "destructive",
            });
            return;
          }

          // Delete selected nodes
          const selectedNodes = nodes.filter((node) => (node as any).selected);
          if (selectedNodes.length > 0) {
            event.preventDefault();
            const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
            setNodes((nds) => nds.filter((n) => !selectedNodeIds.has(n.id)));
            setEdges((eds) =>
              eds.filter(
                (e) =>
                  !selectedNodeIds.has(e.source) &&
                  !selectedNodeIds.has(e.target),
              ),
            );
            toast({
              title: "Deleted",
              description: `${selectedNodes.length} node${selectedNodes.length > 1 ? "s" : ""} deleted`,
            });
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [copySelectedNodes, pasteNodes, copyNodeConfig, pasteNodeConfig, nodes, setNodes, setEdges, toast, isReadOnly]);

    // Context menu handlers
    const handleNodeContextMenu = useCallback(
      (event: React.MouseEvent, node: WorkflowNode) => {
        event.preventDefault();
        if (isReadOnly) return;
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          nodeId: node.id,
        });
      },
      [isReadOnly]
    );

    const handleDeleteNode = useCallback(
      (nodeId: string) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) =>
          eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
        );
        toast({
          title: "Deleted",
          description: "Node deleted",
        });
      },
      [setNodes, setEdges, toast]
    );

    const handleDuplicateNode = useCallback(
      (nodeId: string) => {
        const nodeToDuplicate = nodes.find((n) => n.id === nodeId);
        if (!nodeToDuplicate) return;

        const newNode: WorkflowNode = {
          ...nodeToDuplicate,
          id: `${nodeToDuplicate.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          position: {
            x: nodeToDuplicate.position.x + 50,
            y: nodeToDuplicate.position.y + 50,
          },
          selected: false,
          data: {
            ...nodeToDuplicate.data,
            outputs: undefined, // Clear outputs for duplicated node
            status: "ready",
          },
        };

        setNodes((nds) => [...nds, newNode]);
        toast({
          title: "Duplicated",
          description: "Node duplicated",
        });
      },
      [nodes, setNodes, toast]
    );

    const handleSetNodeLabel = useCallback(
      (nodeId: string, label: string | undefined) => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, customLabel: label } }
              : n
          )
        );
        if (label) {
          toast({
            title: "Label Set",
            description: `Node labeled "${label}"`,
          });
        }
      },
      [setNodes, toast]
    );

    // Capture thumbnail of the canvas
    const captureThumbnail = useCallback(async (): Promise<string | null> => {
      if (!reactFlowWrapper.current || !reactFlowInstance) {
        console.warn(
          "[WorkflowCanvas] Cannot capture thumbnail - wrapper/instance not available",
        );
        return null;
      }

      try {
        logger.debug("[WorkflowCanvas] Capturing thumbnail...");

        // If no nodes, return null
        if (nodes.length === 0) {
          console.warn("[WorkflowCanvas] No nodes to capture");
          return null;
        }

        // Calculate bounds of all nodes
        const nodesBounds = getNodesBounds(nodes);

        // Add padding around nodes (100px on each side)
        const padding = 100;
        const viewportWidth = 1600;
        const viewportHeight = 900;

        // Calculate the viewport that fits all nodes with padding
        const viewport = getViewportForBounds(
          {
            x: nodesBounds.x - padding,
            y: nodesBounds.y - padding,
            width: nodesBounds.width + padding * 2,
            height: nodesBounds.height + padding * 2,
          },
          viewportWidth,
          viewportHeight,
          0.5, // min zoom
          2, // max zoom
          0.1, // default padding
        );

        logger.debug("[WorkflowCanvas] Calculated viewport for thumbnail:", {
          nodesBounds,
          viewport,
        });

        // Temporarily set the viewport to show all nodes
        const originalTransform = reactFlowInstance.getViewport();
        reactFlowInstance.setViewport({
          x: viewport.x,
          y: viewport.y,
          zoom: viewport.zoom,
        });

        // Wait for viewport to update
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Find the ReactFlow viewport element
        const viewportElement = reactFlowWrapper.current.querySelector(
          ".react-flow__viewport",
        );
        if (!viewportElement) {
          console.warn(
            "[WorkflowCanvas] Cannot find .react-flow__viewport element",
          );
          return null;
        }

        // Capture with html2canvas
        const canvas = await html2canvas(viewportElement as HTMLElement, {
          backgroundColor: "#0a0a0a", // Match dark background
          scale: 0.5, // Reduce resolution for smaller file size
          logging: false,
          width: viewportWidth,
          height: viewportHeight,
        });

        // Restore original viewport
        reactFlowInstance.setViewport(originalTransform);

        // Convert to PNG data URL
        const dataUrl = canvas.toDataURL("image/png", 0.8);

        logger.debug("[WorkflowCanvas] Thumbnail captured:", {
          size: `${Math.round(dataUrl.length / 1024)}KB`,
          dimensions: `${canvas.width}x${canvas.height}`,
        });

        return dataUrl;
      } catch (error) {
        console.error("[WorkflowCanvas] Failed to capture thumbnail:", error);
        return null;
      }
    }, [nodes, reactFlowInstance]);

    // Expose loadWorkflow and captureThumbnail methods to parent
    useImperativeHandle(
      ref,
      () => ({
        loadWorkflow,
        captureThumbnail,
      }),
      [loadWorkflow, captureThumbnail],
    );

    // Listen for node execute events
    useEffect(() => {
      const handleNodeExecute = (event: any) => {
        const { nodeId } = event.detail;
        logger.debug("Execute node:", nodeId);
        // Call the single node execution function
        executeSingleNode(nodeId);
      };

      window.addEventListener("node-execute", handleNodeExecute);
      return () =>
        window.removeEventListener("node-execute", handleNodeExecute);
    }, [executeSingleNode]);


    // Listen for add-asset-node events from Index
    useEffect(() => {
      const handleAddAssetNode = (event: CustomEvent<{ assetType: string; url: string }>) => {
        const { assetType, url } = event.detail;

        if (!reactFlowInstance) {
          console.warn("[WorkflowCanvas] ReactFlow instance not available");
          return;
        }

        // Get center of viewport for positioning
        const centerPosition = reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });

        // Create appropriate input node based on asset type
        const nodeType =
          assetType === "video" ? NodeType.VideoInput : NodeType.ImageInput;
        const newNode: WorkflowNode = {
          id: `${nodeType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: nodeType,
          position: centerPosition,
          data: {
            ...(assetType === "video" ? { videoUrl: url } : { imageUrl: url }),
            label: assetType === "video" ? "Video Input" : "Image Input",
            outputs: { [assetType]: url },
          },
        };

        setNodes((nds) => [...nds, newNode]);

        toast({
          title: "Asset added",
          description: `${assetType === "video" ? "Video" : "Image"} input node created`,
        });

        logger.debug("[WorkflowCanvas] Asset node added:", nodeType);
      };

      window.addEventListener("add-asset-node", handleAddAssetNode as EventListener);
      return () =>
        window.removeEventListener("add-asset-node", handleAddAssetNode as EventListener);
    }, [reactFlowInstance, setNodes, toast]);

    return (
      <div className="flex w-full h-full">
        {/* Node Palette - Always visible unless in read-only mode */}
        {!isReadOnly && (
          <div className="shrink-0">
            <NodePalette
              onAddNode={addNode}
            />
          </div>
        )}

        {/* Canvas Area */}
        <div ref={reactFlowWrapper} className="flex-1 relative">
          {/* Read-Only Mode Banner */}
          {isReadOnly && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-purple-600/95 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="text-sm font-semibold">Read-Only Template</p>
                <p className="text-xs">
                  Clone this template to make it editable
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  if (!currentWorkflowId) {
                    toast({
                      title: "Error",
                      description: "No workflow ID found",
                      variant: "destructive",
                    });
                    return;
                  }
                  try {
                    await cloneWorkflow(currentWorkflowId);
                    toast({
                      title: "Workflow Cloned",
                      description:
                        "The template has been cloned to your workflows. Check My Workflows.",
                    });
                  } catch (error) {
                    toast({
                      title: "Clone Failed",
                      description:
                        error instanceof Error
                          ? error.message
                          : "Unknown error",
                      variant: "destructive",
                    });
                  }
                }}
                className="ml-2 text-xs h-7"
              >
                <Copy className="w-3 h-3 mr-1.5" />
                Clone Workflow
              </Button>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={handleInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onMoveEnd={handleMoveEnd}
            onNodeContextMenu={handleNodeContextMenu}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            className="bg-background"
            proOptions={{ hideAttribution: true }}
            multiSelectionKeyCode="Shift"
            selectionKeyCode="Shift"
            deleteKeyCode={isReadOnly ? null : "Backspace"}
            selectionOnDrag={!isReadOnly}
            panOnDrag={true}
            selectNodesOnDrag={false}
            nodesDraggable={!isReadOnly}
            nodesConnectable={!isReadOnly}
            edgesFocusable={!isReadOnly}
            edgesUpdatable={!isReadOnly}
            minZoom={0.1}
            maxZoom={4}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
            translateExtent={[
              [-5000, -5000],
              [5000, 5000],
            ]}
            nodeExtent={[
              [-5000, -5000],
              [5000, 5000],
            ]}
            zoomOnScroll={true}
            zoomOnPinch={true}
            panOnScroll={false}
          >
            <Background className="bg-background" />
            <Controls className="bg-card border border-border" />
            <WorkflowToolbar
              onClearCanvas={clearCanvas}
              onExecuteWorkflow={executeWorkflow}
              onAbortWorkflow={abortWorkflow}
              onResetWorkflow={resetWorkflow}
              onSaveWorkflow={handleSaveWorkflow}
              onLoadWorkflow={handleLoadWorkflow}
              isExecuting={isExecuting}
              executionProgress={executionProgress}
              totalNodes={totalNodes}
              isReadOnly={isReadOnly}
              isBatchMode={isBatchMode}
              batchProgress={batchProgress}
            />
            <FloatingLabels nodes={nodes} />
          </ReactFlow>

          {/* Node context menu */}
          {contextMenu && (
            <NodeContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              nodeId={contextMenu.nodeId}
              currentLabel={
                nodes.find((n) => n.id === contextMenu.nodeId)?.data.customLabel
              }
              onClose={() => setContextMenu(null)}
              onDelete={handleDeleteNode}
              onDuplicate={handleDuplicateNode}
              onSetLabel={handleSetNodeLabel}
              onCopyConfig={(nodeId) => {
                // Select the node first, then copy config
                setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
                setTimeout(() => copyNodeConfig(), 0);
              }}
              onPasteConfig={(nodeId) => {
                // Select the node first, then paste config
                setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
                setTimeout(() => pasteNodeConfig(), 0);
              }}
            />
          )}

          {/* Empty state message */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-muted-foreground max-w-md">
                <p className="text-lg font-medium mb-2">Your canvas is empty</p>
                <p className="text-sm mb-4">
                  Drag nodes from the palette or click on a node to add it
                </p>
                <div className="text-xs space-y-1 bg-muted/50 rounded-lg p-3 pointer-events-auto">
                  <p className="font-medium mb-2">Selection & Shortcuts:</p>
                  <p>
                    • <strong>Drag</strong> on empty canvas to select area
                  </p>
                  <p>
                    • Hold{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      Shift
                    </kbd>{" "}
                    + Click for multi-select
                  </p>
                  <p>
                    •{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      Ctrl/Cmd
                    </kbd>{" "}
                    +{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      C
                    </kbd>{" "}
                    to copy
                  </p>
                  <p>
                    •{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      Ctrl/Cmd
                    </kbd>{" "}
                    +{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      V
                    </kbd>{" "}
                    to paste
                  </p>
                  <p>
                    •{" "}
                    <kbd className="px-1.5 py-0.5 bg-background rounded border">
                      Delete
                    </kbd>{" "}
                    to remove
                  </p>
                  <p>
                    • <strong>Right-click</strong> or{" "}
                    <strong>Middle-click</strong> to pan canvas
                  </p>
                  <p>
                    • <strong>Scroll</strong> to zoom in/out
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save Workflow Dialog */}
        <SaveWorkflowDialog
          open={isSaveDialogOpen}
          onOpenChange={setIsSaveDialogOpen}
          nodes={nodes}
          edges={edges}
          onSaveSuccess={(workflowId) => {
            setCurrentWorkflowId(workflowId);
            // Mark as saved since workflow was successfully saved to backend
            dispatch({ type: "MARK_SAVED" });
          }}
          onCaptureThumbnail={captureThumbnail}
        />

        {/* Load Workflow Dialog */}
        <WorkflowLoadDialog
          open={isLoadDialogOpen}
          onOpenChange={setIsLoadDialogOpen}
          onLoadWorkflow={loadWorkflow}
        />


        {/* Node Search Dialog */}
        <NodeSearchDialog
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />

        {/* Text Edit Side Panel */}
        <TextEditSidePanel
          isOpen={textEditPanel.isOpen}
          onClose={() => setTextEditPanel((prev) => ({ ...prev, isOpen: false }))}
          title={textEditPanel.title}
          value={textEditPanel.value}
          onChange={handleTextEditPanelSave}
          readOnly={textEditPanel.readOnly}
        />
      </div>
    );
  },
);

WorkflowCanvasInner.displayName = "WorkflowCanvasInner";

const WorkflowCanvas = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
  ({ onAssetGenerated, onLoadWorkflowRequest }, ref) => {
    return (
      <ReactFlowProvider>
        <WorkflowCanvasInner
          ref={ref}
          onAssetGenerated={onAssetGenerated}
          onLoadWorkflowRequest={onLoadWorkflowRequest}
        />
      </ReactFlowProvider>
    );
  },
);

WorkflowCanvas.displayName = "WorkflowCanvas";

export default WorkflowCanvas;
