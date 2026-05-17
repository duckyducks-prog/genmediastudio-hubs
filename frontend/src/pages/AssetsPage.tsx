import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Image as ImageIcon, Layers, Video as VideoIcon } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { WorkflowProvider } from "@/contexts/WorkflowContext";
import { ElementsLibrary } from "@/components/workflow/ElementsLibrary";
import { API_ENDPOINTS } from "@/lib/api-config";
import { auth } from "@/lib/firebase";
import Login from "./Login";

interface AssetItem {
  id: string;
  url: string;
  asset_type: "image" | "video";
  prompt?: string;
  created_at?: string;
  mime_type?: string;
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

function AssetCard({ asset }: { asset: AssetItem }) {
  const isVideo = asset.asset_type === "video";
  return (
    <div
      className="dash-card"
      style={{ cursor: "pointer" }}
      onClick={() => window.open(asset.url, "_blank")}
    >
      <div
        className="relative rounded-[10px] mb-3 overflow-hidden"
        style={{
          aspectRatio: "1",
          background: "hsl(var(--background))",
          boxShadow: "inset 2px 2px 5px rgba(0,0,0,0.55), inset -2px -2px 5px rgba(30,100,105,0.22)",
        }}
      >
        {isVideo ? (
          <video src={asset.url} className="absolute inset-0 w-full h-full object-cover" muted preload="metadata" />
        ) : (
          <img src={asset.url} className="absolute inset-0 w-full h-full object-cover" alt="" />
        )}
        {isVideo && (
          <div
            className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium"
            style={{ background: "rgba(4,39,41,0.85)", backdropFilter: "blur(4px)", color: "#A8C0C0" }}
          >
            <VideoIcon className="w-2.5 h-2.5" />Video
          </div>
        )}
      </div>
      <div className="px-0.5">
        <p
          className="text-xs text-foreground leading-tight mb-0.5"
          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {asset.prompt || (isVideo ? "Generated video" : "Generated image")}
        </p>
        <p className="text-[10px]" style={{ color: "#7A8E90" }}>{relativeTime(asset.created_at)}</p>
      </div>
    </div>
  );
}

export default function AssetsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as "generations" | "elements") ?? "generations";
  const [tab, setTab] = useState<"generations" | "elements">(initialTab);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setAssetsLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: HeadersInit = { Authorization: `Bearer ${token}` };
        const res = await fetch(API_ENDPOINTS.assets.list(), { headers });
        if (!res.ok) return;
        const data = await res.json();
        setAssets(data.assets ?? []);
      } catch { /* silent */ }
      finally { setAssetsLoading(false); }
    };
    load();
  }, [user]);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-7 h-7 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Login />;

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <WorkflowProvider>
        <div className="min-h-screen bg-background flex flex-col">
          <header className="border-b border-border flex items-center gap-3 px-8 py-3">
            <button
              onClick={() => navigate("/")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer flex items-center gap-1.5"
            >
              ← Back
            </button>
            <div className="w-px h-4 bg-border" />
            <h1 className="text-sm font-medium text-foreground">All Assets</h1>
          </header>

          <main className="max-w-[1280px] mx-auto w-full px-10 py-10">
            <div className="tab-pill-dash mb-8">
              <button
                className={`tab-opt-dash ${tab === "generations" ? "active" : ""}`}
                onClick={() => setTab("generations")}
              >
                <ImageIcon className="w-3.5 h-3.5" />Generations
                <span
                  className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: tab === "generations" ? "rgba(185,205,190,0.12)" : "rgba(0,0,0,0.3)", color: tab === "generations" ? "#B9CDBE" : "inherit" }}
                >
                  {assets.length}
                </span>
              </button>
              <button
                className={`tab-opt-dash ${tab === "elements" ? "active" : ""}`}
                onClick={() => setTab("elements")}
              >
                <Layers className="w-3.5 h-3.5" />Elements
              </button>
            </div>

            {tab === "generations" ? (
              assetsLoading ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                </div>
              ) : assets.length === 0 ? (
                <p className="text-center text-muted-foreground py-20 text-sm">
                  No generations yet — run a workflow to create some.
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
                  {assets.map((asset) => (
                    <AssetCard key={asset.id} asset={asset} />
                  ))}
                </div>
              )
            ) : (
              <ElementsLibrary />
            )}
          </main>
        </div>
      </WorkflowProvider>
    </ThemeProvider>
  );
}
