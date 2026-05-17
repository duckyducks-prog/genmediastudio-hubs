"use client";

import { memo } from "react";
import { NodeProps, Position } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Combine, CheckCircle, AlertCircle, Info, Volume2 } from "lucide-react";
import { MergeVideosNodeData, NODE_CONFIGURATIONS, NodeType } from "../types";
import { RunNodeButton } from "./RunNodeButton";

function MergeVideosNode({ data, id }: NodeProps<MergeVideosNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.MergeVideos];

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
        return "Merging...";
      default:
        return "Ready";
    }
  };

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

  return (
    <Card className="w-[280px] bg-card border-border shadow-lg">
      {/* Input Handles */}
      {config.inputConnectors.map((connector, index) => (
        <ConnectedHandle
          key={connector.id}
          type="target"
          position={Position.Left}
          id={connector.id}
          data-connector-type={connector.type}
          className="!w-3 !h-3 !border-2"
          style={{ top: 60 + index * 28 }}
        />
      ))}

      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Combine className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{config.label}</span>
          </div>
          {getStatusIcon()}
        </div>

        {/* Input Labels */}
        <div className="space-y-1 mb-4">
          {config.inputConnectors.map((connector) => (
            <div
              key={connector.id}
              className="flex items-center gap-2 text-xs h-5"
            >
              <span
                className={
                  connector.required
                    ? "text-red-400"
                    : "text-muted-foreground"
                }
              >
                {connector.label}
                {connector.required && " *"}
              </span>
            </div>
          ))}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <span>Status: {getStatusText()}</span>
        </div>

        {/* Description */}
        <div className="bg-muted rounded-lg p-3 mb-3">
          <div className="flex flex-col items-center text-center gap-2">
            <Combine className="w-6 h-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Connect 2-6 videos to merge
              <br />
              Click Run to concatenate
            </p>
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="mb-3">
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Output Aspect Ratio
          </label>
          <Select
            value={data.aspectRatio || "16:9"}
            onValueChange={(value) => handleUpdate("aspectRatio", value)}
            disabled={data.readOnly || data.isMerging}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Select aspect ratio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
              <SelectItem value="9:16">9:16 (Portrait/Vertical)</SelectItem>
              <SelectItem value="1:1">1:1 (Square)</SelectItem>
              <SelectItem value="4:3">4:3 (Standard)</SelectItem>
              <SelectItem value="4:5">4:5 (Instagram Portrait)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Trim Silence Toggle */}
        <div className="mb-3 flex items-center justify-between">
          <Label className="text-xs flex items-center gap-1.5 text-muted-foreground cursor-pointer">
            <Volume2 className="w-3 h-3" />
            Trim trailing silence
          </Label>
          <Switch
            checked={data.trimSilence || false}
            onCheckedChange={(checked) => handleUpdate("trimSilence", checked)}
            disabled={data.readOnly || data.isMerging}
          />
        </div>

        {/* Error display */}
        {data.status === "error" && data.error && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1 mb-3">
            {data.error}
          </div>
        )}

        {/* Run Node Button */}
        <RunNodeButton nodeId={id} isExecuting={data.isMerging} disabled={data.readOnly} label="Merge Videos" loadingLabel="Merging..." />

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

export default memo(MergeVideosNode);
