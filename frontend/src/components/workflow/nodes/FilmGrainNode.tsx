import { memo, useEffect, useCallback, useRef, useState } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { FilmGrainNodeData } from "../types";
import { ModifierSlider as Slider } from "@/components/ui/modifier-slider";
import { Film, ChevronDown, ChevronUp } from "lucide-react";
import { FilterConfig, FILTER_DEFINITIONS } from "@/lib/pixi-filter-configs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RunNodeButton } from "./RunNodeButton";

// Preset configurations
const PRESETS = {
  subtle: {
    intensity: 20,
    size: 1,
    shadows: 20,
    highlights: 20,
    midtonesBias: 90,
  },
  standard: {
    intensity: 50,
    size: 1,
    shadows: 30,
    highlights: 30,
    midtonesBias: 80,
  },
  heavy35mm: {
    intensity: 70,
    size: 2,
    shadows: 50,
    highlights: 40,
    midtonesBias: 70,
  },
  super8: {
    intensity: 85,
    size: 3,
    shadows: 60,
    highlights: 50,
    midtonesBias: 60,
  },
  digital: {
    intensity: 30,
    size: 1,
    shadows: 80,
    highlights: 10,
    midtonesBias: 40,
  },
};

// Size presets (1 = fine, 4 = coarse)
const SIZE_PRESETS = {
  fine: 1,
  medium: 2,
  coarse: 3,
};

function FilmGrainNode({ data, id }: NodeProps<FilmGrainNodeData>) {
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    (params: {
      intensity: number;
      size: number;
      shadows: number;
      highlights: number;
      midtonesBias: number;
    }): FilterConfig => ({
      type: "filmGrain",
      params,
    }),
    [],
  );

  const updateOutputsRef = useRef(
    (_params: {
      intensity: number;
      size: number;
      shadows: number;
      highlights: number;
      midtonesBias: number;
    }) => {},
  );

  useEffect(() => {
    updateOutputsRef.current = (params) => {
      const thisConfig = createConfig(params);
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
            ...params,
            outputs,
          },
        },
      });
      window.dispatchEvent(updateEvent);
    };
  });

  useEffect(() => {
    updateOutputsRef.current({
      intensity: data.intensity,
      size: data.size,
      shadows: data.shadows,
      highlights: data.highlights,
      midtonesBias: data.midtonesBias,
    });
  }, [
    data.intensity,
    data.size,
    data.shadows,
    data.highlights,
    data.midtonesBias,
    imageInput,
    videoInput,
    upstreamFiltersKey,
  ]);

  const def = FILTER_DEFINITIONS.filmGrain;

  const handlePresetChange = (preset: string) => {
    if (preset !== "custom") {
      const presetConfig =
        PRESETS[preset as keyof typeof PRESETS] || PRESETS.standard;
      updateOutputsRef.current(presetConfig);
    }
  };

  const handleSizePresetChange = (sizePreset: string) => {
    const size = SIZE_PRESETS[sizePreset as keyof typeof SIZE_PRESETS] || 1.0;
    updateOutputsRef.current({
      intensity: data.intensity,
      size,
      shadows: data.shadows,
      highlights: data.highlights,
      midtonesBias: data.midtonesBias,
    });
  };

  // Determine current size preset
  const getCurrentSizePreset = () => {
    if (Math.abs(data.size - 0.5) < 0.05) return "fine";
    if (Math.abs(data.size - 1.0) < 0.05) return "medium";
    if (Math.abs(data.size - 2.0) < 0.05) return "coarse";
    return "custom";
  };

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-primary" />
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
        {/* Preset Selector */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">
            Preset
          </label>
          <Select onValueChange={handlePresetChange} defaultValue="custom">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Custom" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="subtle">Subtle</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="heavy35mm">Heavy 35mm</SelectItem>
              <SelectItem value="super8">Super 8</SelectItem>
              <SelectItem value="digital">Digital</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Intensity Slider */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
            <span>{def.params.intensity.label}</span>
            <span>{data.intensity.toFixed(0)}</span>
          </label>
          <Slider
            value={[data.intensity]}
            onValueChange={([v]) =>
              updateOutputsRef.current({
                intensity: v,
                size: data.size,
                shadows: data.shadows,
                highlights: data.highlights,
                midtonesBias: data.midtonesBias,
              })
            }
            min={def.params.intensity.min}
            max={def.params.intensity.max}
            step={def.params.intensity.step}
            className="w-full"
          />
        </div>

        {/* Size Preset Selector */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">
            {def.params.size.label}
          </label>
          <Select
            onValueChange={handleSizePresetChange}
            value={getCurrentSizePreset()}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fine">Fine</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="coarse">Coarse</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Advanced Controls Toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span>Advanced</span>
          {showAdvanced ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </Button>

        {/* Advanced Controls */}
        {showAdvanced && (
          <div className="space-y-4 pt-2 border-t border-border">
            {/* Shadows */}
            <div>
              <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
                <span>{def.params.shadows.label}</span>
                <span>{data.shadows.toFixed(0)}</span>
              </label>
              <Slider
                value={[data.shadows]}
                onValueChange={([v]) =>
                  updateOutputsRef.current({
                    intensity: data.intensity,
                    size: data.size,
                    shadows: v,
                    highlights: data.highlights,
                    midtonesBias: data.midtonesBias,
                  })
                }
                min={def.params.shadows.min}
                max={def.params.shadows.max}
                step={def.params.shadows.step}
                className="w-full"
              />
            </div>

            {/* Midtones */}
            <div>
              <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
                <span>{def.params.midtonesBias.label}</span>
                <span>{data.midtonesBias.toFixed(0)}</span>
              </label>
              <Slider
                value={[data.midtonesBias]}
                onValueChange={([v]) =>
                  updateOutputsRef.current({
                    intensity: data.intensity,
                    size: data.size,
                    shadows: data.shadows,
                    highlights: data.highlights,
                    midtonesBias: v,
                  })
                }
                min={def.params.midtonesBias.min}
                max={def.params.midtonesBias.max}
                step={def.params.midtonesBias.step}
                className="w-full"
              />
            </div>

            {/* Highlights */}
            <div>
              <label className="text-xs text-muted-foreground block mb-2 flex justify-between">
                <span>{def.params.highlights.label}</span>
                <span>{data.highlights.toFixed(0)}</span>
              </label>
              <Slider
                value={[data.highlights]}
                onValueChange={([v]) =>
                  updateOutputsRef.current({
                    intensity: data.intensity,
                    size: data.size,
                    shadows: data.shadows,
                    highlights: v,
                    midtonesBias: data.midtonesBias,
                  })
                }
                min={def.params.highlights.min}
                max={def.params.highlights.max}
                step={def.params.highlights.step}
                className="w-full"
              />
            </div>
          </div>
        )}

        <RunNodeButton nodeId={id} disabled={data.readOnly} />
      </div>

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

export default memo(FilmGrainNode);
