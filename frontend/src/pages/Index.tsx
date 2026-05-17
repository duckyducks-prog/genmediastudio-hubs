import { logger } from "@/lib/logger";
import { useState, useRef, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Home,
  Workflow as WorkflowIcon,
  FolderOpen,
  LogOut,
  Sparkles,
} from "lucide-react";
import WorkflowCanvas, {
  WorkflowCanvasRef,
} from "@/components/workflow/WorkflowCanvas";
import AssetLibrary, {
  AssetLibraryRef,
} from "@/components/library/AssetLibrary";
import WorkflowGallery from "@/components/workflow/WorkflowGallery";
import { useAuth } from "@/lib/AuthContext";
import { logOut } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { WorkflowProvider } from "@/contexts/WorkflowContext";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { CreateView } from "@/components/create/CreateView";
import Login from "./Login";

export default function Index() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const assetLibraryRef = useRef<AssetLibraryRef>(null);
  const workflowCanvasRef = useRef<WorkflowCanvasRef>(null);
  const [currentTab, setCurrentTab] = useState("home");
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [inlineLibraryTarget, setInlineLibraryTarget] = useState<{
    nodeId: string;
    assetType: "image" | "video";
  } | null>(null);

  const NavLink = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string;
  }) => (
    <button
      onClick={() => setCurrentTab(value)}
      className={`nav-cell${currentTab === value ? " nav-cell-active" : ""}`}
      title={label}
    >
      {Icon}
    </button>
  );

  // Close user menu on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setUserMenuOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Add generated image to a new blank workflow
  useEffect(() => {
    const handler = (e: Event) => {
      const { url } = (e as CustomEvent<{ url: string }>).detail;
      setCurrentTab("workflow");
      setTimeout(() => {
        workflowCanvasRef.current?.newWorkflow();
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("add-asset-node", { detail: { assetType: "image", url } }));
        }, 80);
      }, 100);
    };
    window.addEventListener("add-image-to-new-workflow", handler);
    return () => window.removeEventListener("add-image-to-new-workflow", handler);
  }, []);

  // Listen for browse-library events from WorkflowCanvas
  useEffect(() => {
    const handleBrowseLibrary = () => {
      logger.debug("[Index] Browse library event received");
      setIsLibraryOpen(true);
    };

    window.addEventListener("browse-library", handleBrowseLibrary);
    return () =>
      window.removeEventListener("browse-library", handleBrowseLibrary);
  }, []);

  // Listen for inline asset library requests from nodes
  useEffect(() => {
    const handleOpenInlineLibrary = (event: Event) => {
      const customEvent = event as CustomEvent<{
        nodeId: string;
        assetType: "image" | "video";
      }>;
      const { nodeId, assetType } = customEvent.detail;

      logger.debug("[Index] Opening inline asset library:", {
        nodeId,
        assetType,
      });

      setInlineLibraryTarget({ nodeId, assetType });
      setIsLibraryOpen(true);
    };

    window.addEventListener(
      "open-asset-library-inline",
      handleOpenInlineLibrary
    );
    return () =>
      window.removeEventListener(
        "open-asset-library-inline",
        handleOpenInlineLibrary
      );
  }, []);

  // Handle adding asset from library to workflow
  const handleAddAssetNode = (asset: any) => {
    logger.debug("[Index] Adding asset to workflow:", asset);

    // Check if this is for an inline library request (specific node)
    if (inlineLibraryTarget) {
      logger.debug("[Index] Updating node with inline asset:", {
        nodeId: inlineLibraryTarget.nodeId,
        asset,
      });

      // Dispatch event to update specific node
      window.dispatchEvent(
        new CustomEvent("update-node-asset", {
          detail: {
            nodeId: inlineLibraryTarget.nodeId,
            assetType: inlineLibraryTarget.assetType,
            assetId: asset.id,
            url: asset.url,
            mimeType: asset.mime_type,
          },
        }),
      );

      // Clear inline library target
      setInlineLibraryTarget(null);
      setIsLibraryOpen(false);

      toast({
        title: "Asset loaded",
        description: `${inlineLibraryTarget.assetType === "video" ? "Video" : "Image"} loaded into node`,
      });
    } else {
      // Regular flow: Add new node to canvas
      window.dispatchEvent(
        new CustomEvent("add-asset-node", {
          detail: {
            assetId: asset.id,
            assetType: asset.asset_type,
            url: asset.url,
            mimeType: asset.mime_type,
          },
        }),
      );

      // Switch to workflow tab
      setCurrentTab("workflow");
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <Login />;
  }

  // Show main app if authenticated
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <WorkflowProvider>
        <div className="h-screen bg-background flex flex-col overflow-hidden" style={{ height: "100dvh" }}>
        <header className="border-b border-border flex items-center gap-4 px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2Fb1d3bf7cc0eb4f0daca65fdc5a7d5179%2F30fc0e70b75040f4858161ac143ab00c?format=webp&width=800"
              alt="HubSpot"
              className="w-6 h-6"
            />
            <span className="text-sm font-medium text-foreground tracking-tight">Gen Media Studio</span>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-border flex-shrink-0" aria-hidden="true" />

          {/* Nav cells */}
          <nav className="flex gap-1.5 items-center flex-shrink-0" aria-label="Main">
            <NavLink icon={<Home className="w-4 h-4" />} label="Home" value="home" />
            <NavLink icon={<WorkflowIcon className="w-4 h-4" />} label="Canvas" value="workflow" />
            <NavLink icon={<Sparkles className="w-4 h-4" />} label="Generate" value="create" />
            <button
              onClick={() => setIsLibraryOpen(true)}
              className={`nav-cell${isLibraryOpen ? " nav-cell-active" : ""}`}
              title="Assets"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Avatar + dropdown */}
          {user && (() => {
            const name = user.displayName ?? user.email ?? "";
            const parts = name.includes("@") ? [] : name.trim().split(" ");
            const initials = parts.length >= 2
              ? `${parts[0][0]}${parts[parts.length - 1][0]}`
              : name.slice(0, 2);

            return (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-label="Open user menu"
                  className="w-9 h-9 rounded-full border-none cursor-pointer flex items-center justify-center text-xs font-medium tracking-wider text-primary bg-secondary transition-all"
                  style={{ boxShadow: "var(--shadow-raised-sm)" }}
                >
                  {initials.toUpperCase()}
                </button>

                {userMenuOpen && (
                  <>
                    {/* Click-outside backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div
                      className="absolute top-full right-0 mt-2 z-50 min-w-[220px] rounded-xl bg-card border border-border overflow-hidden"
                      style={{ boxShadow: "var(--shadow-modal-cv)" }}
                    >
                      <p className="px-3 py-2.5 text-xs text-muted-foreground break-all">
                        {user.email}
                      </p>
                      <div className="h-px bg-border mx-2" />
                      <button
                        onClick={async () => {
                          setUserMenuOpen(false);
                          try {
                            await logOut();
                            toast({ title: "Signed out", description: "You have been signed out successfully" });
                          } catch (error) {
                            toast({ title: "Sign out failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
                          }
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors border-none bg-transparent cursor-pointer text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </header>

        <div className="flex flex-1 min-h-0 gap-0 bg-background">
          <div
            className={`flex flex-col flex-1 min-h-0 bg-background ${currentTab === "workflow" || currentTab === "create" || currentTab === "home" ? "max-w-none" : "container mx-auto max-w-4xl px-4 py-8"}`}
          >
            <Tabs value={currentTab} className="w-full flex flex-col flex-1 min-h-0 bg-background">
              <TabsContent value="home" className="flex-1 min-h-0 mt-0 overflow-y-auto bg-background">
                <WorkflowGallery
                  onLoadWorkflow={(workflow) => {
                    // Load templates (public workflows) as read-only
                    const readOnly = workflow.is_public === true;

                    // Switch to workflow tab FIRST to ensure canvas is mounted
                    setCurrentTab("workflow");

                    // Then load workflow after a small delay to ensure canvas is ready
                    setTimeout(() => {
                      if (workflowCanvasRef.current?.loadWorkflow) {
                        workflowCanvasRef.current.loadWorkflow(workflow, {
                          readOnly,
                        });
                      } else {
                        console.error(
                          "[Index] Failed to load workflow - canvas not ready",
                        );
                      }
                    }, 100);
                  }}
                  onNewWorkflow={() => {
                    setCurrentTab("workflow");
                    setTimeout(() => {
                      workflowCanvasRef.current?.newWorkflow();
                    }, 100);
                  }}
                />

              </TabsContent>

              <TabsContent value="create" className="flex-1 min-h-0 mt-0 bg-background overflow-hidden">
                <CreateView onLibraryRefresh={() => assetLibraryRef.current?.refresh()} />
              </TabsContent>

              <TabsContent value="workflow" className="flex-1 min-h-0 mt-0">
                <SectionErrorBoundary sectionName="Workflow Canvas">
                <WorkflowCanvas
                  ref={workflowCanvasRef}
                  onAssetGenerated={() => {
                    logger.debug("[Index] Asset generated callback triggered");
                    logger.debug(
                      "[Index] AssetLibrary ref:",
                      assetLibraryRef.current,
                    );
                    if (assetLibraryRef.current) {
                      logger.debug("[Index] Calling refresh on asset library");
                      assetLibraryRef.current.refresh();
                    } else {
                      console.warn(
                        "[Index] AssetLibrary ref is null, cannot refresh",
                      );
                    }
                  }}
                />
                </SectionErrorBoundary>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Asset Library */}
        <AssetLibrary
          ref={assetLibraryRef}
          open={isLibraryOpen}
          onOpenChange={setIsLibraryOpen}
          onAddAssetNode={handleAddAssetNode}
        />
      </div>
      </WorkflowProvider>
    </ThemeProvider>
  );
}
