import { useEffect, useRef, useState } from "react";
import { Trash2, Copy, Tag, X, Settings, ClipboardPaste, Package } from "lucide-react";

interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  currentLabel?: string;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onSetLabel: (nodeId: string, label: string | undefined) => void;
  onCopyConfig?: (nodeId: string) => void;
  onPasteConfig?: (nodeId: string) => void;
  onCreateCompound?: () => void;
  hasMultipleSelected?: boolean;
}

export function NodeContextMenu({
  x,
  y,
  nodeId,
  currentLabel,
  onClose,
  onDelete,
  onDuplicate,
  onSetLabel,
  onCopyConfig,
  onPasteConfig,
  onCreateCompound,
  hasMultipleSelected = false,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(currentLabel || "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Focus input when editing label
  useEffect(() => {
    if (isEditingLabel && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingLabel]);

  const handleLabelSubmit = () => {
    const trimmedLabel = labelValue.trim();
    onSetLabel(nodeId, trimmedLabel || undefined);
    onClose();
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLabelSubmit();
    } else if (e.key === "Escape") {
      setIsEditingLabel(false);
      setLabelValue(currentLabel || "");
    }
  };

  const menuItems = [
    {
      label: currentLabel ? "Edit Label" : "Add Label",
      icon: Tag,
      onClick: () => setIsEditingLabel(true),
    },
    ...(onCopyConfig ? [{
      label: "Copy Configuration",
      icon: Settings,
      onClick: () => {
        onCopyConfig(nodeId);
        onClose();
      },
    }] : []),
    ...(onPasteConfig ? [{
      label: "Paste Configuration",
      icon: ClipboardPaste,
      onClick: () => {
        onPasteConfig(nodeId);
        onClose();
      },
    }] : []),
    ...(onCreateCompound && hasMultipleSelected ? [{
      label: "Create Compound Node",
      icon: Package,
      onClick: () => {
        onCreateCompound();
        onClose();
      },
    }] : []),
    {
      label: "Duplicate",
      icon: Copy,
      onClick: () => {
        onDuplicate(nodeId);
        onClose();
      },
    },
    {
      label: "Delete",
      icon: Trash2,
      onClick: () => {
        onDelete(nodeId);
        onClose();
      },
      danger: true,
    },
  ];

  // Add "Remove Label" option if label exists
  if (currentLabel) {
    menuItems.splice(1, 0, {
      label: "Remove Label",
      icon: X,
      onClick: () => {
        onSetLabel(nodeId, undefined);
        onClose();
      },
      danger: false,
    });
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] bg-card border border-border rounded-lg shadow-lg py-1 overflow-hidden"
      style={{
        left: x,
        top: y,
      }}
    >
      {isEditingLabel ? (
        <div className="px-2 py-2">
          <label className="text-xs text-muted-foreground block mb-1">
            Node Label
          </label>
          <input
            ref={inputRef}
            type="text"
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onKeyDown={handleLabelKeyDown}
            onBlur={handleLabelSubmit}
            placeholder="Enter label..."
            className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
            maxLength={30}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Press Enter to save
          </p>
        </div>
      ) : (
        menuItems.map((item, index) => (
          <button
            key={index}
            onClick={item.onClick}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors ${
              item.danger ? "text-destructive hover:text-destructive" : ""
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))
      )}
    </div>
  );
}
