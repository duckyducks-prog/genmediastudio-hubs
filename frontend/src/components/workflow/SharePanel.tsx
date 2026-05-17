import { useState, useEffect, useCallback } from "react";
import {
  Type, Image as ImageIcon, Video as VideoIcon,
  Sparkles, RefreshCw, Copy, Check, Trash2, Loader2,
  ExternalLink, Plus, AppWindow, Eye,
} from "lucide-react";
import { SidePanel } from "@/components/ui/SidePanel";
import { Toggle } from "@/components/ui/Toggle";
import {
  createShareToken,
  listMyShareTokens,
  revokeShareToken,
  ShareToken,
} from "@/lib/shared-api";
import { NodeType } from "./types";
import { API_ENDPOINTS } from "@/lib/api-config";
import { auth } from "@/lib/firebase";

// ─── Types ────────────────────────────────────────────────────

export interface EligibleNode {
  id: string;
  type: NodeType;
  label: string;
  exposed: boolean;
  exposedLabel?: string;
  exposedHelperText?: string;
  exposedRequired?: boolean;
}

interface SharePanelProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string | null;
  workflowName: string;
  eligibleNodes: EligibleNode[];
  onToggleExposed: (nodeId: string, exposed: boolean, config?: {
    label?: string;
    helperText?: string;
    required?: boolean;
  }) => void;
  // legacy compat
  exposedNodeCount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────

function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

const NODE_ICONS: Partial<Record<NodeType, React.ReactNode>> = {
  [NodeType.Prompt]:     <Type className="w-3.5 h-3.5" />,
  [NodeType.ImageInput]: <ImageIcon className="w-3.5 h-3.5" />,
  [NodeType.VideoInput]: <VideoIcon className="w-3.5 h-3.5" />,
};

// ─── Component ────────────────────────────────────────────────

