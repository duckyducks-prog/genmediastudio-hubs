import { Position } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { AlertTriangle } from "lucide-react";
import {
  NODE_CONFIGURATIONS,
  NodeType,
} from "@/components/workflow/types";

interface NodeErrorFallbackProps {
  nodeType: string;
  error?: Error;
}

/**
 * Fallback UI for a crashed workflow node.
 * Preserves React Flow Handle elements so the graph stays connected.
 */
export default function NodeErrorFallback({
  nodeType,
  error,
}: NodeErrorFallbackProps) {
  const config = NODE_CONFIGURATIONS[nodeType as NodeType];

  return (
    <div className="relative px-4 py-3 rounded-lg border border-destructive/50 bg-destructive/10 min-w-[180px]">
      {/* Render input handles to keep edges connected */}
      {config?.inputConnectors?.map((connector, i) => (
        <ConnectedHandle
          key={`in-${connector.id}`}
          type="target"
          position={Position.Left}
          id={connector.id}
          style={{ top: `${30 + i * 24}px` }}
        />
      ))}

      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">
            {config?.label || nodeType}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {error?.message || "This node encountered an error"}
          </p>
        </div>
      </div>

      {/* Render output handles to keep edges connected */}
      {config?.outputConnectors?.map((connector, i) => (
        <ConnectedHandle
          key={`out-${connector.id}`}
          type="source"
          position={Position.Right}
          id={connector.id}
          style={{ top: `${30 + i * 24}px` }}
        />
      ))}
    </div>
  );
}
