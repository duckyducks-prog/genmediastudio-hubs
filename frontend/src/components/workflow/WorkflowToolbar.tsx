import { useState, useEffect, useRef } from "react";
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
  Share2,
  LayoutTemplate,
  PanelRightClose,
  PanelRightOpen,
  Settings,
} from "lucide-react";
import { useReactFlow } from "reactflow";

interface WorkflowToolbarProps {
  onClearCanvas: () => void;
  onExecuteWorkflow: () => void;
  onAbortWorkflow: () => void;
  onResetWorkflow: () => void;
  onSaveWorkflow: () => void;
  onLoadWorkflow: () => void;
  onShareWorkflow?: () => void;
  onOpenTemplateMode?: () => void;
  onOpenSettings: () => void;
  exposedNodeCount?: number;
  isExecuting: boolean;
  executionProgress?: Map<string, string>;
  totalNodes?: number;
  isReadOnly?: boolean;
  isInsideCompound?: boolean;
}

export default function WorkflowToolbar({
  onClearCanvas,
  onExecuteWorkflow,
  onAbortWorkflow,
  onResetWorkflow,
  onSaveWorkflow,
  onLoadWorkflow,
  onShareWorkflow,
  onOpenTemplateMode,
  onOpenSettings,
  exposedNodeCount = 0,
  isExecuting,
  executionProgress: _executionProgress,
  totalNodes: _totalNodes,
  isReadOnly = false,
  isInsideCompound = false,
}: WorkflowToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [collapsed, setCollapsed] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const handleMouseMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.toolbar-btn') as HTMLElement | null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--glow-x', `${((e.clientX - rect.left) / rect.width) * 100}%`);
      target.style.setProperty('--glow-y', `${((e.clientY - rect.top) / rect.height) * 100}%`);
    };
    el.addEventListener('mousemove', handleMouseMove);
    return () => el.removeEventListener('mousemove', handleMouseMove);
  }, []);


  return (
    <div ref={toolbarRef} className="absolute top-2 right-2 flex items-center gap-2 bg-card/90 border border-border rounded-lg px-3 py-1.5 shadow-lg z-10">
      {/* Collapse toggle — meta control, no neumorphic treatment */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="p-1 rounded hover:bg-muted transition-colors"
        title={collapsed ? "Expand toolbar" : "Collapse toolbar"}
      >
        {collapsed ? (
          <PanelRightOpen className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <PanelRightClose className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {!collapsed && <>
        {/* Run All */}
        <button
          onClick={onExecuteWorkflow}
          className="toolbar-btn text-pill"
          disabled={isExecuting}
          title="Run All Nodes"
        >
          {isExecuting ? <Spinner size={14} /> : <Play className="w-3.5 h-3.5" />}
          <span>{isExecuting ? "Running" : "Run All"}</span>
        </button>

        {/* Stop */}
        {isExecuting && (
          <button
            onClick={onAbortWorkflow}
            className="toolbar-btn icon-only danger"
            title="Stop Workflow"
            aria-label="Stop Workflow"
          >
            <StopCircle className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Make into app */}
        {onShareWorkflow && !isReadOnly && (
          <button
            onClick={onShareWorkflow}
            className="toolbar-btn text-pill"
            title="Create share link for temp users"
            disabled={isInsideCompound}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Make into app</span>
          </button>
        )}

        {/* Template */}
        {onOpenTemplateMode && !isReadOnly && exposedNodeCount > 0 && (
          <button
            onClick={onOpenTemplateMode}
            className="toolbar-btn text-pill"
            title="Run workflow in simplified template form"
            disabled={isInsideCompound}
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            <span>Template</span>
          </button>
        )}

        <div className="w-px h-6 bg-border mx-0.5" />

        {/* Save */}
        <button
          onClick={onSaveWorkflow}
          className="toolbar-btn icon-only"
          title={isReadOnly ? "Read-Only Template" : isInsideCompound ? "Inside Compound Node" : "Save Workflow"}
          disabled={isReadOnly || isInsideCompound}
        >
          <Save className="w-3.5 h-3.5" />
        </button>

        {/* Load */}
        <button
          onClick={onLoadWorkflow}
          className="toolbar-btn icon-only muted"
          title="Load Workflow"
          aria-label="Load Workflow"
          disabled={isInsideCompound}
        >
          <List className="w-3.5 h-3.5" />
        </button>

        {/* Reset */}
        <button
          onClick={onResetWorkflow}
          className="toolbar-btn icon-only muted"
          disabled={isExecuting || isReadOnly}
          title={isReadOnly ? "Read-Only Template" : "Reset Workflow"}
          aria-label="Reset Workflow"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="toolbar-btn icon-only muted"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-6 bg-border mx-0.5" />

        {/* Zoom In */}
        <button
          onClick={() => zoomIn()}
          className="toolbar-btn icon-only muted"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Out */}
        <button
          onClick={() => zoomOut()}
          className="toolbar-btn icon-only muted"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        {/* Fit View */}
        <button
          onClick={() => fitView()}
          className="toolbar-btn icon-only muted"
          title="Fit View"
          aria-label="Fit View"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-6 bg-border mx-0.5" />

        {/* Clear Canvas */}
        <button
          onClick={onClearCanvas}
          className="toolbar-btn icon-only danger"
          title={isReadOnly ? "Read-Only Template" : "Clear Canvas"}
          aria-label="Clear Canvas"
          disabled={isReadOnly}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </>}
    </div>
  );
}
