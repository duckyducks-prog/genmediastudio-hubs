import { memo, useEffect, useCallback, useRef, useState } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { CropNodeData } from "../types";
import { Crop, Maximize2 } from "lucide-react";
import { FilterConfig } from "@/lib/pixi-filter-configs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RunNodeButton } from "./RunNodeButton";

const ASPECT_RATIOS = {
  "1:1": { ratio: 1, width: 1080, height: 1080 },
  "3:4": { ratio: 3 / 4, width: 1080, height: 1440 },
  "4:3": { ratio: 4 / 3, width: 1440, height: 1080 },
  "16:9": { ratio: 16 / 9, width: 1920, height: 1080 },
  "9:16": { ratio: 9 / 16, width: 1080, height: 1920 },
  custom: { ratio: 0, width: 0, height: 0 },
};

type ResizeHandle =
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | null;

function CropNode({ data, id }: NodeProps<CropNodeData>) {
  const imageInput = (data as any).image || (data as any).imageInput;
  const upstreamFiltersRaw = (data as any).filters || [];
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeHandle>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [cropStart, setCropStart] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [_containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const upstreamFiltersKey = JSON.stringify(
    upstreamFiltersRaw.map((f: FilterConfig) => ({
      type: f.type,
      params: f.params,
    })),
  );

  const createConfig = useCallback(
    (x: number, y: number, width: number, height: number): FilterConfig => ({
      type: "crop",
      params: { x, y, width, height },
    }),
    [],
  );

  const updateOutputsRef = useRef(
    (_x: number, _y: number, _width: number, _height: number) => {},
  );

  useEffect(() => {
    updateOutputsRef.current = (
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      const thisConfig = createConfig(x, y, width, height);
      const updatedFilters = [...upstreamFiltersRaw, thisConfig];

      const updateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            x,
            y,
            width,
            height,
            outputs: {
              image: imageInput,
              filters: updatedFilters,
            },
          },
        },
      });
      window.dispatchEvent(updateEvent);
    };
  });

  // Load image to get dimensions
  useEffect(() => {
    if (imageInput) {
      setImagePreview(imageInput);

      const img = new Image();
      img.onload = () => {
        const originalWidth = img.naturalWidth;
        const originalHeight = img.naturalHeight;

        setImageDimensions({ width: originalWidth, height: originalHeight });

        if (
          !data.originalWidth ||
          data.originalWidth !== originalWidth ||
          data.originalHeight !== originalHeight
        ) {
          const updateEvent = new CustomEvent("node-update", {
            detail: {
              id,
              data: {
                ...data,
                x: 0,
                y: 0,
                width: originalWidth,
                height: originalHeight,
                originalWidth,
                originalHeight,
              },
            },
          });
          window.dispatchEvent(updateEvent);
        }
      };
      img.src = imageInput;
    } else {
      setImagePreview(null);
      setImageDimensions(null);
    }
  }, [imageInput, id]);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.width, // Will be recalculated based on image
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Update outputs whenever crop parameters change
  useEffect(() => {
    if (
      data.width &&
      data.height &&
      data.x !== undefined &&
      data.y !== undefined
    ) {
      updateOutputsRef.current(data.x, data.y, data.width, data.height);
    }
  }, [data.x, data.y, data.width, data.height, imageInput, upstreamFiltersKey]);

  const handleAspectRatioChange = (value: string) => {
    const aspectRatio = value as CropNodeData["aspectRatio"];

    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          aspectRatio,
        },
      },
    });
    window.dispatchEvent(updateEvent);

    if (aspectRatio !== "custom" && imageDimensions) {
      const aspectConfig = ASPECT_RATIOS[aspectRatio];

      let newWidth = aspectConfig.width;
      let newHeight = aspectConfig.height;

      if (
        newWidth > imageDimensions.width ||
        newHeight > imageDimensions.height
      ) {
        const scaleX = imageDimensions.width / newWidth;
        const scaleY = imageDimensions.height / newHeight;
        const scale = Math.min(scaleX, scaleY);

        newWidth = Math.round(newWidth * scale);
        newHeight = Math.round(newHeight * scale);
      }

      const newX = Math.floor((imageDimensions.width - newWidth) / 2);
      const newY = Math.floor((imageDimensions.height - newHeight) / 2);

      const dimensionUpdateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            aspectRatio,
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight,
          },
        },
      });
      window.dispatchEvent(dimensionUpdateEvent);
    }
  };

  const handlePositionChange = (axis: "x" | "y", value: string) => {
    const numValue = parseInt(value) || 0;
    const maxValue =
      axis === "x"
        ? (imageDimensions?.width || 0) - data.width
        : (imageDimensions?.height || 0) - data.height;
    const clampedValue = Math.max(0, Math.min(numValue, maxValue));

    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          [axis]: clampedValue,
          aspectRatio: "custom",
        },
      },
    });
    window.dispatchEvent(updateEvent);
  };

  const handleDimensionChange = (
    dimension: "width" | "height",
    value: string,
  ) => {
    const numValue = parseInt(value) || 1;
    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          [dimension]: numValue,
          aspectRatio: "custom",
        },
      },
    });
    window.dispatchEvent(updateEvent);
  };

  const handleReset = () => {
    if (imageDimensions) {
      const updateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            x: 0,
            y: 0,
            width: imageDimensions.width,
            height: imageDimensions.height,
            aspectRatio: "custom",
          },
        },
      });
      window.dispatchEvent(updateEvent);
    }
  };

  const handleFitToCrop = () => {
    if (imageDimensions) {
      const newX = Math.floor((imageDimensions.width - data.width) / 2);
      const newY = Math.floor((imageDimensions.height - data.height) / 2);

      const updateEvent = new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            x: Math.max(0, newX),
            y: Math.max(0, newY),
          },
        },
      });
      window.dispatchEvent(updateEvent);
    }
  };

  // Calculate display dimensions (fit image to container while maintaining aspect ratio)
  const getDisplayDimensions = () => {
    if (!imageDimensions || !containerRef.current) return null;

    const containerWidth = containerRef.current.clientWidth;
    const maxHeight = 220;

    const imageAspect = imageDimensions.width / imageDimensions.height;

    let displayWidth = containerWidth;
    let displayHeight = containerWidth / imageAspect;

    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = maxHeight * imageAspect;
    }

    return {
      width: displayWidth,
      height: displayHeight,
      scaleX: displayWidth / imageDimensions.width,
      scaleY: displayHeight / imageDimensions.height,
    };
  };

  const displayDimensions = getDisplayDimensions();

  // Handle drag on crop box center
  const handleCropMouseDown = (e: React.MouseEvent) => {
    if (!displayDimensions || !imageDimensions) return;

    e.stopPropagation();
    e.preventDefault();

    const rect = (e.currentTarget as HTMLElement)
      .closest(".crop-preview-area")
      ?.getBoundingClientRect();
    if (!rect) return;

    const clickX = (e.clientX - rect.left) / displayDimensions.scaleX;
    const clickY = (e.clientY - rect.top) / displayDimensions.scaleY;

    setIsDragging(true);
    setDragStart({ x: clickX - data.x, y: clickY - data.y });
    setCropStart({
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
    });
  };

  // Handle resize handle drag
  const handleResizeMouseDown = (e: React.MouseEvent, handle: ResizeHandle) => {
    if (!displayDimensions || !imageDimensions) return;

    e.stopPropagation();
    e.preventDefault();

    const rect = (e.currentTarget as HTMLElement)
      .closest(".crop-preview-area")
      ?.getBoundingClientRect();
    if (!rect) return;

    const clickX = (e.clientX - rect.left) / displayDimensions.scaleX;
    const clickY = (e.clientY - rect.top) / displayDimensions.scaleY;

    setIsResizing(handle);
    setDragStart({ x: clickX, y: clickY });
    setCropStart({
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
    });
  };

  // Global mouse move handler
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!displayDimensions || !imageDimensions || !dragStart || !cropStart)
        return;

      const previewArea = document.querySelector(".crop-preview-area");
      if (!previewArea) return;

      const rect = previewArea.getBoundingClientRect();

      const mouseX = (e.clientX - rect.left) / displayDimensions.scaleX;
      const mouseY = (e.clientY - rect.top) / displayDimensions.scaleY;

      if (isDragging) {
        const newX = Math.max(
          0,
          Math.min(mouseX - dragStart.x, imageDimensions.width - data.width),
        );
        const newY = Math.max(
          0,
          Math.min(mouseY - dragStart.y, imageDimensions.height - data.height),
        );

        const updateEvent = new CustomEvent("node-update", {
          detail: {
            id,
            data: {
              ...data,
              x: Math.round(newX),
              y: Math.round(newY),
              aspectRatio: "custom",
            },
          },
        });
        window.dispatchEvent(updateEvent);
      } else if (isResizing) {
        const dx = mouseX - dragStart.x;
        const dy = mouseY - dragStart.y;

        let newX = cropStart.x;
        let newY = cropStart.y;
        let newW = cropStart.width;
        let newH = cropStart.height;

        const aspectRatio =
          data.aspectRatio !== "custom" && data.aspectRatio
            ? ASPECT_RATIOS[data.aspectRatio].ratio
            : null;

        if (isResizing === "bottomRight") {
          newW = Math.max(50, cropStart.width + dx);
          newH = aspectRatio
            ? newW / aspectRatio
            : Math.max(50, cropStart.height + dy);
        } else if (isResizing === "bottomLeft") {
          newW = Math.max(50, cropStart.width - dx);
          newH = aspectRatio
            ? newW / aspectRatio
            : Math.max(50, cropStart.height + dy);
          newX = cropStart.x + cropStart.width - newW;
        } else if (isResizing === "topRight") {
          newW = Math.max(50, cropStart.width + dx);
          newH = aspectRatio
            ? newW / aspectRatio
            : Math.max(50, cropStart.height - dy);
          newY = cropStart.y + cropStart.height - newH;
        } else if (isResizing === "topLeft") {
          newW = Math.max(50, cropStart.width - dx);
          newH = aspectRatio
            ? newW / aspectRatio
            : Math.max(50, cropStart.height - dy);
          newX = cropStart.x + cropStart.width - newW;
          newY = cropStart.y + cropStart.height - newH;
        }

        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        newW = Math.min(newW, imageDimensions.width - newX);
        newH = Math.min(newH, imageDimensions.height - newY);

        const updateEvent = new CustomEvent("node-update", {
          detail: {
            id,
            data: {
              ...data,
              x: Math.round(newX),
              y: Math.round(newY),
              width: Math.round(newW),
              height: Math.round(newH),
              aspectRatio: "custom",
            },
          },
        });
        window.dispatchEvent(updateEvent);
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
      setDragStart(null);
      setCropStart(null);
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [
    isDragging,
    isResizing,
    dragStart,
    cropStart,
    imageDimensions,
    data,
    id,
    displayDimensions,
  ]);

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[340px] shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Crop className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Crop</span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFitToCrop}
            className="h-7 text-xs px-2"
            title="Center crop area"
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 text-xs"
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Input Handles */}
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "30%" }}
      />
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "70%" }}
      />

      {/* Image Preview with Crop Overlay */}
      <div ref={containerRef} className="nodrag mb-3">
        {imagePreview && displayDimensions ? (
          <div
            className="crop-preview-area relative mx-auto rounded-lg overflow-hidden border border-border"
            style={{
              width: `${displayDimensions.width}px`,
              height: `${displayDimensions.height}px`,
            }}
          >
            {/* The actual image */}
            <img
              src={imagePreview}
              alt="Crop preview"
              className="absolute inset-0 w-full h-full"
              crossOrigin={
                imagePreview?.startsWith("data:") ? undefined : "anonymous"
              }
            />

            {/* Dark overlay - Top */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: 0,
                top: 0,
                width: "100%",
                height: `${data.y * displayDimensions.scaleY}px`,
              }}
            />
            {/* Dark overlay - Bottom */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: 0,
                top: `${(data.y + data.height) * displayDimensions.scaleY}px`,
                width: "100%",
                height: `${(imageDimensions!.height - data.y - data.height) * displayDimensions.scaleY}px`,
              }}
            />
            {/* Dark overlay - Left */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: 0,
                top: `${data.y * displayDimensions.scaleY}px`,
                width: `${data.x * displayDimensions.scaleX}px`,
                height: `${data.height * displayDimensions.scaleY}px`,
              }}
            />
            {/* Dark overlay - Right */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: `${(data.x + data.width) * displayDimensions.scaleX}px`,
                top: `${data.y * displayDimensions.scaleY}px`,
                width: `${(imageDimensions!.width - data.x - data.width) * displayDimensions.scaleX}px`,
                height: `${data.height * displayDimensions.scaleY}px`,
              }}
            />

            {/* Crop box */}
            <div
              className={`absolute select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
              style={{
                left: `${data.x * displayDimensions.scaleX}px`,
                top: `${data.y * displayDimensions.scaleY}px`,
                width: `${data.width * displayDimensions.scaleX}px`,
                height: `${data.height * displayDimensions.scaleY}px`,
              }}
              onMouseDown={handleCropMouseDown}
            >
              {/* Border */}
              <div className="absolute inset-0 border-2 border-white pointer-events-none" />

              {/* Rule of thirds grid */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ opacity: 0.3 }}
              >
                <line
                  x1="33.33%"
                  y1="0"
                  x2="33.33%"
                  y2="100%"
                  stroke="white"
                  strokeWidth="1"
                />
                <line
                  x1="66.66%"
                  y1="0"
                  x2="66.66%"
                  y2="100%"
                  stroke="white"
                  strokeWidth="1"
                />
                <line
                  x1="0"
                  y1="33.33%"
                  x2="100%"
                  y2="33.33%"
                  stroke="white"
                  strokeWidth="1"
                />
                <line
                  x1="0"
                  y1="66.66%"
                  x2="100%"
                  y2="66.66%"
                  stroke="white"
                  strokeWidth="1"
                />
              </svg>
            </div>

            {/* Resize handles */}
            <div
              className="nodrag absolute w-3 h-3 bg-white rounded-full cursor-nwse-resize -translate-x-1/2 -translate-y-1/2 border-2 border-primary shadow-md hover:scale-125 transition-transform z-10"
              style={{
                left: `${data.x * displayDimensions.scaleX}px`,
                top: `${data.y * displayDimensions.scaleY}px`,
              }}
              onMouseDown={(e) => handleResizeMouseDown(e, "topLeft")}
            />
            <div
              className="nodrag absolute w-3 h-3 bg-white rounded-full cursor-nesw-resize -translate-x-1/2 -translate-y-1/2 border-2 border-primary shadow-md hover:scale-125 transition-transform z-10"
              style={{
                left: `${(data.x + data.width) * displayDimensions.scaleX}px`,
                top: `${data.y * displayDimensions.scaleY}px`,
              }}
              onMouseDown={(e) => handleResizeMouseDown(e, "topRight")}
            />
            <div
              className="nodrag absolute w-3 h-3 bg-white rounded-full cursor-nesw-resize -translate-x-1/2 -translate-y-1/2 border-2 border-primary shadow-md hover:scale-125 transition-transform z-10"
              style={{
                left: `${data.x * displayDimensions.scaleX}px`,
                top: `${(data.y + data.height) * displayDimensions.scaleY}px`,
              }}
              onMouseDown={(e) => handleResizeMouseDown(e, "bottomLeft")}
            />
            <div
              className="nodrag absolute w-3 h-3 bg-white rounded-full cursor-nwse-resize -translate-x-1/2 -translate-y-1/2 border-2 border-primary shadow-md hover:scale-125 transition-transform z-10"
              style={{
                left: `${(data.x + data.width) * displayDimensions.scaleX}px`,
                top: `${(data.y + data.height) * displayDimensions.scaleY}px`,
              }}
              onMouseDown={(e) => handleResizeMouseDown(e, "bottomRight")}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <div className="text-center text-muted-foreground">
              <Crop className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No image connected</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-3">
        {/* Aspect Ratio Selector */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">
            Aspect ratio
          </label>
          <Select
            value={data.aspectRatio}
            onValueChange={handleAspectRatioChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="1:1">1:1</SelectItem>
              <SelectItem value="3:4">3:4</SelectItem>
              <SelectItem value="4:3">4:3</SelectItem>
              <SelectItem value="16:9">16:9</SelectItem>
              <SelectItem value="9:16">9:16</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Position */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">
            Position
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">X</div>
              <Input
                type="number"
                value={data.x || 0}
                onChange={(e) => handlePositionChange("x", e.target.value)}
                className="w-full"
                min={0}
                max={Math.max(0, (imageDimensions?.width || 0) - data.width)}
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Y</div>
              <Input
                type="number"
                value={data.y || 0}
                onChange={(e) => handlePositionChange("y", e.target.value)}
                className="w-full"
                min={0}
                max={Math.max(0, (imageDimensions?.height || 0) - data.height)}
              />
            </div>
          </div>
        </div>

        {/* Dimensions */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">
            Dimensions
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">W</div>
              <Input
                type="number"
                value={data.width || ""}
                onChange={(e) => handleDimensionChange("width", e.target.value)}
                className="w-full"
                min={1}
                max={imageDimensions?.width || 4096}
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">H</div>
              <Input
                type="number"
                value={data.height || ""}
                onChange={(e) =>
                  handleDimensionChange("height", e.target.value)
                }
                className="w-full"
                min={1}
                max={imageDimensions?.height || 4096}
              />
            </div>
          </div>
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
        style={{ top: "30%" }}
      />
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="filters"
        data-connector-type="any"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "70%" }}
      />
    </div>
  );
}

export default memo(CropNode);
