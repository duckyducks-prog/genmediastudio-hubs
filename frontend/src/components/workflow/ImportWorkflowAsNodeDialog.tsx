import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadWorkflow } from "@/lib/workflow-api";
import { analyzeWorkflow, groupByNode } from "@/lib/compound-nodes/analyzeWorkflow";
import { buildCompoundDefinition } from "@/lib/compound-nodes/buildCompoundDefinition";
import {
  CompoundNodeDefinition,
  AvailableInput,
  AvailableControl,
} from "@/lib/compound-nodes/types";
import { Loader2, AlertCircle } from "lucide-react";
import { logger } from "@/lib/logger";

interface ImportWorkflowAsNodeDialogProps {
  open: boolean;
  workflowId: string;
  workflowName: string;
  onConfirm: (definition: CompoundNodeDefinition) => void;
  onCancel: () => void;
}

export function ImportWorkflowAsNodeDialog({
  open,
  workflowId,
  workflowName,
  onConfirm,
  onCancel,
}: ImportWorkflowAsNodeDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workflowData, setWorkflowData] = useState<{
    nodes: any[];
    edges: any[];
  } | null>(null);

  const [name, setName] = useState(workflowName);
  const [icon, setIcon] = useState("📦");
  const [description, setDescription] = useState("");

  const [selectedInputs, setSelectedInputs] = useState<Set<string>>(new Set());
  const [selectedControls, setSelectedControls] = useState<Set<string>>(new Set());

  // Fetch workflow data when dialog opens
  useEffect(() => {
    if (!open || !workflowId) return;

    setLoading(true);
    setError(null);
    setWorkflowData(null);
    setSelectedInputs(new Set());
    setSelectedControls(new Set());
    setName(workflowName);

    loadWorkflow(workflowId)
      .then((workflow) => {
        setWorkflowData({ nodes: workflow.nodes, edges: workflow.edges });
        setLoading(false);
      })
      .catch((err) => {
        logger.error("[ImportWorkflowAsNodeDialog] Failed to load workflow:", err);
        setError(err.message || "Failed to load workflow");
        setLoading(false);
      });
  }, [open, workflowId, workflowName]);

  // Analyze the workflow for exposable items
  const analysis = useMemo(() => {
    if (!workflowData) return null;
    return analyzeWorkflow(workflowData.nodes, workflowData.edges);
  }, [workflowData]);

  // Group inputs by node for display
  const groupedInputs = useMemo(() => {
    if (!analysis) return {};
    return groupByNode(analysis.availableInputs);
  }, [analysis]);

  const groupedControls = useMemo(() => {
    if (!analysis) return {};
    return groupByNode(analysis.availableControls);
  }, [analysis]);

  // Auto-detected outputs (read-only info)
  const autoOutputs = useMemo(() => {
    if (!analysis) return [];
    return analysis.availableOutputs;
  }, [analysis]);

  const toggleInput = (id: string) => {
    setSelectedInputs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleControl = (id: string) => {
    setSelectedControls((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    if (!workflowData || !analysis) return;

    // Build exposedInputs from selection
    const exposedInputs: Record<string, any> = {};
    for (const input of analysis.availableInputs) {
      if (selectedInputs.has(input.id)) {
        exposedInputs[input.id] = {
          id: input.id,
          nodeId: input.nodeId,
          inputHandle: input.inputHandle,
          exposedName: input.suggestedName,
          type: input.type,
          paramPath: input.paramPath,
        };
      }
    }

    // Build exposedControls from selection
    const exposedControls: Record<string, any> = {};
    for (const control of analysis.availableControls) {
      if (selectedControls.has(control.id)) {
        exposedControls[control.id] = {
          id: control.id,
          nodeId: control.nodeId,
          paramPath: control.paramPath,
          exposedName: control.suggestedName,
          controlType: control.suggestedControlType,
          config: control.config,
        };
      }
    }

    const definition = buildCompoundDefinition({
      name: name.trim() || workflowName,
      icon,
      description,
      nodes: workflowData.nodes,
      edges: workflowData.edges,
      exposedInputs,
      exposedControls,
    });

    // Attach source workflow reference
    (definition as any).sourceWorkflowId = workflowId;

    onConfirm(definition);
  };

  const hasOutputs = autoOutputs.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Workflow as Node</DialogTitle>
          <DialogDescription>
            Configure which inputs and controls to expose on the compound node.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading workflow...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && analysis && (
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            {/* Name & Icon */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Node Name
              </label>
              <div className="flex gap-2">
                <Input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-14 text-center text-lg"
                  maxLength={2}
                />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Compound node name"
                  className="flex-1"
                />
              </div>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="text-sm"
              />
            </div>

            {/* Variable Inputs */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Variable Inputs
              </label>
              <p className="text-xs text-muted-foreground">
                Select which inputs become connectors on the compound node. Unselected inputs keep their internal values.
              </p>
              {Object.keys(groupedInputs).length === 0 ? (
                <p className="text-xs text-muted-foreground/70 italic py-2">
                  No exposable inputs found in this workflow.
                </p>
              ) : (
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {Object.entries(groupedInputs).map(([nodeId, group]) => (
                    <div key={nodeId}>
                      {group.items.map((input: AvailableInput) => (
                        <CheckboxItem
                          key={input.id}
                          label={input.suggestedName}
                          sublabel={input.type}
                          checked={selectedInputs.has(input.id)}
                          onChange={() => toggleInput(input.id)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Controls */}
            {Object.keys(groupedControls).length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Controls
                </label>
                <p className="text-xs text-muted-foreground">
                  Expose internal parameters as adjustable controls.
                </p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {Object.entries(groupedControls).map(([nodeId, group]) => (
                    <div key={nodeId}>
                      {group.items.map((control: AvailableControl) => (
                        <CheckboxItem
                          key={control.id}
                          label={control.suggestedName}
                          sublabel={`${control.suggestedControlType} • ${control.currentValue ?? "default"}`}
                          checked={selectedControls.has(control.id)}
                          onChange={() => toggleControl(control.id)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-detected Outputs (read-only) */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Outputs (auto-detected)
              </label>
              {!hasOutputs ? (
                <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 text-yellow-600 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    No GenerateImage or GenerateVideo nodes found. The compound node will have no outputs.
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  {autoOutputs.map((output) => (
                    <div
                      key={output.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-card text-sm"
                    >
                      <div className="w-4 h-4 rounded border-2 border-primary bg-primary flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
                        </svg>
                      </div>
                      <span>{output.suggestedName}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{output.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Node count warning */}
            {workflowData && workflowData.nodes.length > 30 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 text-yellow-600 text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  This workflow has {workflowData.nodes.length} nodes. Large compound nodes may increase save size.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || !!error || !name.trim()}
          >
            Create Node
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reusable checkbox item matching CompoundInputPicker style */
function CheckboxItem({
  label,
  sublabel,
  checked,
  onChange,
}: {
  label: string;
  sublabel: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md border text-sm transition-colors text-left ${
        checked
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent"
      }`}
    >
      <div
        className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
          checked ? "border-primary bg-primary" : "border-muted-foreground"
        }`}
      >
        {checked && (
          <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        )}
      </div>
      <span>{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{sublabel}</span>
    </button>
  );
}
