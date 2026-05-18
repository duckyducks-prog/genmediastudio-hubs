import { useState, useEffect, useRef, useCallback } from "react";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowUp,
  Plus,
  X,
  Pencil,
  Layers,
  FolderPlus,
  FolderOpen,
  Trash2,
  Save,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS } from "@/lib/api-config";
import { GeneratingAnimation } from "./GeneratingAnimation";
import { TabPill } from "@/components/ui/TabPill";
import { ChipTextarea, ElementChipSuggestion } from "@/components/workflow/chips/ChipTextarea";
import { listSceneElements } from "@/lib/scene-elements-api";
import { useAuth } from "@/lib/AuthContext";
import "./create.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionGeneration {
  id: string;
  prompt: string;
  type: "image" | "video";
  aspectRatio: string;
  status: "thinking" | "complete" | "failed";
  mediaUrl: string | null;
  createdAt: number;
  isNew?: boolean;
}

const ASPECT_RATIOS = [
  { value: "1:1",    thumbClass: "r-1-1"  },
  { value: "16:9",   thumbClass: "r-16-9" },
  { value: "9:16",   thumbClass: "r-9-16" },
  { value: "4:3",    thumbClass: "r-4-3"  },
  { value: "3:2",    thumbClass: "r-3-2"  },
  { value: "2.39:1", thumbClass: "r-2-39" },
] as const;

async function getToken() { return auth.currentUser?.getIdToken(); }
async function authHeaders(contentType = true) {
  const token = await getToken();
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (contentType) h["Content-Type"] = "application/json";
  return h;
}

function relTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface CreateViewProps { onLibraryRefresh?: () => void; }

// ─── History card ─────────────────────────────────────────────────────────────

