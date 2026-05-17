import { VEO_API_BASE_URL } from "./api-config";
import { auth } from "./firebase";

const BASE = `${VEO_API_BASE_URL}/v1/shared`;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ExposedInput {
  node_id: string;
  type: "text" | "image" | "video";
  label: string;
}

export interface ShareSchema {
  title: string;
  exposed_inputs: ExposedInput[];
}

export interface ShareToken {
  token: string;
  workflow_id: string;
  title: string;
  created_at: string;
  expires_at: string | null;
}

/** Create a share token for a workflow (owner only). */
export async function createShareToken(
  workflow_id: string,
  title?: string,
  expires_at?: string,
): Promise<{ token: string }> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ workflow_id, title, expires_at }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create share link");
  }
  return res.json();
}

/** List all share tokens for the current user. */
export async function listMyShareTokens(): Promise<{ tokens: ShareToken[] }> {
  const res = await fetch(`${BASE}/my`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Failed to list share tokens (${res.status})`);
  }
  return res.json();
}

/** Revoke a share token (owner only). */
export async function revokeShareToken(token: string): Promise<void> {
  const res = await fetch(`${BASE}/${token}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to revoke share link");
  }
}

/** Get the form schema for a share link (no auth required). */
export async function getShareSchema(token: string): Promise<ShareSchema> {
  const res = await fetch(`${BASE}/${token}`);
  if (res.status === 404) throw new Error("Share link not found");
  if (res.status === 410) throw new Error("Share link has expired");
  if (!res.ok) throw new Error("Failed to load share link");
  return res.json();
}

/** Run a shared workflow with temp-user inputs (no auth required). */
export async function runSharedWorkflow(
  token: string,
  inputs: Record<string, string>,
): Promise<{ status: string; outputs: string[] }> {
  const res = await fetch(`${BASE}/${token}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Workflow execution failed");
  }
  return res.json();
}

export type ResultCardStatus = "pending" | "running" | "completed" | "failed";

export interface ResultCard {
  variationIndex: number;
  status: ResultCardStatus;
  inputs: Record<string, string>;
  outputs: string[];
  error?: string;
}

/**
 * Run N variations in parallel (concurrency-capped). Calls onUpdate after
 * each variation completes so the UI can update progressively.
 */
export async function runVariations(
  token: string,
  variations: Record<string, string>[],
  onUpdate: (card: ResultCard) => void,
  concurrencyLimit = 4,
): Promise<void> {
  const queue = variations.map((inputs, i) => ({ inputs, index: i }));
  let active = 0;

  await new Promise<void>((resolve) => {
    const next = () => {
      while (active < concurrencyLimit && queue.length > 0) {
        const { inputs, index } = queue.shift()!;
        active++;
        onUpdate({ variationIndex: index, status: "running", inputs, outputs: [] });

        runSharedWorkflow(token, inputs)
          .then((result) =>
            onUpdate({
              variationIndex: index,
              status: "completed",
              inputs,
              outputs: result.outputs,
            }),
          )
          .catch((err: Error) =>
            onUpdate({
              variationIndex: index,
              status: "failed",
              inputs,
              outputs: [],
              error: err.message,
            }),
          )
          .finally(() => {
            active--;
            if (queue.length === 0 && active === 0) resolve();
            else next();
          });
      }
    };

    next();
    if (variations.length === 0) resolve();
  });
}
