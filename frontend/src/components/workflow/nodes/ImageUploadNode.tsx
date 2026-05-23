import { logger } from "@/lib/logger";
import { memo, useState, useEffect, useRef } from "react";
import { Position, NodeProps, useReactFlow } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Button } from "@/components/ui/button";
import { ImageInputNodeData } from "../types";
import { Upload, X, Image as ImageIcon, Loader2, FolderOpen, User, BookmarkPlus, User as UserIcon, MapPin } from "lucide-react";
import { saveToLibrary } from "@/lib/api-helpers";
import { RunNodeButton } from "./RunNodeButton";
import { listSceneElements, SceneElement } from "@/lib/scene-elements-api";

function ImageUploadNode({ data, id }: NodeProps<ImageInputNodeData>) {
  // Use imageUrl from data, which may be resolved from imageRef on workflow load
  const [imageUrl, setImageUrl] = useState<string | null>(data.imageUrl ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { setNodes } = useReactFlow();

  // Character / element picker
  const [showElementPicker, setShowElementPicker] = useState(false);

  // Save-as-element flow
  const [savePhase, setSavePhase] = useState<"idle"|"picking"|"naming"|"saving">("idle");
  const [saveElType, setSaveElType] = useState<"character"|"location"|null>(null);
  const [saveElName, setSaveElName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (savePhase === "naming" && saveNameRef.current) saveNameRef.current.focus();
  }, [savePhase]);
  const [elements, setElements] = useState<SceneElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<{ name: string; previewUrl: string | null } | null>(
    (data as any).elementName
      ? { name: (data as any).elementName, previewUrl: (data as any).elementPreviewUrl ?? null }
      : null
  );

  // Sync badge when data.elementName is cleared externally (e.g. bulk reset)
  useEffect(() => {
    const name = (data as any).elementName as string | undefined;
    if (!name) {
      setSelectedElement(null);
    } else if (name !== selectedElement?.name) {
      setSelectedElement({ name, previewUrl: (data as any).elementPreviewUrl ?? null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(data as any).elementName]);

  useEffect(() => {
    if (!showElementPicker) return;
    const IMAGE_TYPES = new Set(["character", "location", "prop"]);
    listSceneElements()
      .then(els => setElements(els.filter(e => IMAGE_TYPES.has(e.element_type) && e.reference_image_urls.length > 0)))
      .catch(() => {});
  }, [showElementPicker]);

  const handleSelectElement = (el: SceneElement) => {
    const urls = el.reference_image_urls;
    const preview = urls[0] ?? null;
    setSelectedElement({ name: el.name, previewUrl: preview });
    setImageUrl(preview);
    setShowElementPicker(false);

    const newData = {
      ...data,
      imageRef: undefined,
      imageUrl: preview,
      elementName: el.name,
      elementPreviewUrl: preview,
      // outputs.image stays scalar for backward compat; full array goes to reference_images
      outputs: { image: preview, reference_images: urls },
    };
    setNodes(nodes => nodes.map(n => n.id === id ? { ...n, data: newData } : n));
    window.dispatchEvent(new CustomEvent("node-update", { detail: { id, data: newData } }));
  };

  const handleSaveAsElement = async () => {
    if (!saveElName.trim() || !saveElType) return;
    const { auth } = await import("@/lib/firebase");
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setSaveError("Not signed in");
      return;
    }
    setSavePhase("saving");
    setSaveError(null);
    try {
      const { VEO_API_BASE_URL } = await import("@/lib/api-config");
      const token = await currentUser.getIdToken();
      const urls = Array.isArray((data as any).outputs?.reference_images)
        ? (data as any).outputs.reference_images
        : Array.isArray((data as any).outputs?.image)
          ? (data as any).outputs.image
          : [(data as any).imageUrl].filter(Boolean);
      const res = await fetch(`${VEO_API_BASE_URL}/v1/scene-elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: saveElName.trim(), element_type: saveElType, reference_image_urls: urls }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      // Dynamic import avoids circular dep between sibling node files
      const { invalidateElementChipCache } = await import("./PromptInputNode");
      invalidateElementChipCache();
      setSavePhase("idle");
      setSaveElName("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      setSavePhase("naming");
    }
  };

  // Sync imageUrl state when data.imageUrl changes (e.g., on workflow load)
  useEffect(() => {
    if (data.imageUrl && data.imageUrl !== imageUrl) {
      setImageUrl(data.imageUrl);
    }
  }, [data.imageUrl]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const url = event.target?.result as string;

      logger.debug("[ImageUploadNode] Image loaded:", {
        nodeId: id,
        urlLength: url.length,
        urlPreview: url.substring(0, 50) + "...",
        fileType: file.type,
        fileSize: file.size,
      });

      // Show image immediately while uploading to asset library
      setImageUrl(url);

      try {
        // Upload to Asset Library to get a persistent reference
        logger.debug("[ImageUploadNode] Uploading to Asset Library...");
        const assetResult = await saveToLibrary({
          imageUrl: url,
          prompt: "User uploaded image",
          assetType: "image",
        });

        const imageRef = assetResult.id;
        logger.debug("[ImageUploadNode] Asset saved:", { imageRef });

        // Create new data object with imageRef for persistence
        const newData = {
          ...data,
          imageRef, // Asset ID for persistence (survives workflow save/load)
          imageUrl: url, // For immediate display
          outputs: { image: url }, // For downstream nodes
        };

        logger.debug("[ImageUploadNode] Updating node with data:", {
          nodeId: id,
          imageRef: newData.imageRef,
          hasOutputs: !!newData.outputs,
        });

        // Update node data
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  data: newData,
                }
              : node,
          ),
        );

        // Trigger propagation to downstream nodes
        logger.debug("[ImageUploadNode] Dispatching node-update event");
        const updateEvent = new CustomEvent("node-update", {
          detail: {
            id,
            data: newData,
          },
        });
        window.dispatchEvent(updateEvent);
      } catch (error) {
        logger.debug("[ImageUploadNode] Failed to save to Asset Library:", error);
        setUploadError("Failed to save image. It won't persist when workflow is saved.");

        // Still update node with base64 for immediate use, but warn user
        const newData = {
          ...data,
          imageUrl: url,
          outputs: { image: url },
        };

        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? { ...node, data: newData }
              : node,
          ),
        );

        const updateEvent = new CustomEvent("node-update", {
          detail: { id, data: newData },
        });
        window.dispatchEvent(updateEvent);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    logger.debug("[ImageUploadNode] Removing image from node:", id);

    setImageUrl(null);
    setUploadError(null);

    const newData = {
      ...data,
      imageRef: undefined, // Clear asset reference
      imageUrl: null,
      file: null,
      outputs: {}, // Clear outputs
    };

    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: newData,
            }
          : node,
      ),
    );

    // Trigger data propagation to downstream nodes
    logger.debug("[ImageUploadNode] Dispatching node-update event (clear)");
    const updateEvent = new CustomEvent("node-update", {
      detail: {
        id,
        data: newData,
      },
    });
    window.dispatchEvent(updateEvent);
  };

  const status = (data as any).status || "ready";
  const isExecuting = status === "executing";
  const isCompleted = status === "completed";

  const getBorderColor = () => {
    return "border-border";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[250px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Image Upload"}
          </div>
        </div>
        {isExecuting && (
          <span className="w-4 h-4 animate-pulse text-yellow-500">⚡</span>
        )}
        {isCompleted && <span className="text-green-500">✓</span>}
      </div>

      {/* Node Content */}
      <div className="space-y-2">
        {imageUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center h-48">
            <img
              src={imageUrl}
              alt="Upload preview"
              className="max-w-full max-h-full object-contain"
            />
            {isUploading && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
            <Button
              onClick={handleRemove}
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              disabled={isUploading}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <label
            htmlFor={`file-upload-${id}`}
            className={`flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-lg transition-colors ${
              isUploading
                ? "cursor-wait opacity-50"
                : "cursor-pointer hover:border-primary hover:bg-accent/10"
            }`}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-8 h-8 text-muted-foreground mb-2 animate-spin" />
                <span className="text-xs text-muted-foreground">
                  Uploading...
                </span>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                <span className="text-xs text-muted-foreground">
                  Click to upload
                </span>
              </>
            )}
            <input
              id={`file-upload-${id}`}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        )}
        {/* Character badge when element selected */}
        {imageUrl && selectedElement && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <User className="w-3 h-3" />
            {selectedElement.name} · {(data as any).outputs?.image?.length ?? 1} ref images
          </p>
        )}
        {uploadError && <p className="text-xs text-destructive mt-1">{uploadError}</p>}
      </div>

      {/* ── Icon toolbar ── */}
      <div className="flex items-center gap-1 px-2.5 py-2 border-t border-border bg-black/10">
        {/* Browse Library */}
        <div className="relative">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-asset-library-inline", { detail: { nodeId: id, assetType: "image" } }))}
            disabled={isUploading || data.readOnly}
            title="Browse Library"
            className="node-tool-btn group"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="node-tool-tip">Browse Library</span>
          </button>
        </div>

        {/* Use Character */}
        <div className="relative">
          <button
            onClick={() => setShowElementPicker(v => !v)}
            disabled={isUploading || data.readOnly}
            title="Use Character"
            className="node-tool-btn group"
          >
            <User className="w-3.5 h-3.5" />
            <span className="node-tool-tip">Use Character</span>
          </button>
          {showElementPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowElementPicker(false)} />
              <div className="absolute bottom-full left-0 mb-1 z-50 w-48 bg-card border border-border rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto">
                {elements.length === 0
                  ? <p className="px-3 py-2 text-xs text-muted-foreground">No characters yet</p>
                  : elements.map(el => (
                    <button key={el.id} onClick={() => handleSelectElement(el)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-accent transition-colors">
                      {el.reference_image_urls[0] && <img src={el.reference_image_urls[0]} className="w-6 h-6 rounded object-cover flex-shrink-0" alt="" />}
                      <span className="truncate">{el.name}</span>
                    </button>
                  ))
                }
              </div>
            </>
          )}
        </div>

        {/* Save as element */}
        <div className="relative">
          <button
            onClick={() => setSavePhase("picking")}
            title="Save as element"
            className="node-tool-btn group"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span className="node-tool-tip">Save as element</span>
          </button>
          {savePhase === "picking" && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSavePhase("idle")} />
              <div className="absolute bottom-full left-0 mb-1 z-50 bg-card border border-border rounded-lg shadow-xl p-2 flex flex-col gap-1 min-w-[140px]">
                <button onClick={() => { setSaveElType("character"); setSavePhase("naming"); }}
                  className="flex items-center gap-2 px-3 py-2 text-xs rounded-md hover:bg-accent transition-colors text-left">
                  <UserIcon className="w-3.5 h-3.5" /> Character
                </button>
                <button onClick={() => { setSaveElType("location"); setSavePhase("naming"); }}
                  className="flex items-center gap-2 px-3 py-2 text-xs rounded-md hover:bg-accent transition-colors text-left">
                  <MapPin className="w-3.5 h-3.5" /> Location
                </button>
              </div>
            </>
          )}
          {(savePhase === "naming" || savePhase === "saving") && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => savePhase !== "saving" && setSavePhase("idle")} />
              <div className="absolute bottom-full left-0 mb-1 z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[180px]" onClick={e => e.stopPropagation()}>
                <p className="text-[10px] text-muted-foreground mb-2">Name this {saveElType}</p>
                <input ref={saveNameRef} value={saveElName} onChange={e => setSaveElName(e.target.value)}
                  placeholder={saveElType === "character" ? "e.g. Sarah" : "e.g. Rooftop"}
                  disabled={savePhase === "saving"}
                  className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background outline-none focus:border-primary mb-1 disabled:opacity-50"
                  onKeyDown={e => { if (e.key === "Enter") handleSaveAsElement(); }}
                />
                {saveError && <p className="text-[9px] text-destructive mb-1">{saveError}</p>}
                <p className="text-[9px] text-muted-foreground">
                  {savePhase === "saving" ? "Saving…" : "Press Enter to save"}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Run node */}
        <RunNodeButton nodeId={id} isExecuting={isExecuting} disabled={data.readOnly} compact />
      </div>

      {/* Output Handle */}
      <ConnectedHandle
        type="source"
        position={Position.Right}
        id="image"
        data-connector-type="image"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(ImageUploadNode);
