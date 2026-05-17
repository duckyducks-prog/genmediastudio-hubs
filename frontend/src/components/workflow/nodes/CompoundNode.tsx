import { memo, useMemo } from "react";
import { Position, NodeProps, useEdges, useNodes } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Loader2, CheckCircle2, AlertCircle, Maximize2 } from "lucide-react";
import { CompoundNodeData, NodeType } from "../types";
import { RunNodeButton } from "./RunNodeButton";

function CompoundNode({ data, id }: NodeProps<CompoundNodeData>) {
  const edges = useEdges();
  const nodes = useNodes();

  const status = data.status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";
  const isError = status === "error";

  // Detect if a WorkflowQueue is connected and get its item count
  const queueInfo = useMemo(() => {
    const incomingEdges = edges.filter((e) => e.target === id);
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (sourceNode?.type === NodeType.WorkflowQueue) {
        const items = (sourceNode.data as any).items || [];
        return { count: items.length, sourceNodeId: sourceNode.id };
      }
    }
    return null;
  }, [edges, nodes, id]);

  // Build output handles: if queue connected, create N indexed outputs per original output
  const outputHandles = useMemo(() => {
    const originalOutputs = data.outputs || [];
    if (!queueInfo || queueInfo.count <= 0) {
      // No queue: show original outputs
      return originalOutputs.map((output) => ({
        id: output.id,
        label: output.label,
        type: output.type,
      }));
    }
    // Queue connected: create indexed outputs
    const handles: { id: string; label: string; type: string }[] = [];
    for (const output of originalOutputs) {
      for (let i = 1; i <= queueInfo.count; i++) {
        handles.push({
          id: `${output.id}_${i}`,
          label: `${output.label} #${i}`,
          type: output.type as string,
        });
      }
    }
    return handles;
  }, [data.outputs, queueInfo]);

  const inputHandles = data.inputs || [];

  const getBorderColor = () => {
    if (isError) return "border-red-500";
    if (isExecuting) return "border-yellow-500";
    if (isCompleted) return "border-green-500";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">{data.icon || "📦"}</span>
          <div className="font-semibold text-sm">
            {data.name || "Compound Node"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isExecuting && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && !isExecuting && (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          )}
          {isError && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      {/* Description */}
      {data.description && (
        <p className="text-xs text-muted-foreground mb-3">{data.description}</p>
      )}

      {/* Queue info */}
      {queueInfo && queueInfo.count > 0 && (
        <div className="mb-3 px-2 py-1.5 rounded bg-primary/10 text-xs text-primary font-medium">
          Batch mode: {queueInfo.count} iteration{queueInfo.count !== 1 ? "s" : ""}
        </div>
      )}

      {/* Input Handles */}
      <div className="space-y-2 mb-3">
        {inputHandles.map((input, index) => {
          const yPercent = inputHandles.length === 1
            ? 50
            : 30 + (index / (inputHandles.length - 1)) * 40;
          return (
            <div key={input.id} className="relative">
              <ConnectedHandle
                type="target"
                position={Position.Left}
                id={input.id}
                data-connector-type={input.type}
                className="!w-3 !h-3 !border-2 !border-background"
                style={{ top: `${yPercent}%`, transform: "translateY(-50%)" }}
              />
              <div className="text-xs text-muted-foreground pl-1">
                {input.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls summary */}
      {(data.controls || []).length > 0 && (
        <div className="mb-3 text-xs text-muted-foreground">
          {data.controls.length} control{data.controls.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Error */}
      {data.error && isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          <div className="text-xs text-red-500">{data.error}</div>
        </div>
      )}

      <RunNodeButton nodeId={id} isExecuting={isExecuting} disabled={data.readOnly} />

      {/* Expand hint */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-2">
        <Maximize2 className="w-3 h-3" />
        Double-click to expand
      </div>

      {/* Output Handles */}
      {outputHandles.map((output, index) => {
        const yPercent = outputHandles.length === 1
          ? 50
          : 20 + (index / (outputHandles.length - 1)) * 60;
        return (
          <div key={output.id}>
            <ConnectedHandle
              type="source"
              position={Position.Right}
              id={output.id}
              data-connector-type={output.type}
              className="!w-3 !h-3 !border-2 !border-background"
              style={{ top: `${yPercent}%`, transform: "translateY(-50%)" }}
            />
            <div
              className="absolute right-0 text-xs text-muted-foreground pr-5 whitespace-nowrap"
              style={{ top: `${yPercent}%`, transform: "translate(0, -50%)" }}
            >
              {output.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(CompoundNode);
