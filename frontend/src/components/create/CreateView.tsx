import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowUp,
  Plus,
  X,
  Pencil,
  Layers,
  FolderPlus,
  Workflow as WorkflowIcon,
  Download,
  Check,
  Trash2,
  Save,
  Maximize2,
  ClipboardCopy,
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

interface SessionResult {
  type: "image" | "video";
  url: string | null;
  key: number;
  aspectRatio: string;
  batchId: number;
  prompt: string;
  status: "pending" | "complete" | "failed";
  assetId?: string;   // saved_asset_id from backend — needed for folder moves
  isNew?: boolean;
}

const ASPECT_RATIOS_IMAGE = [
  { value: "1:1",    thumbClass: "r-1-1"  },
  { value: "16:9",   thumbClass: "r-16-9" },
  { value: "9:16",   thumbClass: "r-9-16" },
  { value: "4:3",    thumbClass: "r-4-3"  },
  { value: "3:2",    thumbClass: "r-3-2"  },
  { value: "2.39:1", thumbClass: "r-2-39" },
] as const;

const ASPECT_RATIOS_VIDEO = [
  { value: "16:9", thumbClass: "r-16-9" },
  { value: "9:16", thumbClass: "r-9-16" },
] as const;

async function getToken() { return auth.currentUser?.getIdToken(); }
async function authHeaders(contentType = true) {
  const token = await getToken();
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (contentType) h["Content-Type"] = "application/json";
  return h;
}

interface CreateViewProps { onLibraryRefresh?: () => void; }

// ─── Main component ───────────────────────────────────────────────────────────

