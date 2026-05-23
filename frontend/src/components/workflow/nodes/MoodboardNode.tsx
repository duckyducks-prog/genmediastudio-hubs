import { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Position, NodeProps, useReactFlow } from "reactflow";
import { ConnectedHandle } from "./ConnectedHandle";
import { MoodboardNodeData } from "../types";
import { X, Pencil, Check, Layers, Loader2, User, MapPin, Link } from "lucide-react";
import { auth } from "@/lib/firebase";
import { VEO_API_BASE_URL } from "@/lib/api-config";
import { invalidateElementChipCache } from "./PromptInputNode";
import { useWorkflowNodes, useWorkflowEdges } from "@/contexts/WorkflowContext";

const SCENE_ELEMENTS_BASE = `${VEO_API_BASE_URL}/v1/scene-elements`;

type SaveState = "idle" | "picking" | "naming" | "saving" | "saved";

function MoodboardNode({ data, id }: NodeProps<MoodboardNodeData>) {
  const { setNodes } = useReactFlow();
  const [allNodes] = useWorkflowNodes();
  const [allEdges] = useWorkflowEdges();

  // Drag-dropped images stored in node data (persisted)
  const ownImages: string[] = data.images ?? [];

  // Live-aggregate images from all connected upstream nodes
  const connectedImages = useMemo(() => {
    const incomingEdges = allEdges.filter(e => e.target === id);
    const imgs: string[] = [];
    for (const edge of incomingEdges) {
      const source = allNodes.find(n => n.id === edge.source);
      if (!source) continue;
      const outputs = (source.data?.outputs ?? {}) as Record<string, unknown>;
      const srcHandle = edge.sourceHandle ?? "image";

      const val = outputs[srcHandle] ?? (source.data as Record<string, unknown>)[srcHandle];
      if (Array.isArray(val)) {
        for (const v of val) { if (typeof v === "string" && v) imgs.push(v); }
      } else if (typeof val === "string" && val) {
        imgs.push(val);
      }

      // Also pull reference_images when the source used the element picker
      const refImgs = outputs["reference_images"];
      if (Array.isArray(refImgs)) {
        for (const v of refImgs) { if (typeof v === "string" && v) imgs.push(v); }
      }
    }
    return [...new Set(imgs)];
  }, [allNodes, allEdges, id]);

  const connectedSet = useMemo(() => new Set(connectedImages), [connectedImages]);

  // All images: connected (non-removable) + own drag-dropped (removable)
  const images = useMemo(
    () => [...new Set([...connectedImages, ...ownImages])],
    [connectedImages, ownImages],
  );

  // Label editing
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(data.moodboardLabel ?? "");
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Save-as-element flow
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [elementType, setElementType] = useState<"character" | "location" | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingLabel && labelInputRef.current) labelInputRef.current.focus();
  }, [editingLabel]);

  useEffect(() => {
    if (saveState === "naming" && nameInputRef.current) nameInputRef.current.focus();
  }, [saveState]);

  // Sync label from external updates
  useEffect(() => {
    setLabelDraft(data.moodboardLabel ?? "");
  }, [data.moodboardLabel]);

  const updateData = useCallback((patch: Partial<MoodboardNodeData>) => {
    const newData = { ...data, ...patch };
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: newData } : n));
    window.dispatchEvent(new CustomEvent("node-update", { detail: { id, data: newData } }));
  }, [data, id, setNodes]);

  const commitLabel = () => {
    setEditingLabel(false);
    updateData({ moodboardLabel: labelDraft.trim() || undefined });
  };

  const removeOwnImage = (url: string) => {
    const newImages = ownImages.filter(u => u !== url);
    const newRefs = (data.imageRefs ?? []).filter((_, i) => ownImages[i] !== url);
    updateData({ images: newImages, imageRefs: newRefs, outputs: { images: [...new Set([...connectedImages, ...newImages])] } });
  };

  // Drag-drop from asset library
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/asset");
    if (!raw) return;
    try {
      const { url } = JSON.parse(raw);
      if (url && !ownImages.includes(url)) {
        const newImages = [...ownImages, url];
        updateData({ images: newImages, outputs: { images: [...new Set([...connectedImages, ...newImages])] } });
      }
    } catch { /* ignore */ }
  };

  // Save as element
  const handleSave = async () => {
    if (!nameDraft.trim() || !elementType) return;
    const currentUser = auth.currentUser;
    if (!currentUser) { setSaveError("Not signed in"); return; }
    setSaveState("saving");
    setSaveError(null);
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(SCENE_ELEMENTS_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: nameDraft.trim(),
          element_type: elementType,
          reference_image_urls: images,
          description: data.moodboardLabel ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveState("saved");
      invalidateElementChipCache();
      setTimeout(() => { setSaveState("idle"); setNameDraft(""); setElementType(null); }, 2500);
    } catch (e) {
      setSaveError((e as Error).message);
      setSaveState("naming");
    }
  };

  const displayLabel = data.moodboardLabel || "Moodboard";

  return (
    <div
      className="bg-card border-2 border-border rounded-lg shadow-lg overflow-visible"
      style={{ minWidth: 240, maxWidth: 300 }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Input handle — accepts multiple image connections */}
      <ConnectedHandle
        type="target"
        position={Position.Left}
        id="images"
        data-connector-type="images"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%" }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary flex-shrink-0" />
          {editingLabel ? (
            <input
              ref={labelInputRef}
              value={labelDraft}
              onChange={e => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={e => { if (e.key === "Enter") commitLabel(); if (e.key === "Escape") { setEditingLabel(false); setLabelDraft(data.moodboardLabel ?? ""); } }}
              className="text-sm font-semibold bg-transparent border-none outline-none w-full"
              placeholder="Name this moodboard…"
            />
          ) : (
            <span className="text-sm font-semibold truncate max-w-[150px]">{displayLabel}</span>
          )}
        </div>
        <button
          onClick={() => setEditingLabel(v => !v)}
          className="p-1 rounded hover:bg-accent transition-colors flex-shrink-0"
          title="Rename"
        >
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Image grid */}
      <div className="p-2">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-border rounded-lg text-center">
            <p className="text-[10px] text-muted-foreground">Connect images or drag from library</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {images.map((url, i) => {
              const isConnected = connectedSet.has(url);
              return (
                <div key={i} className="relative group aspect-square rounded overflow-hidden bg-muted">
                  <img src={url} className="w-full h-full object-cover" alt="" />
                  {isConnected ? (
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="From connection">
                      <Link className="w-2.5 h-2.5 text-white" />
                    </div>
                  ) : (
                    <button
                      onClick={() => removeOwnImage(url)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
          {images.length} image{images.length !== 1 ? "s" : ""}
          {connectedImages.length > 0 && ` · ${connectedImages.length} from connections`}
          {ownImages.length > 0 && connectedImages.length === 0 && " · drag to add more"}
        </p>
      </div>

      {/* Save as element */}
      <div className="px-2 pb-2">
        {saveState === "idle" && (
          <button
            onClick={() => setSaveState("picking")}
            disabled={images.length === 0}
            className="w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save as element
          </button>
        )}

        {saveState === "picking" && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground text-center">What type of element?</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setElementType("character"); setSaveState("naming"); }}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-border bg-secondary hover:bg-accent transition-colors"
              >
                <User className="w-3 h-3" /> Character
              </button>
              <button
                onClick={() => { setElementType("location"); setSaveState("naming"); }}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg border border-border bg-secondary hover:bg-accent transition-colors"
              >
                <MapPin className="w-3 h-3" /> Location
              </button>
            </div>
            <button onClick={() => setSaveState("idle")} className="w-full text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        )}

        {saveState === "naming" && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground">
              Name this {elementType}
            </p>
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setSaveState("picking"); } }}
              placeholder={elementType === "character" ? "e.g. Sarah" : "e.g. Rooftop sunset"}
              className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background outline-none focus:border-primary"
            />
            {saveError && <p className="text-[10px] text-destructive">{saveError}</p>}
            <div className="flex gap-1.5">
              <button
                onClick={handleSave}
                disabled={!nameDraft.trim()}
                className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 transition-colors"
              >
                <Check className="w-3 h-3" /> Save
              </button>
              <button onClick={() => setSaveState("picking")} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors">
                Back
              </button>
            </div>
          </div>
        )}

        {saveState === "saving" && (
          <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </div>
        )}

        {saveState === "saved" && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 text-xs text-primary">
            <Check className="w-3 h-3" /> Saved as {elementType}
          </div>
        )}
      </div>

      {/* Output handle */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="images"
        data-connector-type="images"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%" }}
      />
    </div>
  );
}

export default memo(MoodboardNode);
