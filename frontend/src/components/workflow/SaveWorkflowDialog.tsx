import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, Save, Upload, X, Sparkles, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WorkflowMetadata } from "@/lib/workflow-api";
import { useSaveWorkflow, useUpdateWorkflow } from "@/lib/workflow-queries";
import { useAuth } from "@/lib/AuthContext";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { WorkflowNode, WorkflowEdge } from "./types";
import {
  sanitizeWorkflowForSave,
  validatePayloadSize,
  formatBytes,
} from "@/lib/workflow-sanitizer";
import { Toggle } from "@/components/ui/Toggle";
import { API_ENDPOINTS } from "@/lib/api-config";
import { auth } from "@/lib/firebase";

// Admin users who can create public templates
const ADMIN_EMAILS = ["ldebortolialves@hubspot.com"];

interface SaveWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  existingWorkflow?: WorkflowMetadata & { id: string };
  onSaveSuccess?: (workflowId: string, name?: string) => void;
  onCaptureThumbnail?: () => Promise<string | null>;
  workflowId?: string;
}

export default function SaveWorkflowDialog({
  open,
  onOpenChange,
  nodes,
  edges,
  existingWorkflow,
  onSaveSuccess,
  onCaptureThumbnail,
  workflowId,
}: SaveWorkflowDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [nameError, setNameError] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [serverError, setServerError] = useState("");
  const [aiDraftedName, setAiDraftedName] = useState(false);
  const [aiDraftedDesc, setAiDraftedDesc] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { state: workflowState } = useWorkflow();

  // Check if current user is admin (can create public templates)
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  // React Query mutations for save/update with automatic cache invalidation
  const saveWorkflowMutation = useSaveWorkflow();
  const updateWorkflowMutation = useUpdateWorkflow();
  const isSaving = saveWorkflowMutation.isPending || updateWorkflowMutation.isPending;

  // Populate form when editing existing workflow; fetch AI metadata for new workflows
  useEffect(() => {
    if (!open) return;

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

      // Fetch (or generate) AI-drafted metadata
      const fetchAiMetadata = async () => {
        if (!nodes.length) return;
        setRegenLoading(true);
        try {
          const token = await auth.currentUser?.getIdToken();
          const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` as string,
          };

          let data: { name?: string; description?: string } | null = null;

          // Try cache first
          if (workflowId) {
            const cached = await fetch(API_ENDPOINTS.workflowMetadata.get(workflowId), { headers });
            if (cached.ok) data = await cached.json();
          }

          // No cache — generate now
          if (!data) {
            const gen = await fetch(API_ENDPOINTS.workflowMetadata.generate, {
              method: "POST",
              headers,
              body: JSON.stringify({
                workflow_id: workflowId ?? "draft",
                nodes: nodes.map(n => ({ type: n.type, data: { label: (n.data as any).label, customLabel: (n.data as any).customLabel, prompt: (n.data as any).prompt, outputs: (n.data as any).outputs } })),
                edges: [],
                regenerate: false,
              }),
            });
            if (gen.ok) data = await gen.json();
          }

          if (data) {
            setName(data.name ?? "");
            setDescription(data.description ?? "");
            setAiDraftedName(true);
            setAiDraftedDesc(true);
          }
        } catch {
          // Silent — user can fill in manually
        } finally {
          setRegenLoading(false);
        }
      };

      fetchAiMetadata();
    }

    // Clear errors when dialog opens/closes
    setServerError("");
    setNameError("");
    setWorkflowError("");
  }, [open, existingWorkflow, workflowId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegen = async () => {
    setRegenLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(API_ENDPOINTS.workflowMetadata.generate, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workflow_id: workflowId ?? "unknown",
          nodes: nodes.map((n) => ({ type: n.type, data: n.data })),
          edges: [],
          regenerate: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDescription(data.description);
        setAiDraftedDesc(true);
      }
    } catch {
      // Silent ignore
    } finally {
      setRegenLoading(false);
    }
  };

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
        onSaveSuccess?.(existingWorkflow.id, name);
      } else {
        // Save new workflow using React Query mutation
        const result = await saveWorkflowMutation.mutateAsync(workflowData);
        toast({
          title: "Workflow saved",
          description: `"${name}" has been saved successfully`,
        });
        onSaveSuccess?.(result.id, name);
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

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const modal = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 modal-backdrop-layer"
        style={{ zIndex: 300 }}
        onClick={() => onOpenChange(false)}
      />
      {/* Modal card */}
      <div
        role="dialog"
        aria-labelledby="save-modal-title"
        aria-modal="true"
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 301,
          width: 400, background: "hsl(var(--card))",
          borderRadius: 14, padding: "18px 20px",
          boxShadow: "-5px -5px 12px rgba(30,100,105,0.45), 5px 5px 14px rgba(0,0,0,0.75), 0 0 0 1px rgba(185,205,190,0.08)",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Save className="w-4 h-4 text-primary flex-shrink-0" />
          <h3 id="save-modal-title" style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))", margin: 0, letterSpacing: "-0.005em" }}>
            {existingWorkflow ? "Update workflow" : "Save workflow"}
          </h3>
        </div>

        {/* Errors */}
        {serverError && (
          <div style={{ background: "rgba(255,72,0,0.08)", border: "1px solid rgba(255,72,0,0.25)", borderRadius: 8, padding: "9px 12px", fontSize: 11, color: "#FF6B33" }}>
            {serverError}
          </div>
        )}
        {workflowError && (
          <div style={{ background: "rgba(255,72,0,0.08)", border: "1px solid rgba(255,72,0,0.25)", borderRadius: 8, padding: "9px 12px", fontSize: 11, color: "#FF6B33" }}>
            {workflowError}
          </div>
        )}

        {/* Name field */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Name</label>
            {aiDraftedName && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", background: "rgba(252,195,220,0.1)", borderRadius: 999, fontSize: 8, color: "#FCC3DC", fontWeight: 600, letterSpacing: "0.04em", transition: "opacity 250ms" }}>
                <Sparkles className="w-2 h-2" /> AI
              </span>
            )}
          </div>
          <input
            autoFocus
            value={name}
            onChange={e => { setName(e.target.value); if (aiDraftedName) setAiDraftedName(false); if (nameError) setNameError(""); }}
            placeholder="My awesome workflow"
            style={{
              width: "100%", background: "hsl(var(--background))", border: "none", outline: "none",
              color: "hsl(var(--foreground))", fontSize: 13, fontFamily: "inherit",
              padding: "10px 12px", borderRadius: 8, boxSizing: "border-box",
              boxShadow: "inset 1.5px 1.5px 4px rgba(0,0,0,0.55), inset -1.5px -1.5px 4px rgba(30,100,105,0.18)",
            }}
          />
          {nameError && <p style={{ fontSize: 10, color: "#FF6B33", margin: 0 }}>{nameError}</p>}
        </div>

        {/* Description field */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Description</label>
              {aiDraftedDesc && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", background: "rgba(252,195,220,0.1)", borderRadius: 999, fontSize: 8, color: "#FCC3DC", fontWeight: 600, letterSpacing: "0.04em", transition: "opacity 250ms" }}>
                  <Sparkles className="w-2 h-2" /> AI
                </span>
              )}
            </div>
            <button
              onClick={handleRegen}
              disabled={regenLoading}
              style={{ width: 22, height: 22, border: "none", background: "transparent", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: regenLoading ? "not-allowed" : "pointer", color: "hsl(var(--primary))" }}
              title="Regenerate description"
            >
              <RefreshCw className={`w-3 h-3${regenLoading ? " animate-spin" : ""}`} />
            </button>
          </div>
          <textarea
            value={description}
            onChange={e => { setDescription(e.target.value); if (aiDraftedDesc) setAiDraftedDesc(false); }}
            placeholder="Describe what this workflow does"
            rows={3}
            style={{
              width: "100%", background: "hsl(var(--background))", border: "none", outline: "none",
              color: "hsl(var(--foreground))", fontSize: 12, fontFamily: "inherit",
              padding: "9px 11px", borderRadius: 8, resize: "vertical", lineHeight: 1.45,
              boxSizing: "border-box",
              boxShadow: "inset 1.5px 1.5px 4px rgba(0,0,0,0.55), inset -1.5px -1.5px 4px rgba(30,100,105,0.18)",
            }}
          />
        </div>

        {/* Admin: background image upload (when template is toggled on) */}
        {isAdmin && isPublic && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }}>Template Background Image</label>
            {backgroundImage ? (
              <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "16/9" }}>
                <img src={backgroundImage} alt="Background preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  onClick={() => setBackgroundImage(null)}
                  disabled={isSaving}
                  style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "rgba(255,72,0,0.8)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", aspectRatio: "16/9", border: "1.5px dashed rgba(185,205,190,0.25)", borderRadius: 8, cursor: "pointer", gap: 6 }}
              >
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>Click to upload (JPG, PNG, WebP — max 5MB)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleBackgroundImageUpload} disabled={isSaving} />
              </label>
            )}
          </div>
        )}

        {/* Admin template toggle */}
        {isAdmin && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 8, borderTop: "1px solid rgba(185,205,190,0.08)" }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--foreground))", margin: "0 0 2px", display: "flex", alignItems: "center", gap: 5 }}>
                Save as template
                <span style={{ fontSize: 8, color: "#FCC3DC", background: "rgba(252,195,220,0.1)", padding: "1px 5px", borderRadius: 999, letterSpacing: "0.05em", fontWeight: 600 }}>ADMIN</span>
              </p>
              <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: 0 }}>Make visible to all users</p>
            </div>
            <Toggle size="sm" checked={isPublic} onChange={setIsPublic} label="Save as template" />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={() => onOpenChange(false)}
            style={{ background: "transparent", border: "1px solid rgba(168,192,192,0.18)", color: "hsl(var(--muted-foreground))", padding: "7px 16px", borderRadius: 999, fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(185,205,190,0.14)", border: "1px solid rgba(185,205,190,0.35)", color: "hsl(var(--primary))", padding: "7px 16px", borderRadius: 999, fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: isSaving || !name.trim() ? "not-allowed" : "pointer", opacity: !name.trim() ? 0.4 : 1 }}
          >
            {isSaving ? <><Loader2 className="w-3 h-3 animate-spin" />Saving…</> : <><Save className="w-3 h-3" />Save</>}
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
