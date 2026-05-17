"use client";

import { memo } from "react";
import { NodeProps, Position } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Music,
  CheckCircle,
  AlertCircle,
  Info,
  Volume2,
  Power,
  Mic,
} from "lucide-react";
import {
  AddMusicToVideoNodeData,
  NODE_CONFIGURATIONS,
  NodeType,
} from "../types";
import { RunNodeButton } from "./RunNodeButton";

function AddMusicToVideoNode({ data, id }: NodeProps<AddMusicToVideoNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.AddMusicToVideo];
  const isEnabled = data.enabled !== false;

  const handleUpdate = (field: keyof AddMusicToVideoNodeData, value: any) => {
    if (data.readOnly) return;

    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          [field]: value,
        },
      },
    });
    window.dispatchEvent(event);
  };

  const handleToggleEnabled = () => {
    if (data.readOnly) return;
    handleUpdate("enabled", !isEnabled);
  };

  const getStatusIcon = () => {
    if (data.status === "completed") {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    if (data.status === "error") {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    return <Info className="w-4 h-4 text-muted-foreground" />;
  };

  const getStatusText = () => {
    switch (data.status) {
      case "completed":
        return "Completed";
      case "error":
        return "Error";
      case "running":
        return "Mixing...";
      default:
        return "Ready";
    }
  };

  return (
    <Card className={`w-[300px] bg-card border-border shadow-lg ${!isEnabled ? "opacity-50" : ""}`}>
      {/* Input Handles */}
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2"
        style={{ top: 60 }}
      />
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="audio"
        data-connector-type="audio"
        className="!w-3 !h-3 !border-2"
        style={{ top: 100 }}
      />
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="audio2"
        data-connector-type="audio"
        className="!w-3 !h-3 !border-2"
        style={{ top: 140 }}
      />

      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{config.label}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Enable/Disable Toggle */}
            <button
              onClick={handleToggleEnabled}
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
            {getStatusIcon()}
          </div>
        </div>

        {/* Input Labels */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-400">Video *</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Music className="w-3 h-3 text-purple-400" />
            <span className="text-muted-foreground">Audio Track 1 (e.g., Music)</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Mic className="w-3 h-3 text-orange-400" />
            <span className="text-muted-foreground">Audio Track 2 (e.g., Voice-over)</span>
          </div>
        </div>

        {/* Volume Controls */}
        <div className="space-y-4 mb-4">
          {/* Original Video Audio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                Original Audio
              </Label>
              <span className="text-xs text-muted-foreground">
                {data.originalVolume ?? 100}%
              </span>
            </div>
            <Slider
              value={[data.originalVolume ?? 100]}
              onValueChange={([value]) => handleUpdate("originalVolume", value)}
              min={0}
              max={100}
              step={5}
              disabled={data.readOnly || !isEnabled}
              className="w-full"
            />
          </div>

          {/* Track 1 Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1 text-purple-400">
                <Music className="w-3 h-3" />
                Track 1 Volume
              </Label>
              <span className="text-xs text-muted-foreground">
                {data.musicVolume ?? 50}%
              </span>
            </div>
            <Slider
              value={[data.musicVolume ?? 50]}
              onValueChange={([value]) => handleUpdate("musicVolume", value)}
              min={0}
              max={100}
              step={5}
              disabled={data.readOnly || !isEnabled}
              className="w-full"
            />
          </div>

          {/* Track 2 Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1 text-orange-400">
                <Mic className="w-3 h-3" />
                Track 2 Volume
              </Label>
              <span className="text-xs text-muted-foreground">
                {(data as any).track2Volume ?? 100}%
              </span>
            </div>
            <Slider
              value={[(data as any).track2Volume ?? 100]}
              onValueChange={([value]) => handleUpdate("track2Volume" as any, value)}
              min={0}
              max={100}
              step={5}
              disabled={data.readOnly || !isEnabled}
              className="w-full"
            />
          </div>
        </div>

        {/* Fade Out */}
        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1 text-muted-foreground">
              Fade Out
            </Label>
            <span className="text-xs text-muted-foreground">
              {(data as any).fadeOut ?? 3}s
            </span>
          </div>
          <Slider
            value={[(data as any).fadeOut ?? 3]}
            onValueChange={([value]) => handleUpdate("fadeOut" as any, value)}
            min={0}
            max={10}
            step={0.5}
            disabled={data.readOnly || !isEnabled}
            className="w-full"
          />
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 mt-3">
          <span>Status: {getStatusText()}</span>
        </div>

        {/* Error display */}
        {data.status === "error" && data.error && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 mb-3">
            {data.error}
          </div>
        )}

        {/* Run Node Button */}
        <RunNodeButton nodeId={id} isExecuting={data.isMixing} disabled={data.readOnly || !isEnabled} label="Add Music" loadingLabel="Adding..." />

        {/* Output Video Preview */}
        {data.outputVideoUrl && (
          <div className="mt-3">
            <video
              src={data.outputVideoUrl}
              controls
              className="w-full rounded-lg"
              style={{ maxHeight: "150px" }}
            />
          </div>
        )}

        {/* Output Label */}
        <div className="flex justify-end mt-2">
          <span className="text-xs text-muted-foreground">Video</span>
        </div>
      </CardContent>

      {/* Output Handle */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="video"
        data-connector-type="video"
        className="!w-3 !h-3 !border-2"
        style={{ top: "50%" }}
      />
    </Card>
  );
}

export default memo(AddMusicToVideoNode);