export function CreateView({ onLibraryRefresh }: CreateViewProps) {
  const { user } = useAuth();

  // ── Session state ──────────────────────────────────────────────
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);
  const [viewState, setViewState] = useState<"idle" | "generating" | "result" | "error">("idle");
  const [newestResultKey, setNewestResultKey] = useState<number | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
  const [justCleared, setJustCleared] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; type: "image" | "video"; index: number } | null>(null);
  const [showBulkFolderMenu, setShowBulkFolderMenu] = useState(false);
  const [bulkSaveFeedback, setBulkSaveFeedback] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<{ result: SessionResult; rect: DOMRect } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anySelected = selectedKeys.size > 0;
  const toggleSelect = (key: number) =>
    setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

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
  const [generationError, setGenerationError] = useState<string | null>(null);

  // ── Folder state ───────────────────────────────────────────────
  const [saveToFolder, setSaveToFolder] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [folderList, setFolderList] = useState<Array<{ id: string; name: string }>>([]);

  // ── Refs ───────────────────────────────────────────────────────
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstFrameRef = useRef<HTMLInputElement>(null);
  const lastFrameRef = useRef<HTMLInputElement>(null);
  const resultKeyRef = useRef(0);
  const batchIdRef = useRef(0);
  const currentAspectRatioRef = useRef("1:1");
  const currentPromptRef = useRef("");
  const inFlightRef = useRef(0); // count of in-flight requests

  const rawName = user?.displayName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const isGenerating = viewState === "generating";

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

  // ── Resolve a pending slot to a real result ───────────────────
  const resolveResult = useCallback((key: number, url: string, assetId?: string) => {
    setSessionResults(p => p.map(r => r.key === key
      ? { ...r, url, status: "complete" as const, isNew: true, assetId }
      : r
    ));
    setNewestResultKey(key);
    setViewState("result");
    setTimeout(() => {
      setSessionResults(p => p.map(r => r.key === key ? { ...r, isNew: false } : r));
      setNewestResultKey(null);
    }, 2400);
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

    const capturedPrompt = prompt;
    const capturedMode = mode;
    const capturedAspect = aspectRatio;
    const capturedVariations = capturedMode === "image" ? variations : 1;

    batchIdRef.current++;
    currentAspectRatioRef.current = capturedAspect;
    currentPromptRef.current = capturedPrompt;

    // Create N pending placeholder slots upfront — show them immediately in the grid
    const pendingKeys = Array.from({ length: capturedVariations }, () => ++resultKeyRef.current);
    const pendingEntries: SessionResult[] = pendingKeys.map(key => ({
      key, type: capturedMode, url: null, aspectRatio: capturedAspect,
      batchId: batchIdRef.current, prompt: capturedPrompt, status: "pending",
    }));
    setSessionResults(p => [...pendingEntries, ...p]);
    setViewState("generating");
    setPrompt("");
    setPromptPersisted(false);
    setGenerationError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    inFlightRef.current = capturedVariations;

    const finish = () => {
      inFlightRef.current--;
      if (inFlightRef.current <= 0) {
        setViewState(v => v === "generating" ? "result" : v);
        onLibraryRefresh?.();
      }
    };

    if (capturedMode === "image") {
      const { finalPrompt, allRefs } = resolvePromptAndRefs();
      const body: Record<string, unknown> = {
        prompt: finalPrompt, aspect_ratio: capturedAspect,
        ...(allRefs.length > 0 && { reference_images: allRefs }),
        ...(saveToFolder.id && { folder_id: saveToFolder.id }),
      };
      const headers = await authHeaders();

      await Promise.allSettled(
        pendingKeys.map(async (key) => {
          try {
            const res = await fetch(API_ENDPOINTS.generate.image, {
              method: "POST", headers, body: JSON.stringify(body), signal: controller.signal,
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            if (data.images?.[0]) {
              resolveResult(key, `data:image/png;base64,${data.images[0]}`, data.saved_asset_id ?? undefined);
            } else {
              setSessionResults(p => p.map(r => r.key === key ? { ...r, status: "failed" } : r));
            }
          } catch (e) {
            if ((e as Error).name !== "AbortError") {
              setSessionResults(p => p.map(r => r.key === key ? { ...r, status: "failed" } : r));
            } else {
              setSessionResults(p => p.filter(r => r.key !== key));
            }
          } finally { finish(); }
        })
      );
    } else {
      const key = pendingKeys[0];
      try {
        const body: Record<string, unknown> = {
          prompt: capturedPrompt, aspect_ratio: capturedAspect, duration_seconds: videoDuration,
          ...(firstFrame && { first_frame: firstFrame }),
          ...(lastFrame && { last_frame: lastFrame }),
          ...(saveToFolder.id && { folder_id: saveToFolder.id }),
        };
        const res = await fetch(API_ENDPOINTS.generate.video, {
          method: "POST", headers: await authHeaders(), body: JSON.stringify(body), signal: controller.signal,
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
            resolveResult(key, `data:video/mp4;base64,${statusData.video_base64}`, statusData.saved_asset_id ?? undefined);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setSessionResults(p => p.map(r => r.key === key ? { ...r, status: "failed" } : r));
        } else {
          setSessionResults(p => p.filter(r => r.key !== key));
        }
      } finally { finish(); }
    }
  }, [prompt, isGenerating, mode, aspectRatio, variations, videoDuration, firstFrame, lastFrame, saveToFolder, resolvePromptAndRefs, resolveResult, onLibraryRefresh]);

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    inFlightRef.current = 0;
    setViewState(sessionResults.length > 0 ? "result" : "idle");
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch(API_ENDPOINTS.folders.create, {
        method: "POST", headers: await authHeaders(), body: JSON.stringify({ name: newFolderName.trim() }),
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

  const promptCardClass = prompt.trim() || sessionResults.length > 0 ? "glowing" : "";

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={`create-page${sessionResults.length > 0 || isGenerating ? " has-session" : ""}`}>

      {/* ── Empty state ── */}
      {viewState === "idle" && sessionResults.length === 0 && (
        <div className="empty-state">
          <p className="greeting">
            {`${displayName}, what will you create today?`
              .split(" ").map((word, i) => (
                <span key={i} className="greeting-word" style={{ animationDelay: `${i * 80}ms` }}>{word}</span>
              ))}
          </p>
        </div>
      )}

      {/* ── Session area ── */}
      {(viewState !== "idle" || sessionResults.length > 0) && (
        <div className="session-area">

          {/* Session header — count + single-click clear */}
          {sessionResults.length > 0 && (
            <div className="session-header">
              <span className="session-count">
                ◎ {sessionResults.length} generation{sessionResults.length !== 1 ? "s" : ""} this session
              </span>
              {justCleared ? (
                <span className="save-success">✓ Cleared — images saved to library</span>
              ) : (
                <button
                  className="session-clear-btn"
                  onClick={() => {
                    setSessionResults([]); setSelectedKeys(new Set());
                    setViewState("idle"); setGenerationError(null);
                    setJustCleared(true); setTimeout(() => setJustCleared(false), 3000);
                  }}
                >
                  Clear feed
                </button>
              )}
            </div>
          )}

          {/* Bulk action bar */}
          {anySelected && (
            <div className="bulk-bar">
              <span className="bulk-count">{selectedKeys.size} selected</span>
              <button className="bulk-btn" onClick={() => {
                setSessionResults(p => p.filter(r => !selectedKeys.has(r.key)));
                setSelectedKeys(new Set());
              }}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
              {bulkSaveFeedback ? (
                <span className="save-success">{bulkSaveFeedback}</span>
              ) : (
                <div className="relative">
                  <button className="bulk-btn" onClick={() => setShowBulkFolderMenu(v => !v)}>
                    <Save className="w-3.5 h-3.5" /> Save to folder
                  </button>
                  {showBulkFolderMenu && (<>
                    <div className="fixed inset-0 z-20" onClick={() => setShowBulkFolderMenu(false)} />
                    <div className="chip-popover" style={{ bottom: "calc(100% + 8px)", top: "auto" }}>
                      <p className="chip-popover-header">Move selected to</p>
                      <div className="chip-grid chip-grid-3">
                        {folderList.map(f => (
                          <button key={f.id} className="folder-chip-opt"
                            onClick={async () => {
                              setShowBulkFolderMenu(false);
                              const token = await getToken();
                              const targets = sessionResults.filter(r => selectedKeys.has(r.key) && r.assetId);
                              await Promise.allSettled(targets.map(r =>
                                fetch(API_ENDPOINTS.assets.moveToFolder(r.assetId!, f.id), {
                                  method: "PATCH", headers: { Authorization: `Bearer ${token}` },
                                })
                              ));
                              setBulkSaveFeedback(`✓ ${targets.length} saved to "${f.name}"`);
                              setTimeout(() => setBulkSaveFeedback(null), 3000);
                              setSelectedKeys(new Set());
                            }}>
                            <div className="folder-chip-preview">{[0,1,2,3].map(i => <div key={i} />)}</div>
                            <span className="folder-chip-name">{f.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>)}
                </div>
              )}
              <button className="bulk-cancel" onClick={() => setSelectedKeys(new Set())}>Cancel</button>
            </div>
          )}

          {/* Error state */}
          {viewState === "error" && (
            <div className="error-tile">
              <span style={{ fontSize: 24 }}>⚠</span>
              <p style={{ margin: 0, fontSize: 13 }}>{generationError || "Generation failed"}</p>
              <button
                onClick={() => { setViewState(sessionResults.length > 0 ? "result" : "idle"); setGenerationError(null); }}
                style={{ background: "rgba(255,72,0,0.15)", border: "1px solid rgba(255,72,0,0.3)", color: "#FF4800", padding: "6px 14px", borderRadius: 999, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Masonry grid — newest top-left */}
          {sessionResults.length > 0 && (
            <div
              className="session-mosaic"
              style={sessionResults.every(r => r.aspectRatio === "9:16")
                ? { display: "flex", flexWrap: "wrap" as const, justifyContent: "center" }
                : undefined}
            >
              {sessionResults.map((card, cardIndex) => {
                const isSelected = selectedKeys.has(card.key);
                const isPending = card.status === "pending";
                const isFailed = card.status === "failed";

                return (
                  <div
                    key={card.key}
                    className={`gen-card${card.isNew ? " gen-card-arrived" : ""}${isPending ? " gen-card-pending" : ""}${newestResultKey === card.key && !isPending ? " fresh-glow" : ""}${isSelected ? " is-selected" : ""}`}
                    style={{ aspectRatio: card.aspectRatio.replace(":", " / ") }}
                    onDoubleClick={() => card.url && setLightbox({ url: card.url, type: card.type, index: cardIndex })}
                    onMouseEnter={(e) => {
                      if (isPending || isFailed) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                      hoverTimerRef.current = setTimeout(() => setHoveredCard({ result: card, rect }), 100);
                    }}
                    onMouseLeave={() => {
                      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                      setHoveredCard(null);
                    }}
                  >
                    {/* Pending: show scaled-down GeneratingAnimation */}
                    {isPending && (
                      <div className="gen-card-inner">
                        <div className="mini-anim-wrap">
                          <GeneratingAnimation mode={card.type} />
                        </div>
                      </div>
                    )}

                    {/* Failed */}
                    {isFailed && (
                      <div className="gen-card-inner" style={{ gap: 6 }}>
                        <span style={{ fontSize: 18, opacity: 0.4 }}>⚠</span>
                        <span style={{ fontSize: 9, color: "rgba(255,100,50,0.7)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Failed</span>
                      </div>
                    )}

                    {/* Complete */}
                    {card.status === "complete" && card.url && (
                      card.type === "image"
                        ? <img src={card.url} className="gen-card-img" alt="" />
                        : <video src={card.url} className="gen-card-img" muted loop playsInline
                            onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
                            onMouseLeave={e => { (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0; }}
                          />
                    )}

                    {!isPending && !isFailed && (
                      <>
                        <span className="gen-card-type">{card.type === "image" ? "IMG" : "VID"}</span>
                        <button className={`gen-card-select${isSelected ? " is-selected" : ""}`}
                          onClick={(e) => { e.stopPropagation(); toggleSelect(card.key); }} title="Select">
                          {isSelected && <Check className="w-3 h-3" />}
                        </button>
                        <div className="gen-card-actions">
                          <button className="gen-card-action" title="Full screen"
                            onClick={(e) => { e.stopPropagation(); card.url && setLightbox({ url: card.url, type: card.type, index: cardIndex }); }}>
                            <Maximize2 className="w-3 h-3" />
                          </button>
                          {card.prompt && (
                            <button className="gen-card-action" title="Copy prompt"
                              onClick={(e) => { e.stopPropagation(); setPrompt(card.prompt); }}>
                              <ClipboardCopy className="w-3 h-3" />
                            </button>
                          )}
                          {card.url && <>
                            <button className="gen-card-action" title="Use as reference"
                              onClick={() => setReferenceImages(p => [...p, card.url!])}>
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button className="gen-card-action" title="Open in workflow"
                              onClick={() => window.dispatchEvent(new CustomEvent("add-image-to-new-workflow", { detail: { url: card.url } }))}>
                              <WorkflowIcon className="w-3 h-3" />
                            </button>
                            <button className="gen-card-action" title="Download"
                              onClick={() => { const a = document.createElement("a"); a.href = card.url!; a.download = `generation.${card.type === "video" ? "mp4" : "png"}`; a.click(); }}>
                              <Download className="w-3 h-3" />
                            </button>
                          </>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Sticky prompt ── */}
      <div className="prompt-sticky-wrap">
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

          {/* Reference / first-frame / last-frame previews */}
          {(referenceImages.length > 0 || firstFrame || lastFrame) && (
            <div className="flex gap-2 mt-2 mb-1 flex-wrap">
              {/* First frame */}
              {firstFrame && (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden">
                  <img src={firstFrame} className="w-full h-full object-cover" alt="First frame" />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] font-semibold bg-black/60 text-white py-0.5 leading-none">1st</span>
                  <button onClick={() => setFirstFrame(null)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center">
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              )}
              {/* Last frame */}
              {lastFrame && (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden">
                  <img src={lastFrame} className="w-full h-full object-cover" alt="Last frame" />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] font-semibold bg-black/60 text-white py-0.5 leading-none">Last</span>
                  <button onClick={() => setLastFrame(null)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center">
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              )}
              {/* Reference images */}
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
                  <div className="absolute bottom-full left-0 mb-1 z-20 rounded-xl overflow-hidden bg-card border border-border min-w-[150px]"
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
              ]} value={mode} onChange={(m) => {
                setMode(m);
                if (m === "video" && aspectRatio !== "16:9" && aspectRatio !== "9:16") {
                  setAspectRatio("16:9");
                }
              }} ariaLabel="Generation mode" />

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
                    <div className={`chip-grid ${mode === "video" ? "chip-grid-2" : "chip-grid-3"}`}>
                      {(mode === "video" ? ASPECT_RATIOS_VIDEO : ASPECT_RATIOS_IMAGE).map(({ value, thumbClass }) => (
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
                    <div className="absolute bottom-full left-0 mb-1 z-20 rounded-xl overflow-hidden bg-card border border-border min-w-[70px]"
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
                  style={{ boxShadow: "var(--shadow-raised-sm)" }}>
                  <Layers className="w-3 h-3" />{variations}
                </button>
                {showVariationsMenu && (<>
                  <div className="fixed inset-0 z-20" onClick={() => setShowVariationsMenu(false)} />
                  <div className="chip-popover">
                    <div className="chip-grid chip-grid-2">
                      {([1, 2, 3, 4] as const).map(v => (
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
                            <div className="folder-chip-preview">{[0, 1, 2, 3].map(i => <div key={i} />)}</div>
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

      {/* ── Prompt side card ── */}
      {hoveredCard && createPortal((() => {
        const CARD_W = 240;
        const CARD_GAP = 10;
        const { rect, result } = hoveredCard;
        const flipLeft = rect.right + CARD_GAP + CARD_W > window.innerWidth;
        const left = flipLeft ? rect.left - CARD_GAP - CARD_W : rect.right + CARD_GAP;
        const top = Math.min(rect.top, window.innerHeight - 220);
        const typeLabel = result.type === "video" ? "VID" : "IMG";
        const metaStr = `${result.aspectRatio} · ${typeLabel}`;
        return (
          <div
            style={{
              position: "fixed", top, left, width: CARD_W, zIndex: 9999,
              background: "rgba(6,22,25,0.96)",
              border: "1px solid rgba(185,205,190,0.14)",
              borderRadius: 10,
              padding: "14px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(185,205,190,0.06)",
              animation: "prompt-card-in 180ms cubic-bezier(0.16,1,0.3,1) both",
              transformOrigin: flipLeft ? "right top" : "left top",
            }}
            onMouseEnter={() => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <p style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(185,205,190,0.3)", marginBottom: 8 }}>
              Prompt
            </p>
            <p style={{ fontSize: 12, lineHeight: 1.55, color: "rgba(185,205,190,0.85)", marginBottom: 10, maxHeight: 180, overflow: "auto", scrollbarWidth: "thin" }}>
              {result.prompt || "—"}
            </p>
            <span style={{ fontSize: 9, letterSpacing: "0.07em", color: "rgba(185,205,190,0.3)", textTransform: "uppercase" }}>
              {metaStr}
            </span>
          </div>
        );
      })(), document.body)}

      {/* ── Lightbox with nav arrows ── */}
      {lightbox && (() => {
        const completedResults = sessionResults.filter(r => r.status === "complete" && r.url);
        const currentIdx = completedResults.findIndex((_, i) => i === lightbox.index) !== -1
          ? lightbox.index
          : completedResults.findIndex(r => r.url === lightbox.url);
        const safeIdx = Math.max(0, Math.min(currentIdx, completedResults.length - 1));
        const current = completedResults[safeIdx];
        const canPrev = safeIdx > 0;
        const canNext = safeIdx < completedResults.length - 1;
        const navTo = (idx: number) => {
          const r = completedResults[idx];
          if (r?.url) setLightbox({ url: r.url, type: r.type, index: idx });
        };
        return (
          <div
            className="lightbox-backdrop"
            onClick={() => setLightbox(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setLightbox(null);
              if (e.key === "ArrowLeft" && canPrev) navTo(safeIdx - 1);
              if (e.key === "ArrowRight" && canNext) navTo(safeIdx + 1);
            }}
            tabIndex={-1}
          >
            {/* Close */}
            <button className="lightbox-close" onClick={() => setLightbox(null)} title="Close (Esc)">
              <X className="w-5 h-5" />
            </button>

            {/* Counter */}
            {completedResults.length > 1 && (
              <div className="lightbox-counter">
                {safeIdx + 1} / {completedResults.length}
              </div>
            )}

            {/* Nav arrows */}
            {canPrev && (
              <button className="lightbox-nav left" onClick={(e) => { e.stopPropagation(); navTo(safeIdx - 1); }} title="Previous (←)">
                ‹
              </button>
            )}
            {canNext && (
              <button className="lightbox-nav right" onClick={(e) => { e.stopPropagation(); navTo(safeIdx + 1); }} title="Next (→)">
                ›
              </button>
            )}

            {/* Media */}
            <div className="lightbox-media" onClick={(e) => e.stopPropagation()}>
              {lightbox.type === "video"
                ? <video src={lightbox.url} controls autoPlay className="lightbox-img" />
                : <img src={lightbox.url} className="lightbox-img" alt="" />}
            </div>

            {/* Prompt below media */}
            {current?.prompt && (
              <div className="lightbox-prompt-bar" onClick={(e) => e.stopPropagation()}>
                <p className="lightbox-prompt-text">{current.prompt}</p>
                <button className="lightbox-copy-btn" onClick={() => setPrompt(current.prompt)}>
                  Use prompt ↗
                </button>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}
