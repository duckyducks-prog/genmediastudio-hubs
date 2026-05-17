import { useState, useEffect, useRef, useCallback } from "react";
import {
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowUp,
  Plus,
  X,
  Pencil,
  Camera,
  User,
  Mountain,
  Film,
  Sparkles,
  Workflow as WorkflowIcon,
  Layers,
  FolderPlus,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS } from "@/lib/api-config";
import { GeneratingAnimation } from "./GeneratingAnimation";
import { TabPill } from "@/components/ui/TabPill";
import { ChipTextarea, ElementChipSuggestion } from "@/components/workflow/chips/ChipTextarea";
import { listSceneElements } from "@/lib/scene-elements-api";

import { useAuth } from "@/lib/AuthContext";
import "./create.css";

interface RecentAsset {
  id: string;
  url: string;
  asset_type: "image" | "video";
  created_at: string;
}

const SUGGESTION_CHIPS = [
  { icon: <Camera className="w-3.5 h-3.5" />, label: "Product shot", starter: "Product shot of [your product] on a clean white surface, studio lighting" },
  { icon: <User className="w-3.5 h-3.5" />, label: "Character", starter: "Cinematic portrait of a character, " },
  { icon: <Mountain className="w-3.5 h-3.5" />, label: "Environment", starter: "Wide establishing shot of " },
  { icon: <Film className="w-3.5 h-3.5" />, label: "B-roll", starter: "Atmospheric b-roll footage of " },
  { icon: <Sparkles className="w-3.5 h-3.5" />, label: "Surprise me", starter: "" },
];

const ASPECT_RATIOS = [
  { value: "1:1",   thumbClass: "r-1-1"  },
  { value: "16:9",  thumbClass: "r-16-9" },
  { value: "9:16",  thumbClass: "r-9-16" },
  { value: "4:3",   thumbClass: "r-4-3"  },
  { value: "3:2",   thumbClass: "r-3-2"  },
  { value: "2.39:1",thumbClass: "r-2-39" },
] as const;

async function getToken() {
  return auth.currentUser?.getIdToken();
}

async function authHeaders(contentType = true) {
  const token = await getToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (contentType) headers["Content-Type"] = "application/json";
  return headers;
}

interface CreateViewProps {
  onLibraryRefresh?: () => void;
}

