import { memo, useEffect, useCallback, useRef } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { HueSaturationNodeData } from "../types";
import { ModifierSlider as Slider } from "@/components/ui/modifier-slider";
import { Palette } from "lucide-react";
import { FilterConfig, FILTER_DEFINITIONS } from "@/lib/pixi-filter-configs";
import { RunNodeButton } from "./RunNodeButton";

function HueSaturationNode({ data, id }: NodeProps<HueSaturationNodeData>) {
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
    (hue: number, saturation: number): FilterConfig => ({
      type: "hueSaturation",
      params: { hue, saturation },
    }),
    [],
  );

  const updateOutputsRef = useRef((_hue: number, _saturation: number) => {});

  useEffect(() => {
    updateOutputsRef.current = (hue: number, saturation: number) => {
      const thisConfig = createConfig(hue, saturation);
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
            hue,
            saturation,
            outputs,
          },
        },
      });
      window.dispatchEvent(updateEvent);
    };
  });

  useEffect(() => {
    updateOutputsRef.current(data.hue, data.saturation);
  }, [data.hue, data.saturation, imageInput, videoInput, upstreamFiltersKey]);

  const def = FILTER_DEFINITIONS.hueSaturation;

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
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
            <span>{def.params.hue.label}</span>
            <span>{data.hue.toFixed(0)}°</span>
          </label>
          <Slider
            value={[data.hue]}
            onValueChange={([v]) =>
              updateOutputsRef.current(v, data.saturation)
            }
            min={def.params.hue.min}
            max={def.params.hue.max}
            step={def.params.hue.step}
            className="w-full"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.saturation.label}</span>
            <span>
              {(
                data.saturation * (def.params.saturation.displayMultiplier || 1)
              ).toFixed(0)}
              {def.params.saturation.displayMultiplier ? "%" : ""}
            </span>
          </label>
          <Slider
            value={[data.saturation]}
            onValueChange={([v]) => updateOutputsRef.current(data.hue, v)}
            min={def.params.saturation.min}
            max={def.params.saturation.max}
            step={def.params.saturation.step}
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

export default memo(HueSaturationNode);
