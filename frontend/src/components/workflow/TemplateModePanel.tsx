import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Play, Loader2, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkflowNode } from "./types";

interface TemplateModeProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: WorkflowNode[];
  isExecuting: boolean;
  onGenerate: () => void;
}

export function TemplateModePanel({
  isOpen,
  onClose,
  nodes,
  isExecuting,
  onGenerate,
}: TemplateModeProps) {
  const exposedNodes = nodes.filter((n) => (n.data as any).exposed === true);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, string> = {};
    exposedNodes.forEach((n) => {
      initial[n.id] = (n.data as any).prompt || "";
    });
    setInputs(initial);
  }, [isOpen]);

  const handleChange = (nodeId: string, value: string, nodeData: any) => {
    setInputs((prev) => ({ ...prev, [nodeId]: value }));
    window.dispatchEvent(
      new CustomEvent("node-update", {
        detail: { id: nodeId, data: { ...nodeData, prompt: value } },
      }),
    );
  };

  const allFilled = exposedNodes.every((n) => inputs[n.id]?.trim());

  if (typeof document === "undefined") return null;

  const content = (
    <>
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ zIndex: 9998 }}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{ zIndex: 9999 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <LayoutTemplate className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">Template Mode</h2>
              <p className="text-xs text-muted-foreground">
                Fill in the variables and run
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {exposedNodes.length === 0 ? (
            <div className="rounded-lg bg-muted border border-border p-4 text-sm text-muted-foreground">
              No inputs exposed yet. Click the eye icon on a Text Input node to
              expose it as a template variable.
            </div>
          ) : (
            exposedNodes.map((n) => {
              const label =
                (n.data as any).exposedLabel ||
                (n.data as any).label ||
                "Input";
              return (
                <div key={n.id} className="space-y-1.5">
                  <label className="text-sm font-medium">{label}</label>
                  <textarea
                    value={inputs[n.id] || ""}
                    onChange={(e) =>
                      handleChange(n.id, e.target.value, n.data)
                    }
                    placeholder={`Enter ${label.toLowerCase()}…`}
                    rows={5}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <Button
            onClick={onGenerate}
            disabled={isExecuting || !allFilled || exposedNodes.length === 0}
            className="w-full"
            size="sm"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Generate
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
