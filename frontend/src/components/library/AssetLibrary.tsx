import {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { SidePanel } from "@/components/ui/SidePanel";
import { TabPill } from "@/components/ui/TabPill";
import { Button } from "@/components/ui/button";
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
  Download,
  Search,
  Trash2,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  X,
  RefreshCw,
  Archive,
  Plus,
  Copy,
  CheckCircle2,
  Circle,
  Workflow as WorkflowIcon,
  FolderPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS } from "@/lib/api-config";
import { logger } from "@/lib/logger";
import { useFolders } from "@/hooks/useFolders";

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
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [folderSelectMode, setFolderSelectMode] = useState(false);
    const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
    const [showMovePicker, setShowMovePicker] = useState(false);
    const [deletingFolderWithContentsId, setDeletingFolderWithContentsId] = useState<string | null>(null);
    const [creatingFolderForAsset, setCreatingFolderForAsset] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();

    const {
      folders,
      fetchFolders,
      createFolder,
      renameFolder: _renameFolder,
      deleteFolder,
      deleteFolderWithContents,
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
          if (data.assets?.[0]) console.log("[DEBUG] created_at sample:", data.assets[0].created_at);

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

    // Filter and sort assets
    useEffect(() => {
      let result = filter === "all" ? assets : assets.filter((a) => a.asset_type === filter);
      result = [...result].sort((a, b) => {
        const aTime = new Date(a.created_at.replace(" ", "T")).getTime();
        const bTime = new Date(b.created_at.replace(" ", "T")).getTime();
        return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
      });
      setFilteredAssets(result);
    }, [filter, assets, sortOrder]);

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
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error("Failed to fetch asset");
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `${asset.asset_type}-${asset.id}.${asset.asset_type === "image" ? "png" : "mp4"}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
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
    const _handleDownloadFolderZip = async () => {
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

    // Delete folder and all its assets permanently
    const handleDeleteFolderWithContents = async (folderId: string) => {
      try {
        await deleteFolderWithContents(folderId);
        if (selectedFolderId === folderId) setSelectedFolderId("all");
        setAssets((prev) => prev.filter((a) => a.folder_id !== folderId));
        toast({ title: "Folder and all assets deleted" });
      } catch (error) {
        toast({
          title: "Failed to delete folder",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setDeletingFolderWithContentsId(null);
      }
    };

    // Download a folder by id (used from sidebar)
    const _handleDownloadFolderById = async (folderId: string) => {
      try {
        const user = auth.currentUser;
        const token = await user?.getIdToken();
        const res = await fetch(API_ENDPOINTS.folders.downloadZip(folderId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const folder = folders.find((f) => f.id === folderId);
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
      }
    };

    // Multi-select
    const _toggleSelectMode = () => {
      setIsSelectMode((prev) => !prev);
      setSelectedAssetIds(new Set());
    };

    const _toggleAssetSelection = (assetId: string) => {
      setSelectedAssetIds((prev) => {
        const next = new Set(prev);
        if (next.has(assetId)) next.delete(assetId);
        else next.add(assetId);
        return next;
      });
    };

    const handleBulkDelete = async () => {
      const ids = Array.from(selectedAssetIds);
      try {
        const user = auth.currentUser;
        const token = await user?.getIdToken();
        await Promise.all(
          ids.map((id) =>
            fetch(API_ENDPOINTS.library.delete(id), {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            })
          )
        );
        setAssets((prev) => prev.filter((a) => !selectedAssetIds.has(a.id)));
        setSelectedAssetIds(new Set());
        setBulkDeleteConfirm(false);
        toast({ title: `${ids.length} asset${ids.length > 1 ? "s" : ""} deleted` });
      } catch (error) {
        toast({ title: "Bulk delete failed", variant: "destructive" });
      }
    };

    const _handleBulkDownload = async () => {
      const selected = filteredAssets.filter((a) => selectedAssetIds.has(a.id));
      for (const asset of selected) {
        await handleDownload(asset);
        await new Promise((res) => setTimeout(res, 400));
      }
    };

    const _handleBulkMove = async (folderId: string | null) => {
      const ids = Array.from(selectedAssetIds);
      try {
        await Promise.all(ids.map((id) => handleMoveAsset(id, folderId)));
        setSelectedAssetIds(new Set());
        toast({ title: `${ids.length} asset${ids.length > 1 ? "s" : ""} moved` });
      } catch (error) {
        toast({ title: "Bulk move failed", variant: "destructive" });
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

    // Format date — normalize space-separated timestamps before parsing
    const formatDate = (dateString: string): string => {
      if (!dateString) return "";
      const date = new Date(dateString.replace(" ", "T"));
      if (isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const handleCopyPrompt = (prompt: string) => {
      navigator.clipboard.writeText(prompt).then(() => {
        toast({ title: "Prompt copied to clipboard" });
      }).catch(() => {
        toast({ title: "Failed to copy prompt", variant: "destructive" });
      });
    };

    // Keep unused-but-preserved backend logic accessible for future use
    void [sortOrder, setSortOrder, isSelectMode, setIsSelectMode, _renameFolder,
          _handleDownloadFolderZip, _handleDownloadFolderById, _toggleSelectMode,
          _toggleAssetSelection, _handleBulkDownload, _handleBulkMove];

    return (
      <>
        <SidePanel isOpen={open} onClose={() => onOpenChange(false)} title="Assets" width={580}>
          {/* Two-column body */}
          <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0 }}>

            {/* LEFT: Folder sidebar — 180px */}
            <div style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
              {/* All assets row */}
              <button
                className={`al-folder-row${selectedFolderId === "all" ? " active" : ""}`}
                onClick={() => setSelectedFolderId("all")}
              >
                <span className="al-folder-icon">
                  <Archive className="w-3 h-3" />
                </span>
                <span className="al-folder-name">All assets</span>
                <span className="al-folder-count">{assets.length}</span>
              </button>

              <div className="al-folder-divider" />

              {/* Folders header — inline + button + select toggle */}
              <div className="al-folders-header">
                <p className="al-folder-section-label" style={{ padding: 0, flex: 1 }}>Folders</p>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {folders.length > 0 && (
                    <button
                      onClick={() => { setFolderSelectMode(v => !v); setSelectedFolderIds(new Set()); }}
                      style={{ fontSize: 9, background: "none", border: "none", cursor: "pointer", color: folderSelectMode ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", fontFamily: "inherit", padding: "1px 4px" }}
                    >
                      {folderSelectMode ? "Done" : "Select"}
                    </button>
                  )}
                  <button
                    className="al-new-folder-inline"
                    aria-label="New folder"
                    onClick={() => setCreatingFolderForAsset("__new__")}
                  >
                    <Plus className="w-3 h-3" />
                    <span className="al-tooltip">New folder</span>
                  </button>
                </div>
              </div>

              {folders.map((folder) => {
                const isChecked = selectedFolderIds.has(folder.id);
                return (
                  <div key={folder.id}
                    className={`al-folder-row${!folderSelectMode && selectedFolderId === folder.id ? " active" : ""}${folderSelectMode && isChecked ? " active" : ""}`}
                    style={{ position: "relative" }}
                    onClick={() => {
                      if (folderSelectMode) {
                        setSelectedFolderIds(prev => {
                          const next = new Set(prev);
                          next.has(folder.id) ? next.delete(folder.id) : next.add(folder.id);
                          return next;
                        });
                      } else {
                        setSelectedFolderId(folder.id);
                      }
                    }}
                  >
                    {folderSelectMode ? (
                      <span className="al-folder-icon" style={{ color: isChecked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                        {isChecked ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                      </span>
                    ) : (
                      <span className="al-folder-icon"><Archive className="w-3 h-3" /></span>
                    )}
                    <span className="al-folder-name">{folder.name}</span>
                    {!folderSelectMode && (
                      <>
                        <span className="al-folder-count al-count-hide">{folder.asset_count ?? ""}</span>
                        <button className="al-folder-overflow" onClick={(e) => { e.stopPropagation(); setDeletingFolderId(folder.id); }} title="Delete folder">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Bulk folder actions */}
              {folderSelectMode && selectedFolderIds.size > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 4px 4px", borderTop: "1px solid rgba(185,205,190,0.08)", marginTop: 4 }}>
                  <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: 0, paddingLeft: 4 }}>{selectedFolderIds.size} selected</p>
                  <button className="al-folder-row" style={{ color: "hsl(var(--primary))" }}
                    onClick={async () => {
                      for (const id of selectedFolderIds) await _handleDownloadFolderById(id);
                      setSelectedFolderIds(new Set()); setFolderSelectMode(false);
                    }}>
                    <Download className="w-3 h-3" /><span className="al-folder-name">Download all</span>
                  </button>
                  <button className="al-folder-row" style={{ color: "#FF4800" }}
                    onClick={() => { for (const id of selectedFolderIds) setDeletingFolderId(id); setSelectedFolderIds(new Set()); setFolderSelectMode(false); }}>
                    <Trash2 className="w-3 h-3" /><span className="al-folder-name">Delete selected</span>
                  </button>
                  {onAddAssetNode && (
                    <button className="al-folder-row" style={{ color: "hsl(var(--primary))" }}
                      onClick={() => {
                        assets.filter(a => selectedFolderIds.has(a.folder_id ?? "")).forEach(a => onAddAssetNode(a));
                        setSelectedFolderIds(new Set()); setFolderSelectMode(false);
                        onOpenChange(false);
                      }}>
                      <Plus className="w-3 h-3" /><span className="al-folder-name">Add to workflow</span>
                    </button>
                  )}
                </div>
              )}

              {/* Inline new-folder input — appears below folder list */}
              {creatingFolderForAsset === "__new__" && (
                <div className="al-new-folder-input">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="Folder name…"
                    className="al-folder-name-input"
                    onKeyDown={async e => {
                      if (e.key === "Enter" && newFolderName.trim()) {
                        try {
                          await createFolder(newFolderName.trim());
                          toast({ title: `Folder "${newFolderName.trim()}" created` });
                          setNewFolderName("");
                          setCreatingFolderForAsset(null);
                        } catch (err) {
                          toast({ title: "Failed to create folder", variant: "destructive" });
                        }
                      }
                      if (e.key === "Escape") { setNewFolderName(""); setCreatingFolderForAsset(null); }
                    }}
                  />
                </div>
              )}
            </div>

            {/* RIGHT: Content area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, position: "relative" }} className={isSelectMode ? "al-select-mode" : ""}>
              {/* Search */}
              <div className="panel-search-wrap">
                <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  placeholder="Search assets…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0" />}
                {!isLoading && (
                  <button onClick={() => fetchAssets()} title="Refresh" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "hsl(var(--muted-foreground))" }}>
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Tab pill */}
              <div>
                <TabPill
                  options={[
                    { value: "all" as const, label: "All" },
                    { value: "image" as const, label: "Images", icon: <ImageIcon className="w-3 h-3" /> },
                    { value: "video" as const, label: "Videos", icon: <VideoIcon className="w-3 h-3" /> },
                  ]}
                  value={filter}
                  onChange={setFilter}
                  ariaLabel="Asset type filter"
                />
              </div>

              {/* Asset grid */}
              <div className="al-grid-scroll">
                {filteredAssets.length === 0 && !isLoading ? (
                  <div className="panel-empty">
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? "No assets match your search" : "No assets yet"}
                    </p>
                  </div>
                ) : (
                  <div className="al-asset-grid">
                    {filteredAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className={`al-asset-card${selectedAssetIds.has(asset.id) ? " al-selected" : ""}`}
                        draggable={!isSelectMode}
                        onDragStart={(e) => !isSelectMode && handleAssetDragStart(e, asset)}
                        onClick={() => {
                          if (isSelectMode) {
                            setSelectedAssetIds(prev => { const n = new Set(prev); n.has(asset.id) ? n.delete(asset.id) : n.add(asset.id); if (n.size === 0) setIsSelectMode(false); return n; });
                          } else {
                            setPreviewAsset(asset);
                          }
                        }}
                      >
                        {/* Selection checkbox */}
                        <div
                          className="al-asset-checkbox"
                          role="checkbox"
                          aria-checked={selectedAssetIds.has(asset.id)}
                          aria-label="Select asset"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsSelectMode(true);
                            setSelectedAssetIds(prev => { const n = new Set(prev); n.has(asset.id) ? n.delete(asset.id) : n.add(asset.id); if (n.size === 0) setIsSelectMode(false); return n; });
                          }}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                        {/* Thumbnail */}
                        <div className="al-asset-thumb">
                          {asset.asset_type === "image" ? (
                            <img
                              src={asset.url}
                              alt={asset.prompt}
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          ) : (
                            <video
                              src={asset.url}
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          )}
                          <div className="al-type-badge">
                            {asset.asset_type === "image"
                              ? <ImageIcon className="w-2.5 h-2.5" />
                              : <VideoIcon className="w-2.5 h-2.5" />}
                          </div>
                        </div>

                        {/* Metadata */}
                        <div className="al-asset-meta">
                          <div className="al-asset-title-row">
                            <p className="al-asset-title">{asset.prompt || "Untitled"}</p>
                            <div className="al-asset-actions">
                              {onAddAssetNode && (
                                <button
                                  className="al-action-btn"
                                  title="Add to workflow"
                                  onClick={(e) => { e.stopPropagation(); onAddAssetNode(asset); onOpenChange(false); }}
                                >
                                  <WorkflowIcon className="w-2.5 h-2.5" />
                                </button>
                              )}
                              <button
                                className="al-action-btn"
                                title="Download"
                                onClick={(e) => { e.stopPropagation(); handleDownload(asset); }}
                              >
                                <Download className="w-2.5 h-2.5" />
                              </button>
                              <button
                                className="al-action-btn"
                                title="Copy prompt"
                                onClick={(e) => { e.stopPropagation(); handleCopyPrompt(asset.prompt); }}
                              >
                                <Copy className="w-2.5 h-2.5" />
                              </button>
                              <button
                                className="al-action-btn al-action-danger"
                                title="Delete"
                                onClick={(e) => { e.stopPropagation(); setDeleteId(asset.id); }}
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                          <p className="al-asset-date">{formatDate(asset.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Floating bulk action bar */}
              {isSelectMode && selectedAssetIds.size > 0 && (
                <div className="al-bulk-bar">
                  <span className="al-bulk-count">
                    <span className="al-bulk-count-num">{selectedAssetIds.size}</span> selected
                  </span>
                  {/* Move to folder */}
                  <div style={{ position: "relative" }}>
                    <button className="al-bulk-action" aria-label="Move to folder"
                      onClick={() => setShowMovePicker(v => !v)}>
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span className="al-tooltip">Move to folder</span>
                    </button>
                    {showMovePicker && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowMovePicker(false)} />
                        <div style={{
                          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
                          background: "hsl(var(--card))", borderRadius: 10, padding: 6, zIndex: 20, minWidth: 160,
                          boxShadow: "-3px -3px 8px rgba(30,100,105,0.35), 3px 3px 10px rgba(0,0,0,0.7), 0 0 0 1px rgba(185,205,190,0.06)"
                        }}>
                          <p style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.1em", padding: "4px 6px 6px", margin: 0 }}>Move to folder</p>
                          {folders.map(f => (
                            <button key={f.id}
                              style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "6px 8px", background: "none", border: "none", cursor: "pointer", borderRadius: 6, fontFamily: "inherit", fontSize: 12, color: "hsl(var(--foreground))", textAlign: "left" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "rgba(185,205,190,0.08)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}
                              onClick={async () => {
                                await _handleBulkMove(f.id);
                                setShowMovePicker(false); setIsSelectMode(false); setSelectedAssetIds(new Set());
                                toast({ title: `Moved ${selectedAssetIds.size} asset${selectedAssetIds.size !== 1 ? "s" : ""} to "${f.name}"` });
                              }}>
                              <Archive className="w-3 h-3 flex-shrink-0" style={{ color: "hsl(var(--primary))" }} />
                              {f.name}
                            </button>
                          ))}
                          {folders.length === 0 && (
                            <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", padding: "6px 8px", margin: 0 }}>No folders yet</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="al-bulk-divider" />
                  {onAddAssetNode && (
                    <button className="al-bulk-action" aria-label="Add to workflow"
                      onClick={() => {
                        filteredAssets.filter(a => selectedAssetIds.has(a.id)).forEach(a => onAddAssetNode(a));
                        setIsSelectMode(false); setSelectedAssetIds(new Set()); onOpenChange(false);
                      }}>
                      <WorkflowIcon className="w-3.5 h-3.5" />
                      <span className="al-tooltip">Add to workflow</span>
                    </button>
                  )}
                  <button className="al-bulk-action" aria-label="Download"
                    onClick={() => {
                      filteredAssets.filter(a => selectedAssetIds.has(a.id)).forEach(a => handleDownload(a));
                      setIsSelectMode(false); setSelectedAssetIds(new Set());
                    }}>
                    <Download className="w-3.5 h-3.5" />
                    <span className="al-tooltip">Download</span>
                  </button>
                  <div className="al-bulk-divider" />
                  <button className="al-bulk-action danger" aria-label="Delete"
                    onClick={() => setBulkDeleteConfirm(true)}>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="al-tooltip">Delete</span>
                  </button>
                  <button className="al-bulk-done"
                    onClick={() => { setIsSelectMode(false); setSelectedAssetIds(new Set()); }}>
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </SidePanel>

        {/* Delete Asset Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone. The asset will be permanently deleted.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Folder Dialog */}
        <AlertDialog open={!!deletingFolderId} onOpenChange={() => setDeletingFolderId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
              <AlertDialogDescription>Assets in this folder will be moved to Uncategorized.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deletingFolderId && handleDeleteFolder(deletingFolderId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Folder</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Folder With Contents Confirmation */}
        <AlertDialog
          open={!!deletingFolderWithContentsId}
          onOpenChange={() => setDeletingFolderWithContentsId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Folder and All Assets?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the folder and every asset inside it.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingFolderWithContentsId && handleDeleteFolderWithContents(deletingFolderWithContentsId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation */}
        <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedAssetIds.size} asset{selectedAssetIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Preview Dialog */}
        <AlertDialog open={!!previewAsset} onOpenChange={() => setPreviewAsset(null)}>
          <AlertDialogContent className="max-w-4xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center justify-between">
                <span className="line-clamp-1">{previewAsset?.prompt || "Preview"}</span>
                <Button variant="ghost" size="icon" onClick={() => setPreviewAsset(null)}><X className="w-4 h-4" /></Button>
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="max-h-[70vh] overflow-auto">
              {previewAsset?.asset_type === "image" ? (
                <img src={previewAsset.url} alt={previewAsset.prompt} className="w-full h-auto" />
              ) : (
                <video src={previewAsset?.url} controls className="w-full h-auto" />
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
              {onAddAssetNode && previewAsset && (
                <AlertDialogAction onClick={() => { onAddAssetNode(previewAsset); setPreviewAsset(null); }}>Use in workflow</AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);

AssetLibrary.displayName = "AssetLibrary";

export default AssetLibrary;
