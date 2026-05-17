import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  User, MapPin, Camera, Sun, Sparkles, Package2,
  ChevronLeft, Plus, Trash2, Loader2, Check, Upload, Wand2, X, Lock as LockIcon, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { WorkflowProvider } from "@/contexts/WorkflowContext";
import {
  SceneElement, ElementType,
  listSceneElements, createSceneElement, updateSceneElement, deleteSceneElement,
} from "@/lib/scene-elements-api";
import { API_ENDPOINTS } from "@/lib/api-config";
import { auth } from "@/lib/firebase";
import { isAdmin, isAdminOnly, isImageOnly } from "@/lib/permissions";
import { invalidateElementChipCache } from "@/components/workflow/nodes/PromptInputNode";
import Login from "./Login";

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORIES: Record<ElementType, { label: string; singular: string; icon: React.ReactNode; description: string }> = {
  character:    { label: "Characters",    singular: "Character",    icon: <User className="w-4 h-4" />,     description: "People and personas"          },
  camera_angle: { label: "Camera Angles", singular: "Camera Angle", icon: <Camera className="w-4 h-4" />,   description: "Shots and framing styles"     },
  location:     { label: "Locations",     singular: "Location",     icon: <MapPin className="w-4 h-4" />,   description: "Places and environments"      },
  lighting:     { label: "Lighting",      singular: "Lighting",     icon: <Sun className="w-4 h-4" />,      description: "Light setups and moods"       },
  style:        { label: "Style",         singular: "Style",        icon: <Sparkles className="w-4 h-4" />, description: "Visual styles and aesthetics" },
  prop:         { label: "Props",         singular: "Prop",         icon: <Package2 className="w-4 h-4" />, description: "Objects and items"            },
};

const VALID_TYPES = Object.keys(CATEGORIES) as ElementType[];

// ─── Draft form state ─────────────────────────────────────────────────────────

interface Draft {
  name: string;
  description: string;
  referenceUrls: string[];
  isGlobal: boolean;
}

function emptyDraft(): Draft {
  return { name: "", description: "", referenceUrls: [], isGlobal: false };
}

function draftFromElement(el: SceneElement): Draft {
  return { name: el.name, description: el.description ?? "", referenceUrls: [...el.reference_image_urls], isGlobal: el.is_global ?? false };
}

// ─── Character shot definitions ───────────────────────────────────────────────

interface ShotResult {
  label: string;
  promptSuffix: string;
  status: "idle" | "loading" | "done" | "failed";
  imageUrl: string | null;  // base64 data URL for display
  assetId: string | null;   // saved_asset_id for resolving to GCS URL
  resolvedUrl: string | null; // permanent GCS URL
}

const SHOT_DEFINITIONS: Pick<ShotResult, "label" | "promptSuffix">[] = [
  { label: "Full body · front", promptSuffix: "full body shot, frontal view, plain white background, neutral expression, soft studio lighting" },
  { label: "Full body · side",  promptSuffix: "full body shot, side profile view, plain white background, neutral expression, soft studio lighting" },
  { label: "Portrait · front",  promptSuffix: "close-up portrait, frontal view, plain white background, neutral expression, soft studio lighting" },
  { label: "Portrait · side",   promptSuffix: "close-up portrait, side profile view, plain white background, neutral expression, soft studio lighting" },
  { label: "Smile · front",     promptSuffix: "close-up portrait, frontal view, plain white background, smiling with teeth showing, soft studio lighting" },
  { label: "Smile · side",      promptSuffix: "close-up portrait, side profile view, plain white background, smiling with teeth showing, soft studio lighting" },
];

// ─── Wardrobe chips ───────────────────────────────────────────────────────────

const WARDROBE_CHIPS = [
  { id: "athletic",  label: "Athletic",       prompt: "wearing athletic wear, sportswear, activewear" },
  { id: "business",  label: "Business casual", prompt: "wearing business casual attire, smart casual" },
  { id: "formal",    label: "Formal",         prompt: "wearing a formal suit, professional business attire" },
  { id: "casual",    label: "Casual",         prompt: "wearing casual everyday clothes, relaxed outfit" },
  { id: "streetwear",label: "Streetwear",     prompt: "wearing streetwear, urban fashion" },
  { id: "evening",   label: "Evening",        prompt: "wearing evening wear, cocktail attire" },
  { id: "luxury",    label: "Luxury",         prompt: "wearing luxury high-end designer clothes" },
  { id: "beach",     label: "Beach",          prompt: "wearing beach attire, swimwear and cover-up" },
];

function idleShots(): ShotResult[] {
  return SHOT_DEFINITIONS.map((d) => ({ ...d, status: "idle", imageUrl: null, assetId: null, resolvedUrl: null }));
}

function shotsFromUrls(urls: string[]): ShotResult[] {
  return SHOT_DEFINITIONS.map((d, i) => ({
    ...d,
    status: urls[i] ? "done" : "idle",
    imageUrl: urls[i] ?? null,
    assetId: null,
    resolvedUrl: urls[i] ?? null,
  }));
}

// ─── Reference image grid ─────────────────────────────────────────────────────

