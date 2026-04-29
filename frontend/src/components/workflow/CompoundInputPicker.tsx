import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConnectorType } from "./types";

export interface SourceNodeOption {
  nodeId: string;
  label: string;
  type: ConnectorType;
}

interface CompoundInputPickerProps {
  open: boolean;
  sourceNodes: SourceNodeOption[];
  onConfirm: (selectedNodeIds: string[]) => void;
  onCancel: () => void;
}

export function CompoundInputPicker({
  open,
  sourceNodes,
  onConfirm,
  onCancel,
}: CompoundInputPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (nodeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select Variable Inputs</DialogTitle>
          <DialogDescription>
            Which inputs should be variable? Unselected inputs keep their
            internal values.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {sourceNodes.map((node) => (
            <button
              key={node.nodeId}
              onClick={() => toggle(node.nodeId)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md border text-sm transition-colors text-left ${
                selected.has(node.nodeId)
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  selected.has(node.nodeId)
                    ? "border-primary bg-primary"
                    : "border-muted-foreground"
                }`}
              >
                {selected.has(node.nodeId) && (
                  <svg
                    className="w-3 h-3 text-primary-foreground"
                    viewBox="0 0 12 12"
                  >
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                )}
              </div>
              <span>{node.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {node.type}
              </span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(Array.from(selected))}>
            Create Compound
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
