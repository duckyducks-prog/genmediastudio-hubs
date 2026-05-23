import { logger } from "@/lib/logger";
import { memo, useState, useEffect, useRef } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { GenerateImageNodeData, NODE_CONFIGURATIONS, NodeType } from "../types";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  Sparkles,
  Loader2,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Download,
  ChevronDown,
  Power,
  FolderOpen,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { RunNodeButton } from "./RunNodeButton";
import { useFolders } from "@/hooks/useFolders";

function GenerateImageNode({ data, id }: NodeProps<GenerateImageNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.GenerateImage];
  const status = data.status || "ready";
  const isGenerating = data.isGenerating || status === "executing";
  const isCompleted = status === "completed";
  const isError = status === "error";
  const incomingImageUrl = data.imageUrl;
  const images = data.images || [];
  const isEnabled = data.enabled !== false; // Default to enabled

  // Debug logging
  useEffect(() => {
    logger.debug("[GenerateImageNode] Data updated:", {
      nodeId: id,
      status,
      isCompleted,
      hasImageUrl: !!incomingImageUrl,
      hasImages: images.length > 0,
      imageUrlPreview: incomingImageUrl
        ? incomingImageUrl.substring(0, 50)
        : "null",
      imageCount: images.length,
      allDataKeys: Object.keys(data),
    });
  }, [id, status, isCompleted, incomingImageUrl, images, data]);

  const [upscaleFactor, _setUpscaleFactor] = useState<string>("x2");
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [savedAssetId, setSavedAssetId] = useState<string | null>(data.savedAssetId || null);
  const [assignedFolderId, setAssignedFolderId] = useState<string | null>(null);
  const [_isSavingFolder, setIsSavingFolder] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const foldersFetched = useRef(false);
  const { folders, fetchFolders } = useFolders();
  const { toast } = useToast();

  // Sync savedAssetId from node data (set after generation)
  useEffect(() => {
    if (data.savedAssetId && data.savedAssetId !== savedAssetId) {
      setSavedAssetId(data.savedAssetId);
    }
  }, [data.savedAssetId]);

  // Lazy-fetch folders once when the node completes and has a saved asset
  useEffect(() => {
    if (isCompleted && savedAssetId && !foldersFetched.current) {
      foldersFetched.current = true;
      fetchFolders();
    }
  }, [isCompleted, savedAssetId, fetchFolders]);

  const imageUrl = currentImageUrl || incomingImageUrl;

  // Reset to new incoming image when workflow executes
  useEffect(() => {
    if (incomingImageUrl && incomingImageUrl !== currentImageUrl) {
      setCurrentImageUrl(null);
      setUpscaleError(null);
    }
  }, [incomingImageUrl, currentImageUrl]);

  const handleUpdate = (field: keyof GenerateImageNodeData, value: any) => {
    // Block updates in read-only mode
    if (data.readOnly) return;

    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          [field]: value,
        },
      },
    });
    window.dispatchEvent(event);
  };

  const handleToggleEnabled = () => {
    if (data.readOnly) return;
    handleUpdate("enabled", !isEnabled);
  };

  const getBorderColor = () => {
    if (!isEnabled) return "border-muted";
    if (isError) return "border-red-500";
    return "border-border";
  };

  const getStatusText = () => {
    if (isGenerating) return "Generating...";
    if (isCompleted) return "Completed";
    if (isError) return "Error";
    return "Ready";
  };

  const handleUpscale = async () => {
    if (!imageUrl || isUpscaling) return;

    setIsUpscaling(true);
    setUpscaleError(null);

    try {
      let base64Image = imageUrl;
      if (imageUrl.startsWith("data:")) {
        base64Image = imageUrl.split(",")[1];
      }

      const user = auth.currentUser;
      const token = await user?.getIdToken();

      const response = await fetch(API_ENDPOINTS.generate.upscale, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          image: base64Image,
          upscale_factor: upscaleFactor,
        }),
      });

      if (response.status === 403) {
        toast({
          title: "Access Denied",
          description: "Access denied. Contact administrator.",
          variant: "destructive",
        });
        setUpscaleError("Access denied. Contact administrator.");
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upscale failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      if (result.image) {
        const mimeType = result.mime_type || "image/png";
        setCurrentImageUrl(`data:${mimeType};base64,${result.image}`);
        if (result.saved_asset_id) {
          setSavedAssetId(result.saved_asset_id);
          setAssignedFolderId(null);
          if (!foldersFetched.current) {
            foldersFetched.current = true;
            fetchFolders();
          }
        }
        if (result.saved_to_library) {
          toast({ title: "Image upscaled", description: "Saved to your library." });
        } else {
          toast({
            title: "Image upscaled",
            description: result.save_error || "Could not save to library.",
            variant: "destructive",
          });
        }
      } else {
        throw new Error("No image returned from upscale API");
      }
    } catch (error) {
      console.error("Upscale error:", error);
      setUpscaleError(
        error instanceof Error ? error.message : "Upscale failed",
      );
    } finally {
      setIsUpscaling(false);
    }
  };

  const handleAssignFolder = async (folderId: string) => {
    if (!savedAssetId) return;
    setIsSavingFolder(true);
    try {
      const user = auth.currentUser;
      const token = await user?.getIdToken();
      const url = API_ENDPOINTS.assets.moveToFolder(savedAssetId, folderId === "__none__" ? null : folderId);
      const res = await fetch(url, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to assign folder: ${res.status}`);
      setAssignedFolderId(folderId === "__none__" ? null : folderId);
      toast({ title: "Folder assigned", description: "Asset moved successfully." });
    } catch (e) {
      toast({ title: "Failed to assign folder", variant: "destructive" });
    } finally {
      setIsSavingFolder(false);
    }
  };

  const handleDownload = async () => {
    if (!imageUrl) return;

    try {
      if (imageUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = `generated-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      try {
        const response = await fetch(imageUrl, { mode: "cors" });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `generated-image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (fetchError) {
        window.open(imageUrl, "_blank");
      }
    } catch (error) {
      console.error("Download failed:", error);
      window.open(imageUrl, "_blank");
    }
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[300px] shadow-lg transition-colors ${getBorderColor()} ${!isEnabled ? "opacity-50" : ""}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Generate Image"}
          </div>
        </div>
        <div className="flex items-center gap-1">
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
          {isGenerating && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          {isError && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      {/* Input Handles - Left side */}
      <div className="space-y-3 mb-4">
        {config.inputConnectors.map((input) => {
          const isRequired = input.required;
          const isMultiple = input.acceptsMultiple;

          return (
            <div
              key={input.id}
              className="flex items-center gap-2 relative h-6"
            >
              <ConnectedHandle
                type="target"
                position={Position.Left}
                id={input.id}
                data-connector-type={input.type}
                className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
              />
              <div className="text-xs font-medium text-muted-foreground">
                {input.label}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
                {isMultiple && (
                  <span className="text-blue-500 ml-1">(multi)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Node Content */}
      <div className="space-y-3">
        {/* Aspect Ratio Dropdown */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Aspect Ratio
          </label>
          <div className="relative">
            <select
              value={data.aspectRatio}
              onChange={(e) => handleUpdate("aspectRatio", e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md appearance-none pr-8"
              disabled={isGenerating || data.readOnly}
            >
              <option value="1:1">1:1 (Square)</option>
              <option value="16:9">16:9 (Landscape)</option>
              <option value="9:16">9:16 (Portrait)</option>
              <option value="3:4">3:4 (Portrait)</option>
              <option value="4:3">4:3 (Landscape)</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Status */}
        <div className="text-xs text-muted-foreground">
          Status: <span className="font-medium">{getStatusText()}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-3 h-3" />
          <span>Gemini 3 Pro</span>
          {data.generatedMode && (
            <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-semibold ${
              data.generatedMode === "project"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {data.generatedMode === "project" ? "Project" : "Explore"}
            </span>
          )}
        </div>

        {/* Image Preview */}
        {isCompleted && imageUrl && (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
              <img
                src={imageUrl}
                alt="Generated"
                className="w-full h-auto max-h-[200px] object-contain"
                crossOrigin={
                  imageUrl?.startsWith("data:") ? undefined : "anonymous"
                }
              />
            </div>

            {upscaleError && (
              <p className="text-xs text-destructive mt-1">{upscaleError}</p>
            )}

            {/* Icon toolbar — completed state */}
            <div className="flex items-center gap-1 px-0.5 pt-1 border-t border-border mt-1">
              <button onClick={handleDownload} className="node-tool-btn" title="Download">
                <Download className="w-3.5 h-3.5" />
                <span className="node-tool-tip">Download</span>
              </button>
              <button onClick={handleUpscale} disabled={isUpscaling || data.readOnly} className="node-tool-btn" title="Upscale">
                {isUpscaling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span className="node-tool-tip">Upscale {upscaleFactor}</span>
              </button>
              {savedAssetId && folders.length > 0 && (
                <div className="relative">
                  <button className="node-tool-btn" title="Save to folder" onClick={() => setShowFolderPicker(v => !v)}>
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span className="node-tool-tip">Save to folder</span>
                  </button>
                  {showFolderPicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowFolderPicker(false)} />
                      <div className="absolute bottom-full left-0 mb-1 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[140px]">
                        {assignedFolderId && (
                          <button onClick={() => { handleAssignFolder("__none__"); setShowFolderPicker(false); }}
                            className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent transition-colors">
                            Remove from folder
                          </button>
                        )}
                        {folders.map(f => (
                          <button key={f.id} onClick={() => { handleAssignFolder(f.id); setShowFolderPicker(false); }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors ${assignedFolderId === f.id ? "text-primary" : ""}`}>
                            {f.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="flex-1" />
              <RunNodeButton nodeId={id} isExecuting={isGenerating} disabled={data.readOnly} label="Regenerate" loadingLabel="Generating..." compact />
            </div>
          </div>
        )}

        {/* No Image Yet */}
        {!isCompleted && !imageUrl && (
          <div className="space-y-2">
            <div className="flex flex-col items-center justify-center h-[150px] border-2 border-dashed border-border rounded-lg bg-muted/30">
              <ImageIcon className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">
                {isGenerating ? "Generating..." : "No image yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {!isGenerating && "Run workflow to generate"}
              </p>
            </div>
            {/* Toolbar — idle state (only Run) */}
            <div className="flex items-center gap-1 px-0.5 pt-1 border-t border-border">
              <button disabled className="node-tool-btn" style={{opacity:0.25}} title="Download"><Download className="w-3.5 h-3.5"/></button>
              <button disabled className="node-tool-btn" style={{opacity:0.25}} title="Upscale"><Sparkles className="w-3.5 h-3.5"/></button>
              <button disabled className="node-tool-btn" style={{opacity:0.25}} title="Save to folder"><FolderOpen className="w-3.5 h-3.5"/></button>
              <div className="flex-1" />
              <RunNodeButton nodeId={id} isExecuting={isGenerating} disabled={data.readOnly} label="Generate" loadingLabel="Generating..." compact />
            </div>
          </div>
        )}

        {/* Error Display */}
        {isError && data.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}
      </div>

      {/* Output Handles - Right side */}
      <div className="space-y-2">
        <ConnectedHandle
          type="source"
          position={Position.Right}
          id="images"
          data-connector-type={config.outputConnectors[0]?.type}
          className="!w-3 !h-3 !border-2 !border-background"
          style={{ top: "40%", transform: "translateY(-50%)" }}
        />
        <ConnectedHandle
          type="source"
          position={Position.Right}
          id="image"
          data-connector-type={config.outputConnectors[1]?.type}
          className="!w-3 !h-3 !border-2 !border-background"
          style={{ top: "60%", transform: "translateY(-50%)" }}
        />
      </div>
    </div>
  );
}

export default memo(GenerateImageNode);
