import { useState } from "react";
import { FolderPlus, Check } from "lucide-react";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS } from "@/lib/api-config";

interface SessionFolderModalProps {
  isOpen: boolean;
  defaultName: string;
  onAccept: (folderId: string, folderName: string) => void;
  onSkip: (folderId: string) => void;
  onClose: () => void;
}

async function authHeaders() {
  const token = await auth.currentUser?.getIdToken();
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function createFolder(name: string): Promise<string> {
  const res = await fetch(API_ENDPOINTS.folders.create, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.id;
}

async function findOrCreateUnsorted(): Promise<string> {
  // List folders and find "Unsorted", or create it
  const res = await fetch(API_ENDPOINTS.folders.list, { headers: await authHeaders() });
  if (res.ok) {
    const data = await res.json();
    const unsorted = (data.folders ?? []).find((f: any) => f.name === "Unsorted");
    if (unsorted) return unsorted.id;
  }
  return createFolder("Unsorted");
}

export function extractFolderName(prompt: string): string {
  const stripped = prompt.replace(/^(a|an|the)\s+/i, "").trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  const meaningful = words.slice(0, 4).join(" ");
  const capitalized = meaningful.charAt(0).toUpperCase() + meaningful.slice(1);
  return capitalized.slice(0, 40);
}

export function SessionFolderModal({ isOpen, defaultName, onAccept, onSkip }: SessionFolderModalProps) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleAccept = async () => {
    setSaving(true);
    try {
      const id = await createFolder(name.trim() || defaultName);
      onAccept(id, name.trim() || defaultName);
    } catch {
      onAccept("", name.trim());
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      const id = await findOrCreateUnsorted();
      onSkip(id);
    } catch {
      onSkip("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
    >
      <div
        className="w-[460px] rounded-[20px] p-8 bg-card border border-border"
        style={{ boxShadow: "var(--shadow-modal-cv)" }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center bg-secondary"
            style={{ boxShadow: "var(--shadow-pressed-deep-cv)" }}
          >
            <FolderPlus className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-medium text-white">Start a new session</h2>
        </div>
        <p className="text-sm mb-6 leading-relaxed text-muted-foreground">
          Generations from this session will be saved to a new folder in your Assets library.
        </p>
        <p className="text-sm font-medium mb-2 text-foreground">Folder name</p>
        <div
          className="rounded-[10px] px-3 py-3 mb-1 bg-background"
          style={{ boxShadow: "var(--shadow-pressed-cv)" }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAccept()}
            className="w-full bg-transparent border-none outline-none text-base text-foreground"
          />
        </div>
        <p className="text-xs mb-7 text-muted-foreground/60">
          Suggested from your prompt — edit anytime
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleSkip}
            disabled={saving}
            className="px-4 py-2.5 text-sm bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={handleAccept}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-sm font-medium border-none cursor-pointer disabled:opacity-50 bg-primary text-primary-foreground"
            style={{ boxShadow: "var(--shadow-pink-btn)" }}
          >
            <Check className="w-4 h-4" />
            Create & generate
          </button>
        </div>
      </div>
    </div>
  );
}