export function SharePanel({
  isOpen,
  onClose,
  workflowId,
  workflowName,
  eligibleNodes,
  onToggleExposed,
}: SharePanelProps) {
  // Share tokens
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // AI-drafted app details
  const [aiDraftedName, setAiDraftedName] = useState(false);
  const [aiDraftedDesc, setAiDraftedDesc] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);

  // Local config drafts per node
  const [nodeDrafts, setNodeDrafts] = useState<Record<string, {
    label: string; helperText: string; required: boolean;
  }>>({});

  // App details
  const [appName, setAppName] = useState(workflowName);
  const [appDescription, setAppDescription] = useState("");

  // Unsaved changes tracking
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const exposedCount = eligibleNodes.filter(n => n.exposed).length;
  const appExists = tokens.length > 0;

  // ── Load tokens ─────────────────────────────────────────────
  const loadTokens = useCallback(async () => {
    if (!workflowId) return;
    setLoadingTokens(true);
    try {
      const data = await listMyShareTokens();
      setTokens(data.tokens.filter(t => t.workflow_id === workflowId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingTokens(false);
    }
  }, [workflowId]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setAppName(workflowName);
    setAiDraftedName(false);
    setAiDraftedDesc(false);
    loadTokens();

    // Fetch AI-drafted app name + description for marketers
    const fetchAppMeta = async () => {
      if (!eligibleNodes.length) return;
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
        const res = await fetch(API_ENDPOINTS.workflowMetadata.generate, {
          method: "POST",
          headers,
          body: JSON.stringify({
            workflow_id: workflowId ?? "draft",
            nodes: eligibleNodes.map(n => ({ type: n.type, data: { label: n.label, prompt: (n as any).prompt } })),
            edges: [],
            context: "share_app",
            regenerate: false,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setAppName(data.name ?? workflowName);
          setAppDescription(data.description ?? "");
          setAiDraftedName(true);
          setAiDraftedDesc(true);
        }
      } catch { /* silent */ }
    };
    fetchAppMeta();
  }, [isOpen, workflowId, workflowName, loadTokens]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenApp = async () => {
    if (!eligibleNodes.length) return;
    setRegenLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const res = await fetch(API_ENDPOINTS.workflowMetadata.generate, {
        method: "POST",
        headers,
        body: JSON.stringify({
          workflow_id: workflowId ?? "draft",
          nodes: eligibleNodes.map(n => ({ type: n.type, data: { label: n.label } })),
          edges: [],
          context: "share_app",
          regenerate: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.name) { setAppName(data.name); setAiDraftedName(true); }
        setAppDescription(data.description ?? "");
        setAiDraftedDesc(true);
      }
    } catch { /* silent */ }
    finally { setRegenLoading(false); }
  };

  // Initialise drafts from node data
  useEffect(() => {
    const drafts: Record<string, { label: string; helperText: string; required: boolean }> = {};
    eligibleNodes.forEach(n => {
      drafts[n.id] = {
        label: n.exposedLabel ?? n.label,
        helperText: n.exposedHelperText ?? "",
        required: n.exposedRequired ?? false,
      };
    });
    setNodeDrafts(drafts);
  }, [eligibleNodes]);

  // ── Handlers ────────────────────────────────────────────────
  const handleToggle = (node: EligibleNode, val: boolean) => {
    onToggleExposed(node.id, val, nodeDrafts[node.id]);
    setHasUnsaved(true);
  };

  const updateDraft = (nodeId: string, field: "label" | "helperText" | "required", value: string | boolean) => {
    setNodeDrafts(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], [field]: value } }));
    setHasUnsaved(true);
  };

  const flushDraft = (nodeId: string) => {
    const node = eligibleNodes.find(n => n.id === nodeId);
    if (node?.exposed) onToggleExposed(nodeId, true, nodeDrafts[nodeId]);
  };

  const handleCreate = async () => {
    if (!workflowId) return;
    setCreating(true);
    setError(null);
    try {
      await createShareToken(workflowId, appName || workflowName);
      await loadTokens();
      setHasUnsaved(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      await revokeShareToken(token);
      setTokens(prev => prev.filter(t => t.token !== token));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(shareUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // ── Derived CTA state ────────────────────────────────────────
  const baseBlocked = !workflowId || exposedCount === 0 || !appName.trim();
  const ctaDisabled = creating || baseBlocked || (appExists && !hasUnsaved);
  const previewDisabled = baseBlocked;

  const ctaHint = !workflowId
    ? "Save the workflow first"
    : exposedCount === 0
    ? "Expose at least one input to create an app"
    : !appName.trim()
    ? "Give your app a name"
    : appExists && !hasUnsaved
    ? "No changes to save"
    : appExists
    ? "Recipients will see updates after saving"
    : "Creates the app and a link your recipients can use";

  const handlePreview = () => {
    if (!workflowId) return;
    window.open(`${window.location.origin}/preview/${workflowId}`, "_blank");
  };

  const blockedReason = !workflowId
    ? "Save the workflow first"
    : exposedCount === 0
    ? "Expose at least one input to preview"
    : !appName.trim()
    ? "Give your app a name to preview"
    : undefined;

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Make into app" subtitle={workflowName} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, overflowY: "auto", scrollbarWidth: "thin" }}>

        {error && (
          <div style={{ background: "rgba(255,72,0,0.08)", border: "1px solid rgba(255,72,0,0.25)", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#FF6B33" }}>
            {error}
          </div>
        )}

        {/* ── Inputs ─────────────────────────────────────────── */}
        <section className="settings-section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p className="settings-section-label">Inputs</p>
            {eligibleNodes.length > 0 && (
              <span className="mia-count-pill">{exposedCount} of {eligibleNodes.length} exposed</span>
            )}
          </div>

          {eligibleNodes.length === 0 ? (
            <div className="mia-empty">
              <div className="mia-empty-icon">
                <AppWindow className="w-5 h-5" style={{ color: "rgba(185,205,190,0.5)" }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0 }}>
                Add an input node to make this into an app
              </p>
              <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: 0, lineHeight: 1.4, maxWidth: 280 }}>
                Your workflow needs at least one Text, Image, or Video input that recipients can fill in.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {eligibleNodes.map(node => {
                const draft = nodeDrafts[node.id] ?? { label: node.label, helperText: "", required: false };
                return node.exposed ? (
                  /* Expanded (exposed) */
                  <div key={node.id} className="mia-node-row expanded">
                    <div className="mia-node-header">
                      <div className="mia-node-icon">{NODE_ICONS[node.type] ?? <Type className="w-3.5 h-3.5" />}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {draft.label || node.label}
                        </p>
                        <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: 0 }}>
                          {node.type === NodeType.Prompt ? "Text Input" : node.type === NodeType.ImageInput ? "Image Input" : "Video Input"}
                        </p>
                      </div>
                      <Toggle size="sm" checked={true} onChange={() => handleToggle(node, false)} label="Expose" />
                    </div>
                    <div className="mia-node-config">
                      <div className="mia-config-field">
                        <label className="mia-config-label">Label shown to recipient</label>
                        <input
                          className="mia-config-input"
                          value={draft.label}
                          placeholder={node.label}
                          onChange={e => updateDraft(node.id, "label", e.target.value)}
                          onBlur={() => flushDraft(node.id)}
                        />
                      </div>
                      <div className="mia-config-field">
                        <label className="mia-config-label">Helper text (optional)</label>
                        <input
                          className="mia-config-input"
                          value={draft.helperText}
                          placeholder="Brief guidance for the recipient"
                          onChange={e => updateDraft(node.id, "helperText", e.target.value)}
                          onBlur={() => flushDraft(node.id)}
                        />
                      </div>
                      <div className="mia-meta-row">
                        <Toggle size="sm" checked={draft.required} onChange={v => { updateDraft(node.id, "required", v); flushDraft(node.id); }} label="Required" />
                        <span>Required</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Collapsed (not exposed) */
                  <div key={node.id} className="mia-node-row">
                    <div className="mia-node-icon">{NODE_ICONS[node.type] ?? <Type className="w-3.5 h-3.5" />}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {node.label}
                      </p>
                      <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: 0 }}>Not exposed</p>
                    </div>
                    <Toggle size="sm" checked={false} onChange={() => handleToggle(node, true)} label="Expose" />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {eligibleNodes.length > 0 && (
          <>
            <div className="settings-divider" />

            {/* ── App details ──────────────────────────────────── */}
            <section className="settings-section">
              <p className="settings-section-label">App details</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>App name</label>
                  {aiDraftedName && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      fontSize: 9, color: "hsl(var(--primary))", fontWeight: 500,
                      background: "rgba(185,205,190,0.1)", borderRadius: 4,
                      padding: "1px 5px",
                    }}>
                      <Sparkles className="w-2.5 h-2.5" />
                      AI
                    </span>
                  )}
                </div>
                <input
                  className="mia-config-input"
                  value={appName}
                  placeholder="What recipients will see"
                  onChange={e => { setAppName(e.target.value); setHasUnsaved(true); setAiDraftedName(false); }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>
                    Description{" "}
                    <span style={{ fontWeight: 400 }}>(optional)</span>
                  </label>
                  {aiDraftedDesc && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      fontSize: 9, color: "hsl(var(--primary))", fontWeight: 500,
                      background: "rgba(185,205,190,0.1)", borderRadius: 4,
                      padding: "1px 5px",
                    }}>
                      <Sparkles className="w-2.5 h-2.5" />
                      AI
                    </span>
                  )}
                  <button
                    onClick={handleRegenApp}
                    disabled={regenLoading}
                    title="Regenerate with AI"
                    style={{
                      marginLeft: "auto", display: "flex", alignItems: "center", gap: 3,
                      background: "none", border: "none", cursor: regenLoading ? "default" : "pointer",
                      padding: "2px 4px", borderRadius: 4, fontFamily: "inherit",
                      fontSize: 9, color: "hsl(var(--muted-foreground))", transition: "color 120ms",
                    }}
                    onMouseEnter={e => { if (!regenLoading) (e.currentTarget.style.color = "hsl(var(--primary))"); }}
                    onMouseLeave={e => (e.currentTarget.style.color = "hsl(var(--muted-foreground))")}
                  >
                    {regenLoading
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <RefreshCw className="w-3 h-3" />}
                    Regen
                  </button>
                </div>
                <textarea
                  className="mia-config-input"
                  style={{ resize: "vertical", minHeight: 54, lineHeight: 1.4 }}
                  value={appDescription}
                  placeholder="Help recipients understand what this app does"
                  onChange={e => { setAppDescription(e.target.value); setHasUnsaved(true); setAiDraftedDesc(false); }}
                />
              </div>
            </section>

            {/* ── Share links ───────────────────────────────────── */}
            {tokens.length > 0 && (
              <>
                <div className="settings-divider" />
                <section className="settings-section">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p className="settings-section-label">Share links</p>
                    <span className="mia-count-pill">{tokens.length} active</span>
                  </div>

                  {loadingTokens ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {tokens.map(t => (
                        <div key={t.token} className="mia-share-card">
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0 }}>
                                Share link
                              </p>
                              <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: 0 }}>
                                Created {new Date(t.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                              <button className="mia-icon-btn" title="Open app" onClick={() => window.open(shareUrl(t.token), "_blank")}>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                              <button className="mia-icon-btn" title="Revoke link" onClick={() => handleRevoke(t.token)} style={{ color: "#FF4800" }}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <div className="mia-share-url">
                            <span className="mia-share-url-text">{shareUrl(t.token)}</span>
                            <button className="mia-icon-btn" title="Copy link" onClick={() => handleCopy(t.token)}>
                              {copiedToken === t.token
                                ? <Check className="w-3 h-3" style={{ color: "#10b981" }} />
                                : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Create another link */}
                      <button
                        onClick={handleCreate}
                        disabled={creating}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 9px", background: "none", border: "none", cursor: "pointer", borderRadius: 7, fontFamily: "inherit", fontSize: 11, color: "hsl(var(--primary))", transition: "background 120ms", width: "100%" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(185,205,190,0.08)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <Plus className="w-3 h-3" />
                        Create another share link
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* ── Preview + Primary CTA ─────────────────────────── */}
            <div style={{ marginTop: "auto", paddingTop: 4 }}>
              <div className="mia-cta-row">
                <button
                  className="mia-btn-preview"
                  disabled={previewDisabled}
                  onClick={handlePreview}
                  title={blockedReason ?? "Open recipient view in a new tab"}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </button>
                <button
                  className="mia-primary-cta"
                  disabled={ctaDisabled}
                  onClick={handleCreate}
                >
                  {creating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{appExists ? "Saving…" : "Creating…"}</>
                  ) : appExists ? (
                    <><RefreshCw className="w-4 h-4" />Save changes</>
                  ) : (
                    <><Sparkles className="w-4 h-4" />Create share link</>
                  )}
                </button>
              </div>
              <p className={`mia-cta-hint${hasUnsaved && appExists ? " pending" : ""}`}>
                {hasUnsaved && appExists ? "Unsaved changes" : ctaHint}
              </p>
            </div>
          </>
        )}
      </div>
    </SidePanel>
  );
}
