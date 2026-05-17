import { useState, useMemo } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadWorkflow, SavedWorkflow } from "@/lib/workflow-api";
import { useMyWorkflows, usePublicWorkflows } from "@/lib/workflow-queries";
import { SidePanel } from "@/components/ui/SidePanel";
import { TabPill } from "@/components/ui/TabPill";
import { WorkflowThumb } from "./WorkflowThumb";

interface WorkflowLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadWorkflow: (workflow: SavedWorkflow) => void;
  onNewWorkflow?: () => void;
}

export default function WorkflowLoadDialog({
  open,
  onOpenChange,
  onLoadWorkflow,
  onNewWorkflow,
}: WorkflowLoadDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"mine" | "templates">("mine");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: myData, isLoading: loadingMine } = useMyWorkflows({ enabled: open });
  const { data: publicData, isLoading: loadingPublic } = usePublicWorkflows({ enabled: open });

  const allWorkflows = useMemo(() => {
    const source = tab === "mine" ? (myData ?? []) : (publicData ?? []);
    return [...source].sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
        new Date(a.updated_at ?? a.created_at ?? 0).getTime()
    );
  }, [tab, myData, publicData]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return allWorkflows;
    const q = searchQuery.toLowerCase();
    return allWorkflows.filter(
      w =>
        w.name.toLowerCase().includes(q) ||
        (w.description ?? "").toLowerCase().includes(q)
    );
  }, [allWorkflows, searchQuery]);

  const handleLoad = async (wf: SavedWorkflow) => {
    if (!wf.id) return;
    setLoadingId(wf.id);
    try {
      const full = await loadWorkflow(wf.id);
      onLoadWorkflow(full);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Failed to load",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoadingId(null);
    }
  };

  const isLoading = tab === "mine" ? loadingMine : loadingPublic;

  return (
    <SidePanel isOpen={open} onClose={() => onOpenChange(false)} title="Workflows" width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
        {/* Search */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "hsl(var(--background))", borderRadius: 8,
            padding: "7px 10px",
            boxShadow: "inset 1.5px 1.5px 4px rgba(0,0,0,0.45), inset -1.5px -1.5px 4px rgba(30,100,105,0.2)",
            flexShrink: 0,
          }}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search workflows…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "hsl(var(--foreground))", fontSize: 12, fontFamily: "inherit",
            }}
          />
        </div>

        {/* Tabs — alignSelf keeps pill sized to content, not stretched */}
        <div style={{ alignSelf: "flex-start" }}>
          <TabPill
            options={[
              { value: "mine" as const, label: "My Workflows" },
              { value: "templates" as const, label: "Templates" },
            ]}
            value={tab}
            onChange={setTab}
            ariaLabel="Workflow source"
          />
        </div>

        {/* Grid — outer div handles scroll, inner div is the grid */}
        {isLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "thin" }}>
          <div
            style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 10, alignContent: "start", paddingRight: 4,
            }}
          >
            {/* New workflow tile */}
            <button
              onClick={() => { onNewWorkflow?.(); onOpenChange(false); }}
              style={{
                width: "100%", background: "transparent",
                border: "1.5px dashed rgba(185,205,190,0.25)",
                borderRadius: 10, cursor: "pointer", display: "flex",
                flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 8, aspectRatio: "16/14",
                padding: 12, fontFamily: "inherit",
                transition: "border-color 150ms, background 150ms",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(185,205,190,0.5)";
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(185,205,190,0.04)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(185,205,190,0.25)";
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(185,205,190,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <span style={{ fontSize: 11, color: "hsl(var(--primary))", fontWeight: 500 }}>New workflow</span>
              <p style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", margin: 0 }}>Start from blank</p>
            </button>

            {/* Workflow cards */}
            {filtered.map(wf => (
              <button
                key={wf.id}
                onClick={() => handleLoad(wf as SavedWorkflow)}
                disabled={loadingId === wf.id}
                style={{
                  width: "100%", background: "hsl(var(--secondary))", borderRadius: 10,
                  overflow: "hidden", cursor: loadingId === wf.id ? "wait" : "pointer",
                  border: "none", padding: 0, textAlign: "left",
                  fontFamily: "inherit", position: "relative",
                  boxShadow: "0 0 0 1px rgba(185,205,190,0.06)",
                  transition: "box-shadow 150ms, transform 150ms",
                  display: "flex", flexDirection: "column",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1px rgba(185,205,190,0.3)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1px rgba(185,205,190,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "none";
                }}
              >
                {loadingId === wf.id && (
                  <div
                    style={{
                      position: "absolute", inset: 0, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      background: "rgba(0,0,0,0.4)", zIndex: 2,
                    }}
                  >
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                )}
                <WorkflowThumb
                  nodes={(wf as any).nodes ?? []}
                  thumbnail={(wf as any).thumbnail}
                />
                <div style={{ padding: "9px 11px 11px" }}>
                  <p
                    style={{
                      fontSize: 11, fontWeight: 500, color: "hsl(var(--foreground))",
                      margin: "0 0 2px", whiteSpace: "nowrap",
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {wf.name}
                  </p>
                  <p style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", margin: 0 }}>
                    {wf.node_count ?? 0} nodes
                    {wf.updated_at
                      ? ` · ${new Date(wf.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : ""}
                  </p>
                </div>
              </button>
            ))}

            {filtered.length === 0 && !isLoading && (
              <div
                style={{
                  gridColumn: "1 / -1", padding: "40px 20px",
                  textAlign: "center", color: "hsl(var(--muted-foreground))", fontSize: 12,
                }}
              >
                {tab === "templates"
                  ? "No templates yet"
                  : searchQuery
                  ? "No workflows match your search"
                  : "No workflows yet"}
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
