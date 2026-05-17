import { memo, useEffect, useCallback, useRef } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { NoiseNodeData } from "../types";
import { ModifierSlider as Slider } from "@/components/ui/modifier-slider";
import { Radio } from "lucide-react";
import { FilterConfig, FILTER_DEFINITIONS } from "@/lib/pixi-filter-configs";
import { RunNodeButton } from "./RunNodeButton";

function NoiseNode({ data, id }: NodeProps<NoiseNodeData>) {
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
    (noise: number): FilterConfig => ({
      type: "noise",
      params: { noise },
    }),
    [],
  );

  const updateOutputsRef = useRef((_noise: number) => {});

  useEffect(() => {
    updateOutputsRef.current = (noise: number) => {
      const thisConfig = createConfig(noise);
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
            noise,
            outputs,
          },
        },
      });
      window.dispatchEvent(updateEvent);
    };
  });

  useEffect(() => {
    updateOutputsRef.current(data.noise);
  }, [data.noise, imageInput, videoInput, upstreamFiltersKey]);

  const def = FILTER_DEFINITIONS.noise;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
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
            <span>{def.params.noise.label}</span>
            <span>
              {(data.noise * (def.params.noise.displayMultiplier || 1)).toFixed(
                0,
              )}
              {def.params.noise.displayMultiplier ? "%" : ""}
            </span>
          </label>
          <Slider
            value={[data.noise]}
            onValueChange={([v]) => updateOutputsRef.current(v)}
            min={def.params.noise.min}
            max={def.params.noise.max}
            step={def.params.noise.step}
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

export default memo(NoiseNode);