export function CreateView({ onLibraryRefresh }: CreateViewProps) {
  const { user } = useAuth();

  const [prompt, setPrompt] = useState("");
  const [elementChips, setElementChips] = useState<ElementChipSuggestion[]>([]);
  const [activeElements, setActiveElements] = useState<ElementChipSuggestion[]>([]);
  const [mode, setMode] = useState<"image" | "video">("image");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showDurationMenu, setShowDurationMenu] = useState(false);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [firstFrame, setFirstFrame] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(8);
  const firstFrameRef = useRef<HTMLInputElement>(null);
  const lastFrameRef = useRef<HTMLInputElement>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [newestResultKey, setNewestResultKey] = useState<number | null>(null);
  const [results, setResults] = useState<Array<{ type: "image" | "video"; url: string; key: number }>>([]);
  const [recentAssets, setRecentAssets] = useState<RecentAsset[]>([]);
  // Passive save-to chip — never blocks generate
  const [saveToFolder, setSaveToFolder] = useState<{ id: string | null; name: string }>({ id: null, name: "General" });
  const [showSaveToMenu, setShowSaveToMenu] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderList, setFolderList] = useState<Array<{ id: string; name: string }>>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultKeyRef = useRef(0);

  // New state variables
  const [variations, setVariations] = useState(1);
  const [showVariationsMenu, setShowVariationsMenu] = useState(false);
  const [promptPersisted, setPromptPersisted] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);
  const [viewState, setViewState] = useState<"idle" | "generating" | "result" | "error">("idle");
  const [entranceKey, setEntranceKey] = useState(0);

  // Derived value replacing isGenerating state
  const isGenerating = viewState === "generating";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const rawName = user?.displayName?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  // Entrance animation on mount
  const [isCascading, setIsCascading] = useState(true);

  useEffect(() => {
    setEntranceKey(k => k + 1);
    const t = setTimeout(() => setIsCascading(false), 2000);
    return () => clearTimeout(t);
  }, []);

  // Load element chips (characters, locations, props) for @ suggestions
  useEffect(() => {
    const load = () => {
      const IMAGE_TYPES = new Set(["character", "location", "prop"]);
      listSceneElements().then(els =>
        setElementChips(
          els.filter(e => IMAGE_TYPES.has(e.element_type)).map(e => ({
            id: e.id,
            name: e.name,
            token: e.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
            elementType: e.element_type,
            referenceImageUrls: e.reference_image_urls,
          }))
        )
      ).catch(() => {});
    };
    load();
    window.addEventListener("scene-elements-updated", load);
    return () => window.removeEventListener("scene-elements-updated", load);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.assets.list(), { headers: await authHeaders(false) });
        if (!res.ok) return;
        const data = await res.json();
        setRecentAssets((data.assets ?? []).slice(0, 4));
      } catch { /* silent */ }
    };
    load();
  }, []);

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || referenceImages.length >= 9) return;
    const reader = new FileReader();
    reader.onload = (ev) => setReferenceImages((p) => [...p, ev.target?.result as string]);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSuggestionClick = (starter: string) => {
    if (!starter) {
      const surprises = [
        "A lone astronaut standing on a red desert planet, golden light on the horizon",
        "Dense neon-lit city alley at night, rain reflections on the pavement",
        "A cozy wooden cabin in a snowstorm, warm light from a single window",
        "Underwater scene with a school of iridescent fish around ancient ruins",
      ];
      setPrompt(surprises[Math.floor(Math.random() * surprises.length)]);
    } else {
      setPrompt(starter);
    }
  };

  const addResult = (type: "image" | "video", url: string) => {
    const key = ++resultKeyRef.current;
    setResults((p) => [{ type, url, key }, ...p]);
    setNewestResultKey(key);
    setViewState("result");
    setTimeout(() => setNewestResultKey(null), 5500);
  };

  // Build the final prompt and reference image list, resolving element chips
  const resolvePromptAndRefs = useCallback(() => {
    const DESCRIPTORS: Record<string, string> = {
      character: "the character in the reference images",
      location: "the location in the reference images",
      prop: "the prop in the reference images",
    };
    let finalPrompt = prompt;
    const elementRefs: string[] = [];
    for (const el of activeElements) {
      const descriptor = DESCRIPTORS[el.elementType] ?? el.name;
      finalPrompt = finalPrompt.replace(new RegExp(`@${el.token}\\b`, "gi"), descriptor);
      elementRefs.push(...el.referenceImageUrls);
    }
    const allRefs = [...referenceImages, ...elementRefs];
    return { finalPrompt, allRefs };
  }, [prompt, activeElements, referenceImages]);

  const runGenerate = async (folderId: string | null) => {
    if (!prompt.trim() || isGenerating) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setViewState("generating");
    setPromptPersisted(false);
    setGenerationError(null);
    try {
      if (mode === "image") {
        const { finalPrompt, allRefs } = resolvePromptAndRefs();
        const body: Record<string, unknown> = {
          prompt: finalPrompt,
          aspect_ratio: aspectRatio,
          ...(allRefs.length > 0 && { reference_images: allRefs }),
          ...(folderId && { folder_id: folderId }),
        };
        // Run variations in parallel
        const headers = await authHeaders();
        const calls = Array.from({ length: variations }, () =>
          fetch(API_ENDPOINTS.generate.image, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          })
        );
        const responses = await Promise.all(calls);
        for (const res of responses) {
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          if (data.images?.[0]) addResult("image", `data:image/png;base64,${data.images[0]}`);
        }
      } else {
        const body: Record<string, unknown> = {
          prompt,
          aspect_ratio: aspectRatio,
          duration_seconds: videoDuration,
          ...(firstFrame && { first_frame: firstFrame }),
          ...(lastFrame && { last_frame: lastFrame }),
          ...(folderId && { folder_id: folderId }),
        };
        const res = await fetch(API_ENDPOINTS.generate.video, {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const opName = data.operation_name;
        let complete = false;
        while (!complete) {
          await new Promise((r) => setTimeout(r, 10000));
          if (controller.signal.aborted) return;
          const statusRes = await fetch(
            API_ENDPOINTS.generate.videoStatus(opName, prompt),
            { headers: { Authorization: `Bearer ${await getToken()}` } }
          );
          const statusData = await statusRes.json();
          if (statusData.status === "complete" && statusData.video_base64) {
            complete = true;
            addResult("video", `data:video/mp4;base64,${statusData.video_base64}`);
          }
        }
      }
      setViewState("result");
      setPromptPersisted(true);
      onLibraryRefresh?.();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setViewState("idle");
        return;
      }
      setViewState("error");
      setGenerationError("Generation failed. Try again or refine your prompt.");
      setTimeout(() => {
        setViewState("idle");
      }, 6000);
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    setViewState("idle");
  };

  // Load folders for the save-to popover
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

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch(API_ENDPOINTS.folders.create, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (!res.ok) return;
      const folder = await res.json();
      setFolderList(prev => [{ id: folder.id, name: folder.name }, ...prev]);
      setSaveToFolder({ id: folder.id, name: folder.name });
      setNewFolderName("");
      setShowNewFolderInput(false);
      setShowSaveToMenu(false);
    } catch { /* silent */ }
  };

  // Generate fires immediately — no blocking folder prompt
  const handleGenerate = () => {
    if (!prompt.trim()) return;
    runGenerate(saveToFolder.id);
  };

  const recentToShow = recentAssets;

  return (
    <div className={`h-full overflow-y-auto px-12 pt-32 pb-10 flex flex-col bg-background create-bg${isGenerating ? " is-generating" : ""}${isCascading ? " cascade-in" : ""}`}>

      {/* Greeting */}
      <p className="greeting text-center text-3xl font-light tracking-tight mb-6 text-foreground">
        {[`${displayName},`, "what", "will", "you", "create", "today?"].map((word, i) => (
          <span
            key={`${entranceKey}-${i}`}
            className="greeting-word"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            {word}
          </span>
        ))}
      </p>

      {/* Top slot — shows animation when generating, result when done, nothing when idle */}
      {(viewState !== "idle" || results.length > 0) && (
        <div className="top-slot">
          <div className="top-slot-frame">
            {viewState === "generating" && <GeneratingAnimation mode={mode} />}
            {viewState === "result" && results.length > 0 && (
              <div className={`result-grid ${["", "single", "double", "triple", "quad"][Math.min(results.length, variations)]}`}>
                {results.slice(0, variations).map((r) => (
                  <div key={r.key} className={`result-tile ${newestResultKey === r.key || newestResultKey === null ? "fresh-glow" : ""}`}>
                    {r.type === "image"
                      ? <img src={r.url} className="result-tile-img" alt="" />
                      : <video src={r.url} controls className="result-tile-img" />}
                    <div className="result-actions">
                      <button className="result-action-btn" onClick={() => setReferenceImages(p => [...p, r.url])} title="Use as reference">
                        <Pencil className="w-2.5 h-2.5" />
                      </button>
                      <button className="result-action-btn" onClick={() => window.dispatchEvent(new CustomEvent("add-image-to-new-workflow", { detail: { url: r.url } }))} title="Open in workflow">
                        <WorkflowIcon className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {viewState === "error" && (
              <div className="error-tile">
                <span style={{ fontSize: 24 }}>⚠</span>
                <p style={{ margin: 0, fontSize: 13 }}>Generation failed</p>
                <button
                  onClick={() => { setViewState("idle"); setGenerationError(null); }}
                  style={{ background: "rgba(255,72,0,0.15)", border: "1px solid rgba(255,72,0,0.3)", color: "#FF4800", padding: "6px 14px", borderRadius: 999, fontSize: 12, cursor: "pointer" }}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero prompt card */}
      <div
        className={`prompt-hero-enter max-w-2xl mx-auto w-full rounded-[20px] px-6 pt-5 pb-4 mb-7 bg-card border border-border transition-opacity duration-200${promptFocused ? " prompt-hero-focused" : ""}`}
        style={{ boxShadow: "var(--shadow-raised-lg)", opacity: isGenerating ? 0.55 : 1 }}
      >
        {/* Last prompt tag */}
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
            // Remove activeElements whose token is no longer in the text
            setActiveElements(prev => prev.filter(el =>
              v.toLowerCase().includes(`@${el.token}`)
            ));
          }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
          placeholder="Describe what is on your mind… (type @ for elements)"
          disabled={isGenerating}
          elementChips={elementChips}
          onElementChipSelect={(chip) => {
            setActiveElements(prev =>
              prev.some(e => e.id === chip.id) ? prev : [...prev, chip]
            );
          }}
          className={promptPersisted ? "opacity-70" : ""}
          textareaClassName="w-full bg-transparent border-none outline-none resize-none text-base text-foreground placeholder:text-muted-foreground/50 disabled:cursor-not-allowed focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
        />
        </div>

        {/* Reference image previews */}
        {referenceImages.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {referenceImages.map((img, i) => (
              <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden">
                <img src={img} className="w-full h-full object-cover" alt="" />
                <button
                  onClick={() => setReferenceImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2.5">
            {/* + button — opens add menu */}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefImageUpload} />
            <input ref={firstFrameRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => setFirstFrame(ev.target?.result as string);
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
            <input ref={lastFrameRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => setLastFrame(ev.target?.result as string);
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
            <div className="relative">
              <button
                onClick={() => setShowAddMenu((v) => !v)}
                className="relative w-9 h-9 rounded-[10px] border-none flex items-center justify-center cursor-pointer bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                style={{ boxShadow: "var(--shadow-raised-sm)" }}
              >
                <Plus className="w-4 h-4" />
                {(referenceImages.length + (firstFrame ? 1 : 0) + (lastFrame ? 1 : 0)) > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                    {referenceImages.length + (firstFrame ? 1 : 0) + (lastFrame ? 1 : 0)}
                  </span>
                )}
              </button>
              {showAddMenu && (
                <div
                  className="absolute top-full left-0 mt-1 z-20 rounded-xl overflow-hidden bg-card border border-border min-w-[150px]"
                  style={{ boxShadow: "var(--shadow-modal-cv)" }}
                >
                  <button
                    onClick={() => { fileInputRef.current?.click(); setShowAddMenu(false); }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left border-none cursor-pointer hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" /> Reference image
                  </button>
                  {mode === "video" && (
                    <>
                      <button
                        onClick={() => { firstFrameRef.current?.click(); setShowAddMenu(false); }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left border-none cursor-pointer hover:bg-secondary transition-colors whitespace-nowrap"
                        style={{ color: firstFrame ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                      >
                        <Plus className="w-3.5 h-3.5" /> First frame {firstFrame && "✓"}
                      </button>
                      <button
                        onClick={() => { lastFrameRef.current?.click(); setShowAddMenu(false); }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left border-none cursor-pointer hover:bg-secondary transition-colors whitespace-nowrap"
                        style={{ color: lastFrame ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Last frame {lastFrame && "✓"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Image / Video toggle */}
            <TabPill
              options={[
                { value: "image" as const, label: "Image", icon: <ImageIcon className="w-3.5 h-3.5" /> },
                { value: "video" as const, label: "Video", icon: <VideoIcon className="w-3.5 h-3.5" /> },
              ]}
              value={mode}
              onChange={setMode}
              ariaLabel="Generation mode"
            />

            {/* Aspect ratio chip */}
            <div className="relative">
              <button
                onClick={() => setShowAspectMenu((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-none cursor-pointer text-sm bg-secondary text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap${showAspectMenu ? " chip-popover-open" : ""}`}
                style={{ boxShadow: "var(--shadow-raised-sm)" }}
              >
                {aspectRatio}
              </button>
              {showAspectMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowAspectMenu(false)} />
                  <div className="chip-popover">
                    <div className="chip-grid chip-grid-3">
                      {ASPECT_RATIOS.map(({ value, thumbClass }) => (
                        <button
                          key={value}
                          onClick={() => { setAspectRatio(value); setShowAspectMenu(false); }}
                          className={`chip-grid-opt${aspectRatio === value ? " active" : ""}`}
                        >
                          <div className={`ratio-thumb ${thumbClass}`} />
                          <span className="chip-grid-label">{value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Video-only: duration dropdown */}
            {mode === "video" && (
              <div className="relative">
                <button
                  onClick={() => setShowDurationMenu((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-none cursor-pointer text-sm bg-secondary text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap"
                  style={{ boxShadow: "var(--shadow-raised-sm)" }}
                >
                  {videoDuration}s
                </button>
                {showDurationMenu && (
                  <div
                    className="absolute top-full left-0 mt-1 z-20 rounded-xl overflow-hidden bg-card border border-border min-w-[70px]"
                    style={{ boxShadow: "var(--shadow-modal-cv)" }}
                  >
                    {[4, 6, 8].map((d) => (
                      <button
                        key={d}
                        onClick={() => { setVideoDuration(d); setShowDurationMenu(false); }}
                        className={`block w-full px-4 py-2 text-sm text-left border-none cursor-pointer transition-colors whitespace-nowrap ${d === videoDuration ? "text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                        style={d === videoDuration ? { background: "hsl(var(--primary) / 0.1)" } : undefined}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Variations chip */}
            <div className="relative">
              <button
                onClick={() => setShowVariationsMenu(v => !v)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-none cursor-pointer text-xs bg-secondary text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap${showVariationsMenu ? " chip-popover-open" : ""}`}
                style={{ boxShadow: "var(--shadow-raised-sm)", border: "1px solid rgba(185,205,190,0.18)" }}
              >
                <Layers className="w-3 h-3" />
                {variations}
              </button>
              {showVariationsMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowVariationsMenu(false)} />
                  <div className="chip-popover">
                    <div className="chip-grid chip-grid-2">
                      {([1,2,3,4] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => { setVariations(v); setShowVariationsMenu(false); }}
                          className={`chip-grid-opt${variations === v ? " active" : ""}`}
                        >
                          <div className={`var-thumb v${v}`}>
                            {Array.from({ length: v }).map((_, i) => <div key={i} />)}
                          </div>
                          <span className="chip-grid-label">{v}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Save-to chip — passive, never blocks generate */}
            <div className="relative">
              <button
                onClick={() => { setShowSaveToMenu(v => !v); setShowNewFolderInput(false); }}
                className={`flex items-center justify-center w-9 h-9 rounded-lg border-none cursor-pointer bg-secondary transition-colors${showSaveToMenu ? " chip-popover-open" : ""}`}
                style={{ boxShadow: "var(--shadow-raised-sm)" }}
                title={saveToFolder.id ? `Saving to: ${saveToFolder.name}` : "Add to folder"}
              >
                <FolderPlus className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              </button>

              {showSaveToMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => { setShowSaveToMenu(false); setShowNewFolderInput(false); setNewFolderName(""); }} />
                  <div className="chip-popover folder-chip-popover">
                    <p className="chip-popover-header">
                      {saveToFolder.id ? "Saving to" : "Add to folder"}
                    </p>

                    <div className="chip-grid chip-grid-3">
                      {/* User folders */}
                      {folderList.map(f => {
                        const isActive = saveToFolder.id === f.id;
                        return (
                          <button
                            key={f.id}
                            className={`folder-chip-opt${isActive ? " active" : ""}`}
                            onClick={() => {
                              setSaveToFolder(isActive ? { id: null, name: "" } : { id: f.id, name: f.name });
                              setShowSaveToMenu(false);
                            }}
                          >
                            {isActive && <span className="folder-active-badge">✓</span>}
                            {isActive && <span className="folder-deselect-hint">✕</span>}
                            <div className="folder-chip-preview">
                              {[0,1,2,3].map(i => <div key={i} />)}
                            </div>
                            <span className="folder-chip-name">{f.name}</span>
                          </button>
                        );
                      })}

                      {/* New folder tile */}
                      {showNewFolderInput ? (
                        <button className="folder-chip-opt new-folder-tile" style={{ flexDirection: "column", gap: 4 }}>
                          <input
                            autoFocus
                            style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "hsl(var(--foreground))", fontSize: 10, fontFamily: "inherit", textAlign: "center", padding: 0 }}
                            placeholder="Name…"
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleCreateFolder();
                              if (e.key === "Escape") { setShowNewFolderInput(false); setNewFolderName(""); }
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                          <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>Enter to create</span>
                        </button>
                      ) : (
                        <button
                          className="folder-chip-opt new-folder-tile"
                          onClick={e => { e.stopPropagation(); setShowNewFolderInput(true); }}
                          title="New folder"
                        >
                          <FolderPlus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Generate / Cancel button */}
          {isGenerating ? (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border cursor-pointer text-xs font-medium transition-colors"
              style={{ background: "transparent", borderColor: "rgba(255,72,0,0.35)", color: "#FF4800", fontFamily: "inherit" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,72,0,0.05)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,72,0,0.55)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,72,0,0.35)"; }}
            >
              <X className="w-3.5 h-3.5" />Cancel
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              className="w-11 h-11 rounded-xl border-none cursor-pointer flex items-center justify-center disabled:opacity-40 transition-all bg-primary text-primary-foreground"
              style={{ boxShadow: "var(--shadow-pink-btn)" }}
              title="Generate (⌘↵)"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Inline error — shown in idle state when error has cleared from top slot */}
      {generationError && viewState === "idle" && (
        <div className="max-w-2xl mx-auto w-full mt-3 px-3.5 py-2.5 rounded-lg text-xs text-center"
          style={{ background: "rgba(255,72,0,0.08)", border: "1px solid rgba(255,72,0,0.25)", color: "#FF6B33" }}>
          {generationError}
        </div>
      )}

      {/* Suggestion chips — only show when idle */}
      {viewState === "idle" && (
        <div className="suggestion-chips flex gap-2.5 justify-center flex-wrap max-w-2xl mx-auto mb-14 transition-opacity duration-150">
          {SUGGESTION_CHIPS.map(({ icon, label, starter }) => (
            <button
              key={label}
              onClick={() => handleSuggestionClick(starter)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border-none cursor-pointer text-sm bg-card text-foreground/80 hover:bg-secondary transition-colors border border-border"
            >
              <span className="text-primary">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Recent strip — only shown when idle with no results */}
      {recentToShow.length > 0 && (
        <div className="max-w-2xl mx-auto w-full">
          <div className="flex justify-between items-center mb-4">
            <p className="recent-label text-xs uppercase tracking-wider text-muted-foreground/60">Recent</p>
            <p className="text-xs cursor-pointer text-muted-foreground hover:text-foreground transition-colors">View all →</p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {recentToShow.map((a) => (
              <div key={a.id} className="recent-thumb aspect-square rounded-xl overflow-hidden relative bg-muted group"
                style={{ boxShadow: "var(--shadow-raised-sm)" }}>
                {a.url && <img src={a.url} className="w-full h-full object-cover" alt="" />}
                <span className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-primary">
                  {a.asset_type === "image" ? "IMG" : "VID"}
                </span>
                {a.asset_type === "image" && a.url && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setReferenceImages((p) => [...p, a.url])}
                      title="Use as reference image"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border-none cursor-pointer bg-black/70 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
                    >
                      <Pencil className="w-3 h-3" />Edit
                    </button>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent("add-image-to-new-workflow", { detail: { url: a.url } }))}
                      title="Open in new workflow"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border-none cursor-pointer bg-black/70 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
                    >
                      <WorkflowIcon className="w-3 h-3" />Workflow
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
