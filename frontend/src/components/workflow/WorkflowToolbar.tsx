import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  RotateCcw,
  Save,
  List,
  StopCircle,
  Package,
} from "lucide-react";
import { useReactFlow } from "reactflow";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface WorkflowToolbarProps {
  onClearCanvas: () => void;
  onExecuteWorkflow: () => void;
  onAbortWorkflow: () => void;
  onResetWorkflow: () => void;
  onSaveWorkflow: () => void;
  onSaveAsNode: () => void;
  onLoadWorkflow: () => void;
  isExecuting: boolean;
  executionProgress?: Map<string, string>;
  totalNodes?: number;
  isReadOnly?: boolean;
  isInsideCompound?: boolean;
  parallelExecution?: boolean;
  onToggleParallelExecution?: () => void;
}

export default function WorkflowToolbar({
  onClearCanvas,
  onExecuteWorkflow,
  onAbortWorkflow,
  onResetWorkflow,
  onSaveWorkflow,
  onSaveAsNode,
  onLoadWorkflow,
  isExecuting,
  executionProgress: _executionProgress,
  totalNodes: _totalNodes,
  isReadOnly = false,
  isInsideCompound = false,
  parallelExecution = false,
  onToggleParallelExecution,
}: WorkflowToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { state } = useWorkflow();

  // Format last saved time
  const getLastSavedText = () => {
    if (!state.lastSaved) return null;

    const now = new Date();
    const diff = Math.floor((now.getTime() - state.lastSaved.getTime()) / 1000);

    if (diff < 60) return "Saved just now";
    if (diff < 3600) return `Saved ${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `Saved ${Math.floor(diff / 3600)}h ago`;
    return `Saved ${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="absolute top-2 right-2 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 shadow-lg z-10">
      {/* Unsaved indicator and last saved time */}
      <div className="flex items-center gap-2 text-xs">
        {state.isDirty && (
          <div
            className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"
            title="Unsaved changes"
          />
        )}
        {getLastSavedText() && (
          <span className="text-muted-foreground whitespace-nowrap">
            {getLastSavedText()}
          </span>
        )}
      </div>

      {/* Separator */}
      {(state.isDirty || getLastSavedText()) && (
        <div className="w-px h-6 bg-border" />
      )}

      <Button
        onClick={onSaveWorkflow}
        variant="default"
        size="icon"
        className="h-8 w-8"
        title={isReadOnly ? "Read-Only Template" : isInsideCompound ? "Inside Compound Node" : "Save Workflow"}
        disabled={isReadOnly || isInsideCompound}
      >
        <Save className="w-3.5 h-3.5" />
      </Button>

      <Button
        onClick={onSaveAsNode}
        variant="outline"
        size="sm"
        className="h-8 px-2"
        title="Save as reusable compound node"
        disabled={isReadOnly || isInsideCompound}
      >
        <Package className="w-3.5 h-3.5 mr-1" />
        <span className="text-xs">Save as Node</span>
      </Button>

      <Button
        onClick={onLoadWorkflow}
        variant="outline"
        size="icon"
        className="h-8 w-8"
        title="Load Workflow"
        aria-label="Load Workflow"
        disabled={isInsideCompound}
      >
        <List className="w-3.5 h-3.5" />
      </Button>

      <div className="w-px h-6 bg-border mx-0.5" />

      <ThemeToggle />

      <div className="w-px h-6 bg-border mx-0.5" />

      <button
        onClick={onToggleParallelExecution}
        disabled={isExecuting}
        className={`h-7 px-2 rounded text-[10px] font-medium transition-colors ${
          parallelExecution
            ? "bg-primary/20 text-primary border border-primary/40"
            : "bg-muted text-muted-foreground border border-transparent hover:bg-muted/80"
        } ${isExecuting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        title={parallelExecution ? "Parallel: API nodes run simultaneously (faster, may hit rate limits)" : "Sequential: API nodes run one at a time (safer for complex workflows)"}
      >
        {parallelExecution ? "Parallel" : "Sequential"}
      </button>

      <Button
        onClick={onExecuteWorkflow}
        disabled={isExecuting}
        variant="default"
        size="sm"
        className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground px-3"
        title="Run All Nodes"
      >
        {isExecuting ? (
          <Spinner size={16} className="mr-1" />
        ) : (
          <Play className="w-3.5 h-3.5 mr-1" />
        )}
        {isExecuting ? "Running" : "Run All"}
      </Button>

      {isExecuting && (
        <Button
          onClick={onAbortWorkflow}
          variant="destructive"
          size="icon"
          className="h-8 w-8"
          title="Stop Workflow"
          aria-label="Stop Workflow"
        >
          <StopCircle className="w-3.5 h-3.5" />
        </Button>
      )}

      <Button
        onClick={onResetWorkflow}
        disabled={isExecuting || isReadOnly}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title={isReadOnly ? "Read-Only Template" : "Reset Workflow"}
        aria-label="Reset Workflow"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </Button>

      <div className="w-px h-6 bg-border mx-0.5" />

      <Button
        onClick={() => zoomIn()}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Zoom In"
        aria-label="Zoom In"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </Button>

      <Button
        onClick={() => zoomOut()}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </Button>

      <Button
        onClick={() => fitView()}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Fit View"
        aria-label="Fit View"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </Button>

      <div className="w-px h-6 bg-border mx-0.5" />

      <Button
        onClick={onClearCanvas}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title={isReadOnly ? "Read-Only Template" : "Clear Canvas"}
        aria-label="Clear Canvas"
        disabled={isReadOnly}
      >
        <Trash2 className="w-3.5 h-3.5 text-destructive" />
      </Button>
    </div>
  );
}
