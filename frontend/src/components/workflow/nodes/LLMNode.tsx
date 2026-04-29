import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { LLMNodeData } from '../types';
import { Brain, Loader2, CheckCircle2, AlertCircle, Power, Maximize2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { openTextEditPanel } from './PromptInputNode';
import { RunNodeButton } from './RunNodeButton';

function LLMNode({ data, id }: NodeProps<LLMNodeData>) {
  const status = data.status || 'ready';
  const isGenerating = data.isGenerating || status === 'executing';
  const isEnabled = data.enabled !== false; // Default to enabled

  const getBorderColor = () => {
    if (!isEnabled) return 'border-muted';
    if (status === 'error') return 'border-red-500';
    return 'border-border';
  };

  const handleUpdate = (field: keyof LLMNodeData, value: any) => {
    const event = new CustomEvent('node-update', {
      detail: {
        id,
        data: { ...data, [field]: value },
      },
    });
    window.dispatchEvent(event);
  };

  const handleToggleEnabled = () => {
    if (data.readOnly) return;
    handleUpdate('enabled', !isEnabled);
  };

  const handleExpandClick = () => {
    openTextEditPanel(
      id,
      "LLM - System Prompt",
      data.systemPrompt || "",
      data.readOnly || !isEnabled,
      "systemPrompt"
    );
  };

  return (
    <div className={`bg-card border-2 rounded-lg p-4 min-w-[320px] max-w-[400px] shadow-lg transition-colors ${getBorderColor()} ${!isEnabled ? 'opacity-50' : ''}`}>
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">{data.label || 'LLM'}</div>
        </div>
        <div className="flex items-center gap-1">
          {/* Enable/Disable Toggle */}
          <button
            onClick={handleToggleEnabled}
            disabled={data.readOnly}
            className={`p-1 rounded transition-colors ${
              isEnabled
                ? 'text-green-500 hover:bg-green-500/10'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            title={isEnabled ? 'Disable node' : 'Enable node'}
          >
            <Power className="w-4 h-4" />
          </button>
          {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
          {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          {status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 relative h-6">
          <Handle
            type="target"
            position={Position.Left}
            id="prompt"
            data-connector-type="text"
            className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
          />
          <div className="text-xs font-medium text-muted-foreground">
            Prompt<span className="text-red-500 ml-1">*</span>
          </div>
        </div>
        <div className="flex items-center gap-2 relative h-6">
          <Handle
            type="target"
            position={Position.Left}
            id="context"
            data-connector-type="text"
            className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
          />
          <div className="text-xs font-medium text-muted-foreground">
            Context
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-3">
        {/* System Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-muted-foreground">
              System Prompt
            </label>
            <button
              onClick={handleExpandClick}
              disabled={data.readOnly || !isEnabled}
              className="p-1 rounded transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-50"
              title="Expand editor"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
          <Textarea
            value={data.systemPrompt || ''}
            onChange={(e) => handleUpdate('systemPrompt', e.target.value)}
            placeholder="Instructions to the LLM..."
            className="text-xs min-h-[60px] resize-none"
          />
        </div>

        {/* Temperature */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center justify-between">
            <span>Temperature</span>
            <span className="text-primary font-mono">{data.temperature.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={data.temperature}
            onChange={(e) => handleUpdate('temperature', parseFloat(e.target.value))}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>

        {/* Response Preview */}
        {data.responsePreview && (
          <div className="bg-muted/50 p-3 rounded border border-border max-h-[120px] overflow-y-auto">
            <div className="text-xs text-muted-foreground mb-1">Response:</div>
            <div className="text-xs whitespace-pre-wrap">{data.responsePreview}</div>
          </div>
        )}

        {data.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}

        {(data as any).generatedMode && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Brain className="w-3 h-3" />
            <span>Gemini Flash</span>
            <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-semibold ${
              (data as any).generatedMode === "project"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {(data as any).generatedMode === "project" ? "Project" : "Explore"}
            </span>
          </div>
        )}

        {/* Run Node Button */}
        <RunNodeButton nodeId={id} isExecuting={isGenerating} disabled={data.readOnly} label="Run" loadingLabel="Running..." />
      </div>

      {/* Output Handle - Right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="response"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

export default memo(LLMNode);
