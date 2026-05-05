import { memo, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "reactflow";
import { ChipTextarea } from "../chips/ChipTextarea";
import { PromptNodeData } from "../types";
import { Type, CheckCircle2, Loader2, Power, Maximize2 } from "lucide-react";
import { RunNodeButton } from "./RunNodeButton";

// Custom event for opening text edit panel
// field: the data field to update (default: "prompt")
export const openTextEditPanel = (nodeId: string, title: string, value: string, readOnly: boolean, field: string = "prompt") => {
  window.dispatchEvent(
    new CustomEvent("open-text-edit-panel", {
      detail: { nodeId, title, value, readOnly, field },
    })
  );
};

function PromptInputNode({ data, id }: NodeProps<PromptNodeData>) {
  const { setNodes } = useReactFlow();
  const isEnabled = data.enabled !== false; // Default to enabled

  // Initialize outputs when component mounts or prompt changes externally
  useEffect(() => {
    if (data.prompt && (!data.outputs || data.outputs.text !== data.prompt)) {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  outputs: { text: data.prompt },
                },
              }
            : node,
        ),
      );
    }
  }, [id, data.prompt, data.outputs?.text, setNodes]);

  const handleChange = (newPrompt: string) => {
    if (data.readOnly) return;
    window.dispatchEvent(
      new CustomEvent("node-update", {
        detail: {
          id,
          data: {
            ...data,
            prompt: newPrompt,
            outputs: { text: newPrompt },
          },
        },
      })
    );
  };

  const handleExpandClick = () => {
    openTextEditPanel(
      id,
      data.label || "Text Input",
      data.prompt || "",
      data.readOnly || !isEnabled
    );
  };

  const handleToggleEnabled = () => {
    if (data.readOnly) return;
    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          enabled: !isEnabled,
        },
      },
    });
    window.dispatchEvent(event);
  };

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const getBorderColor = () => {
    if (!isEnabled) return "border-muted";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()} ${!isEnabled ? "opacity-50" : ""}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Text Input"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Expand Button */}
          <button
            onClick={handleExpandClick}
            disabled={data.readOnly}
            className="p-1 rounded transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10"
            title="Expand editor"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
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
          {isExecuting && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      {/* Node Content */}
      <div>
        <ChipTextarea
          value={data.prompt || ""}
          onChange={handleChange}
          placeholder="Enter your prompt... (type @ for chips)"
          textareaClassName="min-h-[100px]"
          disabled={data.readOnly || !isEnabled}
        />
      </div>

      <RunNodeButton nodeId={id} isExecuting={isExecuting} disabled={data.readOnly || !isEnabled} />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

export default memo(PromptInputNode);
