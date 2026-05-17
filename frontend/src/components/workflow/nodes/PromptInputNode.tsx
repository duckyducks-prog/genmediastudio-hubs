import { memo, useCallback, useEffect, useState } from "react";
import { Position, NodeProps, useReactFlow } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { ChipTextarea, ElementChipSuggestion } from "../chips/ChipTextarea";
import { PromptNodeData } from "../types";
import { Type, CheckCircle2, Loader2, Power, Maximize2, Eye, EyeOff } from "lucide-react";
import { RunNodeButton } from "./RunNodeButton";
import { listSceneElements, SceneElement } from "@/lib/scene-elements-api";

// Module-level cache so all prompt nodes share a single fetch.
// Invalidated by dispatching "scene-elements-updated" from anywhere that creates/updates elements.
let _elementCache: SceneElement[] | null = null;
let _elementCachePromise: Promise<SceneElement[]> | null = null;

export function invalidateElementChipCache() {
  _elementCache = null;
  _elementCachePromise = null;
  window.dispatchEvent(new CustomEvent("scene-elements-updated"));
}

async function loadElementsOnce(): Promise<SceneElement[]> {
  if (_elementCache) return _elementCache;
  if (_elementCachePromise) return _elementCachePromise;
  _elementCachePromise = listSceneElements().then((els) => { _elementCache = els; return els; });
  return _elementCachePromise;
}

