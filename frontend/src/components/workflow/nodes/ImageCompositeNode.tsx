import { logger } from "@/lib/logger";
import { useEffect, useState, useRef } from "react";
import { Position, NodeProps, useReactFlow } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { ImageCompositeNodeData, NODE_CONFIGURATIONS, NodeType, WorkflowNode, WorkflowEdge } from "../types";
import { Layers, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { gatherNodeInputs } from "../executionHelpers";
import { renderCompositeWithPixi } from "@/lib/pixi-renderer";
import { NodeLockToggle } from "../NodeLockToggle";
import { RunNodeButton } from "./RunNodeButton";

function ImageCompositeNode({ data, id }: NodeProps<ImageCompositeNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.ImageComposite];
  const status = data.status || "ready";
  const { getNodes, getEdges } = useReactFlow();
  const [isRendering, setIsRendering] = useState(false);
  const renderRequestId = useRef(0);

  const handleUpdate = (field: string, value: any) => {
    if (data.readOnly) return;

    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: { ...data, [field]: value },
      },
    });
    window.dispatchEvent(event);
  };

  const toggleLock = () => {
    handleUpdate("locked", !data.locked);
  };

  // Real-time execution: Update composite whenever inputs or blend settings change
  useEffect(() => {
    const nodes = getNodes() as WorkflowNode[];
    const edges = getEdges() as WorkflowEdge[];
    const currentNode = nodes.find((n) => n.id === id);

    if (!currentNode || data.readOnly) return;

    // Gather inputs from connected nodes
    const inputs = gatherNodeInputs(currentNode, nodes, edges);
    const imageInputs = inputs.images;
    const filters = inputs.filters || [];

    logger.debug("[ImageCompositeNode] Live update triggered:", {
      imageCount: Array.isArray(imageInputs) ? imageInputs.length : 0,
      blendMode: data.blendMode,
      opacity: data.opacity,
      filterCount: filters.length,
    });

    // Validate at least 2 images
    if (!Array.isArray(imageInputs) || imageInputs.length < 2) {
      // Clear outputs if not enough images
      if ((data as any).image) {
        const event = new CustomEvent("node-update", {
          detail: {
            id,
            data: {
              ...data,
              image: undefined,
              compositePreview: undefined,
              outputs: {},
              error: undefined,
            },
          },
        });
        window.dispatchEvent(event);
      }
      return;
    }

    // Increment request ID to track this render
    const currentRequestId = ++renderRequestId.current;
    setIsRendering(true);

    // Execute composite rendering
    const executeComposite = async () => {
      try {
        logger.debug(
          `[ImageCompositeNode] Starting composite render (request #${currentRequestId})`,
        );

        const compositeResult = await renderCompositeWithPixi(
          imageInputs,
          data.blendMode,
          data.opacity,
          filters,
        );

        // Only update if this is still the latest request
        if (currentRequestId === renderRequestId.current) {
          logger.debug(
            `[ImageCompositeNode] Composite completed (request #${currentRequestId})`,
          );

          const event = new CustomEvent("node-update", {
            detail: {
              id,
              data: {
                ...data,
                image: compositeResult,
                compositePreview: `${imageInputs.length} layers blended`,
                outputs: { image: compositeResult },
                error: undefined,
              },
            },
          });
          window.dispatchEvent(event);
        } else {
          logger.debug(
            `[ImageCompositeNode] Discarding stale render (request #${currentRequestId})`,
          );
        }
      } catch (error) {
        // Only handle error if this is still the latest request
        if (currentRequestId === renderRequestId.current) {
          console.error(
            `[ImageCompositeNode] Composite failed (request #${currentRequestId}):`,
            error,
          );

          const event = new CustomEvent("node-update", {
            detail: {
              id,
              data: {
                ...data,
                error:
                  error instanceof Error
                    ? error.message
                    : "Image compositing failed",
              },
            },
          });
          window.dispatchEvent(event);
        }
      } finally {
        // Only clear rendering flag if this is still the latest request
        if (currentRequestId === renderRequestId.current) {
          setIsRendering(false);
        }
      }
    };

    executeComposite();
  }, [id, data.blendMode, data.opacity, data.readOnly, getNodes, getEdges]);

  const getBorderColor = () => {
    if (status === "error") return "border-red-500";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Image Composite"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NodeLockToggle
            locked={!!data.locked}
            onToggle={toggleLock}
            disabled={data.readOnly}
          />
          {(isRendering || status === "executing") && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {!isRendering && status === "completed" && (
            <div className="text-green-500 text-xs">✓</div>
          )}
          {status === "error" && (
            <div className="text-red-500 text-xs">✗</div>
          )}
        </div>
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-3 mb-3">
        {config.inputConnectors.map((input) => (
          <div key={input.id} className="flex items-center gap-2 relative h-6">
            <ConnectedHandle
              type="target"
              position={Position.Left}
              id={input.id}
              data-connector-type={input.type}
              className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
            />
            <div className="text-xs font-medium text-muted-foreground">
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
              {input.acceptsMultiple && (
                <span className="text-xs text-muted-foreground/70 ml-1">
                  (multi)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Blend Mode Selector */}
      <div className="space-y-3 mb-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Blend Mode
          </label>
          <Select
            value={data.blendMode}
            onValueChange={(value) => handleUpdate("blendMode", value)}
            disabled={data.readOnly}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="multiply">Multiply</SelectItem>
              <SelectItem value="screen">Screen</SelectItem>
              <SelectItem value="add">Add</SelectItem>
              <SelectItem value="overlay">Overlay*</SelectItem>
              <SelectItem value="darken">Darken*</SelectItem>
              <SelectItem value="lighten">Lighten*</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-[10px] text-muted-foreground/60 mt-1">
            * Approximated modes
          </div>
        </div>

        {/* Opacity Slider */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Opacity: {Math.round(data.opacity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={data.opacity * 100}
            onChange={(e) =>
              handleUpdate("opacity", parseInt(e.target.value) / 100)
            }
            onPointerDown={(e) => {
              // Prevent ReactFlow from starting node drag when interacting with slider
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              // Also prevent mouse drag events from bubbling up to ReactFlow
              e.stopPropagation();
            }}
            onDragStart={(e) => {
              // Prevent any drag events from initiating on the node
              e.preventDefault();
              e.stopPropagation();
            }}
            disabled={data.readOnly}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:bg-primary
                     [&::-moz-range-thumb]:w-4
                     [&::-moz-range-thumb]:h-4
                     [&::-moz-range-thumb]:rounded-full
                     [&::-moz-range-thumb]:bg-primary
                     [&::-moz-range-thumb]:border-0"
          />
        </div>
      </div>

      {/* Composite Result Preview */}
      {(data as any).image && (
        <div className="mb-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Result Preview:
          </div>
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            <img
              src={(data as any).image}
              alt="Composite Result"
              className="w-full h-auto max-h-[120px] object-contain"
              crossOrigin={
                (data as any).image?.startsWith("data:")
                  ? undefined
                  : "anonymous"
              }
            />
          </div>
        </div>
      )}

      {/* Preview Info */}
      {data.compositePreview && (
        <div className="bg-muted/50 p-2 rounded border border-border mb-3">
          <div className="text-xs text-muted-foreground">
            {data.compositePreview}
          </div>
        </div>
      )}

      {/* Error Display */}
      {data.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          <div className="text-xs text-red-500">{data.error}</div>
        </div>
      )}

      <RunNodeButton nodeId={id} isExecuting={isRendering || status === "executing"} disabled={data.readOnly} />

      {/* Output Handle - Right side */}
      <div className="flex items-center justify-end gap-2 relative h-6">
        <div className="text-xs font-medium text-muted-foreground">
          {config.outputConnectors[0].label}
        </div>
        <ConnectedHandle
          type="source"
          position={Position.Right}
          id={config.outputConnectors[0].id}
          data-connector-type={config.outputConnectors[0].type}
          className="!w-3 !h-3 !border-2 !border-background !-right-[18px] !absolute !top-1/2 !-translate-y-1/2"
        />
      </div>
    </div>
  );
}

export default ImageCompositeNode;
