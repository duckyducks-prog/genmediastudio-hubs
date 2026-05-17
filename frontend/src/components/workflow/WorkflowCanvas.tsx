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
  ConnectorType,
  CompoundNodeData,
  getNodeConfiguration,
} from "./types";
import NodePalette from "./NodePalette";
import WorkflowToolbar from "./WorkflowToolbar";
import SaveWorkflowDialog from "./SaveWorkflowDialog";
import WorkflowLoadDialog from "./WorkflowLoadDialog";
import CompoundBreadcrumb, { CompoundNavEntry } from "./CompoundBreadcrumb";
import { CompoundInputPicker } from "./CompoundInputPicker";
import { ImportWorkflowAsNodeDialog } from "./ImportWorkflowAsNodeDialog";
import { CompoundNodeDefinition } from "@/lib/compound-nodes/types";
import { useWorkflowExecution } from "./useWorkflowExecution";
import { validateConnection, getConnectorType } from "./connectionValidation";
import { useToast } from "@/hooks/use-toast";
import { SavedWorkflow, cloneWorkflow, loadWorkflow as fetchWorkflow } from "@/lib/workflow-api";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { NodeContextMenu } from "./NodeContextMenu";
import { FloatingLabels } from "./FloatingLabels";
import { NodeSearchDialog } from "./NodeSearchDialog";
import { GhostNodeSearch } from "./GhostNodeSearch";
import { TextEditSidePanel } from "./TextEditSidePanel";
import { SharePanel } from "./SharePanel";
import { SettingsPanel } from "./SettingsPanel";
import { TemplateModePanel } from "./TemplateModePanel";
import {
  useWorkflowNodes,
  useWorkflowEdges,
  useWorkflow,
} from "@/contexts/WorkflowContext";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { nodeTypes, getDefaultNodeData } from "./registry";
import { WorkflowRunningScreen } from "./WorkflowRunningScreen";

export interface WorkflowCanvasRef {
  loadWorkflow: (
    workflow: SavedWorkflow,
    options?: { readOnly?: boolean },
  ) => void;
  captureThumbnail: () => Promise<string | null>;
  newWorkflow: () => void;
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
    const [isSharePanelOpen, setIsSharePanelOpen] = useState(false);
    const [isTemplatePanelOpen, setIsTemplatePanelOpen] = useState(false);
    const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
    const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(
      null,
    );
    const [currentWorkflowName, setCurrentWorkflowName] = useState("Untitled Workflow");
    const [copiedNodes, setCopiedNodes] = useState<WorkflowNode[]>([]);
    const [copiedEdges, setCopiedEdges] = useState<WorkflowEdge[]>([]);
    const [copiedConfig, setCopiedConfig] = useState<{
      nodeType: NodeType;
      config: any;
    } | null>(null);
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [ghostSearch, setGhostSearch] = useState<{ x: number; y: number } | null>(null);
    const [recentNodeTypes, setRecentNodeTypes] = useState<NodeType[]>([]);
    const lastCursorPosRef = useRef({ x: 0, y: 0 });
    const [parallelExecution, setParallelExecution] = useState(false);
    // Compound node navigation stack (for navigate-into editing)
    const [compoundNavStack, setCompoundNavStack] = useState<CompoundNavEntry[]>([]);
    const isInsideCompound = compoundNavStack.length > 0;

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
    // Element chips for the expanded text panel — loaded once, refreshed on scene-elements-updated
    const [panelElementChips, setPanelElementChips] = useState<import("./chips/ChipTextarea").ElementChipSuggestion[]>([]);
    useEffect(() => {
      const load = () => {
        import("@/lib/scene-elements-api").then(({ listSceneElements }) =>
          listSceneElements().then((els) => {
            const IMAGE_TYPES = new Set(["character", "location", "prop"]);
            setPanelElementChips(
              els.filter(e => IMAGE_TYPES.has(e.element_type)).map(e => ({
                id: e.id,
                name: e.name,
                token: e.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
                elementType: e.element_type,
                referenceImageUrls: e.reference_image_urls,
              }))
            );
          }).catch(() => {})
        );
      };
      load();
      window.addEventListener("scene-elements-updated", load);
      return () => window.removeEventListener("scene-elements-updated", load);
    }, []);

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
          // Ghost-node inline search at cursor position
          const wrapper = reactFlowWrapper.current;
          if (wrapper) {
            const rect = wrapper.getBoundingClientRect();
            // Position ghost in screen space, clamped to wrapper
            const gx = Math.min(lastCursorPosRef.current.x, rect.width - 280);
            const gy = Math.min(lastCursorPosRef.current.y, rect.height - 300);
            setGhostSearch({ x: Math.max(8, gx), y: Math.max(8, gy) });
          } else {
            setIsSearchOpen(true); // fallback
          }
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
        setCurrentWorkflowName(workflow.name || "Untitled Workflow");