function toToken(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toElementChip(el: SceneElement): ElementChipSuggestion {
  return {
    id: el.id,
    name: el.name,
    token: toToken(el.name),
    elementType: el.element_type,
    referenceImageUrls: el.reference_image_urls,
  };
}

// Custom event for opening text edit panel
// field: the data field to update (default: "prompt")
export const openTextEditPanel = (nodeId: string, title: string, value: string, readOnly: boolean, field: string = "prompt") => {
  window.dispatchEvent(
    new CustomEvent("open-text-edit-panel", {
      detail: { nodeId, title, value, readOnly, field },
    })
  );
};

function PromptInputNode({ data, id }: NodeProps<PromptNodeData>) {
  const { setNodes } = useReactFlow();
  const isEnabled = data.enabled !== false;
  const isExposed = (data as any).exposed === true;
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState((data as any).exposedLabel || "");
  const [elementChipSuggestions, setElementChipSuggestions] = useState<ElementChipSuggestion[]>([]);

  // Load scene elements for chip suggestions; refresh when new elements are created
  const refreshElementChips = useCallback(() => {
    loadElementsOnce().then((els) => {
      const IMAGE_TYPES = new Set(["character", "location", "prop"]);
      setElementChipSuggestions(
        els.filter((e) => IMAGE_TYPES.has(e.element_type)).map(toElementChip)
      );
    }).catch(() => { /* silent — chips are a convenience, not critical */ });
  }, []);

  useEffect(() => {
    refreshElementChips();
    window.addEventListener("scene-elements-updated", refreshElementChips);
    return () => window.removeEventListener("scene-elements-updated", refreshElementChips);
  }, [refreshElementChips]);

  // Initialize outputs when component mounts or prompt changes externally
  useEffect(() => {
    if (data.prompt && (!data.outputs || data.outputs.text !== data.prompt)) {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  outputs: { text: data.prompt },
                },
              }
            : node,
        ),
      );
    }
  }, [id, data.prompt, data.outputs?.text, setNodes]);

  useEffect(() => {
    const handleInject = (e: Event) => {
      if (data.readOnly) return;
      const { text, skipTextAppend, elementId, elementType, referenceImageUrls, targetNodeId } = (e as CustomEvent<{
        text: string;
        skipTextAppend?: boolean;
        elementId?: string;
        elementType?: string;
        referenceImageUrls?: string[];
        targetNodeId?: string;
      }>).detail;

      // If the event targets a specific node, ignore it if it's not us
      if (targetNodeId && targetNodeId !== id) return;

      // Build updated activeElements list
      let activeElements = [...(data.activeElements ?? [])];
      if (elementId && referenceImageUrls?.length) {
        if (!activeElements.some((el) => el.id === elementId)) {
          activeElements = [...activeElements, { id: elementId, name: text, elementType: elementType ?? "", referenceImageUrls }];
        }
      }

      if (skipTextAppend) {
        // ChipTextarea already inserted the @token — only update activeElements
        window.dispatchEvent(new CustomEvent("node-update", {
          detail: { id, data: { ...data, activeElements } },
        }));
      } else {
        // Plain panel injection — append text to prompt too
        const current = data.prompt || "";
        const separator = current && !current.endsWith(" ") ? " " : "";
        const newPrompt = current + separator + text;
        window.dispatchEvent(new CustomEvent("node-update", {
          detail: { id, data: { ...data, prompt: newPrompt, outputs: { text: newPrompt }, activeElements } },
        }));
      }
    };
    window.addEventListener("inject-scene-element", handleInject);
    return () => window.removeEventListener("inject-scene-element", handleInject);
  }, [id, data.prompt, data.readOnly, data.activeElements, data]);

  const handleChange = (newPrompt: string) => {
    if (data.readOnly) return;
    // Remove activeElements whose name or @token no longer appear in the prompt
    const activeElements = (data.activeElements ?? []).filter((el) => {
      const lower = newPrompt.toLowerCase();
      const token = toToken(el.name);
      return lower.includes(el.name.toLowerCase()) || lower.includes(`@${token}`);
    });
    window.dispatchEvent(
      new CustomEvent("node-update", {
        detail: {
          id,
          data: { ...data, prompt: newPrompt, outputs: { text: newPrompt }, activeElements },
        },
      })
    );
  };

  const handleToggleExpose = () => {
    if (data.readOnly) return;
    if (!isExposed) {
      setLabelDraft((data as any).exposedLabel || data.label || "Text Input");
      setEditingLabel(true);
    } else {
      window.dispatchEvent(new CustomEvent("node-update", {
        detail: { id, data: { ...data, exposed: false, exposedLabel: undefined } },
      }));
    }
  };

  const handleConfirmLabel = () => {
    const label = labelDraft.trim() || data.label || "Text Input";
    window.dispatchEvent(new CustomEvent("node-update", {
      detail: { id, data: { ...data, exposed: true, exposedLabel: label } },
    }));
    setEditingLabel(false);
  };

  const handleExpandClick = () => {
    openTextEditPanel(
      id,
      data.label || "Text Input",
      data.prompt || "",
      data.readOnly || !isEnabled
    );
  };

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

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const getBorderColor = () => {
    if (!isEnabled) return "border-muted";
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[280px] shadow-lg transition-colors ${getBorderColor()} ${!isEnabled ? "opacity-50" : ""} ${isExposed ? "ring-2 ring-primary/40" : ""}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Text Input"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Expose toggle */}
          {!data.readOnly && (
            <button
              onClick={handleToggleExpose}
              className={`p-1 rounded transition-colors ${
                isExposed
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-primary hover:bg-primary/10"
              }`}
              title={isExposed ? `Exposed as "${(data as any).exposedLabel}"` : "Expose in shared form"}
            >
              {isExposed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          )}
          {/* Expand Button */}
          <button
            onClick={handleExpandClick}
            disabled={data.readOnly}
            className="p-1 rounded transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10"
            title="Expand editor"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
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

      {/* Expose label editor */}
      {editingLabel && (
        <div className="mb-2 flex items-center gap-1">
          <input
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleConfirmLabel(); if (e.key === "Escape") setEditingLabel(false); }}
            placeholder="Label for shared form"
            className="nodrag flex-1 text-xs px-2 py-1 rounded border border-primary bg-background focus:outline-none"
            onPointerDown={(e) => e.stopPropagation()}
          />
          <button onClick={handleConfirmLabel} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground">OK</button>
        </div>
      )}

      {/* Exposed badge */}
      {isExposed && !editingLabel && (data as any).exposedLabel && (
        <div className="mb-2 flex items-center gap-1">
          <Eye className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-primary font-medium">shared as "{(data as any).exposedLabel}"</span>
        </div>
      )}

      {/* Node Content */}
      <div>
        <ChipTextarea
          value={data.prompt || ""}
          onChange={handleChange}
          placeholder="Enter your prompt… (type @ for chips or characters)"
          textareaClassName="min-h-[100px]"
          disabled={data.readOnly || !isEnabled}
          elementChips={elementChipSuggestions}
          onElementChipSelect={(chip) => {
            // ChipTextarea already inserted @token into the text.
            // Only update activeElements — skipTextAppend tells the listener not to append again.
            window.dispatchEvent(new CustomEvent("inject-scene-element", {
              detail: {
                text: chip.name,
                skipTextAppend: true,
                elementId: chip.id,
                elementType: chip.elementType,
                referenceImageUrls: chip.referenceImageUrls,
              },
            }));
          }}
        />
      </div>

      <RunNodeButton nodeId={id} isExecuting={isExecuting} disabled={data.readOnly || !isEnabled} />

      {/* Output Handle */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="text"
        data-connector-type="text"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

export default memo(PromptInputNode);
