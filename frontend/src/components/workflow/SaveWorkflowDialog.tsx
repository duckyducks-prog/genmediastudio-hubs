import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WorkflowMetadata, testWorkflowAPI } from "@/lib/workflow-api";
import { useSaveWorkflow, useUpdateWorkflow } from "@/lib/workflow-queries";
import { useAuth } from "@/lib/AuthContext";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { WorkflowNode, WorkflowEdge } from "./types";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  sanitizeWorkflowForSave,
  validatePayloadSize,
  formatBytes,
} from "@/lib/workflow-sanitizer";

// Admin users who can create public templates
const ADMIN_EMAILS = ["ldebortolialves@hubspot.com"];

interface SaveWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  existingWorkflow?: WorkflowMetadata & { id: string };
  onSaveSuccess?: (workflowId: string) => void;
  onCaptureThumbnail?: () => Promise<string | null>;
}

export default function SaveWorkflowDialog({
  open,
  onOpenChange,
  nodes,
  edges,
  existingWorkflow,
  onSaveSuccess,
  onCaptureThumbnail,
}: SaveWorkflowDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [nameError, setNameError] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [serverError, setServerError] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { state: workflowState } = useWorkflow();

  // Check if current user is admin (can create public templates)
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  // React Query mutations for save/update with automatic cache invalidation
  const saveWorkflowMutation = useSaveWorkflow();
  const updateWorkflowMutation = useUpdateWorkflow();
  const isSaving = saveWorkflowMutation.isPending || updateWorkflowMutation.isPending;

  // Populate form when editing existing workflow
  useEffect(() => {
    if (existingWorkflow) {
      setName(existingWorkflow.name);
      setDescription(existingWorkflow.description);
      setIsPublic(existingWorkflow.is_public);
      setBackgroundImage((existingWorkflow as any).background_image || null);
    } else {
      setName("");
      setDescription("");
      setIsPublic(false);
      setBackgroundImage(null);
    }
    // Clear errors when dialog opens/closes
    setServerError("");
    setNameError("");
    setWorkflowError("");
  }, [existingWorkflow, open]);

  const handleBackgroundImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPG, PNG, or WebP image",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `Image must be less than 5MB (current: ${(file.size / (1024 * 1024)).toFixed(2)}MB)`,
        variant: "destructive",
      });
      return;
    }

    // Read file as data URL
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setBackgroundImage(result);
    };
    reader.onerror = () => {
      toast({
        title: "Failed to read image",
        description: "Please try again",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    let hasError = false;

    // Validate name
    if (!name.trim()) {
      setNameError("Workflow name is required");
      hasError = true;
    } else {
      setNameError("");
    }

    // Validate workflow not empty
    if (nodes.length === 0) {
      setWorkflowError("Please add at least one node before saving");
      hasError = true;
    } else {
      setWorkflowError("");
    }

    if (hasError) {
      return;
    }

    try {
      // Capture thumbnail before sanitizing
      let thumbnail: string | undefined;
      if (onCaptureThumbnail) {
        logger.debug('[SaveWorkflowDialog] Capturing thumbnail...');
        const thumbnailData = await onCaptureThumbnail();
        if (thumbnailData) {
          thumbnail = thumbnailData;
          logger.debug('[SaveWorkflowDialog] Thumbnail captured:',
            `${Math.round(thumbnailData.length / 1024)}KB`);
        } else {
          console.warn('[SaveWorkflowDialog] Thumbnail capture returned null');
        }
      }

      // Sanitize workflow data (remove large base64 images)
      logger.debug('[SaveWorkflowDialog] Sanitizing workflow before save...');
      const sanitized = sanitizeWorkflowForSave(nodes, edges);

      // Validate payload size
      const sizeValidation = validatePayloadSize(sanitized.sanitizedSize);

      if (!sizeValidation.valid) {
        setServerError(sizeValidation.error!);
        toast({
          title: "Payload too large",
          description: sizeValidation.error,
          variant: "destructive",
        });
        return;
      }

      if (sizeValidation.warning) {
        console.warn('[SaveWorkflowDialog]', sizeValidation.warning);
      }

      logger.debug('[SaveWorkflowDialog] Payload stats:', {
        originalSize: formatBytes(sanitized.originalSize),
        sanitizedSize: formatBytes(sanitized.sanitizedSize),
        removed: formatBytes(sanitized.removed),
        nodes: sanitized.nodes.length,
        edges: sanitized.edges.length,
      });

      const workflowData = {
        name: name.trim(),
        description: description.trim(),
        is_public: isPublic,
        nodes: sanitized.nodes,
        edges: sanitized.edges,
        thumbnail,
        background_image: isPublic ? backgroundImage || undefined : undefined,
        mode: workflowState.mode,
      };

      if (existingWorkflow?.id) {
        // Update existing workflow using React Query mutation
        await updateWorkflowMutation.mutateAsync({
          workflowId: existingWorkflow.id,
          workflow: workflowData as any,
        });
        toast({
          title: "Workflow updated",
          description: `"${name}" has been updated successfully`,
        });
        onSaveSuccess?.(existingWorkflow.id);
      } else {
        // Save new workflow using React Query mutation
        const result = await saveWorkflowMutation.mutateAsync(workflowData);
        toast({
          title: "Workflow saved",
          description: `"${name}" has been saved successfully`,
        });
        onSaveSuccess?.(result.id);
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Error saving workflow:", error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Provide user-friendly error messages
      let userFriendlyMessage = errorMessage;
      let detailedMessage = errorMessage;

      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        userFriendlyMessage = 'Workflow API endpoint not found';
        detailedMessage = 'The backend API may not be properly deployed or the router is not mounted at /workflows. Contact support.';
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('Authentication failed')) {
        userFriendlyMessage = 'Authentication failed';
        detailedMessage = 'Your session may have expired. Please sign out and sign back in.';
      } else if (errorMessage.includes('403') || errorMessage.includes('Access denied') || errorMessage.includes('Forbidden')) {
        userFriendlyMessage = 'Access denied';
        detailedMessage = 'You may not have permission to save workflows. Contact your administrator.';
      } else if (errorMessage.includes('413') || errorMessage.includes('Payload too large')) {
        userFriendlyMessage = 'Workflow too large';
        detailedMessage = 'The workflow is too large to save. Try reducing the number of nodes or removing large images. ' + errorMessage;
      } else if (errorMessage.includes('CORS') || errorMessage.includes('Network') || errorMessage.includes('Cannot connect')) {
        userFriendlyMessage = 'Cannot connect to backend';
        detailedMessage = 'Network error or CORS configuration issue. The backend may be down or unreachable.';
      } else if (errorMessage.includes('500') || errorMessage.includes('Server error')) {
        userFriendlyMessage = 'Backend server error';
        detailedMessage = errorMessage;
      } else if (errorMessage.includes('Invalid workflow data')) {
        userFriendlyMessage = 'Validation error';
        detailedMessage = errorMessage;
      }

      setServerError(detailedMessage);

      toast({
        title: userFriendlyMessage,
        description: detailedMessage,
        variant: "destructive",
      });
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setServerError("");

    try {
      const result = await testWorkflowAPI();

      if (result.available) {
        toast({
          title: "Connection successful",
          description: "Workflow API is accessible. You can save workflows.",
        });
        setServerError("");
      } else {
        const errorMsg = `API Status: ${result.endpoints.list ? '✓' : '✗'} List endpoint\n${result.details || result.error || 'Unknown error'}`;
        setServerError(errorMsg);
        toast({
          title: "Connection failed",
          description: result.details || result.error || "Cannot reach workflow API",
          variant: "destructive",
        });
      }
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Connection test failed");
      toast({
        title: "Connection test failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {existingWorkflow ? "Update Workflow" : "Save Workflow"}
          </DialogTitle>
          <DialogDescription>
            {existingWorkflow
              ? "Update the details of your workflow"
              : "Give your workflow a name and description"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          <div className="space-y-2">
            <Label htmlFor="workflow-name">Name *</Label>
            <Input
              id="workflow-name"
              placeholder="My awesome workflow"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim() !== "") {
                  setNameError("");
                }
              }}
              disabled={isSaving}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "name-error" : undefined}
              className={nameError ? "border-red-500 focus-visible:ring-red-500" : ""}
            />
            {nameError && (
              <p id="name-error" className="text-sm text-red-500">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="workflow-description">Description</Label>
            <Textarea
              id="workflow-description"
              placeholder="Describe what this workflow does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
              rows={3}
            />
          </div>

          {/* Share as template - Admin only */}
          {isAdmin && (
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="workflow-public">Share as template</Label>
                <p className="text-sm text-muted-foreground">
                  Make this workflow available to all users
                </p>
              </div>
              <Switch
                id="workflow-public"
                checked={isPublic}
                onCheckedChange={setIsPublic}
                disabled={isSaving}
              />
            </div>
          )}

          {/* Background Image Upload - Only for templates (admin only) */}
          {isAdmin && isPublic && (
            <div className="space-y-2">
              <Label htmlFor="background-image">Template Background Image (Optional)</Label>
              <p className="text-sm text-muted-foreground">
                Upload a custom background image for your template card
              </p>

              {backgroundImage ? (
                <div className="relative aspect-video rounded-lg overflow-hidden border border-border">
                  <img
                    src={backgroundImage}
                    alt="Background preview"
                    className="w-full h-full object-cover"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => setBackgroundImage(null)}
                    disabled={isSaving}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="background-image"
                  className="flex flex-col items-center justify-center w-full aspect-video border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col items-center justify-center py-6">
                    <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload background image
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, or WebP (max 5MB)
                    </p>
                  </div>
                  <input
                    id="background-image"
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleBackgroundImageUpload}
                    disabled={isSaving}
                  />
                </label>
              )}
            </div>
          )}

          <div className={`rounded-lg p-3 text-sm ${workflowError ? "bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800/50 dark:text-red-400" : "bg-muted/50 text-muted-foreground"}`}>
            <p>
              <strong>Workflow info:</strong>
            </p>
            <p>• {nodes.length} nodes</p>
            <p>• {edges.length} connections</p>
            {workflowError && (
              <p className="mt-2 text-sm font-medium">{workflowError}</p>
            )}
          </div>

          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Server Error</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">
                {serverError}
              </AlertDescription>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
              >
                {isTestingConnection ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !!nameError || nodes.length === 0}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {existingWorkflow ? "Update" : "Save"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
