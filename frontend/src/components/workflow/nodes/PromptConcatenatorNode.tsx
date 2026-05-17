import { memo, useEffect } from 'react';
import { Position, NodeProps, useReactFlow } from 'reactflow';
import { ConnectedHandle } from './ConnectedHandle';
import { PromptConcatenatorNodeData, NODE_CONFIGURATIONS, NodeType, WorkflowNode, WorkflowEdge } from '../types';
import { Combine, ChevronDown } from 'lucide-react';
import { gatherNodeInputs, executeConcatenator } from '../executionHelpers';
import { RunNodeButton } from "./RunNodeButton";


function PromptConcatenatorNode({ data, id }: NodeProps<PromptConcatenatorNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.PromptConcatenator];
  const status = data.status || 'ready';
  const { getNodes, getEdges } = useReactFlow();

  // Real-time execution: Update outputs whenever inputs or separator changes
  useEffect(() => {
    const nodes = getNodes() as WorkflowNode[];
    const edges = getEdges() as WorkflowEdge[];
    const currentNode = nodes.find(n => n.id === id);

    if (!currentNode) return;
    // Allow execution updates even in read-only mode (this is just output calculation)

    // Gather inputs from connected nodes
    const inputs = gatherNodeInputs(currentNode, nodes, edges);

    // Compute combined text
    const combined = executeConcatenator(inputs, data.separator);

    // Update node data with preview and outputs
    const event = new CustomEvent('node-update', {
      detail: {
        id,
        data: {
          ...data,
          combinedPreview: combined,
          outputs: { combined },
        },
      },
    });
    window.dispatchEvent(event);
  }, [id, data.separator, getNodes, getEdges]);

  const getBorderColor = () => {
    if (status === 'error') return 'border-red-500';
    return 'border-border';
  };

  return (
    <div className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()}`}>
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Combine className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">{data.label || 'Prompt Concatenator'}</div>
        </div>
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-3 mb-3">
        {config.inputConnectors.map((input) => (
          <div key={input.id} className="flex items-center gap-2 relative h-6">
            <ConnectedHandle
              type="target"
              position={Position.Left}
              id={input.id}
              data-connector-type={input.type}
              className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
            />
            <div className="text-xs font-medium text-muted-foreground">
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Separator Config */}
      <div className="space-y-3 mb-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Separator
          </label>
          <div className="relative">
            <select
              value={data.separator}
              onChange={(e) => {
                // Block changes in read-only mode
                if (data.readOnly) return;

                // This will be handled by WorkflowCanvas setNodes
                const event = new CustomEvent('node-update', {
                  detail: {
                    id,
                    data: { ...data, separator: e.target.value as any },
                  },
                });
                window.dispatchEvent(event);
              }}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md appearance-none pr-8"
              disabled={data.readOnly}
            >
              <option value="Space">Space</option>
              <option value="Comma">Comma</option>
              <option value="Newline">Newline</option>
              <option value="Period">Period</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Preview */}
        {data.combinedPreview && (
          <div className="bg-muted/50 p-2 rounded border border-border">
            <div className="text-xs text-muted-foreground mb-1">Preview:</div>
            <div className="text-xs line-clamp-3 font-mono">
              {data.combinedPreview}
            </div>
          </div>
        )}

        {data.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}
      </div>

      <RunNodeButton nodeId={id} disabled={data.readOnly} />

      {/* Output Handle - Right side */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="combined"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

export default memo(PromptConcatenatorNode);
