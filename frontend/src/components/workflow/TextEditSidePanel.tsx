import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipTextarea, ElementChipSuggestion } from "./chips/ChipTextarea";
import { createPortal } from "react-dom";

interface TextEditSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  nodeId?: string;
  elementChips?: ElementChipSuggestion[];
}

export function TextEditSidePanel({
  isOpen,
  onClose,
  title,
  value,
  onChange,
  placeholder = "Enter text...",
  readOnly = false,
  nodeId,
  elementChips = [],
}: TextEditSidePanelProps) {
  const [localValue, setLocalValue] = useState(value);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync local value when prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSave = () => {
    onChange(localValue);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to save
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    // Escape to close (without saving)
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(localValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const charCount = localValue.length;
  const wordCount = localValue.trim() ? localValue.trim().split(/\s+/).length : 0;

  const panelContent = (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ zIndex: 9998 }}
        onClick={onClose}
      />

      {/* Side Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-card border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ zIndex: 9999 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <Type className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {charCount} chars · {wordCount} words
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-8 px-2"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content - Full height textarea with chip support */}
        <div className="flex-1 p-6 overflow-hidden">
          <ChipTextarea
            ref={textareaRef}
            value={localValue}
            onChange={setLocalValue}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            readOnly={readOnly}
            className="w-full h-full"
            textareaClassName="flex-1 min-h-0 text-base leading-relaxed"
            elementChips={elementChips}
            onElementChipSelect={(chip) => {
              // Update activeElements on the target node (text already inserted by ChipTextarea)
              window.dispatchEvent(new CustomEvent("inject-scene-element", {
                detail: {
                  text: chip.name,
                  skipTextAppend: true,
                  targetNodeId: nodeId,
                  elementId: chip.id,
                  elementType: chip.elementType,
                  referenceImageUrls: chip.referenceImageUrls,
                },
              }));
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div className="text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">⌘/Ctrl + Enter</kbd>
            <span className="ml-2">to save</span>
            <span className="mx-2">·</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd>
            <span className="ml-2">to cancel</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={handleSave}>
                Save Changes
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );

  // Use portal to render at document body level
  if (typeof document === "undefined") return null;

  return createPortal(panelContent, document.body);
}