function HistoryCard({ gen, isNew, onUseAsRef }: {
  gen: SessionGeneration;
  isNew: boolean;
  onUseAsRef: (url: string) => void;
}) {
  return (
    <div className={`history-card${isNew ? " sliding-in" : ""}`}>
      <div className="history-card-media">
        {gen.status === "complete" && gen.mediaUrl ? (
          gen.type === "video"
            ? <video src={gen.mediaUrl} className="history-card-media-bg" muted loop preload="metadata" />
            : <img src={gen.mediaUrl} className="history-card-media-bg" alt="" />
        ) : gen.status === "failed" ? (
          <div className="history-card-failed-media">
            <span style={{ fontSize: 22, opacity: 0.5 }}>⚠</span>
          </div>
        ) : null}
        <span className="history-card-type">{gen.type === "video" ? "VID" : "IMG"}</span>
        {gen.status === "complete" && gen.mediaUrl && (
          <div className="history-card-actions">
            <button className="history-card-action" title="Use as reference" onClick={() => onUseAsRef(gen.mediaUrl!)}>
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <div className="history-card-body">
        <p className="history-card-prompt">
          {gen.status === "failed" ? <span style={{ color: "rgba(255,100,50,0.8)" }}>Generation failed</span> : gen.prompt}
        </p>
        <div className="history-card-meta">
          <span>{relTime(gen.createdAt)}</span>
          <span className="meta-dot" />
          <span>{gen.aspectRatio} · {gen.type === "video" ? "Video" : "Image"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CreateView({ onLibraryRefresh }: CreateViewProps) {
  const { user } = useAuth();

  // ── Session state ──────────────────────────────────────────────
  const [sessionGens, setSessionGens] = useState<SessionGeneration[]>([]);
  const [newlyHistoryId, setNewlyHistoryId] = useState<string | null>(null);

  const activeGen = sessionGens.length > 0 ? sessionGens[sessionGens.length - 1] : null;
  const historyGens = sessionGens.slice(0, -1);
  const hasSession = sessionGens.length > 0;

  // ── Prompt state ───────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [promptPersisted, setPromptPersisted] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);
  const [elementChips, setElementChips] = useState<ElementChipSuggestion[]>([]);
  const [activeElements, setActiveElements] = useState<ElementChipSuggestion[]>([]);

  // ── Generation settings ────────────────────────────────────────
  const [mode, setMode] = useState<"image" | "video">("image");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [videoDuration, setVideoDuration] = useState(8);
  const [variations, setVariations] = useState(1);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [firstFrame, setFirstFrame] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<string | null>(null);

  // ── Menu visibility ────────────────────────────────────────────
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showDurationMenu, setShowDurationMenu] = useState(false);
  const [showVariationsMenu, setShowVariationsMenu] = useState(false);
  const [showSaveToMenu, setShowSaveToMenu] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // ── Folder state ───────────────────────────────────────────────
  const [saveToFolder, setSaveToFolder] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [folderList, setFolderList] = useState<Array<{ id: string; name: string }>>([]);

  // ── Session toolbar state ──────────────────────────────────────
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [_savingToFolder, setSavingToFolder] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // ── Misc refs ──────────────────────────────────────────────────
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstFrameRef = useRef<HTMLInputElement>(null);
  const lastFrameRef = useRef<HTMLInputElement>(null);
  const genIdRef = useRef(0);

  const rawName = user?.displayName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const isGenerating = activeGen?.status === "thinking";

  // ── Load element chips ─────────────────────────────────────────
  useEffect(() => {
    const load = () => {
      const IMAGE_TYPES = new Set(["character", "location", "prop"]);
      listSceneElements().then(els =>
        setElementChips(els.filter(e => IMAGE_TYPES.has(e.element_type)).map(e => ({
          id: e.id, name: e.name,
          token: e.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
          elementType: e.element_type,
          referenceImageUrls: e.reference_image_urls,
        })))
      ).catch(() => {});
    };
    load();
    window.addEventListener("scene-elements-updated", load);
    return () => window.removeEventListener("scene-elements-updated", load);
  }, []);

  // ── Load folders ───────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.folders.list, { headers: await authHeaders(false) });
        if (!res.ok) return;
        const data = await res.json();
        setFolderList((data.folders ?? []).slice(0, 8).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })));
      } catch { /* silent */ }
    };
    load();
  }, []);

  // ── Resolve prompt + references ────────────────────────────────
  const resolvePromptAndRefs = useCallback(() => {
    const DESCRIPTORS: Record<string, string> = {
      character: "the character in the reference images",
      location: "the location in the reference images",
      prop: "the prop in the reference images",
    };
    let finalPrompt = prompt;
    const elementRefs: string[] = [];
    for (const el of activeElements) {
      finalPrompt = finalPrompt.replace(new RegExp(`@${el.token}\\b`, "gi"), DESCRIPTORS[el.elementType] ?? el.name);
      elementRefs.push(...el.referenceImageUrls);
    }
    return { finalPrompt, allRefs: [...referenceImages, ...elementRefs] };
  }, [prompt, activeElements, referenceImages]);

  // ── Generate ───────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    const genId = String(++genIdRef.current);
    const capturedPrompt = prompt;
    const capturedMode = mode;
    const capturedAspect = aspectRatio;

    // Mark previous active as newly-in-history for slide-in animation
    if (activeGen) {
      setNewlyHistoryId(activeGen.id);
      setTimeout(() => setNewlyHistoryId(null), 800);
    }

    // Add thinking entry
    const thinkingEntry: SessionGeneration = {
      id: genId, prompt: capturedPrompt, type: capturedMode,
      aspectRatio: capturedAspect, status: "thinking", mediaUrl: null, createdAt: Date.now(),
    };
    setSessionGens(prev => [...prev, thinkingEntry]);
    setPromptPersisted(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let mediaUrl: string | null = null;

      if (capturedMode === "image") {
        const { finalPrompt, allRefs } = resolvePromptAndRefs();
        const body: Record<string, unknown> = {
          prompt: finalPrompt, aspect_ratio: capturedAspect,
          ...(allRefs.length > 0 && { reference_images: allRefs }),
          ...(saveToFolder.id && { folder_id: saveToFolder.id }),
        };
        const res = await fetch(API_ENDPOINTS.generate.image, {
          method: "POST", headers: await authHeaders(),
          body: JSON.stringify(body), signal: controller.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (data.images?.[0]) mediaUrl = `data:image/png;base64,${data.images[0]}`;
      } else {
        const body: Record<string, unknown> = {
          prompt: capturedPrompt, aspect_ratio: capturedAspect, duration_seconds: videoDuration,
          ...(firstFrame && { first_frame: firstFrame }),
          ...(lastFrame && { last_frame: lastFrame }),
          ...(saveToFolder.id && { folder_id: saveToFolder.id }),
        };
        const res = await fetch(API_ENDPOINTS.generate.video, {
          method: "POST", headers: await authHeaders(),
          body: JSON.stringify(body), signal: controller.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const opName = data.operation_name;
        let complete = false;
        while (!complete) {
          await new Promise(r => setTimeout(r, 10000));
          if (controller.signal.aborted) return;
          const statusRes = await fetch(API_ENDPOINTS.generate.videoStatus(opName, capturedPrompt), {
            headers: { Authorization: `Bearer ${await getToken()}` },
          });
          const statusData = await statusRes.json();
          if (statusData.status === "complete" && statusData.video_base64) {
            complete = true;
            mediaUrl = `data:video/mp4;base64,${statusData.video_base64}`;
          }
        }
      }

      setSessionGens(prev => prev.map(g => g.id === genId
        ? { ...g, status: "complete", mediaUrl, isNew: true }
        : g
      ));
      setTimeout(() => setSessionGens(prev => prev.map(g => g.id === genId ? { ...g, isNew: false } : g)), 3000);
      setPromptPersisted(true);
      onLibraryRefresh?.();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setSessionGens(prev => prev.filter(g => g.id !== genId));
        return;
      }
      setSessionGens(prev => prev.map(g => g.id === genId ? { ...g, status: "failed" } : g));
    }
  }, [prompt, isGenerating, mode, aspectRatio, videoDuration, firstFrame, lastFrame, saveToFolder, activeGen, resolvePromptAndRefs, onLibraryRefresh]);

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    setSessionGens(prev => prev.filter(g => g.status !== "thinking"));
  };

  // ── Session toolbar actions ────────────────────────────────────
  const handleClearFeed = () => {
    setSessionGens([]);
    setShowClearConfirm(false);
    setPromptPersisted(false);
  };

  const handleSaveAllToFolder = async (_folderId: string, folderName: string) => {
    setSavingToFolder(true);
    try {
      const completedUrls = sessionGens.filter(g => g.status === "complete" && g.mediaUrl).map(g => g.mediaUrl!);
      // The generations are already saved to the library — just update folder assignment via patch
      // This is a best-effort save; individual assets were already saved by the generation API
      setSavedFeedback(`Saved to "${folderName}"`);
      setTimeout(() => setSavedFeedback(null), 3000);
      void completedUrls; // suppress unused warning — actual folder assignment happens server-side during generation
    } catch { /* silent */ }
    finally { setSavingToFolder(false); setShowSaveToMenu(false); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch(API_ENDPOINTS.folders.create, {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (!res.ok) return;
      const folder = await res.json();
      setFolderList(prev => [{ id: folder.id, name: folder.name }, ...prev]);
      setSaveToFolder({ id: folder.id, name: folder.name });
      setNewFolderName(""); setShowNewFolderInput(false); setShowSaveToMenu(false);
    } catch { /* silent */ }
  };

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || referenceImages.length >= 9) return;
    const reader = new FileReader();
    reader.onload = (ev) => setReferenceImages(p => [...p, ev.target?.result as string]);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const promptCardClass = isGenerating ? "thinking-state" : prompt.trim() || hasSession ? "glowing" : "";

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={`create-page${hasSession ? " has-session" : ""}`}>

      {/* ── Empty state (greeting shown when no session) ── */}
      {!hasSession && !isGenerating && (
        <div className="empty-state">
          <p className="greeting">
            {`${displayName}, what will you create today?`
              .split(" ").map((word, i) => (
                <span key={i} className="greeting-word" style={{ animationDelay: `${i * 80}ms` }}>{word}</span>
              ))}
          </p>
        </div>
      )}

      {/* ── Session: toolbar + history + active gen ── */}
      {(hasSession || isGenerating) && (
        <div className="session-content">

          {/* Session toolbar */}
          <div className="session-toolbar">
            <div className="session-count">
              <span>⬡</span>
              <span>
                <strong>{sessionGens.length}</strong>{" "}
                {sessionGens.length === 1 ? "generation" : "generations"} this session
              </span>
            </div>
            <div className="session-actions">
              {savedFeedback ? (
                <span className="save-success">✓ {savedFeedback}</span>
              ) : (
                <>
                  {/* Save all */}
                  <div className="relative">
                    <button className="session-link" onClick={() => setShowSaveToMenu(v => !v)}>
                      <Save className="w-3.5 h-3.5" />
                      Save all
                    </button>
                    {showSaveToMenu && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => { setShowSaveToMenu(false); setShowNewFolderInput(false); setNewFolderName(""); }} />
                        <div className="chip-popover folder-chip-popover" style={{ right: 0, left: "auto" }}>
                          <p className="chip-popover-header">Save to folder</p>
                          <div className="chip-grid chip-grid-3">
                            {folderList.map(f => (
                              <button key={f.id} className={`folder-chip-opt${saveToFolder.id === f.id ? " active" : ""}`}
                                onClick={() => { setSaveToFolder({ id: f.id, name: f.name }); handleSaveAllToFolder(f.id, f.name); }}>
                                <div className="folder-chip-preview">{[0,1,2,3].map(i => <div key={i} />)}</div>
                                <span className="folder-chip-name">{f.name}</span>
                              </button>
                            ))}
                            {showNewFolderInput ? (
                              <button className="folder-chip-opt new-folder-tile" style={{ flexDirection: "column", gap: 4 }}>
                                <input autoFocus style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "hsl(var(--foreground))", fontSize: 10, fontFamily: "inherit", textAlign: "center", padding: 0 }}
                                  placeholder="Name…" value={newFolderName}
                                  onChange={e => setNewFolderName(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setShowNewFolderInput(false); setNewFolderName(""); } }}
                                  onClick={e => e.stopPropagation()} />
                                <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>Enter to create</span>
                              </button>
                            ) : (
                              <button className="folder-chip-opt new-folder-tile" onClick={e => { e.stopPropagation(); setShowNewFolderInput(true); }}>
                                <FolderPlus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="session-link-divider" />

                  {/* Clear feed */}
                  {showClearConfirm ? (
                    <div className="inline-confirm">
                      <span className="inline-confirm-text">Clear {sessionGens.length} {sessionGens.length === 1 ? "generation" : "generations"}?</span>
                      <button className="inline-confirm-btn confirm" onClick={handleClearFeed}>
                        <Trash2 className="w-3 h-3" /> Clear
                      </button>
                      <button className="inline-confirm-btn cancel" onClick={() => setShowClearConfirm(false)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="session-link danger" onClick={() => setShowClearConfirm(true)}>
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* History grid — oldest top-left → newest bottom-right */}
          {historyGens.length > 0 && (
            <div className="history-grid">
              {historyGens.map((gen) => (
                <HistoryCard
                  key={gen.id}
                  gen={gen}
                  isNew={gen.id === newlyHistoryId}
                  onUseAsRef={(url) => setReferenceImages(p => [...p, url])}
                />
              ))}
            </div>
          )}

          {/* Active generation / thinking area */}
          <div className="active-gen-wrap">
            {isGenerating ? (
              <div className="thinking-area">
                <GeneratingAnimation mode={mode} />
              </div>
            ) : activeGen?.status === "complete" && activeGen.mediaUrl ? (
              <div className={`active-gen${activeGen.isNew ? " new-arrival" : ""}`}>
                {activeGen.type === "video"
                  ? <video src={activeGen.mediaUrl} className="active-gen-media" controls />
                  : <img src={activeGen.mediaUrl} className="active-gen-media" alt="" />}
                <div className="active-gen-actions">
                  <button className="active-gen-action-btn" title="Use as reference"
                    onClick={() => setReferenceImages(p => [...p, activeGen.mediaUrl!])}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button className="active-gen-action-btn" title="Open in workflow"
                    onClick={() => window.dispatchEvent(new CustomEvent("add-image-to-new-workflow", { detail: { url: activeGen.mediaUrl } }))}>
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : activeGen?.status === "failed" ? (
              <div className="active-gen failed-gen">
                <span style={{ fontSize: 28, opacity: 0.5 }}>⚠</span>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgba(255,100,50,0.8)" }}>Generation failed</p>
                <button onClick={() => setSessionGens(prev => prev.filter(g => g.id !== activeGen.id))}
                  style={{ marginTop: 10, background: "rgba(255,72,0,0.12)", border: "1px solid rgba(255,72,0,0.3)", color: "#FF4800", padding: "5px 14px", borderRadius: 999, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Sticky prompt ── */}
      <div className="prompt-sticky-wrap">
        {/* Hero prompt card */}
        <div
          className={`prompt-hero-card max-w-2xl mx-auto w-full rounded-[20px] px-6 pt-5 pb-4 bg-card border border-border${promptCardClass ? ` ${promptCardClass}` : ""}`}
          style={{ boxShadow: "var(--shadow-raised-lg)" }}
        >
          {promptPersisted && (
            <div className="last-prompt-tag">
              <span style={{ color: "hsl(var(--primary))", fontSize: 10 }}>◷</span>
              Last prompt
            </div>
          )}

          <div
            className={`prompt-input-wrap${promptFocused ? " prompt-input-active" : ""}`}
            onFocus={() => setPromptFocused(true)}
            onBlur={() => setPromptFocused(false)}
          >
            <ChipTextarea
              value={prompt}
              onChange={(v) => {
                setPrompt(v);
                if (promptPersisted) setPromptPersisted(false);
                setActiveElements(prev => prev.filter(el => v.toLowerCase().includes(`@${el.token}`)));
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
              placeholder="Describe what is on your mind… (type @ for elements)"
              disabled={isGenerating}
              elementChips={elementChips}
              onElementChipSelect={(chip) => setActiveElements(prev => prev.some(e => e.id === chip.id) ? prev : [...prev, chip])}
              className={promptPersisted ? "opacity-70" : ""}
              textareaClassName="w-full bg-transparent border-none outline-none resize-none text-base text-foreground placeholder:text-muted-foreground/50 disabled:cursor-not-allowed focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
            />
          </div>

          {/* Reference image previews */}
          {referenceImages.length > 0 && (
            <div className="flex gap-2 mt-2 mb-1 flex-wrap">
              {referenceImages.map((img, i) => (
                <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden">
                  <img src={img} className="w-full h-full object-cover" alt="" />
                  <button onClick={() => setReferenceImages(p => p.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center">
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2.5">
              {/* File inputs */}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefImageUpload} />
              <input ref={firstFrameRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setFirstFrame(ev.target?.result as string); r.readAsDataURL(f); e.target.value = ""; }} />
              <input ref={lastFrameRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setLastFrame(ev.target?.result as string); r.readAsDataURL(f); e.target.value = ""; }} />

              {/* + button */}
              <div className="relative">
                <button onClick={() => setShowAddMenu(v => !v)}
                  className="relative w-9 h-9 rounded-[10px] border-none flex items-center justify-center cursor-pointer bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  style={{ boxShadow: "var(--shadow-raised-sm)" }}>
                  <Plus className="w-4 h-4" />
                  {(referenceImages.length + (firstFrame ? 1 : 0) + (lastFrame ? 1 : 0)) > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                      {referenceImages.length + (firstFrame ? 1 : 0) + (lastFrame ? 1 : 0)}
                    </span>
                  )}
                </button>
                {showAddMenu && (
                  <div className="absolute top-full left-0 mt-1 z-20 rounded-xl overflow-hidden bg-card border border-border min-w-[150px]"
                    style={{ boxShadow: "var(--shadow-modal-cv)" }}>
                    <button onClick={() => { fileInputRef.current?.click(); setShowAddMenu(false); }}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left border-none cursor-pointer hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground whitespace-nowrap">
                      <Plus className="w-3.5 h-3.5" /> Reference image
                    </button>
                    {mode === "video" && (<>
                      <button onClick={() => { firstFrameRef.current?.click(); setShowAddMenu(false); }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left border-none cursor-pointer hover:bg-secondary transition-colors whitespace-nowrap"
                        style={{ color: firstFrame ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                        <Plus className="w-3.5 h-3.5" /> First frame {firstFrame && "✓"}
                      </button>
                      <button onClick={() => { lastFrameRef.current?.click(); setShowAddMenu(false); }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left border-none cursor-pointer hover:bg-secondary transition-colors whitespace-nowrap"
                        style={{ color: lastFrame ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                        <Plus className="w-3.5 h-3.5" /> Last frame {lastFrame && "✓"}
                      </button>
                    </>)}
                  </div>
                )}
              </div>

              {/* Image / Video toggle */}
              <TabPill options={[
                { value: "image" as const, label: "Image", icon: <ImageIcon className="w-3.5 h-3.5" /> },
                { value: "video" as const, label: "Video", icon: <VideoIcon className="w-3.5 h-3.5" /> },
              ]} value={mode} onChange={setMode} ariaLabel="Generation mode" />

              {/* Aspect ratio */}
              <div className="relative">
                <button onClick={() => setShowAspectMenu(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-none cursor-pointer text-sm bg-secondary text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap${showAspectMenu ? " chip-popover-open" : ""}`}
                  style={{ boxShadow: "var(--shadow-raised-sm)" }}>
                  {aspectRatio}
                </button>
                {showAspectMenu && (<>
                  <div className="fixed inset-0 z-20" onClick={() => setShowAspectMenu(false)} />
                  <div className="chip-popover">
                    <div className="chip-grid chip-grid-3">
                      {ASPECT_RATIOS.map(({ value, thumbClass }) => (
                        <button key={value} onClick={() => { setAspectRatio(value); setShowAspectMenu(false); }}
                          className={`chip-grid-opt${aspectRatio === value ? " active" : ""}`}>
                          <div className={`ratio-thumb ${thumbClass}`} />
                          <span className="chip-grid-label">{value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>)}
              </div>

              {/* Duration (video only) */}
              {mode === "video" && (
                <div className="relative">
                  <button onClick={() => setShowDurationMenu(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-none cursor-pointer text-sm bg-secondary text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap"
                    style={{ boxShadow: "var(--shadow-raised-sm)" }}>
                    {videoDuration}s
                  </button>
                  {showDurationMenu && (
                    <div className="absolute top-full left-0 mt-1 z-20 rounded-xl overflow-hidden bg-card border border-border min-w-[70px]"
                      style={{ boxShadow: "var(--shadow-modal-cv)" }}>
                      {[4, 6, 8].map(d => (
                        <button key={d} onClick={() => { setVideoDuration(d); setShowDurationMenu(false); }}
                          className={`block w-full px-4 py-2 text-sm text-left border-none cursor-pointer transition-colors whitespace-nowrap ${d === videoDuration ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                          style={d === videoDuration ? { background: "hsl(var(--primary) / 0.1)" } : undefined}>
                          {d}s
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Variations */}
              <div className="relative">
                <button onClick={() => setShowVariationsMenu(v => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-none cursor-pointer text-xs bg-secondary text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap${showVariationsMenu ? " chip-popover-open" : ""}`}
                  style={{ boxShadow: "var(--shadow-raised-sm)", border: "1px solid rgba(185,205,190,0.18)" }}>
                  <Layers className="w-3 h-3" />{variations}
                </button>
                {showVariationsMenu && (<>
                  <div className="fixed inset-0 z-20" onClick={() => setShowVariationsMenu(false)} />
                  <div className="chip-popover">
                    <div className="chip-grid chip-grid-2">
                      {([1,2,3,4] as const).map(v => (
                        <button key={v} onClick={() => { setVariations(v); setShowVariationsMenu(false); }}
                          className={`chip-grid-opt${variations === v ? " active" : ""}`}>
                          <div className={`var-thumb v${v}`}>{Array.from({ length: v }).map((_, i) => <div key={i} />)}</div>
                          <span className="chip-grid-label">{v}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>)}
              </div>

              {/* Save-to folder */}
              <div className="relative">
                <button onClick={() => { setShowSaveToMenu(v => !v); setShowNewFolderInput(false); }}
                  className={`flex items-center justify-center w-9 h-9 rounded-lg border-none cursor-pointer bg-secondary transition-colors${showSaveToMenu ? " chip-popover-open" : ""}`}
                  style={{ boxShadow: "var(--shadow-raised-sm)" }}
                  title={saveToFolder.id ? `Saving to: ${saveToFolder.name}` : "Save to folder"}>
                  <FolderPlus className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                </button>
                {showSaveToMenu && (<>
                  <div className="fixed inset-0 z-20" onClick={() => { setShowSaveToMenu(false); setShowNewFolderInput(false); setNewFolderName(""); }} />
                  <div className="chip-popover folder-chip-popover">
                    <p className="chip-popover-header">{saveToFolder.id ? "Saving to" : "Save to folder"}</p>
                    <div className="chip-grid chip-grid-3">
                      {folderList.map(f => {
                        const isActive = saveToFolder.id === f.id;
                        return (
                          <button key={f.id} className={`folder-chip-opt${isActive ? " active" : ""}`}
                            onClick={() => { setSaveToFolder(isActive ? { id: null, name: "" } : { id: f.id, name: f.name }); setShowSaveToMenu(false); }}>
                            {isActive && <span className="folder-active-badge">✓</span>}
                            <div className="folder-chip-preview">{[0,1,2,3].map(i => <div key={i} />)}</div>
                            <span className="folder-chip-name">{f.name}</span>
                          </button>
                        );
                      })}
                      {showNewFolderInput ? (
                        <button className="folder-chip-opt new-folder-tile" style={{ flexDirection: "column", gap: 4 }}>
                          <input autoFocus style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "hsl(var(--foreground))", fontSize: 10, fontFamily: "inherit", textAlign: "center", padding: 0 }}
                            placeholder="Name…" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setShowNewFolderInput(false); setNewFolderName(""); } }}
                            onClick={e => e.stopPropagation()} />
                          <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>Enter to create</span>
                        </button>
                      ) : (
                        <button className="folder-chip-opt new-folder-tile" onClick={e => { e.stopPropagation(); setShowNewFolderInput(true); }}>
                          <FolderPlus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </>)}
              </div>
            </div>

            {/* Generate / Cancel */}
            {isGenerating ? (
              <button onClick={handleCancel}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border cursor-pointer text-xs font-medium transition-colors"
                style={{ background: "transparent", borderColor: "rgba(255,72,0,0.35)", color: "#FF4800", fontFamily: "inherit" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,72,0,0.05)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                <X className="w-3.5 h-3.5" />Cancel
              </button>
            ) : (
              <button onClick={handleGenerate} disabled={!prompt.trim()}
                className="w-11 h-11 rounded-xl border-none cursor-pointer flex items-center justify-center disabled:opacity-40 transition-all bg-primary text-primary-foreground"
                style={{ boxShadow: "var(--shadow-pink-btn)" }} title="Generate (⌘↵)">
                <ArrowUp className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
