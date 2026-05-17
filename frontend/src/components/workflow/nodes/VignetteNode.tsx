import { memo, useEffect, useCallback, useRef } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { VignetteNodeData } from "../types";
import { ModifierSlider as Slider } from "@/components/ui/modifier-slider";
import { Circle } from "lucide-react";
import { FilterConfig, FILTER_DEFINITIONS } from "@/lib/pixi-filter-configs";
import { RunNodeButton } from "./RunNodeButton";

function VignetteNode({ data, id }: NodeProps<VignetteNodeData>) {
  // Get incoming data - support both image and video
  const imageInput = (data as any).image || (data as any).imageInput;
  const videoInput = (data as any).video || (data as any).videoInput;
  const upstreamFiltersRaw = (data as any).filters || [];

  const upstreamFiltersKey = JSON.stringify(
    upstreamFiltersRaw.map((f: FilterConfig) => ({
      type: f.type,
      params: f.params,
    })),
  );

  const createConfig = useCallback(
    (size: number, amount: number): FilterConfig => ({
      type: "vignette",
      params: { size, amount },
    }),
    [],
  );

  const updateOutputsRef = useRef((_size: number, _amount: number) => {});

  useEffect(() => {
    updateOutputsRef.current = (size: number, amount: number) => {
      const thisConfig = createConfig(size, amount);
      const updatedFilters = [...upstreamFiltersRaw, thisConfig];

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
            size,
            amount,
            outputs,
          },
        },
      });
      window.dispatchEvent(updateEvent);
    };
  });

  useEffect(() => {
    updateOutputsRef.current(data.size, data.amount);
  }, [data.size, data.amount, imageInput, videoInput, upstreamFiltersKey]);

  const def = FILTER_DEFINITIONS.vignette;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Circle className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{def.label}</span>
        </div>
      </div>

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

      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.size.label}</span>
            <span>
              {(data.size * (def.params.size.displayMultiplier || 1)).toFixed(
                0,
              )}
              {def.params.size.displayMultiplier ? "%" : ""}
            </span>
          </label>
          <Slider
            value={[data.size]}
            onValueChange={([v]) => updateOutputsRef.current(v, data.amount)}
            min={def.params.size.min}
            max={def.params.size.max}
            step={def.params.size.step}
            className="w-full"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.amount.label}</span>
            <span>
              {(
                data.amount * (def.params.amount.displayMultiplier || 1)
              ).toFixed(0)}
              {def.params.amount.displayMultiplier ? "%" : ""}
            </span>
          </label>
          <Slider
            value={[data.amount]}
            onValueChange={([v]) => updateOutputsRef.current(data.size, v)}
            min={def.params.amount.min}
            max={def.params.amount.max}
            step={def.params.amount.step}
            className="w-full"
          />
        </div>
      </div>

      <RunNodeButton nodeId={id} disabled={data.readOnly} />

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

export default memo(VignetteNode);
