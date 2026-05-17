import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { NODE_CONFIGURATIONS, NodeType } from "./types";

// Flat list of all insertable node types with metadata
const ALL_NODES = Object.entries(NODE_CONFIGURATIONS)
  .filter(([, cfg]) => cfg.label && cfg.category !== undefined)
  .map(([type, cfg]) => ({
    type: type as NodeType,
    label: cfg.label,
    category: cfg.category ?? "action",
    description: cfg.description ?? "",
  }));

interface GhostNodeSearchProps {
  position: { x: number; y: number };
  onConfirm: (nodeType: NodeType, position: { x: number; y: number }) => void;
  onCancel: () => void;
  recentTypes: NodeType[];
}

export function GhostNodeSearch({ position, onConfirm, onCancel, recentTypes }: GhostNodeSearchProps) {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? ALL_NODES.filter(n =>
        n.label.toLowerCase().includes(query.toLowerCase()) ||
        n.category.toLowerCase().includes(query.toLowerCase()) ||
        n.description.toLowerCase().includes(query.toLowerCase())
      )
    : recentTypes.length > 0
      ? recentTypes.map(t => ALL_NODES.find(n => n.type === t)).filter(Boolean) as typeof ALL_NODES
      : ALL_NODES.slice(0, 6);

  const sectionLabel = query.trim() ? "Matches" : recentTypes.length > 0 ? "Recently used" : "All nodes";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

  const doConfirm = useCallback((nodeType: NodeType) => {
    setConfirming(true);
    setTimeout(() => onConfirm(nodeType, position), 150);
  }, [onConfirm, position]);

  const doCancel = useCallback(() => {
    setCanceling(true);
    setTimeout(() => onCancel(), 150);
  }, [onCancel]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        doCancel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [doCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[focusedIndex]) doConfirm(filtered[focusedIndex].type); }
    else if (e.key === "Escape") { e.preventDefault(); doCancel(); }
  };

  const animClass = confirming ? "ghost-confirming" : canceling ? "ghost-canceling" : "ghost-appear";

  return (
    <div
      ref={containerRef}
      className={`ghost-node-search ${animClass}`}
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label="Insert a node"
    >
      {/* Search input row */}
      <div className="ghost-input-row">
        <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#B9CDBE" }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Insert a node…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="ghost-search-input"
        />
        {query && (
          <button onClick={() => setQuery("")} className="ghost-clear-btn">
            <X className="w-3 h-3" />
          </button>
        )}
        <span className="ghost-trigger-badge">/</span>
      </div>

      {/* Suggestions */}
      <p className="ghost-section-label">{sectionLabel}</p>

      {filtered.length === 0 ? (
        <div className="ghost-no-results">No matches for "{query}"</div>
      ) : (
        <div className="ghost-suggestions-list">
          {filtered.map((node, i) => (
            <button
              key={node.type}
              className={`ghost-suggestion${i === focusedIndex ? " focused" : ""}`}
              onMouseEnter={() => setFocusedIndex(i)}
              onClick={() => doConfirm(node.type)}
            >
              <span className="ghost-suggestion-name">{node.label}</span>
              <span className="ghost-suggestion-cat">{node.category}</span>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="ghost-footer">
        <span><kbd>↑↓</kbd>navigate</span>
        <span><kbd>↵</kbd>insert</span>
        <span><kbd>Esc</kbd>cancel</span>
      </div>
    </div>
  );
}
