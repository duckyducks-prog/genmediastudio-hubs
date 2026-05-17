import { memo, useEffect } from "react";
import { Position, NodeProps, useReactFlow } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { TextOutputNodeData, NODE_CONFIGURATIONS, NodeType } from "../types";
import { Type, CheckCircle2, Loader2, Copy, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RunNodeButton } from "./RunNodeButton";

function TextOutputNode({ data, id }: NodeProps<TextOutputNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.TextOutput];
  const { setNodes, getEdges, getNodes } = useReactFlow();
  const { toast } = useToast();
  const status = data.status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";
  const isEnabled = data.enabled !== false; // Default to enabled

  // Gather text from connected input
  useEffect(() => {
    const edges = getEdges();
    const nodes = getNodes();

    // Find edge connecting to this node's text input
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle === "text"
    );

    if (incomingEdge) {
      const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
      if (sourceNode) {
        let textValue: string | undefined;

        // Get text from source node's outputs
        if (sourceNode.data.outputs) {
          // Try various output handles
          textValue =
            sourceNode.data.outputs[incomingEdge.sourceHandle || "response"] ||
            sourceNode.data.outputs.response ||
            sourceNode.data.outputs.text ||
            sourceNode.data.outputs.combined;
        }

        // Also check responsePreview for LLM nodes
        if (!textValue && sourceNode.data.responsePreview) {
          textValue = sourceNode.data.responsePreview;
        }

        if (textValue && textValue !== data.textContent) {
          setNodes((nodes) =>
            nodes.map((node) =>
              node.id === id
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      textContent: textValue,
                    },
                  }
                : node
            )
          );
        }
      }
    }
  }, [id, getEdges, getNodes, setNodes, data.textContent]);

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

  const handleCopy = async () => {
    if (!data.textContent) return;
    try {
      await navigator.clipboard.writeText(data.textContent);
      toast({
        title: "Copied",
        description: "Text copied to clipboard",
      });
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const getBorderColor = () => {
    if (!isEnabled) return "border-muted";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[300px] max-w-[400px] shadow-lg transition-colors ${getBorderColor()} ${!isEnabled ? "opacity-50" : ""}`}
    >
      {/* Input Handle */}
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="text"
        data-connector-type={config.inputConnectors[0]?.type}
        className="!w-3 !h-3 !border-2 !border-background !-left-[6px]"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />

      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Text Output"}
          </div>
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
          {isExecuting && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>
      </div>

      {/* Text Content */}
      <div className="space-y-2">
        {data.textContent ? (
          <>
            <div className="bg-muted/50 rounded-md p-3 max-h-[200px] overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap break-words">
                {data.textContent}
              </p>
            </div>
            <Button
              onClick={handleCopy}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Copy className="w-3 h-3 mr-1" />
              Copy Text
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-[100px] border-2 border-dashed border-border rounded-lg bg-muted/30">
            <Type className="w-6 h-6 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">No text yet</p>
            <p className="text-xs text-muted-foreground">
              Connect an LLM node
            </p>
          </div>
        )}
      </div>

      <RunNodeButton nodeId={id} disabled={data.readOnly} isExecuting={isExecuting} />
    </div>
  );
}

export default memo(TextOutputNode);
