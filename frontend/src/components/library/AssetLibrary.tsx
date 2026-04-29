import {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Trash2,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  X,
  RefreshCw,
  Archive,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS } from "@/lib/api-config";
import { logger } from "@/lib/logger";
import { Input } from "@/components/ui/input";
import { useFolders } from "@/hooks/useFolders";
import { FolderSidebar } from "./FolderSidebar";

interface Asset {
  id: string;
  url: string;
  asset_type: "image" | "video";
  prompt: string;
  created_at: string;
  mime_type: string;
  folder_id?: string | null;
}

interface AssetLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddAssetNode?: (asset: Asset) => void;
}

export interface AssetLibraryRef {
  refresh: () => void;
}

const AssetLibrary = forwardRef<AssetLibraryRef, AssetLibraryProps>(
  ({ open, onOpenChange, onAddAssetNode }, ref) => {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [filteredAssets, setFilteredAssets] = useState<Asset[]>([]);
    const [filter, setFilter] = useState<"all" | "image" | "video">("all");
    const [isLoading, setIsLoading] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
    const [isDownloadingZip, setIsDownloadingZip] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
    const [creatingFolderForAsset, setCreatingFolderForAsset] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState("");
    const { toast } = useToast();

    const {
      folders,
      fetchFolders,
      createFolder,
      renameFolder,
      deleteFolder,
      moveAssetToFolder,
    } = useFolders();

    // Fetch assets from API
    const fetchAssets = useCallback(
      async (assetType?: "image" | "video") => {
        setIsLoading(true);
        try {
          const folderId = selectedFolderId === "all" ? undefined : selectedFolderId;
          const url = API_ENDPOINTS.library.list(assetType, folderId);

          logger.debug("[DEBUG] Fetching assets from:", url);

          const user = auth.currentUser;
          const token = await user?.getIdToken();

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          logger.debug("[DEBUG] Library response status:", response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error("[DEBUG] Library error response:", errorText);
            throw new Error(`Failed to fetch assets: ${response.status}`);
          }

          const data = await response.json();
          logger.debug("[DEBUG] Library data received:", data);
          logger.debug("[DEBUG] Number of assets:", data.assets?.length || 0);

          setAssets(data.assets || []);
          setFilteredAssets(data.assets || []);
        } catch (error) {
          console.error("Error fetching assets:", error);
          toast({
            title: "Failed to load assets",
            description:
              error instanceof Error ? error.message : "Unknown error",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
        }
      },
      [toast, selectedFolderId],
    );

    // Expose refresh function to parent
    useImperativeHandle(
      ref,
      () => ({
        refresh: () => {
          logger.debug("[AssetLibrary] External refresh triggered");
          fetchAssets();
        },
      }),
      [fetchAssets],
    );

    // Load assets and folders when panel opens
    useEffect(() => {
      if (open) {
        logger.debug("[AssetLibrary] Panel opened, fetching assets and folders");
        fetchAssets();
        fetchFolders();
      }
    }, [open, fetchAssets, fetchFolders]);

    // Re-fetch assets when selected folder changes
    useEffect(() => {
      if (open) {
        fetchAssets();
      }
    }, [selectedFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Filter assets based on selected type filter
    useEffect(() => {
      if (filter === "all") {
        setFilteredAssets(assets);
      } else {
        setFilteredAssets(
          assets.filter((asset) => asset.asset_type === filter),
        );
      }
    }, [filter, assets]);

    // Delete asset
    const handleDelete = async (id: string) => {
      try {
        const user = auth.currentUser;
        const token = await user?.getIdToken();

        const response = await fetch(API_ENDPOINTS.library.delete(id), {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to delete asset: ${response.status}`);
        }

        setAssets(assets.filter((asset) => asset.id !== id));
        toast({
          title: "Asset deleted",
          description: "The asset has been removed from your library",
        });
      } catch (error) {
        console.error("Error deleting asset:", error);
        toast({
          title: "Failed to delete asset",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setDeleteId(null);
      }
    };

    // Download asset
    const handleDownload = async (asset: Asset) => {
      try {
        const link = document.createElement("a");
        link.href = asset.url;
        link.download = `${asset.asset_type}-${asset.id}.${asset.asset_type === "image" ? "png" : "mp4"}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        console.error("Download error:", error);
        toast({
          title: "Download failed",
          description: "Could not download the asset",
          variant: "destructive",
        });
      }
    };

    // Move asset to folder
    const handleMoveAsset = async (assetId: string, folderId: string | null) => {
      try {
        await moveAssetToFolder(assetId, folderId);
        setAssets((prev) =>
          prev.map((a) => (a.id === assetId ? { ...a, folder_id: folderId } : a))
        );
        // If we're filtered to a specific folder, remove the moved asset from view
        if (selectedFolderId !== "all") {
          setFilteredAssets((prev) => prev.filter((a) => a.id !== assetId));
          setAssets((prev) => prev.filter((a) => a.id !== assetId));
        }
        toast({ title: "Moved to folder" });
      } catch (error) {
        toast({
          title: "Failed to move asset",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    };

    // Download folder as zip
    const handleDownloadFolderZip = async () => {
      if (selectedFolderId === "all" || isDownloadingZip) return;
      setIsDownloadingZip(true);
      try {
        const user = auth.currentUser;
        const token = await user?.getIdToken();
        const res = await fetch(API_ENDPOINTS.folders.downloadZip(selectedFolderId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const folder = folders.find((f) => f.id === selectedFolderId);
        link.download = `${folder?.name ?? "folder"}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        toast({
          title: "Download failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsDownloadingZip(false);
      }
    };

    // Delete folder
    const handleDeleteFolder = async (folderId: string) => {
      try {
        await deleteFolder(folderId);
        // If we were viewing the deleted folder, go back to all
        if (selectedFolderId === folderId) {
          setSelectedFolderId("all");
        }
        toast({ title: "Folder deleted", description: "Assets moved to Uncategorized" });
      } catch (error) {
        toast({
          title: "Failed to delete folder",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setDeletingFolderId(null);
      }
    };

    // Handle asset drag start
    const handleAssetDragStart = useCallback(
      (event: React.DragEvent, asset: Asset) => {
        const payload = {
          type: "asset-drop",
          assetId: asset.id,
          assetType: asset.asset_type,
          url: asset.url,
          mimeType: asset.mime_type,
        };
        event.dataTransfer.setData(
          "application/asset",
          JSON.stringify(payload),
        );
        event.dataTransfer.effectAllowed = "copy";
        logger.debug("[AssetLibrary] Drag started:", payload);
      },
      [],
    );

    // Format date
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    return (
      <>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-3xl overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>Asset Library</SheetTitle>
              <SheetDescription>
                View, download, and manage your generated images and videos
              </SheetDescription>
            </SheetHeader>

            <div className="flex mt-4 gap-4 h-[calc(100%-5rem)]">
              {/* Folder Sidebar */}
              <FolderSidebar
                folders={folders}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                onCreateFolder={async (name) => {
                  try {
                    await createFolder(name);
                    toast({ title: `Folder "${name}" created` });
                  } catch (error) {
                    toast({
                      title: "Failed to create folder",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    });
                  }
                }}
                onRenameFolder={async (id, name) => {
                  try {
                    await renameFolder(id, name);
                  } catch (error) {
                    toast({
                      title: "Failed to rename folder",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    });
                  }
                }}
                onDeleteFolder={(id) => setDeletingFolderId(id)}
                onDropAsset={(assetId, folderId) => handleMoveAsset(assetId, folderId)}
              />

              {/* Main content */}
              <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
                {/* Toolbar */}
                <div className="flex gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchAssets()}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    <RefreshCw
                      className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                  {selectedFolderId !== "all" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadFolderZip}
                      disabled={isDownloadingZip || filteredAssets.length === 0}
                      title="Download folder as zip"
                    >
                      {isDownloadingZip ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Archive className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>

                {/* Filters */}
                <Tabs
                  value={filter}
                  onValueChange={(v) => setFilter(v as any)}
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="image">Images</TabsTrigger>
                    <TabsTrigger value="video">Videos</TabsTrigger>
                  </TabsList>

                  <TabsContent value={filter} className="mt-6">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      </div>
                    ) : filteredAssets.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                        <p className="text-lg font-medium mb-2">No assets yet</p>
                        <p className="text-sm">
                          {filter === "all"
                            ? "Generate images or videos and save them to your library"
                            : `Generate ${filter}s and save them to your library`}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                          >
                            {/* Thumbnail */}
                            <div
                              className="relative aspect-video bg-muted cursor-grab active:cursor-grabbing"
                              draggable
                              onDragStart={(e) => handleAssetDragStart(e, asset)}
                              onClick={() => setPreviewAsset(asset)}
                            >
                              {asset.asset_type === "image" ? (
                                <img
                                  src={asset.url}
                                  alt={asset.prompt}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    console.error(
                                      "[AssetLibrary] Image failed to load:",
                                      asset.url,
                                    );
                                    e.currentTarget.src =
                                      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" fill="%23999" font-family="monospace" font-size="12"%3EError%3C/text%3E%3C/svg%3E';
                                  }}
                                />
                              ) : (
                                <video
                                  src={asset.url}
                                  className="w-full h-full object-cover"
                                  onError={() => {
                                    console.error(
                                      "[AssetLibrary] Video failed to load:",
                                      asset.url,
                                    );
                                  }}
                                />
                              )}
                              {/* Type Badge */}
                              <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1.5">
                                {asset.asset_type === "image" ? (
                                  <ImageIcon className="w-4 h-4" />
                                ) : (
                                  <VideoIcon className="w-4 h-4" />
                                )}
                              </div>
                            </div>

                            {/* Info */}
                            <div className="p-3 space-y-2">
                              <p className="text-sm font-medium line-clamp-2">
                                {asset.prompt || "No prompt"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(asset.created_at)}
                              </p>

                              {/* Actions */}
                              <div className="flex gap-2">
                                {onAddAssetNode && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => {
                                      onAddAssetNode(asset);
                                      toast({
                                        title: "Added to workflow",
                                        description:
                                          "Asset node created on the canvas",
                                      });
                                    }}
                                    className="flex-1"
                                  >
                                    Add to Workflow
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownload(asset)}
                                  className={onAddAssetNode ? "" : "flex-1"}
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setDeleteId(asset.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>

                              {/* Folder selector */}
                              {creatingFolderForAsset === asset.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    placeholder="Folder name"
                                    className="h-7 text-xs flex-1"
                                    autoFocus
                                    onKeyDown={async (e) => {
                                      if (e.key === "Enter" && newFolderName.trim()) {
                                        try {
                                          const folder = await createFolder(newFolderName.trim());
                                          await handleMoveAsset(asset.id, folder.id);
                                        } catch (err) {
                                          toast({ title: "Failed to create folder", variant: "destructive" });
                                        }
                                        setNewFolderName("");
                                        setCreatingFolderForAsset(null);
                                      }
                                      if (e.key === "Escape") {
                                        setNewFolderName("");
                                        setCreatingFolderForAsset(null);
                                      }
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs px-2"
                                    disabled={!newFolderName.trim()}
                                    onClick={async () => {
                                      if (!newFolderName.trim()) return;
                                      try {
                                        const folder = await createFolder(newFolderName.trim());
                                        await handleMoveAsset(asset.id, folder.id);
                                      } catch (err) {
                                        toast({ title: "Failed to create folder", variant: "destructive" });
                                      }
                                      setNewFolderName("");
                                      setCreatingFolderForAsset(null);
                                    }}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs px-2"
                                    onClick={() => {
                                      setNewFolderName("");
                                      setCreatingFolderForAsset(null);
                                    }}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Select
                                  value={asset.folder_id ?? "__unset__"}
                                  onValueChange={(val) => {
                                    if (val === "__create__") {
                                      setCreatingFolderForAsset(asset.id);
                                      return;
                                    }
                                    handleMoveAsset(asset.id, val === "__remove__" ? null : val);
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Add to folder…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {asset.folder_id && (
                                      <SelectItem value="__remove__">
                                        Remove from folder
                                      </SelectItem>
                                    )}
                                    {folders.map((f) => (
                                      <SelectItem key={f.id} value={f.id}>
                                        {f.name}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="__create__">
                                      <span className="flex items-center gap-1">
                                        <Plus className="w-3 h-3" />
                                        Create Folder
                                      </span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Delete Asset Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                asset from your library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && handleDelete(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Folder Confirmation */}
        <AlertDialog
          open={!!deletingFolderId}
          onOpenChange={() => setDeletingFolderId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
              <AlertDialogDescription>
                All assets in this folder will be moved to Uncategorized. The
                assets themselves will not be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  deletingFolderId && handleDeleteFolder(deletingFolderId)
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Folder
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Preview Dialog */}
        <AlertDialog
          open={!!previewAsset}
          onOpenChange={() => setPreviewAsset(null)}
        >
          <AlertDialogContent className="max-w-4xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center justify-between">
                <span className="line-clamp-1">
                  {previewAsset?.prompt || "Preview"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPreviewAsset(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="max-h-[70vh] overflow-auto">
              {previewAsset?.asset_type === "image" ? (
                <img
                  src={previewAsset.url}
                  alt={previewAsset.prompt}
                  className="w-full h-auto"
                  onError={() => {
                    console.error(
                      "[AssetLibrary] Preview image failed to load:",
                      previewAsset.url,
                    );
                  }}
                />
              ) : (
                <video
                  src={previewAsset?.url}
                  controls
                  className="w-full h-auto"
                  onError={() => {
                    console.error(
                      "[AssetLibrary] Preview video failed to load:",
                      previewAsset?.url,
                    );
                  }}
                />
              )}
            </div>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => previewAsset && handleDownload(previewAsset)}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <AlertDialogCancel>Close</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);

AssetLibrary.displayName = "AssetLibrary";

export default AssetLibrary;
