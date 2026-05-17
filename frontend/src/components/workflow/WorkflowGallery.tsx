import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Carousel } from "@/components/Carousel";
import {
  Plus,
  RefreshCw,
  Lock,
  MoreHorizontal,
  Image as ImageIcon,
  Layers,
  Trash2,
  ExternalLink,
  Loader2,
  Folder,
} from "lucide-react";
import { loadWorkflow, SavedWorkflow, WorkflowListItem } from "@/lib/workflow-api";
import {
  useMyWorkflows,
  usePublicWorkflows,
  useDeleteWorkflow,
} from "@/lib/workflow-queries";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ElementsLibrary } from "./ElementsLibrary";
import { API_ENDPOINTS } from "@/lib/api-config";
import { auth } from "@/lib/firebase";
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

const ADMIN_EMAILS = ["ldebortolialves@hubspot.com"];

interface WorkflowGalleryProps {
  onLoadWorkflow: (workflow: SavedWorkflow) => void;
  onNewWorkflow: () => void;
}

interface AssetItem {
  id: string;
  url: string;
  asset_type: "image" | "video";
  prompt?: string;
  created_at?: string;
  mime_type?: string;
}

interface FolderCard {
  id: string;
  name: string;
  created_at?: string;
  previews: string[];
  item_count: number;
  isVirtual?: boolean;
}

function relativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 86400) return "today";
  if (diff < 172800) return "yesterday";
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

