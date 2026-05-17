import { logger } from "@/lib/logger";
import { memo, useState, useEffect } from "react";
import { Position, NodeProps, useReactFlow } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Button } from "@/components/ui/button";
import { ImageInputNodeData } from "../types";
import { Upload, X, Image as ImageIcon, Loader2, FolderOpen } from "lucide-react";
import { saveToLibrary } from "@/lib/api-helpers";
import { RunNodeButton } from "./RunNodeButton";

function ImageUploadNode({ data, id }: NodeProps<ImageInputNodeData>) {
  // Use imageUrl from data, which may be resolved from imageRef on workflow load
  const [imageUrl, setImageUrl] = useState<string | null>(data.imageUrl ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { setNodes } = useReactFlow();

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
        {!imageUrl && (
          <Button
            onClick={() => {
              // Dispatch event to open asset library with this node as target
              window.dispatchEvent(
                new CustomEvent("open-asset-library-inline", {
                  detail: { nodeId: id, assetType: "image" },
                })
              );
            }}
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isUploading}
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Browse Library
          </Button>
        )}
        {uploadError && (
          <p className="text-xs text-destructive">{uploadError}</p>
        )}
        {data.imageRef && !uploadError && (
          <p className="text-xs text-muted-foreground">✓ Saved to library</p>
        )}
      </div>

      <RunNodeButton nodeId={id} isExecuting={isExecuting} disabled={data.readOnly} />

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
