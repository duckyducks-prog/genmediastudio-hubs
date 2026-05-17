import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, Trash2, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { loadWorkflow, WorkflowListItem } from "@/lib/workflow-api";
import { useMyWorkflows, usePublicWorkflows, useDeleteWorkflow } from "@/lib/workflow-queries";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { WorkflowProvider } from "@/contexts/WorkflowContext";
import Login from "./Login";

const ADMIN_EMAILS = ["ldebortolialves@hubspot.com"];

function relativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 86400) return "today";
  if (diff < 172800) return "yesterday";
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

export default function WorkflowsPage() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  const [tab, setTab] = useState<"library" | "mine">("library");

  const { data: publicData, isLoading: loadingPublic, refetch: refetchPublic } = usePublicWorkflows();
  const { data: mineData, isLoading: loadingMine, refetch: refetchMine } = useMyWorkflows();
  const deleteWorkflow = useDeleteWorkflow();

  const publicWorkflows = publicData ?? [];
  const myWorkflows = useMemo(() =>
    (mineData ?? []).slice().sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()),
    [mineData]
  );

  const displayed = tab === "library" ? publicWorkflows : myWorkflows;
  const isLoading = loadingPublic || loadingMine;

  const handleOpen = useCallback(async (wf: WorkflowListItem) => {
    if (!wf.id) return;
    try {
      await loadWorkflow(wf.id);
      navigate("/");
    } catch (e) {
      toast({ title: "Failed to load", description: (e as Error).message, variant: "destructive" });
    }
  }, [navigate, toast]);

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkflow.mutateAsync(id);
      toast({ title: "Deleted" });
    } catch (e) {
      toast({ title: "Failed to delete", description: (e as Error).message, variant: "destructive" });
    }
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!user) return <Login />;

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <WorkflowProvider>
        <div className="min-h-screen bg-background flex flex-col">
          {/* Minimal back header */}
          <header className="border-b border-border flex items-center gap-3 px-8 py-3">
            <button
              onClick={() => navigate("/")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer flex items-center gap-1.5"
            >
              ← Back
            </button>
            <div className="w-px h-4 bg-border" />
            <h1 className="text-sm font-medium text-foreground">All Workflows</h1>
            <div className="flex-1" />
            <button onClick={() => { refetchPublic(); refetchMine(); }} className="w-8 h-8 rounded-lg flex items-center justify-center border-none bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </header>

          <main className="max-w-[1280px] mx-auto w-full px-10 py-10">
            {/* Tab pill */}
            <div className="tab-pill-dash mb-8">
              <button className={`tab-opt-dash ${tab === "library" ? "active" : ""}`} onClick={() => setTab("library")}>
                Workflow Library
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: tab === "library" ? "rgba(185,205,190,0.12)" : "rgba(0,0,0,0.3)", color: tab === "library" ? "#B9CDBE" : "inherit" }}>
                  {publicWorkflows.length}
                </span>
              </button>
              <button className={`tab-opt-dash ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>
                My Workflows
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: tab === "mine" ? "rgba(185,205,190,0.12)" : "rgba(0,0,0,0.3)", color: tab === "mine" ? "#B9CDBE" : "inherit" }}>
                  {myWorkflows.length}
                </span>
              </button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
            ) : displayed.length === 0 ? (
              <p className="text-center text-muted-foreground py-20 text-sm">
                {tab === "library" ? "No templates yet." : "No workflows yet."}
              </p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "18px" }}>
                {displayed.map((wf) => (
                  <div key={wf.id} className="dash-card" onClick={() => handleOpen(wf)}>
                    <div
                      className="relative overflow-hidden rounded-[10px] mb-3"
                      style={{ aspectRatio: "16/10", background: "hsl(var(--background))", boxShadow: "inset 2px 2px 5px rgba(0,0,0,0.55), inset -2px -2px 5px rgba(30,100,105,0.22)" }}
                    >
                      <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "14px 14px" }} />
                      {wf.thumbnail && <img src={wf.thumbnail} className="absolute inset-0 w-full h-full object-cover" alt="" />}
                      {wf.is_public && (
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider" style={{ background: "rgba(4,39,41,0.85)", backdropFilter: "blur(6px)", color: "#A8C0C0" }}>
                          <Lock className="w-3 h-3" />Template
                        </div>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2 px-0.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate leading-tight mb-0.5">{wf.name}</p>
                        <p className="text-xs" style={{ color: "#7A8E90" }}>
                          {wf.node_count ? `${wf.node_count} nodes · ` : ""}{relativeTime(wf.created_at)}
                        </p>
                      </div>
                      {(tab === "mine" || isAdmin) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); wf.id && handleDelete(wf.id); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-red-400/10 transition-colors text-red-400 flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </WorkflowProvider>
    </ThemeProvider>
  );
}
