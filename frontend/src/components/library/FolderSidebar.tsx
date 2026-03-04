import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, Folder, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import type { Folder as FolderType } from "@/hooks/useFolders";

interface FolderSidebarProps {
  folders: FolderType[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onDropAsset: (assetId: string, folderId: string) => void;
}

export function FolderSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDropAsset,
}: FolderSidebarProps) {
  const [showInput, setShowInput] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const rowCls = (id: string, isDragOver = false) =>
    `flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors group w-full text-left ${
      isDragOver
        ? "bg-primary/20 ring-1 ring-primary"
        : selectedFolderId === id
        ? "bg-primary/10 text-primary font-medium"
        : "hover:bg-muted"
    }`;

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(folderId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear when the cursor truly leaves the button (not just moving to a child element)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverId(null);
    try {
      const payload = JSON.parse(e.dataTransfer.getData("application/asset"));
      if (payload.assetId) {
        onDropAsset(payload.assetId, folderId);
      }
    } catch {
      // ignore malformed drag data
    }
  };

  return (
    <div className="w-44 shrink-0 border-r border-border pr-3 space-y-0.5 flex flex-col">
      {/* All Assets */}
      <button className={rowCls("all")} onClick={() => onSelectFolder("all")}>
        <FolderOpen className="w-4 h-4 shrink-0" />
        <span className="truncate">All Assets</span>
      </button>

      {/* Divider */}
      {folders.length > 0 && <div className="border-t border-border my-1" />}

      {/* User folders */}
      {folders.map((folder) =>
        renamingId === folder.id ? (
          <div key={folder.id} className="flex items-center gap-1 px-1">
            <Input
              value={renamingValue}
              onChange={(e) => setRenamingValue(e.target.value)}
              className="h-6 text-xs px-1 flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && renamingValue.trim()) {
                  onRenameFolder(folder.id, renamingValue.trim());
                  setRenamingId(null);
                }
                if (e.key === "Escape") setRenamingId(null);
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 shrink-0"
              onClick={() => {
                if (renamingValue.trim()) {
                  onRenameFolder(folder.id, renamingValue.trim());
                }
                setRenamingId(null);
              }}
            >
              <Check className="w-3 h-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 shrink-0"
              onClick={() => setRenamingId(null)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <button
            key={folder.id}
            className={rowCls(folder.id, dragOverId === folder.id)}
            onClick={() => onSelectFolder(folder.id)}
            onDragOver={(e) => handleDragOver(e, folder.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, folder.id)}
          >
            <Folder className="w-4 h-4 shrink-0" />
            <span className="truncate flex-1 text-left">{folder.name}</span>
            {folder.asset_count > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">
                {folder.asset_count}
              </span>
            )}
            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
              <span
                className="p-0.5 hover:text-foreground text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(folder.id);
                  setRenamingValue(folder.name);
                }}
              >
                <Pencil className="w-3 h-3" />
              </span>
              <span
                className="p-0.5 hover:text-destructive text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(folder.id);
                }}
              >
                <Trash2 className="w-3 h-3" />
              </span>
            </div>
          </button>
        )
      )}

      {/* New folder input */}
      <div className="mt-auto pt-2">
        {showInput ? (
          <div className="space-y-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Folder name"
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  onCreateFolder(newName.trim());
                  setNewName("");
                  setShowInput(false);
                }
                if (e.key === "Escape") {
                  setShowInput(false);
                  setNewName("");
                }
              }}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                className="flex-1 h-6 text-xs"
                disabled={!newName.trim()}
                onClick={() => {
                  if (newName.trim()) {
                    onCreateFolder(newName.trim());
                    setNewName("");
                    setShowInput(false);
                  }
                }}
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => {
                  setShowInput(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground w-full"
            onClick={() => setShowInput(true)}
          >
            <Plus className="w-3 h-3" />
            New folder
          </button>
        )}
      </div>
    </div>
  );
}