function ReferenceGrid({ urls, onRemove }: { urls: string[]; onRemove: (url: string) => void }) {
  if (urls.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
      {urls.map((url) => (
        <div key={url} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "hsl(var(--background))" }}>
          <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
          <button
            onClick={() => onRemove(url)}
            style={{
              position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%",
              background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X className="w-3 h-3" style={{ color: "#fff" }} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Library picker (mini grid of existing assets, with search) ──────────────

interface LibraryAsset { id: string; url: string; prompt?: string; }

function LibraryPicker({ selected, onToggle }: { selected: Set<string>; onToggle: (url: string) => void }) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(
          `${API_ENDPOINTS.assets.list("image")}&limit=200`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        setAssets(data.assets ?? []);
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filtered = query.trim()
    ? assets.filter((a) => (a.prompt ?? "").toLowerCase().includes(query.toLowerCase()))
    : assets;

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (assets.length === 0) return <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: "16px 0" }}>No images in library yet</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 7,
        background: "hsl(var(--background))", borderRadius: 8,
        padding: "6px 10px",
        boxShadow: "inset 1.5px 1.5px 4px rgba(0,0,0,0.45), inset -1.5px -1.5px 4px rgba(30,100,105,0.2)",
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by prompt…"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "hsl(var(--foreground))", fontSize: 11, fontFamily: "inherit",
          }}
        />
        {query && (
          <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "hsl(var(--muted-foreground))", lineHeight: 1 }}>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: "12px 0" }}>No results for "{query}"</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 6, maxHeight: 280, overflowY: "auto", scrollbarWidth: "thin" }}>
          {filtered.map((a) => {
            const isSelected = selected.has(a.url);
            return (
              <div
                key={a.id}
                onClick={() => onToggle(a.url)}
                title={a.prompt ?? ""}
                style={{
                  position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden",
                  cursor: "pointer", outline: isSelected ? "2px solid hsl(var(--primary))" : "none",
                  outlineOffset: 1,
                }}
              >
                <img src={a.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={a.prompt ?? ""} />
                {isSelected && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(185,205,190,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ElementStudioPage() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseFileInputRef = useRef<HTMLInputElement>(null);

  const elementType = VALID_TYPES.includes(type as ElementType) ? (type as ElementType) : null;
  const category = elementType ? CATEGORIES[elementType] : null;
  const userIsAdmin = isAdmin(user?.email);
  const accessDenied = !!elementType && isAdminOnly(elementType) && !userIsAdmin;
  const imageOnly = !!elementType && isImageOnly(elementType);

  // ── Element list ────────────────────────────────────────────────
  const [elements, setElements] = useState<SceneElement[]>([]);
  const [elementsLoading, setElementsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | "new" | null>("new");

  // ── Draft form ──────────────────────────────────────────────────
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Tabs inside main area ───────────────────────────────────────
  const [tab, setTab] = useState<"references" | "generate">("references");
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [librarySelected, setLibrarySelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);

  // ── Generate tab ────────────────────────────────────────────────
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);  // base64 for display
  const [generatedAssetId, setGeneratedAssetId] = useState<string | null>(null);

  // ── Character creation flow ──────────────────────────────────────
  const [characterPhase, setCharacterPhase] = useState<"upload" | "generating" | "approve">("upload");
  const [baseImageUrl, setBaseImageUrl] = useState<string | null>(null);
  const [baseAssetId, setBaseAssetId] = useState<string | null>(null);
  const [shotResults, setShotResults] = useState<ShotResult[]>(idleShots());
  const [showBaseLibraryPicker, setShowBaseLibraryPicker] = useState(false);
  const [baseLibrarySelected, setBaseLibrarySelected] = useState<string | null>(null);

  // ── Wardrobe styles ──────────────────────────────────────────────
  const [styles, setStyles] = useState<SceneElement[]>([]);
  const [styleCreatorOpen, setStyleCreatorOpen] = useState(false);
  const [selectedWardrobeChips, setSelectedWardrobeChips] = useState<Set<string>>(new Set());
  const [customWardrobeText, setCustomWardrobeText] = useState("");
  const [styleShots, setStyleShots] = useState<ShotResult[]>(idleShots());
  const [styleShotsPhase, setStyleShotsPhase] = useState<"idle" | "generating" | "approve">("idle");
  const [savingStyle, setSavingStyle] = useState(false);
  const [expandedStyleId, setExpandedStyleId] = useState<string | null>(null);

  // Load elements on mount
  useEffect(() => {
    if (!user || !elementType) return;
    setElementsLoading(true);
    listSceneElements(elementType)
      .then((els) => {
        setElements(els);
        if (els.length > 0) { setSelectedId(els[0].id); setDraft(draftFromElement(els[0])); }
        else { setSelectedId("new"); setDraft(emptyDraft()); }
      })
      .catch((e) => toast({ title: "Failed to load", description: e.message, variant: "destructive" }))
      .finally(() => setElementsLoading(false));
  }, [user, elementType]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectElement = (el: SceneElement) => {
    setSelectedId(el.id);
    setDraft(draftFromElement(el));
    setGeneratedUrl(null);
    setGeneratedAssetId(null);
    setShowLibraryPicker(false);
    // character flow: show existing shots in approve phase
    if (el.element_type === "character") {
      setShotResults(shotsFromUrls(el.reference_image_urls));
      setCharacterPhase(el.reference_image_urls.length > 0 ? "approve" : "upload");
      setBaseImageUrl(null);
      setBaseAssetId(null);
      setStyleCreatorOpen(false);
      setStyleShotsPhase("idle");
      setStyleShots(idleShots());
      setExpandedStyleId(null);
      // Load existing styles for this character
      listSceneElements(undefined, el.id).then(setStyles).catch(() => setStyles([]));
    }
  };

  const selectNew = () => {
    setSelectedId("new");
    setDraft(emptyDraft());
    setGeneratedUrl(null);
    setGeneratedAssetId(null);
    setShowLibraryPicker(false);
    // character flow: reset to upload phase
    setShotResults(idleShots());
    setCharacterPhase("upload");
    setBaseImageUrl(null);
    setBaseAssetId(null);
    setStyles([]);
    setStyleCreatorOpen(false);
    setStyleShotsPhase("idle");
    setStyleShots(idleShots());
  };

  // ── Save / update ───────────────────────────────────────────────
  const handleSave = async () => {
    if (!draft.name.trim() || !elementType) return;
    setSaving(true);
    try {
      const payload = { name: draft.name.trim(), element_type: elementType, description: draft.description.trim() || undefined, reference_image_urls: draft.referenceUrls, is_global: userIsAdmin && draft.isGlobal };
      if (selectedId === "new") {
        const el = await createSceneElement(payload);
        setElements((prev) => [el, ...prev]);
        setSelectedId(el.id);
        toast({ title: "Element created" });
      } else {
        const el = await updateSceneElement(selectedId!, payload);
        setElements((prev) => prev.map((e) => (e.id === el.id ? el : e)));
        toast({ title: "Element saved" });
      }
    } catch (e) {
      toast({ title: "Failed to save", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ── Delete ──────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteSceneElement(id);
      const remaining = elements.filter((e) => e.id !== id);
      setElements(remaining);
      if (selectedId === id) {
        if (remaining.length > 0) { setSelectedId(remaining[0].id); setDraft(draftFromElement(remaining[0])); }
        else selectNew();
      }
    } catch (e) {
      toast({ title: "Failed to delete", description: (e as Error).message, variant: "destructive" });
    } finally { setDeletingId(null); }
  };

  // ── Upload reference image ──────────────────────────────────────
  const handleUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { toast({ title: "Images only" }); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((res, rej) => {
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const token = await auth.currentUser?.getIdToken();
      const saveRes = await fetch(API_ENDPOINTS.assets.save, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: base64, asset_type: "image", mime_type: file.type }),
      });
      if (!saveRes.ok) throw new Error(await saveRes.text());
      const asset = await saveRes.json();
      setDraft((d) => ({ ...d, referenceUrls: [...d.referenceUrls, asset.url] }));
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally { setUploading(false); }
  }, [toast]);

  // ── Add from library picker ─────────────────────────────────────
  const applyLibrarySelection = () => {
    setDraft((d) => ({
      ...d,
      referenceUrls: [...new Set([...d.referenceUrls, ...librarySelected])],
    }));
    setLibrarySelected(new Set());
    setShowLibraryPicker(false);
  };

  // ── Generate reference image ────────────────────────────────────
  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setGenerating(true);
    setGeneratedUrl(null);
    setGeneratedAssetId(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(API_ENDPOINTS.generate.image, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: genPrompt.trim(), aspect_ratio: "1:1", number_of_images: 1 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.images?.[0]) setGeneratedUrl(`data:image/png;base64,${data.images[0]}`);
      if (data.saved_asset_id) setGeneratedAssetId(data.saved_asset_id);
    } catch (e) {
      toast({ title: "Generation failed", description: (e as Error).message, variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const addGeneratedAsReference = async () => {
    if (!generatedAssetId) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(API_ENDPOINTS.assets.get(generatedAssetId), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      const asset = await res.json();
      setDraft((d) => ({ ...d, referenceUrls: [...new Set([...d.referenceUrls, asset.url])] }));
      setGeneratedUrl(null);
      setGeneratedAssetId(null);
      setTab("references");
      toast({ title: "Added as reference" });
    } catch (e) {
      toast({ title: "Could not add reference", description: (e as Error).message, variant: "destructive" });
    }
  };

  // ── Character: upload base image ────────────────────────────────
  const uploadBaseImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { toast({ title: "Images only" }); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((res, rej) => {
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const token = await auth.currentUser?.getIdToken();
      const saveRes = await fetch(API_ENDPOINTS.assets.save, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: base64, asset_type: "image", mime_type: file.type }),
      });
      if (!saveRes.ok) throw new Error(await saveRes.text());
      const asset = await saveRes.json();
      setBaseImageUrl(asset.url);
      setBaseAssetId(asset.id);
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally { setUploading(false); }
  }, [toast]);

  // ── Character: generate all 6 shots (sequential so each informs the next) ──
  const generateAllShots = useCallback(async () => {
    if (!baseImageUrl) return;
    setCharacterPhase("generating");
    // Start with first shot loading, rest idle — shows sequential progress
    setShotResults(SHOT_DEFINITIONS.map((d, i) => ({
      ...d, status: i === 0 ? "loading" : "idle", imageUrl: null, assetId: null, resolvedUrl: null,
    })));

    const baseRef = baseAssetId ?? baseImageUrl;
    const charDesc = draft.description.trim() || draft.name.trim();
    const token = await auth.currentUser?.getIdToken();
    const accumulated: string[] = []; // asset IDs of completed shots, passed as refs to each next shot

    for (let i = 0; i < SHOT_DEFINITIONS.length; i++) {
      const def = SHOT_DEFINITIONS[i];
      const prompt = charDesc ? `${charDesc}, ${def.promptSuffix}` : def.promptSuffix;
      // base image + all previously completed shots → model keeps wardrobe/shoes/details consistent
      const refs = [baseRef, ...accumulated];

      setShotResults((prev) => prev.map((s, j) =>
        j === i ? { ...s, status: "loading" } :
        j > i  ? { ...s, status: "idle" } : s
      ));

      try {
        const res = await fetch(API_ENDPOINTS.generate.image, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ prompt, aspect_ratio: "1:1", reference_images: refs }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const assetId = data.saved_asset_id ?? null;
        if (assetId) accumulated.push(assetId);
        setShotResults((prev) => prev.map((s, j) => j === i ? {
          ...s, status: "done",
          imageUrl: data.images?.[0] ? `data:image/png;base64,${data.images[0]}` : null,
          assetId, resolvedUrl: null,
        } : s));
      } catch {
        setShotResults((prev) => prev.map((s, j) => j === i ? { ...s, status: "failed" } : s));
        // continue — don't let one failure block the rest
      }
    }

    setCharacterPhase("approve");
  }, [baseImageUrl, baseAssetId, draft.description, draft.name]);

  // ── Character: regenerate one shot (uses all other shots as refs) ─
  const generateOneShot = useCallback(async (index: number) => {
    const baseRef = baseAssetId ?? baseImageUrl;
    if (!baseRef) return;
    const charDesc = draft.description.trim() || draft.name.trim();
    const def = SHOT_DEFINITIONS[index];
    if (!def) return;
    const prompt = charDesc ? `${charDesc}, ${def.promptSuffix}` : def.promptSuffix;

    // All other completed shots as cross-refs → regenerated shot stays consistent
    const otherRefs = shotResults
      .filter((s, i) => i !== index && s.status === "done")
      .map((s) => s.assetId ?? s.resolvedUrl)
      .filter(Boolean) as string[];

    setShotResults((prev) => prev.map((s, i) => i === index ? { ...s, status: "loading" } : s));
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(API_ENDPOINTS.generate.image, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt, aspect_ratio: "1:1", reference_images: [baseRef, ...otherRefs] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setShotResults((prev) => prev.map((s, i) => i === index ? {
        ...s, status: "done",
        imageUrl: data.images?.[0] ? `data:image/png;base64,${data.images[0]}` : s.imageUrl,
        assetId: data.saved_asset_id ?? null, resolvedUrl: null,
      } : s));
    } catch (e) {
      setShotResults((prev) => prev.map((s, i) => i === index ? { ...s, status: "failed" } : s));
      toast({ title: `Shot ${index + 1} failed`, description: (e as Error).message, variant: "destructive" });
    }
  }, [baseImageUrl, baseAssetId, draft.description, draft.name, shotResults, toast]);

  // ── Character: resolve asset ID → GCS URL ────────────────────────
  const resolveAssetUrl = useCallback(async (assetId: string): Promise<string | null> => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(API_ENDPOINTS.assets.get(assetId), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      return (await res.json()).url ?? null;
    } catch { return null; }
  }, []);

  // ── Character: save with resolved URLs ───────────────────────────
  const saveCharacter = useCallback(async () => {
    if (!draft.name.trim() || !elementType) return;
    setSaving(true);
    try {
      const urls: string[] = [];
      for (const shot of shotResults) {
        if (shot.status !== "done") continue;
        if (shot.resolvedUrl) { urls.push(shot.resolvedUrl); continue; }
        if (shot.assetId) {
          const url = await resolveAssetUrl(shot.assetId);
          if (url) { urls.push(url); continue; }
        }
        if (shot.imageUrl && shot.imageUrl.startsWith("http")) urls.push(shot.imageUrl);
      }
      const payload = { name: draft.name.trim(), element_type: elementType, description: draft.description.trim() || undefined, reference_image_urls: urls, is_global: userIsAdmin && draft.isGlobal };
      if (selectedId === "new") {
        const el = await createSceneElement(payload);
        setElements((prev) => [el, ...prev]);
        setSelectedId(el.id);
        setShotResults(shotsFromUrls(urls));
        invalidateElementChipCache();
        toast({ title: `${category?.singular} created` });
      } else {
        const el = await updateSceneElement(selectedId!, payload);
        setElements((prev) => prev.map((e) => (e.id === el.id ? el : e)));
        setShotResults(shotsFromUrls(urls));
        invalidateElementChipCache();
        toast({ title: "Saved" });
      }
    } catch (e) {
      toast({ title: "Failed to save", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }, [draft, elementType, selectedId, shotResults, resolveAssetUrl, category?.singular, createSceneElement, updateSceneElement]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wardrobe: generate style shots (sequential, each informs the next) ──
  const generateStyleShots = useCallback(async () => {
    if (!elementType) return;
    const element = elements.find(e => e.id === selectedId);
    // Character's own shots are the identity anchors — use asset IDs if available, else GCS URLs
    const charRefs = (element?.reference_image_urls ?? []).slice(0, 4);
    if (!charRefs.length) return;

    const wardrobeChipPrompts = WARDROBE_CHIPS.filter(c => selectedWardrobeChips.has(c.id)).map(c => c.prompt).join(", ");
    const wardrobeText = [wardrobeChipPrompts, customWardrobeText.trim()].filter(Boolean).join(", ");
    if (!wardrobeText) return;

    setStyleShotsPhase("generating");
    setStyleShots(SHOT_DEFINITIONS.map((d, i) => ({
      ...d, status: i === 0 ? "loading" : "idle", imageUrl: null, assetId: null, resolvedUrl: null,
    })));

    const token = await auth.currentUser?.getIdToken();
    const charName = draft.name.trim();
    const accumulated: string[] = []; // asset IDs of completed style shots

    for (let i = 0; i < SHOT_DEFINITIONS.length; i++) {
      const def = SHOT_DEFINITIONS[i];
      const prompt = `${charName}, ${wardrobeText}, ${def.promptSuffix}`;
      // character identity refs + accumulated style shots → consistent wardrobe across angles
      const refs = [...charRefs, ...accumulated];

      setStyleShots(prev => prev.map((s, j) =>
        j === i ? { ...s, status: "loading" } :
        j > i  ? { ...s, status: "idle" } : s
      ));

      try {
        const res = await fetch(API_ENDPOINTS.generate.image, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ prompt, aspect_ratio: "1:1", reference_images: refs }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const assetId = data.saved_asset_id ?? null;
        if (assetId) accumulated.push(assetId);
        setStyleShots(prev => prev.map((s, j) => j === i ? {
          ...s, status: "done",
          imageUrl: data.images?.[0] ? `data:image/png;base64,${data.images[0]}` : null,
          assetId, resolvedUrl: null,
        } : s));
      } catch {
        setStyleShots(prev => prev.map((s, j) => j === i ? { ...s, status: "failed" } : s));
      }
    }

    setStyleShotsPhase("approve");
  }, [elementType, elements, selectedId, selectedWardrobeChips, customWardrobeText, draft.name]);

  const generateOneStyleShot = useCallback(async (index: number) => {
    const element = elements.find(e => e.id === selectedId);
    const charRefs = (element?.reference_image_urls ?? []).slice(0, 3);
    if (!charRefs.length) return;

    const wardrobeChipPrompts = WARDROBE_CHIPS.filter(c => selectedWardrobeChips.has(c.id)).map(c => c.prompt).join(", ");
    const wardrobeText = [wardrobeChipPrompts, customWardrobeText.trim()].filter(Boolean).join(", ");
    const def = SHOT_DEFINITIONS[index];
    if (!def || !wardrobeText) return;

    // Other completed style shots as cross-refs for consistency
    const otherStyleRefs = styleShots
      .filter((s, i) => i !== index && s.status === "done")
      .map(s => s.assetId ?? s.resolvedUrl)
      .filter(Boolean) as string[];

    setStyleShots(prev => prev.map((s, j) => j === index ? { ...s, status: "loading" } : s));
    const token = await auth.currentUser?.getIdToken();
    const prompt = `${draft.name.trim()}, ${wardrobeText}, ${def.promptSuffix}`;
    try {
      const res = await fetch(API_ENDPOINTS.generate.image, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt, aspect_ratio: "1:1", reference_images: [...charRefs, ...otherStyleRefs] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStyleShots(prev => prev.map((s, j) => j === index ? {
        ...s, status: "done",
        imageUrl: data.images?.[0] ? `data:image/png;base64,${data.images[0]}` : null,
        assetId: data.saved_asset_id ?? null, resolvedUrl: null,
      } : s));
    } catch {
      setStyleShots(prev => prev.map((s, j) => j === index ? { ...s, status: "failed" } : s));
    }
  }, [elements, selectedId, selectedWardrobeChips, customWardrobeText, draft.name, styleShots]);

  const saveStyle = useCallback(async () => {
    if (!elementType || selectedId === "new" || selectedId === null) return;
    setSavingStyle(true);

    const wardrobeChipLabels = WARDROBE_CHIPS.filter(c => selectedWardrobeChips.has(c.id)).map(c => c.label);
    const styleName = [...wardrobeChipLabels, customWardrobeText.trim()].filter(Boolean).join(" + ") || "Style";

    try {
      const urls: string[] = [];
      for (const shot of styleShots) {
        if (shot.status !== "done") continue;
        if (shot.resolvedUrl) { urls.push(shot.resolvedUrl); continue; }
        if (shot.assetId) {
          const url = await resolveAssetUrl(shot.assetId);
          if (url) urls.push(url);
        }
      }
      const el = await createSceneElement({
        name: styleName,
        element_type: elementType,
        description: undefined,
        reference_image_urls: urls,
        is_global: false,
        parent_element_id: selectedId,
      });
      setStyles(prev => [el, ...prev]);
      setStyleCreatorOpen(false);
      setStyleShotsPhase("idle");
      setStyleShots(idleShots());
      setSelectedWardrobeChips(new Set());
      setCustomWardrobeText("");
      toast({ title: `Style "${styleName}" saved` });
    } catch (e) {
      toast({ title: "Failed to save style", description: (e as Error).message, variant: "destructive" });
    } finally { setSavingStyle(false); }
  }, [elementType, selectedId, styleShots, selectedWardrobeChips, customWardrobeText, resolveAssetUrl, toast]);

  // ── Auth guards ─────────────────────────────────────────────────
  if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!user) return <Login />;
  if (!elementType || !category) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Unknown element type</div>;
  if (accessDenied) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <LockIcon className="w-6 h-6" />
      <p className="text-sm font-medium">Admin access required</p>
      <p className="text-xs">{category.label} can only be managed by admins.</p>
      <button onClick={() => navigate("/assets?tab=elements")} style={{ marginTop: 8, fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "hsl(var(--primary))", fontFamily: "inherit" }}>
        ← Back to Elements
      </button>
    </div>
  );

  const selectedElement = elements.find((e) => e.id === selectedId);
  const isDirty = selectedId === "new"
    ? draft.name.trim() !== ""
    : selectedElement ? (draft.name !== selectedElement.name || draft.description !== (selectedElement.description ?? "") || JSON.stringify(draft.referenceUrls) !== JSON.stringify(selectedElement.reference_image_urls)) : false;

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <WorkflowProvider>
        <div className="min-h-screen bg-background flex flex-col">

          {/* ── Header ── */}
          <header
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 28px",
              borderBottom: "1px solid hsl(var(--border))", flexShrink: 0,
            }}
          >
            <button
              onClick={() => navigate("/assets?tab=elements")}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "hsl(var(--muted-foreground))", fontFamily: "inherit" }}
            >
              <ChevronLeft className="w-4 h-4" />Elements
            </button>
            <span style={{ color: "rgba(185,205,190,0.2)" }}>/</span>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ color: "hsl(var(--primary))" }}>{category.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))" }}>{category.label}</span>
            </div>
            <div style={{ flex: 1 }} />
            {elementType !== "character" && (
              <button
                onClick={handleSave}
                disabled={saving || !draft.name.trim()}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 16px", borderRadius: 9, border: "none", cursor: saving || !draft.name.trim() ? "default" : "pointer",
                  fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                  background: isDirty && draft.name.trim() ? "rgba(185,205,190,0.2)" : "rgba(185,205,190,0.07)",
                  color: isDirty && draft.name.trim() ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  transition: "background 150ms, color 150ms",
                  opacity: !draft.name.trim() ? 0.4 : 1,
                }}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {selectedId === "new" ? "Create" : "Save"}
              </button>
            )}
          </header>

          {/* ── Body ── */}
          <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

            {/* ── Left sidebar: element list ── */}
            <aside
              style={{
                width: 260, flexShrink: 0, display: "flex", flexDirection: "column",
                borderRight: "1px solid hsl(var(--border))", overflowY: "auto",
                scrollbarWidth: "thin",
              }}
            >
              <div style={{ padding: "14px 14px 8px" }}>
                <button
                  onClick={selectNew}
                  className="btn-soft-tint"
                  style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
                >
                  <Plus className="w-3.5 h-3.5" />New {category.singular}
                </button>
              </div>

              {elementsLoading ? (
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 24 }}>
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : elements.length === 0 ? (
                <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: "16px 14px" }}>
                  No {category.label.toLowerCase()} yet
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", padding: "4px 8px", gap: 2 }}>
                  {elements.map((el) => (
                    <div
                      key={el.id}
                      onClick={() => selectElement(el)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "8px 10px", borderRadius: 9, cursor: "pointer",
                        background: selectedId === el.id ? "hsl(var(--secondary))" : "transparent",
                        transition: "background 120ms",
                      }}
                      onMouseEnter={e => { if (selectedId !== el.id) (e.currentTarget as HTMLDivElement).style.background = "rgba(185,205,190,0.05)"; }}
                      onMouseLeave={e => { if (selectedId !== el.id) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <p style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {el.name}
                          </p>
                          {el.is_global && (
                            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", padding: "1px 5px", borderRadius: 4, background: "rgba(185,205,190,0.12)", color: "hsl(var(--primary))", flexShrink: 0, textTransform: "uppercase" }}>
                              Global
                            </span>
                          )}
                        </div>
                        {el.reference_image_urls.length > 0 && (
                          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: 0 }}>
                            {el.reference_image_urls.length} reference{el.reference_image_urls.length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(el.id); }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 5, flexShrink: 0, opacity: 0.4 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}
                      >
                        {deletingId === el.id
                          ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                          : <Trash2 className="w-3 h-3" style={{ color: "#FF4800" }} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </aside>

            {/* ── Main studio area ── */}
            <main style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: "28px 36px", gap: 24 }}>

              {/* Name + Description */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 680 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Name
                  </label>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder={`e.g. ${elementType === "character" ? "Sarah, the CEO" : elementType === "location" ? "Rooftop at sunset" : elementType === "camera_angle" ? "Low-angle wide shot" : elementType === "lighting" ? "Golden hour backlight" : elementType === "style" ? "Cinematic noir" : "Vintage briefcase"}`}
                    style={{
                      fontSize: 22, fontWeight: 500, fontFamily: "inherit",
                      background: "transparent", border: "none", outline: "none",
                      color: "hsl(var(--foreground))", borderBottom: "1px solid hsl(var(--border))",
                      padding: "6px 0", width: "100%",
                    }}
                  />
                </div>

                {userIsAdmin && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, background: "rgba(185,205,190,0.05)", border: "1px solid rgba(185,205,190,0.1)" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--primary))", margin: "0 0 1px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Make global</p>
                      <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: 0 }}>Visible to all users as a shared chip</p>
                    </div>
                    <button
                      onClick={() => setDraft((d) => ({ ...d, isGlobal: !d.isGlobal }))}
                      style={{
                        width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", padding: 2,
                        background: draft.isGlobal ? "hsl(var(--primary))" : "rgba(185,205,190,0.15)",
                        transition: "background 150ms", position: "relative", flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", background: "#fff",
                        position: "absolute", top: 2, transition: "left 150ms",
                        left: draft.isGlobal ? 18 : 2,
                      }} />
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Description
                    <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 6, letterSpacing: 0 }}>— injected into prompts when you use this element</span>
                  </label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Describe the details that should appear in every generation using this element…"
                    rows={3}
                    style={{
                      fontSize: 13, fontFamily: "inherit", background: "hsl(var(--secondary))",
                      border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 14px",
                      outline: "none", resize: "vertical", color: "hsl(var(--foreground))",
                      boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.3)",
                    }}
                  />
                </div>
              </div>

              {/* ── Character creation flow ── */}
              {elementType === "character" ? (
              <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Phase: upload */}
                {characterPhase === "upload" && (
                  <>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>
                        Base Reference Photo
                      </p>
                      {/* Drop zone */}
                      <div
                        onClick={() => !baseImageUrl && baseFileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadBaseImage(f); }}
                        style={{
                          borderRadius: 14, border: baseImageUrl ? "none" : "2px dashed rgba(185,205,190,0.2)",
                          background: baseImageUrl ? "transparent" : "hsl(var(--secondary))",
                          cursor: baseImageUrl ? "default" : "pointer",
                          display: "flex", flexDirection: baseImageUrl ? "row" : "column",
                          alignItems: "center", justifyContent: baseImageUrl ? "flex-start" : "center",
                          gap: 14, padding: baseImageUrl ? 0 : "36px 24px",
                          minHeight: baseImageUrl ? "auto" : 160,
                          transition: "border-color 150ms",
                        }}
                      >
                        {baseImageUrl ? (
                          <>
                            <div style={{ width: 120, height: 120, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
                              <img src={baseImageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Base" />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <p style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0 }}>Reference photo uploaded</p>
                              <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: 0 }}>The studio will generate 6 character shots from this image.</p>
                              <button
                                onClick={() => { setBaseImageUrl(null); setBaseAssetId(null); }}
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "hsl(var(--muted-foreground))", padding: 0, fontFamily: "inherit", textAlign: "left" }}
                              >
                                Change photo
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            {uploading
                              ? <Loader2 className="w-6 h-6 animate-spin text-primary" />
                              : <Upload className="w-6 h-6" style={{ color: "rgba(185,205,190,0.4)" }} />}
                            <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", margin: 0, textAlign: "center" }}>
                              {uploading ? "Uploading…" : "Drop a photo here, or click to upload"}
                            </p>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowBaseLibraryPicker((v) => !v); }}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "hsl(var(--primary))", fontFamily: "inherit" }}
                            >
                              Pick from library
                            </button>
                          </>
                        )}
                      </div>
                      <input ref={baseFileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBaseImage(f); e.target.value = ""; }} />
                    </div>

                    {/* Library picker for base image */}
                    {showBaseLibraryPicker && (
                      <div style={{ borderRadius: 12, background: "hsl(var(--secondary))", padding: 14, border: "1px solid hsl(var(--border))" }}>
                        <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: "0 0 10px", fontWeight: 500 }}>Pick from your library</p>
                        <LibraryPicker
                          selected={baseLibrarySelected ? new Set([baseLibrarySelected]) : new Set()}
                          onToggle={(url) => { setBaseLibrarySelected(url === baseLibrarySelected ? null : url); setBaseImageUrl(url === baseLibrarySelected ? null : url); }}
                        />
                        {baseLibrarySelected && (
                          <button
                            onClick={() => setShowBaseLibraryPicker(false)}
                            style={{ marginTop: 10, padding: "7px 14px", borderRadius: 8, background: "rgba(185,205,190,0.15)", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 500, color: "hsl(var(--primary))" }}
                          >
                            Use this photo
                          </button>
                        )}
                      </div>
                    )}

                    {/* Create CTA */}
                    <button
                      onClick={generateAllShots}
                      disabled={!baseImageUrl || !draft.name.trim()}
                      style={{
                        alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8,
                        padding: "11px 22px", borderRadius: 11, border: "none",
                        cursor: !baseImageUrl || !draft.name.trim() ? "default" : "pointer",
                        fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                        background: "rgba(185,205,190,0.18)", color: "hsl(var(--primary))",
                        opacity: !baseImageUrl || !draft.name.trim() ? 0.35 : 1,
                        boxShadow: "-4px -4px 10px rgba(30,100,105,0.35), 4px 4px 12px rgba(0,0,0,0.6)",
                        transition: "opacity 150ms",
                      }}
                    >
                      <Sparkles className="w-4 h-4" />
                      Create Character
                    </button>
                    {!draft.name.trim() && <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: 0 }}>Fill in the character name above first</p>}
                  </>
                )}

                {/* Phase: generating or approve — 2×3 shot grid */}
                {(characterPhase === "generating" || characterPhase === "approve") && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                        {characterPhase === "generating" ? "Generating shots…" : "Approve shots"}
                      </p>
                      {characterPhase === "approve" && (
                        <button
                          onClick={() => { setCharacterPhase("upload"); setShotResults(idleShots()); }}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "hsl(var(--muted-foreground))", fontFamily: "inherit" }}
                        >
                          ← Start over
                        </button>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {shotResults.map((shot, i) => (
                        <div key={shot.label}>
                          <div style={{ position: "relative", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "hsl(var(--secondary))", boxShadow: "inset 2px 2px 5px rgba(0,0,0,0.4)" }}>
                            {shot.status === "loading" && (
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                              </div>
                            )}
                            {shot.status === "failed" && (
                              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: 0 }}>Failed</p>
                              </div>
                            )}
                            {(shot.status === "done") && shot.imageUrl && (
                              <img src={shot.imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={shot.label} />
                            )}
                            {/* Controls overlay */}
                            {characterPhase === "approve" && (
                              <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
                                <button
                                  onClick={() => generateOneShot(i)}
                                  title="Regenerate"
                                  style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                >
                                  <RefreshCw className="w-3 h-3" style={{ color: "#fff" }} />
                                </button>
                                <button
                                  onClick={() => setShotResults((prev) => prev.map((s, j) => j === i ? { ...s, status: "idle", imageUrl: null, assetId: null, resolvedUrl: null } : s))}
                                  title="Remove"
                                  style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                >
                                  <X className="w-3 h-3" style={{ color: "#fff" }} />
                                </button>
                              </div>
                            )}
                          </div>
                          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: "5px 0 0", textAlign: "center" }}>{shot.label}</p>
                        </div>
                      ))}
                    </div>

                    {characterPhase === "approve" && (
                      <>
                        <button
                          onClick={saveCharacter}
                          disabled={saving || !shotResults.some((s) => s.status === "done")}
                          style={{
                            alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8,
                            padding: "10px 22px", borderRadius: 11, border: "none",
                            cursor: saving ? "default" : "pointer",
                            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                            background: "rgba(185,205,190,0.18)", color: "hsl(var(--primary))",
                            opacity: !shotResults.some((s) => s.status === "done") ? 0.35 : 1,
                            boxShadow: "-3px -3px 8px rgba(30,100,105,0.3), 3px 3px 10px rgba(0,0,0,0.55)",
                          }}
                        >
                          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><Check className="w-4 h-4" />{selectedId === "new" ? "Save Character" : "Update Character"}</>}
                        </button>

                        {/* ── Wardrobe Styles section (only for saved characters) ── */}
                        {selectedId !== "new" && (
                          <div style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                                Wardrobe Styles
                              </p>
                              <button
                                onClick={() => { setStyleCreatorOpen(v => !v); setStyleShotsPhase("idle"); setStyleShots(idleShots()); setSelectedWardrobeChips(new Set()); setCustomWardrobeText(""); }}
                                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "hsl(var(--primary))", fontFamily: "inherit" }}
                              >
                                <Plus className="w-3.5 h-3.5" />Add style
                              </button>
                            </div>

                            {/* Existing styles */}
                            {styles.length > 0 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {styles.map((style) => (
                                  <div key={style.id}>
                                    <button
                                      onClick={() => setExpandedStyleId(expandedStyleId === style.id ? null : style.id)}
                                      style={{
                                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                                        background: expandedStyleId === style.id ? "hsl(var(--secondary))" : "rgba(185,205,190,0.04)",
                                        border: "1px solid hsl(var(--border))", borderRadius: 10,
                                        padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                                      }}
                                    >
                                      {style.reference_image_urls[0] && (
                                        <div style={{ width: 36, height: 36, borderRadius: 7, overflow: "hidden", flexShrink: 0 }}>
                                          <img src={style.reference_image_urls[0]} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                                        </div>
                                      )}
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{style.name}</p>
                                        <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: 0 }}>{style.reference_image_urls.length} shots</p>
                                      </div>
                                      <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>{expandedStyleId === style.id ? "▲" : "▼"}</span>
                                    </button>
                                    {expandedStyleId === style.id && style.reference_image_urls.length > 0 && (
                                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 6, padding: "0 2px" }}>
                                        {style.reference_image_urls.map((url, i) => (
                                          <div key={i} style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden" }}>
                                            <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {styles.length === 0 && !styleCreatorOpen && (
                              <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: 0 }}>
                                No styles yet. Add a wardrobe to generate {draft.name.split(" ")[0]} in different outfits.
                              </p>
                            )}

                            {/* Style creator */}
                            {styleCreatorOpen && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "hsl(var(--secondary))", borderRadius: 12, padding: 16, border: "1px solid hsl(var(--border))" }}>
                                <p style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0 }}>Select wardrobe</p>

                                {/* Wardrobe chip picker */}
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {WARDROBE_CHIPS.map((chip) => {
                                    const active = selectedWardrobeChips.has(chip.id);
                                    return (
                                      <button
                                        key={chip.id}
                                        onClick={() => setSelectedWardrobeChips(prev => {
                                          const n = new Set(prev);
                                          active ? n.delete(chip.id) : n.add(chip.id);
                                          return n;
                                        })}
                                        style={{
                                          padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer",
                                          fontSize: 11, fontWeight: 500, fontFamily: "inherit",
                                          background: active ? "rgba(185,205,190,0.2)" : "rgba(185,205,190,0.06)",
                                          color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                                          outline: active ? "1.5px solid hsl(var(--primary))" : "none",
                                          transition: "all 120ms",
                                        }}
                                      >
                                        {chip.label}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Custom text */}
                                <input
                                  value={customWardrobeText}
                                  onChange={e => setCustomWardrobeText(e.target.value)}
                                  placeholder="Or describe a custom wardrobe… (e.g. Victorian era gown)"
                                  className="mia-config-input"
                                  style={{ fontSize: 12 }}
                                />

                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <button
                                    onClick={generateStyleShots}
                                    disabled={styleShotsPhase === "generating" || (selectedWardrobeChips.size === 0 && !customWardrobeText.trim())}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 7,
                                      padding: "8px 18px", borderRadius: 9, border: "none",
                                      cursor: styleShotsPhase === "generating" || (selectedWardrobeChips.size === 0 && !customWardrobeText.trim()) ? "default" : "pointer",
                                      fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                                      background: "rgba(185,205,190,0.18)", color: "hsl(var(--primary))",
                                      opacity: selectedWardrobeChips.size === 0 && !customWardrobeText.trim() ? 0.35 : 1,
                                    }}
                                  >
                                    {styleShotsPhase === "generating" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</> : <><Sparkles className="w-3.5 h-3.5" />Generate Style</>}
                                  </button>
                                  <button
                                    onClick={() => setStyleCreatorOpen(false)}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "hsl(var(--muted-foreground))", fontFamily: "inherit" }}
                                  >
                                    Cancel
                                  </button>
                                </div>

                                {/* Style shot grid */}
                                {(styleShotsPhase === "generating" || styleShotsPhase === "approve") && (
                                  <>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                      {styleShots.map((shot, i) => (
                                        <div key={shot.label}>
                                          <div style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "hsl(var(--background))", boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.4)" }}>
                                            {shot.status === "loading" && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
                                            {shot.status === "done" && shot.imageUrl && <img src={shot.imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={shot.label} />}
                                            {styleShotsPhase === "approve" && (
                                              <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 3 }}>
                                                <button onClick={() => generateOneStyleShot(i)} style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                  <RefreshCw className="w-2.5 h-2.5" style={{ color: "#fff" }} />
                                                </button>
                                                <button onClick={() => setStyleShots(prev => prev.map((s, j) => j === i ? { ...s, status: "idle", imageUrl: null, assetId: null, resolvedUrl: null } : s))} style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                  <X className="w-2.5 h-2.5" style={{ color: "#fff" }} />
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                          <p style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", margin: "3px 0 0", textAlign: "center" }}>{shot.label}</p>
                                        </div>
                                      ))}
                                    </div>

                                    {styleShotsPhase === "approve" && (
                                      <button
                                        onClick={saveStyle}
                                        disabled={savingStyle || !styleShots.some(s => s.status === "done")}
                                        style={{
                                          alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 7,
                                          padding: "8px 18px", borderRadius: 9, border: "none",
                                          cursor: savingStyle ? "default" : "pointer",
                                          fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                                          background: "rgba(185,205,190,0.18)", color: "hsl(var(--primary))",
                                          opacity: !styleShots.some(s => s.status === "done") ? 0.35 : 1,
                                        }}
                                      >
                                        {savingStyle ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</> : <><Check className="w-3.5 h-3.5" />Save Style</>}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              ) : (
              /* ── Non-character types: References | Generate tabs ── */
              <div style={{ maxWidth: 680 }}>
                <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid hsl(var(--border))" }}>
                  {(imageOnly ? ["references"] as const : ["references", "generate"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      style={{
                        padding: "8px 16px", background: "none", border: "none", cursor: "pointer",
                        fontSize: 13, fontFamily: "inherit", fontWeight: 500,
                        color: tab === t ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                        borderBottom: tab === t ? "2px solid hsl(var(--primary))" : "2px solid transparent",
                        marginBottom: -1, transition: "color 120ms",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {t === "references" ? <Upload className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
                      {t === "references" ? "Reference Images" : "Generate"}
                    </button>
                  ))}
                </div>

                {/* ── References tab ── */}
                {tab === "references" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <ReferenceGrid
                      urls={draft.referenceUrls}
                      onRemove={(url) => setDraft((d) => ({ ...d, referenceUrls: d.referenceUrls.filter((u) => u !== url) }))}
                    />

                    <div style={{ display: "flex", gap: 8 }}>
                      {/* Upload button */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
                          borderRadius: 9, background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))",
                          cursor: uploading ? "default" : "pointer", fontSize: 12, fontFamily: "inherit",
                          color: "hsl(var(--foreground))", transition: "background 120ms",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(185,205,190,0.1)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "hsl(var(--secondary))")}
                      >
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Upload image
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
                      />

                      {/* Pick from library */}
                      <button
                        onClick={() => setShowLibraryPicker((v) => !v)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
                          borderRadius: 9, background: showLibraryPicker ? "rgba(185,205,190,0.12)" : "hsl(var(--secondary))",
                          border: "1px solid hsl(var(--border))", cursor: "pointer",
                          fontSize: 12, fontFamily: "inherit", color: "hsl(var(--foreground))", transition: "background 120ms",
                        }}
                        onMouseEnter={e => { if (!showLibraryPicker) (e.currentTarget.style.background = "rgba(185,205,190,0.1)"); }}
                        onMouseLeave={e => { if (!showLibraryPicker) (e.currentTarget.style.background = "hsl(var(--secondary))"); }}
                      >
                        <Sparkles className="w-3.5 h-3.5" />Pick from library
                      </button>
                    </div>

                    {/* Library picker expanded */}
                    {showLibraryPicker && (
                      <div style={{
                        borderRadius: 12, background: "hsl(var(--secondary))",
                        padding: 14, border: "1px solid hsl(var(--border))",
                        boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.3)",
                      }}>
                        <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: "0 0 10px", fontWeight: 500 }}>
                          Select images from your library
                        </p>
                        <LibraryPicker
                          selected={librarySelected}
                          onToggle={(url) => setLibrarySelected((s) => { const n = new Set(s); n.has(url) ? n.delete(url) : n.add(url); return n; })}
                        />
                        {librarySelected.size > 0 && (
                          <button
                            onClick={applyLibrarySelection}
                            style={{
                              marginTop: 10, padding: "7px 14px", borderRadius: 8,
                              background: "rgba(185,205,190,0.15)", border: "none", cursor: "pointer",
                              fontSize: 12, fontFamily: "inherit", fontWeight: 500, color: "hsl(var(--primary))",
                            }}
                          >
                            Add {librarySelected.size} image{librarySelected.size !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                    )}

                    {draft.referenceUrls.length === 0 && !showLibraryPicker && (
                      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.5 }}>
                        {imageOnly
                          ? `Upload one or more photos of this ${category.singular.toLowerCase()}. The AI will use these as visual anchors every time you include it in a generation.`
                          : `Reference images help the AI understand exactly what this ${category.singular.toLowerCase()} should look like. Upload photos or generate reference images in the Generate tab.`}
                      </p>
                    )}
                  </div>
                )}

                {/* ── Generate tab ── */}
                {tab === "generate" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>
                      Generate a reference image for this {category.singular.toLowerCase()} — describe how it should look and the AI will create it.
                    </p>
                    <textarea
                      value={genPrompt}
                      onChange={(e) => setGenPrompt(e.target.value)}
                      placeholder={`Describe the ${category.singular.toLowerCase()}…`}
                      rows={4}
                      style={{
                        fontSize: 13, fontFamily: "inherit", background: "hsl(var(--secondary))",
                        border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 14px",
                        outline: "none", resize: "vertical", color: "hsl(var(--foreground))",
                        boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.3)",
                      }}
                    />
                    <button
                      onClick={handleGenerate}
                      disabled={generating || !genPrompt.trim()}
                      style={{
                        alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 7,
                        padding: "9px 18px", borderRadius: 10, border: "none",
                        cursor: generating || !genPrompt.trim() ? "default" : "pointer",
                        fontSize: 13, fontWeight: 500, fontFamily: "inherit",
                        background: "rgba(185,205,190,0.15)", color: "hsl(var(--primary))",
                        opacity: !genPrompt.trim() ? 0.4 : 1,
                        boxShadow: "-3px -3px 7px rgba(30,100,105,0.3), 3px 3px 8px rgba(0,0,0,0.5)",
                        transition: "opacity 150ms",
                      }}
                    >
                      {generating ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Wand2 className="w-4 h-4" />Generate</>}
                    </button>

                    {generatedUrl && (
                      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                        <div style={{ width: 200, aspectRatio: "1", borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
                          <img src={generatedUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Generated" />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
                          <p style={{ fontSize: 12, color: "hsl(var(--foreground))", margin: 0, fontWeight: 500 }}>
                            Looks good?
                          </p>
                          <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: 0 }}>
                            Add it as a reference image for this {category.singular.toLowerCase()}.
                          </p>
                          <button
                            onClick={addGeneratedAsReference}
                            style={{
                              display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                              borderRadius: 9, background: "rgba(185,205,190,0.15)", border: "none",
                              cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                              fontWeight: 500, color: "hsl(var(--primary))",
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />Add to references
                          </button>
                          <button
                            onClick={() => { setGeneratedUrl(null); setGeneratedAssetId(null); }}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "left", padding: 0, fontFamily: "inherit" }}
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )} {/* end character/non-character conditional */}
            </main>
          </div>
        </div>
      </WorkflowProvider>
    </ThemeProvider>
  );
}
