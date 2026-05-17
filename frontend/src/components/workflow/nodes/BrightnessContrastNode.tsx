import { logger } from "@/lib/logger";
import { memo, useEffect, useCallback, useRef } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { BrightnessContrastNodeData } from "../types";
import { ModifierSlider as Slider } from "@/components/ui/modifier-slider";
import { Sun, Power } from "lucide-react";
import { FilterConfig, FILTER_DEFINITIONS } from "@/lib/pixi-filter-configs";
import { NodeLockToggle } from "../NodeLockToggle";
import { RunNodeButton } from "./RunNodeButton";

function BrightnessContrastNode({
  data,
  id,
}: NodeProps<BrightnessContrastNodeData>) {
  const isEnabled = data.enabled !== false; // Default to enabled

  const toggleLock = () => {
    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: { ...data, locked: !data.locked },
      },
    });
    window.dispatchEvent(updateEvent);
  };

  const toggleEnabled = () => {
    if (data.readOnly) return;
    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: { ...data, enabled: !isEnabled },
      },
    });
    window.dispatchEvent(updateEvent);
  };
  // Get incoming data - support both image and video
  // Extract primitive/comparable values to use as dependencies
  const imageInput = (data as any).image || (data as any).imageInput;
  const videoInput = (data as any).video || (data as any).videoInput;
  const upstreamFiltersRaw = (data as any).filters || [];

  // Convert filters to a stable string for comparison
  const upstreamFiltersKey = JSON.stringify(
    upstreamFiltersRaw.map((f: FilterConfig) => ({
      type: f.type,
      params: f.params,
    })),
  );

  // Create this node's filter config (lightweight, no PixiJS instance)
  const createConfig = useCallback(
    (brightness: number, contrast: number): FilterConfig => ({
      type: "brightness",
      params: { brightness, contrast },
    }),
    [],
  );

  // Update node outputs (Layer 1: store ONLY config)
  // Use useRef to avoid recreating this function and causing re-render loops
  const updateOutputsRef = useRef((_brightness: number, _contrast: number) => {});

  useEffect(() => {
    updateOutputsRef.current = (brightness: number, contrast: number) => {
      const thisConfig = createConfig(brightness, contrast);
      const updatedFilters = [...upstreamFiltersRaw, thisConfig];

      logger.debug("[BrightnessContrastNode] Dispatching node-update:", {
        nodeId: id,
        brightness,
        contrast,
        hasImage: !!imageInput,
        hasVideo: !!videoInput,
        upstreamFilterCount: upstreamFiltersRaw.length,
        totalFilterCount: updatedFilters.length,
      });

      // Pass through both image and video (whichever is connected)
      const outputs: Record<string, any> = {
        filters: updatedFilters,
      };
      if (imageInput) outputs.image = imageInput;
      if (videoInput) outputs.video = videoInput;

      const updateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            brightness,
            contrast,
            outputs,
          },
        },
      });
      window.dispatchEvent(updateEvent);
    };
  });

  // Update outputs whenever brightness, contrast, or inputs change
  useEffect(() => {
    updateOutputsRef.current(data.brightness, data.contrast);
  }, [data.brightness, data.contrast, imageInput, videoInput, upstreamFiltersKey]);

  const handleBrightnessChange = (value: number) => {
    updateOutputsRef.current(value, data.contrast);
  };

  const handleContrastChange = (value: number) => {
    updateOutputsRef.current(data.brightness, value);
  };

  const def = FILTER_DEFINITIONS.brightness;

  return (
    <div className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg ${!isEnabled ? "opacity-50 border-muted" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{def.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Enable/Disable Toggle */}
          <button
            onClick={toggleEnabled}
            disabled={data.readOnly}
            className={`p-1 rounded transition-colors ${
              isEnabled
                ? "text-green-500 hover:bg-green-500/10"
                : "text-muted-foreground hover:bg-muted"
            }`}
            title={isEnabled ? "Disable node" : "Enable node"}
          >
            <Power className="w-4 h-4" />
          </button>
          <NodeLockToggle
            locked={!!data.locked}
            onToggle={toggleLock}
            disabled={data.readOnly}
          />
        </div>
      </div>

      {/* Input Handles */}
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "20%" }}
      />
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "40%" }}
      />
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "80%" }}
      />

      {/* Controls */}
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.brightness.label}</span>
            <span>
              {(
                data.brightness * (def.params.brightness.displayMultiplier || 1)
              ).toFixed(0)}
              {def.params.brightness.displayMultiplier ? "%" : ""}
            </span>
          </label>
          <Slider
            value={[data.brightness]}
            onValueChange={([v]) => handleBrightnessChange(v)}
            min={def.params.brightness.min}
            max={def.params.brightness.max}
            step={def.params.brightness.step}
            className="w-full"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.contrast.label}</span>
            <span>
              {(
                data.contrast * (def.params.contrast.displayMultiplier || 1)
              ).toFixed(0)}
              {def.params.contrast.displayMultiplier ? "%" : ""}
            </span>
          </label>
          <Slider
            value={[data.contrast]}
            onValueChange={([v]) => handleContrastChange(v)}
            min={def.params.contrast.min}
            max={def.params.contrast.max}
            step={def.params.contrast.step}
            className="w-full"
          />
        </div>
      </div>

      <RunNodeButton nodeId={id} disabled={data.readOnly} />

      {/* Output Handles */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "20%" }}
      />
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "40%" }}
      />
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "80%" }}
      />
    </div>
  );
}

export default memo(BrightnessContrastNode);
