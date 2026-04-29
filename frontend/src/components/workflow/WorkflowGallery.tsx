import { logger } from "@/lib/logger";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import {
  Trash2,
  Loader2,
  RefreshCw,
  Workflow as WorkflowIcon,
  Lock,
  AlertCircle,
  ArrowUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  loadWorkflow,
  SavedWorkflow,
  WorkflowListItem,
  testWorkflowAPI,
  APITestResult,
} from "@/lib/workflow-api";
import {
  useMyWorkflows,
  usePublicWorkflows,
  useDeleteWorkflow,
  useInvalidateWorkflows,
} from "@/lib/workflow-queries";
import { useAuth } from "@/lib/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Admin users who can delete public templates
const ADMIN_EMAILS = ["ldebortolialves@hubspot.com"];

interface WorkflowGalleryProps {
  onLoadWorkflow: (workflow: SavedWorkflow) => void;
}

export default function WorkflowGallery({
  onLoadWorkflow,
}: WorkflowGalleryProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<APITestResult | null>(null);
  const [showApiTest, setShowApiTest] = useState(false);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  // Check if current user is admin (can delete public templates)
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  // React Query hooks for cached data fetching
  const {
    data: myWorkflowsData,
    isLoading: isLoadingMy,
    error: myError,
    refetch: refetchMy,
  } = useMyWorkflows();

  const {
    data: publicWorkflowsData,
    isLoading: isLoadingPublic,
    error: publicError,
    refetch: refetchPublic,
  } = usePublicWorkflows();

  const deleteWorkflowMutation = useDeleteWorkflow();
  const { invalidateAll } = useInvalidateWorkflows();

  // Derive workflow lists from query data
  const publicWorkflows = publicWorkflowsData ?? [];

  const myWorkflows = useMemo(() => {
    const list = myWorkflowsData ?? [];
    return [...list].sort((a, b) => {
      const dateA = new Date(a.created_at ?? 0).getTime();
      const dateB = new Date(b.created_at ?? 0).getTime();
      return sortNewestFirst ? dateB - dateA : dateA - dateB;
    });
  }, [myWorkflowsData, sortNewestFirst]);

  const isLoading = isLoadingMy || isLoadingPublic;

  // Show API test alert only if there was an error fetching
  useEffect(() => {
    if (publicError) {
      logger.debug("[WorkflowGallery] Error fetching public workflows");
      setShowApiTest(true);
    } else {
      setShowApiTest(false);
    }
  }, [publicError]);

  // Test API connectivity on mount
  useEffect(() => {
    const testAPI = async () => {
      const result = await testWorkflowAPI();
      setApiStatus(result);

      if (!result.available) {
        console.warn("[WorkflowGallery] API Status:", result);
        setShowApiTest(true);
      }
    };

    testAPI();
  }, []);

  const fetchWorkflows = useCallback(() => {
    refetchMy();
    refetchPublic();
  }, [refetchMy, refetchPublic]);

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkflowMutation.mutateAsync(id);
      toast({
        title: "Workflow deleted",
        description: "The workflow has been removed",
      });
    } catch (error) {
      console.error("Error deleting workflow:", error);
      toast({
        title: "Failed to delete workflow",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };


  const WorkflowCard = ({
    workflow,
    showDelete = false,
  }: {
    workflow: WorkflowListItem;
    showDelete?: boolean;
  }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);

    // Load full workflow with nodes/edges when clicked
    const handleLoadWorkflow = async () => {
      if (!workflow.id) {
        toast({
          title: "Error",
          description: "Workflow ID is missing",
          variant: "destructive",
        });
        return;
      }

      setIsLoadingWorkflow(true);
      try {
        const fullWorkflow = await loadWorkflow(workflow.id);
        onLoadWorkflow(fullWorkflow);
      } catch (error) {
        console.error("Failed to load workflow:", error);
        toast({
          title: "Failed to load workflow",
          description:
            error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsLoadingWorkflow(false);
      }
    };

    return (
      <div
        className="group relative cursor-pointer rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleLoadWorkflow}
      >
        {/* Thumbnail Image */}
        <div className="relative aspect-video bg-muted">
          {/* Templates: prioritize custom background_image over auto-generated thumbnail */}
          {workflow.is_public && (workflow as any).background_image ? (
            <img
              src={(workflow as any).background_image}
              alt={workflow.name}
              className="w-full h-full object-cover"
            />
          ) : workflow.thumbnail ? (
            <img
              src={workflow.thumbnail}
              alt={workflow.name}
              className="w-full h-full object-cover"
            />
          ) : workflow.is_public ? (
            // Default template image if no background_image or thumbnail
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2Fb1d3bf7cc0eb4f0daca65fdc5a7d5179%2F5cc32d6d0a324e819ef846f34c73c640?format=webp&width=800"
              alt={workflow.name}
              className="w-full h-full object-cover"
            />
          ) : (
            // Placeholder for personal workflows without thumbnail
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted via-muted to-accent/20">
              <WorkflowIcon className="w-16 h-16 opacity-30" />
            </div>
          )}

          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* Template badge (top-right) */}
          {workflow.is_public && (
            <div className="absolute top-2 right-2 z-10">
              <Badge
                variant="secondary"
                className="flex items-center gap-1 shadow-lg"
              >
                <Lock className="w-3 h-3" />
                Template
              </Badge>
            </div>
          )}

          {/* Action buttons overlay - show for personal workflows OR templates when admin can delete */}
          {(!workflow.is_public || showDelete) && (
            <div
              className={`absolute inset-0 bg-black/60 flex items-center justify-center gap-2 transition-opacity ${
                isHovered ? "opacity-100" : "opacity-0"
              }`}
              style={{ zIndex: 5 }}
            >
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLoadWorkflow();
                }}
                disabled={isLoadingWorkflow}
                className="shadow-lg"
              >
                {isLoadingWorkflow ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <WorkflowIcon className="w-4 h-4 mr-1" />
                )}
                {isLoadingWorkflow ? "Loading..." : "Open"}
              </Button>

              {showDelete && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(workflow.id!);
                  }}
                  className="shadow-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}

          {/* Title at bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
            <h3 className="font-semibold text-white text-base drop-shadow-lg line-clamp-2">
              {workflow.name}
            </h3>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Workflows</h2>
          <p className="text-muted-foreground">
            Browse the Workflow Library or manage your saved workflows
          </p>
        </div>
        <Button onClick={fetchWorkflows} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {showApiTest && apiStatus && !apiStatus.available && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Workflow API Unavailable</AlertTitle>
          <AlertDescription>
            Cannot connect to the backend API. You won't be able to save or load
            your own workflows.
            {apiStatus.details && (
              <span className="block mt-1 text-sm">
                <strong>Details:</strong> {apiStatus.details}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={async () => {
                const result = await testWorkflowAPI();
                setApiStatus(result);
                if (result.available) {
                  setShowApiTest(false);
                  fetchWorkflows();
                  toast({
                    title: "Connection restored",
                    description: "Workflow API is now accessible",
                  });
                } else {
                  toast({
                    title: "Still unavailable",
                    description:
                      result.details || result.error || "Cannot reach API",
                    variant: "destructive",
                  });
                }
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Connection
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="templates">
            Workflow Library
            {publicWorkflows.length > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {publicWorkflows.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="my">
            My Workflows
            {myWorkflows.length > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {myWorkflows.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-6">
          {publicWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <WorkflowIcon className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Workflow Library is empty</p>
              <p className="text-sm">Check back later for more workflows</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  showDelete={isAdmin}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="my" className="mt-6">
          {myWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <WorkflowIcon className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">No workflows yet</p>
              <p className="text-sm">Create your first workflow and save it</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortNewestFirst((prev) => !prev)}
                >
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  {sortNewestFirst ? "Newest First" : "Oldest First"}
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myWorkflows.map((workflow) => (
                  <WorkflowCard
                    key={workflow.id}
                    workflow={workflow}
                    showDelete={true}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              workflow.
            </AlertDialogDescription>
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
