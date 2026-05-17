import { memo, useMemo } from "react";
import { Position, NodeProps, useReactFlow } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { WorkflowQueueNodeData } from "../types";
import { ListOrdered, Maximize2 } from "lucide-react";
import { openTextEditPanel } from "./PromptInputNode";

function WorkflowQueueNode({ data, id }: NodeProps<WorkflowQueueNodeData>) {
  const { setNodes } = useReactFlow();

  // Parse items from rawInput based on separator
  const items = useMemo(() => {
    if (!data.rawInput || data.rawInput.trim() === "") return [];

    let separator = "\n";
    if (data.separator === "---") {
      separator = "---";
    } else if (data.separator === "custom" && data.customSeparator) {
      separator = data.customSeparator;
    }

    return data.rawInput
      .split(separator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [data.rawInput, data.separator, data.customSeparator]);

  // Sync parsed items to node data
  const updateField = (field: string, value: any) => {
    if (data.readOnly) return;
    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: { ...data, [field]: value },
      },
    });
    window.dispatchEvent(event);
  };

  // Keep items in sync
  if (JSON.stringify(items) !== JSON.stringify(data.items)) {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                items,
                outputs: {
                  text: items,
                  _isQueue: true,
                  _count: items.length,
                },
              },
            }
          : node
      )
    );
  }

  const handleExpandClick = () => {
    openTextEditPanel(
      id,
      "Workflow Queue - Items",
      data.rawInput || "",
      data.readOnly ?? false,
      "rawInput"
    );
  };

  return (
    <div className="bg-card border-2 rounded-lg p-4 min-w-[300px] shadow-lg transition-colors border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">Workflow Queue</div>
        </div>
        <div className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Separator Selector */}
      <div className="mb-3">
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Split by
        </label>
        <Select
          value={data.separator || "---"}
          onValueChange={(value) => updateField("separator", value)}
          disabled={data.readOnly}
        >
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="---">--- (triple dash)</SelectItem>
            <SelectItem value="newline">New line</SelectItem>
            <SelectItem value="custom">Custom separator</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Custom Separator */}
      {data.separator === "custom" && (
        <div className="mb-3">
          <Input
            value={data.customSeparator || ""}
            onChange={(e) => updateField("customSeparator", e.target.value)}
            placeholder="Enter custom separator..."
            className="h-8 text-xs nodrag"
            disabled={data.readOnly}
          />
        </div>
      )}

      {/* Items Input */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">
            Paste items below
          </label>
          <button
            onClick={handleExpandClick}
            disabled={data.readOnly}
            className="p-1 rounded transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-50"
            title="Expand editor"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
        <Textarea
          value={data.rawInput || ""}
          onChange={(e) => updateField("rawInput", e.target.value)}
          placeholder={`Script 1...\n---\nScript 2...\n---\nScript 3...`}
          className="min-h-[120px] text-xs nodrag font-mono"
          disabled={data.readOnly}
        />
      </div>

      {/* Item Preview */}
      {items.length > 0 && (
        <div className="bg-muted/50 rounded p-2 max-h-[100px] overflow-y-auto">
          <div className="text-xs text-muted-foreground mb-1">Items:</div>
          {items.slice(0, 5).map((item, i) => (
            <div
              key={i}
              className="text-xs py-1 border-b border-border/50 last:border-0 text-foreground/70"
            >
              <span className="text-primary font-medium mr-2">{i + 1}.</span>
              {item.substring(0, 60)}
              {item.length > 60 ? "..." : ""}
            </div>
          ))}
          {items.length > 5 && (
            <div className="text-xs text-muted-foreground mt-1">
              +{items.length - 5} more...
            </div>
          )}
        </div>
      )}

      {/* Output Handle */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="text"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(WorkflowQueueNode);