// OverflowMenu — generic dropdown anchored to trigger
function OverflowMenu({ items, onClose }: {
  items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute right-0 top-full mt-1 z-50 rounded-xl py-1.5 min-w-[180px]"
        style={{
          background: "hsl(var(--card))",
          boxShadow: "-10px -10px 22px rgba(30, 100, 105, 0.4), 10px 10px 26px rgba(0, 0, 0, 0.75)",
        }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose(); }}
            className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left border-none cursor-pointer transition-colors ${item.danger ? "text-red-400 hover:bg-red-400/10" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

// WorkflowCard
function WorkflowCard({
  workflow,
  onOpen,
  onDelete,
  canDelete,
}: {
  workflow: WorkflowListItem;
  onOpen: (wf: WorkflowListItem) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const nodeCount = workflow.node_count ?? 0;
  const meta = [
    nodeCount > 0 && `${nodeCount} node${nodeCount !== 1 ? "s" : ""}`,
    relativeTime(workflow.created_at),
  ].filter(Boolean).join(" · ");

  const menuItems = [
    { label: "Open", icon: <ExternalLink className="w-4 h-4" />, onClick: () => onOpen(workflow) },
    ...(canDelete ? [{ label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => workflow.id && onDelete(workflow.id), danger: true as const }] : []),
  ];

  return (
    <div
      className="dash-card group"
      onClick={() => !menuOpen && onOpen(workflow)}
    >
      {/* Thumbnail */}
      <div
        className="relative overflow-hidden rounded-[10px] mb-3"
        style={{
          aspectRatio: "16/10",
          background: "hsl(var(--background))",
          boxShadow: "inset 2px 2px 5px rgba(0,0,0,0.55), inset -2px -2px 5px rgba(30,100,105,0.22)",
        }}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
        />
        {/* Thumbnail image if available */}
        {workflow.thumbnail && (
          <img src={workflow.thumbnail} className="absolute inset-0 w-full h-full object-cover" alt="" />
        )}
        {/* Template badge */}
        {workflow.is_public && (
          <div
            className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider"
            style={{ background: "rgba(4,39,41,0.85)", backdropFilter: "blur(6px)", color: "#A8C0C0" }}
          >
            <Lock className="w-3 h-3" />Template
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-start justify-between gap-2 px-0.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate leading-tight mb-0.5">{workflow.name}</p>
          <p className="text-xs" style={{ color: "#7A8E90" }}>{meta}</p>
        </div>
        <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-secondary transition-colors text-muted-foreground"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && <OverflowMenu items={menuItems} onClose={() => setMenuOpen(false)} />}
        </div>
      </div>
    </div>
  );
}

// FolderTile — used for both "All assets" virtual card and real folders
function FolderTile({ folder, onClick }: { folder: FolderCard; onClick?: () => void }) {
  const tiles = [...folder.previews, ...Array(4).fill(null)].slice(0, 4);
  return (
    <div className="dash-card" style={{ cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div
        className="relative rounded-[10px] mb-3"
        style={{
          aspectRatio: "1",
          background: "hsl(var(--background))",
          boxShadow: "inset 2px 2px 5px rgba(0,0,0,0.55), inset -2px -2px 5px rgba(30,100,105,0.22)",
          overflow: "hidden",
        }}
      >
        <div className="absolute inset-2.5 grid grid-cols-2 grid-rows-2 gap-1">
          {tiles.map((url, i) => (
            <div key={i} className="rounded-[5px] overflow-hidden" style={{ background: "hsl(var(--secondary))" }}>
              {url && <img src={url} className="w-full h-full object-cover" alt="" />}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-2.5 px-0.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "hsl(var(--secondary))", boxShadow: "-3px -3px 7px rgba(30,100,105,0.4), 3px 3px 8px rgba(0,0,0,0.6)" }}
        >
          <Folder className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-medium text-foreground truncate leading-tight mb-0.5">{folder.name}</p>
          <p className="text-xs" style={{ color: "#7A8E90" }}>
            {folder.item_count} item{folder.item_count !== 1 ? "s" : ""}
            {!folder.isVirtual && folder.created_at ? ` · ${relativeTime(folder.created_at)}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

// Main component
export default function WorkflowGallery({ onLoadWorkflow, onNewWorkflow }: WorkflowGalleryProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  // Workflow data
  const { data: publicWorkflowsData, isLoading: isLoadingPublic, refetch: refetchPublic } = usePublicWorkflows();
  const { data: myWorkflowsData, isLoading: isLoadingMy, refetch: refetchMy } = useMyWorkflows();
  const deleteWorkflowMutation = useDeleteWorkflow();

  const publicWorkflows = publicWorkflowsData ?? [];
  const myWorkflows = useMemo(() => (myWorkflowsData ?? []).slice().sort((a, b) =>
    new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  ), [myWorkflowsData]);

  // Workflow tab state
  const [wfTab, setWfTab] = useState<"library" | "mine">("library");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Asset tab state
  const [assetTab, setAssetTab] = useState<"generations" | "elements">("generations");
  const [folderCards, setFolderCards] = useState<FolderCard[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const headers: HeadersInit = { Authorization: `Bearer ${token}` };

      // Fetch all assets + folders in parallel
      const [assetsRes, foldersRes] = await Promise.all([
        fetch(API_ENDPOINTS.assets.list(), { headers }),
        fetch(API_ENDPOINTS.folders.list, { headers }),
      ]);

      const allAssets: AssetItem[] = assetsRes.ok ? (await assetsRes.json()).assets ?? [] : [];
      const rawFolders: any[] = foldersRes.ok ? (await foldersRes.json()).folders ?? [] : [];

      // "All assets" virtual card — first 4 image previews
      const allPreviews = allAssets
        .filter(a => a.asset_type === "image")
        .slice(0, 4)
        .map(a => a.url);

      const virtualAll: FolderCard = {
        id: "__all__",
        name: "All assets",
        previews: allPreviews,
        item_count: allAssets.length,
        isVirtual: true,
      };

      // Real folder cards — enrich with previews (batch, up to 8 folders)
      const enriched: FolderCard[] = await Promise.all(
        rawFolders.slice(0, 8).map(async (f: any) => {
          try {
            const ar = await fetch(API_ENDPOINTS.assets.list(undefined, f.id), { headers });
            if (!ar.ok) return { id: f.id, name: f.name, created_at: f.created_at, previews: [], item_count: 0 };
            const ad = await ar.json();
            const imgs = (ad.assets ?? []).filter((a: any) => a.asset_type === "image").slice(0, 4);
            return { id: f.id, name: f.name, created_at: f.created_at, previews: imgs.map((a: any) => a.url), item_count: ad.assets?.length ?? 0 };
          } catch {
            return { id: f.id, name: f.name, created_at: f.created_at, previews: [], item_count: 0 };
          }
        })
      );

      setFolderCards([virtualAll, ...enriched]);
    } catch { /* silent */ }
    finally { setAssetsLoading(false); }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const handleOpenWorkflow = useCallback(async (wf: WorkflowListItem) => {
    if (!wf.id) return;
    try {
      const full = await loadWorkflow(wf.id);
      onLoadWorkflow(full);
    } catch (e) {
      toast({ title: "Failed to load workflow", description: (e as Error).message, variant: "destructive" });
    }
  }, [onLoadWorkflow, toast]);

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkflowMutation.mutateAsync(id);
      toast({ title: "Workflow deleted" });
    } catch (e) {
      toast({ title: "Failed to delete", description: (e as Error).message, variant: "destructive" });
    } finally { setDeleteId(null); }
  };


  const displayedWorkflows = wfTab === "library" ? publicWorkflows : myWorkflows;
  const isLoadingWf = isLoadingPublic || isLoadingMy;

  return (
    <div className="max-w-[1440px] mx-auto py-11 pb-20 space-y-14" style={{ paddingLeft: "clamp(32px, 4vw, 64px)", paddingRight: "clamp(32px, 4vw, 64px)" }}>

      {/* Workflows section */}
      <section>
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-2xl font-medium tracking-tight text-foreground mb-1">Workflows</h2>
            <p className="text-sm text-muted-foreground">Build pipelines and reuse templates</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate("/workflows")}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
            >
              View all →
            </button>
            <button
              onClick={() => { refetchPublic(); refetchMy(); }}
              className="w-9 h-9 rounded-[10px] flex items-center justify-center border-none cursor-pointer bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              style={{ boxShadow: "-4px -4px 9px rgba(30,100,105,0.4), 4px 4px 10px rgba(0,0,0,0.6)" }}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onNewWorkflow} className="btn-soft-tint">
              <Plus className="w-3.5 h-3.5" />New workflow
            </button>
          </div>
        </div>

        {/* Tab pill */}
        <div className="tab-pill-dash mb-6">
          <button className={`tab-opt-dash ${wfTab === "library" ? "active" : ""}`} onClick={() => setWfTab("library")}>
            Workflow Library
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: wfTab === "library" ? "rgba(185,205,190,0.12)" : "rgba(0,0,0,0.3)", color: wfTab === "library" ? "#B9CDBE" : "inherit" }}>
              {publicWorkflows.length}
            </span>
          </button>
          <button className={`tab-opt-dash ${wfTab === "mine" ? "active" : ""}`} onClick={() => setWfTab("mine")}>
            My Workflows
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: wfTab === "mine" ? "rgba(185,205,190,0.12)" : "rgba(0,0,0,0.3)", color: wfTab === "mine" ? "#B9CDBE" : "inherit" }}>
              {myWorkflows.length}
            </span>
          </button>
        </div>

        {/* Grid */}
        {isLoadingWf ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : displayedWorkflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <p className="text-sm">{wfTab === "library" ? "Workflow library is empty" : "No workflows yet"}</p>
            {wfTab === "mine" && (
              <button onClick={onNewWorkflow} className="btn-soft-tint text-xs px-3 py-1.5">
                <Plus className="w-3 h-3" />Create your first
              </button>
            )}
          </div>
        ) : (
          <Carousel cardStep={318}>
            {displayedWorkflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                onOpen={handleOpenWorkflow}
                onDelete={(id) => setDeleteId(id)}
                canDelete={wfTab === "mine" || !!isAdmin}
              />
            ))}
          </Carousel>
        )}
      </section>

      {/* Assets section */}
      <section>
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-2xl font-medium tracking-tight text-foreground mb-1">Assets</h2>
            <p className="text-sm text-muted-foreground">Your generations and reusable elements</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate(`/assets?tab=${assetTab}`)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
            >
              View all →
            </button>
            {assetTab === "generations" && (
              <button
                onClick={loadAssets}
                className="w-9 h-9 rounded-[10px] flex items-center justify-center border-none cursor-pointer bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                style={{ boxShadow: "-4px -4px 9px rgba(30,100,105,0.4), 4px 4px 10px rgba(0,0,0,0.6)" }}
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tab pill */}
        <div className="tab-pill-dash mb-6">
          <button className={`tab-opt-dash ${assetTab === "generations" ? "active" : ""}`} onClick={() => setAssetTab("generations")}>
            <ImageIcon className="w-3.5 h-3.5" />Generations
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: assetTab === "generations" ? "rgba(185,205,190,0.12)" : "rgba(0,0,0,0.3)", color: assetTab === "generations" ? "#B9CDBE" : "inherit" }}>
              {folderCards[0]?.item_count ?? 0}
            </span>
          </button>
          <button className={`tab-opt-dash ${assetTab === "elements" ? "active" : ""}`} onClick={() => setAssetTab("elements")}>
            <Layers className="w-3.5 h-3.5" />Elements
          </button>
        </div>

        {/* Content */}
        {assetTab === "generations" ? (
          assetsLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : folderCards.length === 0 || folderCards[0]?.item_count === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <p className="text-sm">No generations yet — run a workflow to create some</p>
              <button onClick={onNewWorkflow} className="btn-soft-tint text-xs px-3 py-1.5">
                <Plus className="w-3 h-3" />Start a workflow
              </button>
            </div>
          ) : (
            <Carousel cardStep={256} className="asset-carousel">
              {folderCards.map((folder) => (
                <FolderTile
                  key={folder.id}
                  folder={folder}
                  onClick={() => navigate("/assets")}
                />
              ))}
            </Carousel>
          )
        ) : (
          <ElementsLibrary />
        )}
      </section>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