        // Restore generation mode from saved workflow
        if (workflow.mode) {
          dispatch({ type: "SET_MODE", payload: workflow.mode });
        }

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
      executionSteps,
    } = useWorkflowExecution(
      nodes,
      edges,
      setNodes,
      setEdges,
      onAssetGenerated,
      parallelExecution,
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

    // Import workflow as compound node state
    const [importWorkflow, setImportWorkflow] = useState<{
      id: string;
      name: string;
    } | null>(null);

    // Compound creation state: holds pending data while input picker is open
    const [compoundPickerData, setCompoundPickerData] = useState<{
      sourceNodes: Array<{ nodeId: string; label: string; type: ConnectorType }>;
      selectedNodes: WorkflowNode[];
      selectedIds: Set<string>;
      incomingEdges: Edge[];
      outgoingEdges: Edge[];
      internalEdges: Edge[];
    } | null>(null);

    // Step 1: Analyze selection and open the input picker dialog
    const createCompoundFromSelection = useCallback(() => {
      const selectedNodes = nodes.filter((n) => n.selected);
      if (selectedNodes.length < 2) {
        toast({
          title: "Select Nodes",
          description: "Select 2 or more nodes to create a compound node.",
          variant: "destructive",
        });
        return;
      }

      const selectedIds = new Set(selectedNodes.map((n) => n.id));

      // Classify edges
      const incomingEdges: Edge[] = [];
      const outgoingEdges: Edge[] = [];
      const internalEdges: Edge[] = [];

      for (const edge of edges) {
        const srcInside = selectedIds.has(edge.source);
        const tgtInside = selectedIds.has(edge.target);
        if (srcInside && tgtInside) {
          internalEdges.push(edge);
        } else if (!srcInside && tgtInside) {
          incomingEdges.push(edge);
        } else if (srcInside && !tgtInside) {
          outgoingEdges.push(edge);
        }
      }

      // Find source nodes (category: "input") not already covered by boundary edges
      const nodesWithBoundaryInput = new Set(incomingEdges.map((e) => e.target));
      const sourceNodes: Array<{ nodeId: string; label: string; type: ConnectorType }> = [];
      for (const node of selectedNodes) {
        if (nodesWithBoundaryInput.has(node.id)) continue;
        const config = getNodeConfiguration(node.type as NodeType);
        if (!config || config.category !== "input") continue;
        if (config.outputConnectors.length === 0) continue;
        sourceNodes.push({
          nodeId: node.id,
          label: node.data?.customLabel || config.label || (node.type as string),
          type: config.outputConnectors[0].type,
        });
      }

      // If there are source nodes to pick from, show the picker
      if (sourceNodes.length > 0) {
        setCompoundPickerData({
          sourceNodes,
          selectedNodes,
          selectedIds,
          incomingEdges,
          outgoingEdges,
          internalEdges,
        });
        return;
      }

      // No source nodes to pick — create compound directly
      finalizeCompound([], selectedNodes, selectedIds, incomingEdges, outgoingEdges, internalEdges);
    }, [nodes, edges, toast]);

    // Step 2: Build and insert the compound node
    const finalizeCompound = useCallback((
      variableInputNodeIds: string[],
      selectedNodes: WorkflowNode[],
      selectedIds: Set<string>,
      incomingEdges: Edge[],
      outgoingEdges: Edge[],
      internalEdges: Edge[],
    ) => {
      const variableSet = new Set(variableInputNodeIds);

      // Build input handles
      const compoundInputs: Array<{ id: string; label: string; type: ConnectorType }> = [];
      const inputMappings: Record<string, { nodeId: string; inputHandle: string }> = {};
      const inputRewireEdges: Array<{ edgeSourceId: string; edgeSourceHandle: string; compoundHandleId: string }> = [];

      // From boundary edges (outside → inside)
      for (const edge of incomingEdges) {
        const targetNode = selectedNodes.find((n) => n.id === edge.target) as WorkflowNode | undefined;
        const handleId = `in_${compoundInputs.length}`;
        const connType = (targetNode ? getConnectorType(targetNode, edge.targetHandle, false) : null) || ConnectorType.Any;
        compoundInputs.push({
          id: handleId,
          label: `${targetNode?.data?.customLabel || targetNode?.type || "Input"} - ${edge.targetHandle || "input"}`,
          type: connType,
        });
        inputMappings[handleId] = { nodeId: edge.target, inputHandle: edge.targetHandle || "" };
        inputRewireEdges.push({ edgeSourceId: edge.source, edgeSourceHandle: edge.sourceHandle || "", compoundHandleId: handleId });
      }

      // From user-selected variable source nodes
      for (const nodeId of variableInputNodeIds) {
        const node = selectedNodes.find((n) => n.id === nodeId);
        if (!node) continue;
        const config = getNodeConfiguration(node.type as NodeType);
        if (!config || config.outputConnectors.length === 0) continue;
        const handleId = `in_${compoundInputs.length}`;
        compoundInputs.push({
          id: handleId,
          label: node.data?.customLabel || config.label || (node.type as string),
          type: config.outputConnectors[0].type,
        });
        inputMappings[handleId] = { nodeId: node.id, inputHandle: "__source__" };
      }

      // Build output handles
      const compoundOutputs: Array<{ id: string; label: string; type: ConnectorType }> = [];
      const outputMappings: Record<string, { nodeId: string; outputHandle: string }> = {};
      const outputRewireEdges: Array<{ edgeTargetId: string; edgeTargetHandle: string; compoundHandleId: string }> = [];

      // From boundary edges (inside → outside)
      for (const edge of outgoingEdges) {
        const sourceNode = selectedNodes.find((n) => n.id === edge.source) as WorkflowNode | undefined;
        const handleId = `out_${compoundOutputs.length}`;
        const connType = (sourceNode ? getConnectorType(sourceNode, edge.sourceHandle, true) : null) || ConnectorType.Any;
        compoundOutputs.push({
          id: handleId,
          label: `${sourceNode?.data?.customLabel || sourceNode?.type || "Output"} - ${edge.sourceHandle || "output"}`,
          type: connType,
        });
        outputMappings[handleId] = { nodeId: edge.source, outputHandle: edge.sourceHandle || "" };
        outputRewireEdges.push({ edgeTargetId: edge.target, edgeTargetHandle: edge.targetHandle || "", compoundHandleId: handleId });
      }

      // Auto-detect terminal outputs: nodes with output connectors that have
      // no outgoing internal edges from those handles
      const internalSourceHandles = new Set(
        internalEdges.map((e) => `${e.source}:${e.sourceHandle || ""}`)
      );
      const nodesWithBoundaryOutput = new Set(outgoingEdges.map((e) => e.source));
      for (const node of selectedNodes) {
        if (nodesWithBoundaryOutput.has(node.id)) continue;
        if (variableSet.has(node.id)) continue; // Don't also make source nodes into outputs
        const config = getNodeConfiguration(node.type as NodeType);
        if (!config) continue;
        for (const output of config.outputConnectors) {
          const key = `${node.id}:${output.id}`;
          if (!internalSourceHandles.has(key)) {
            const handleId = `out_${compoundOutputs.length}`;
            compoundOutputs.push({
              id: handleId,
              label: `${node.data?.customLabel || config.label || node.type} - ${output.label}`,
              type: output.type,
            });
            outputMappings[handleId] = { nodeId: node.id, outputHandle: output.id };
          }
        }
      }

      // Calculate position (center of selected nodes)
      const avgX = selectedNodes.reduce((sum, n) => sum + (n.position?.x || 0), 0) / selectedNodes.length;
      const avgY = selectedNodes.reduce((sum, n) => sum + (n.position?.y || 0), 0) / selectedNodes.length;

      // Create the compound node
      const compoundId = `compound_${Date.now()}`;
      const compoundNode: WorkflowNode = {
        id: compoundId,
        type: NodeType.Compound,
        position: { x: avgX, y: avgY },
        data: {
          label: "Compound",
          status: "ready",
          name: `Compound (${selectedNodes.length} nodes)`,
          icon: "📦",
          description: "",
          inputs: compoundInputs.map((h) => ({
            id: h.id,
            label: h.label,
            type: h.type,
            required: false,
            acceptsMultiple: false,
          })),
          outputs: compoundOutputs.map((h) => ({
            id: h.id,
            label: h.label,
            type: h.type,
          })),
          controls: [],
          controlValues: {},
          internalWorkflow: {
            nodes: JSON.parse(JSON.stringify(selectedNodes)),
            edges: JSON.parse(JSON.stringify(internalEdges)),
          },
          mappings: {
            inputs: inputMappings,
            controls: {},
            outputs: outputMappings,
          },
          compoundId,
        } as CompoundNodeData,
      };

      // Remove selected nodes and their edges, add compound node
      const remainingNodes = nodes.filter((n) => !selectedIds.has(n.id));
      const remainingEdges = edges.filter((e) => {
        return !selectedIds.has(e.source) && !selectedIds.has(e.target);
      });

      // Reconnect boundary edges to compound handles
      const newEdges: Edge[] = [];
      for (const rewire of inputRewireEdges) {
        newEdges.push({
          id: `e_${rewire.edgeSourceId}_${compoundId}_${rewire.compoundHandleId}`,
          source: rewire.edgeSourceId,
          sourceHandle: rewire.edgeSourceHandle,
          target: compoundId,
          targetHandle: rewire.compoundHandleId,
        });
      }
      for (const rewire of outputRewireEdges) {
        newEdges.push({
          id: `e_${compoundId}_${rewire.edgeTargetId}_${rewire.compoundHandleId}`,
          source: compoundId,
          sourceHandle: rewire.compoundHandleId,
          target: rewire.edgeTargetId,
          targetHandle: rewire.edgeTargetHandle,
        });
      }

      setNodes([...remainingNodes, compoundNode]);
      setEdges([...remainingEdges, ...newEdges]);

      toast({
        title: "Compound Node Created",
        description: `${selectedNodes.length} nodes collapsed into a compound node. Double-click to expand.`,
      });
    }, [nodes, edges, setNodes, setEdges, toast]);

    // Compound node navigation: enter into a compound node's internal workflow
    const enterCompoundNode = useCallback(
      (nodeId: string) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== NodeType.Compound) return;

        const compoundData = node.data as any;
        const internalWorkflow = compoundData.internalWorkflow;
        if (!internalWorkflow?.nodes || !internalWorkflow?.edges) return;

        // Push current state onto nav stack
        setCompoundNavStack((prev) => [
          ...prev,
          {
            parentNodes: JSON.parse(JSON.stringify(nodes)),
            parentEdges: JSON.parse(JSON.stringify(edges)),
            compoundNodeId: nodeId,
            label: compoundData.name || "Compound Node",
          },
        ]);

        // Load internal workflow onto canvas
        setNodes(JSON.parse(JSON.stringify(internalWorkflow.nodes)));
        setEdges(JSON.parse(JSON.stringify(internalWorkflow.edges)));

        // Fit view after loading
        setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2 }), 100);
      },
      [nodes, edges, setNodes, setEdges, reactFlowInstance],
    );

    // Compound node navigation: navigate back to a specific level
    const navigateToLevel = useCallback(
      (targetLevel: number) => {
        if (compoundNavStack.length === 0) return;

        // Save current canvas state back into the compound node we're inside
        let currentNodes = JSON.parse(JSON.stringify(nodes));
        let currentEdges = JSON.parse(JSON.stringify(edges));

        // Walk backwards from current level, saving changes at each level
        const newStack = [...compoundNavStack];
        while (newStack.length > targetLevel + 1) {
          const entry = newStack.pop()!;
          // Find the compound node in the parent and update its internal workflow
          const parentNodes = entry.parentNodes.map((n: any) => {
            if (n.id === entry.compoundNodeId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  internalWorkflow: {
                    nodes: currentNodes,
                    edges: currentEdges,
                  },
                },
              };
            }
            return n;
          });
          currentNodes = parentNodes;
          currentEdges = entry.parentEdges;
        }

        setCompoundNavStack(newStack);
        setNodes(currentNodes);
        setEdges(currentEdges);

        setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2 }), 100);
      },
      [compoundNavStack, nodes, edges, setNodes, setEdges, reactFlowInstance],
    );

    // Handle double-click on nodes (enter compound nodes)
    const handleNodeDoubleClick = useCallback(
      (_event: React.MouseEvent, node: WorkflowNode) => {
        if (node.type === NodeType.Compound) {
          enterCompoundNode(node.id);
        }
      },
      [enterCompoundNode],
    );

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
    const newWorkflow = useCallback(() => {
      setNodes([]);
      setEdges([]);
      setCurrentWorkflowId(null);
      setIsReadOnly(false);
      dispatch({ type: "MARK_SAVED" });
    }, [setNodes, setEdges, dispatch]);

    useImperativeHandle(
      ref,
      () => ({
        loadWorkflow,
        captureThumbnail,
        newWorkflow,
      }),
      [loadWorkflow, captureThumbnail, newWorkflow],
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
        {/* Full-screen running overlay */}
        {isExecuting && (
          <WorkflowRunningScreen steps={executionSteps} onCancel={abortWorkflow} />
        )}

        {/* Node Palette - Always visible unless in read-only mode */}
        {!isReadOnly && (
          <div className="shrink-0">
            <NodePalette
              onAddNode={addNode}
            />
          </div>
        )}

        {/* Canvas Area */}
        <div
          ref={reactFlowWrapper}
          className="flex-1 relative"
          onMouseMove={(e) => {
            const rect = reactFlowWrapper.current?.getBoundingClientRect();
            if (rect) {
              lastCursorPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            }
          }}
        >
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
                    const { id: clonedId } = await cloneWorkflow(currentWorkflowId);
                    const clonedWorkflow = await fetchWorkflow(clonedId);
                    loadWorkflow(clonedWorkflow, { readOnly: false });
                    toast({
                      title: "Workflow Cloned",
                      description:
                        `"${clonedWorkflow.name}" is now open and editable.`,
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
            onNodeDoubleClick={handleNodeDoubleClick}
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
              onShareWorkflow={() => setIsSharePanelOpen(true)}
              onOpenTemplateMode={() => setIsTemplatePanelOpen(true)}
              onOpenSettings={() => setIsSettingsPanelOpen(true)}
              exposedNodeCount={nodes.filter((n) => (n.data as any).exposed === true).length}
              isExecuting={isExecuting}
              executionProgress={executionProgress}
              totalNodes={totalNodes}
              isReadOnly={isReadOnly}
              isInsideCompound={isInsideCompound}
            />
            <FloatingLabels nodes={nodes} />
          </ReactFlow>

          {/* Compound node breadcrumb navigation */}
          <CompoundBreadcrumb
            navStack={compoundNavStack}
            onNavigateToLevel={navigateToLevel}
          />

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
              onCreateCompound={createCompoundFromSelection}
              hasMultipleSelected={nodes.filter((n) => n.selected).length >= 2}
            />
          )}

          {/* Compound input picker dialog */}
          {compoundPickerData && (
            <CompoundInputPicker
              open={true}
              sourceNodes={compoundPickerData.sourceNodes}
              onConfirm={(selectedNodeIds) => {
                const data = compoundPickerData;
                setCompoundPickerData(null);
                finalizeCompound(
                  selectedNodeIds,
                  data.selectedNodes,
                  data.selectedIds,
                  data.incomingEdges,
                  data.outgoingEdges,
                  data.internalEdges,
                );
              }}
              onCancel={() => setCompoundPickerData(null)}
            />
          )}

          {/* Import workflow as compound node dialog */}
          {importWorkflow && (
            <ImportWorkflowAsNodeDialog
              open={true}
              workflowId={importWorkflow.id}
              workflowName={importWorkflow.name}
              onConfirm={(definition: CompoundNodeDefinition) => {
                setImportWorkflow(null);

                // Get viewport center for placement
                const bounds = reactFlowWrapper.current?.getBoundingClientRect();
                let position = { x: 400, y: 300 };
                if (bounds && reactFlowInstance) {
                  const center = reactFlowInstance.project({
                    x: bounds.width / 2,
                    y: bounds.height / 2,
                  });
                  position = { x: center.x - 100, y: center.y - 50 };
                }

                const compoundId = `compound_${Date.now()}`;
                const newNode: WorkflowNode = {
                  id: compoundId,
                  type: NodeType.Compound,
                  position,
                  data: {
                    label: definition.name,
                    status: "ready",
                    name: definition.name,
                    icon: definition.icon,
                    description: definition.description,
                    inputs: definition.inputs.map((i) => ({
                      id: i.id,
                      label: i.name,
                      type: i.type,
                      required: false,
                      acceptsMultiple: false,
                    })),
                    outputs: definition.outputs.map((o) => ({
                      id: o.id,
                      label: o.name,
                      type: o.type,
                    })),
                    controls: definition.controls.map((c) => ({
                      id: c.id,
                      label: c.name,
                      type: c.type === "slider" ? "number" as const
                        : c.type === "dropdown" ? "select" as const
                        : "text" as const,
                      default: c.default,
                      ...(c.options ? { options: c.options } : {}),
                    })),
                    controlValues: Object.fromEntries(
                      definition.controls.map((c) => [c.id, c.default]),
                    ),
                    internalWorkflow: definition.internalWorkflow,
                    mappings: definition.mappings as any,
                    compoundId: definition.id,
                  } as CompoundNodeData,
                };

                setNodes((nds) => [...nds, newNode]);
                toast({
                  title: "Workflow Imported",
                  description: `"${definition.name}" added as a compound node.`,
                });
              }}
              onCancel={() => setImportWorkflow(null)}
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
          workflowId={currentWorkflowId ?? undefined}
          onSaveSuccess={(workflowId, name) => {
            setCurrentWorkflowId(workflowId);
            if (name) setCurrentWorkflowName(name);
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
          onNewWorkflow={() => { newWorkflow(); setIsLoadDialogOpen(false); }}
        />

        {/* Node Search Dialog */}
        <NodeSearchDialog
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />

        {/* Ghost-node inline search */}
        {ghostSearch && !isReadOnly && (
          <GhostNodeSearch
            position={ghostSearch}
            recentTypes={recentNodeTypes}
            onConfirm={(nodeType, pos) => {
              addNode(nodeType, reactFlowInstance?.screenToFlowPosition({
                x: pos.x + (reactFlowWrapper.current?.getBoundingClientRect().left ?? 0),
                y: pos.y + (reactFlowWrapper.current?.getBoundingClientRect().top ?? 0),
              }) ?? pos);
              setRecentNodeTypes(prev => [nodeType, ...prev.filter(t => t !== nodeType)].slice(0, 5));
              setGhostSearch(null);
            }}
            onCancel={() => setGhostSearch(null)}
          />
        )}

        {/* Text Edit Side Panel */}
        <TextEditSidePanel
          isOpen={textEditPanel.isOpen}
          onClose={() => setTextEditPanel((prev) => ({ ...prev, isOpen: false }))}
          title={textEditPanel.title}
          value={textEditPanel.value}
          onChange={handleTextEditPanelSave}
          readOnly={textEditPanel.readOnly}
          nodeId={textEditPanel.nodeId}
          elementChips={panelElementChips}
        />

        {/* Settings Panel */}
        <SettingsPanel
          isOpen={isSettingsPanelOpen}
          onClose={() => setIsSettingsPanelOpen(false)}
          parallelExecution={parallelExecution}
          onToggleParallelExecution={() => setParallelExecution(prev => !prev)}
        />

        {/* Share Panel */}
        <SharePanel
          isOpen={isSharePanelOpen}
          onClose={() => setIsSharePanelOpen(false)}
          workflowId={currentWorkflowId}
          workflowName={currentWorkflowName}
          eligibleNodes={nodes
            .filter(n => [NodeType.Prompt, NodeType.ImageInput, NodeType.VideoInput].includes(n.type as NodeType))
            .map(n => ({
              id: n.id,
              type: n.type as NodeType,
              label: (n.data as any).customLabel || (n.data as any).label || n.type,
              exposed: !!(n.data as any).exposed,
              exposedLabel: (n.data as any).exposedLabel,
              exposedHelperText: (n.data as any).exposedHelperText,
              exposedRequired: (n.data as any).exposedRequired,
            }))}
          onToggleExposed={(nodeId, exposed, config) => {
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return;
            window.dispatchEvent(new CustomEvent("node-update", {
              detail: {
                id: nodeId,
                data: { ...node.data, exposed, ...(config && { exposedLabel: config.label, exposedHelperText: config.helperText, exposedRequired: config.required }) },
              },
            }));
          }}
        />

        {/* Template Mode Panel */}
        <TemplateModePanel
          isOpen={isTemplatePanelOpen}
          onClose={() => setIsTemplatePanelOpen(false)}
          nodes={nodes}
          isExecuting={isExecuting}
          onGenerate={executeWorkflow}
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
