import { auth } from "@/lib/firebase";
import { VEO_API_BASE_URL } from "@/lib/api-config";

const BASE = `${VEO_API_BASE_URL}/v1/scene-elements`;

export type ElementType = "character" | "location" | "camera_angle" | "lighting" | "style" | "prop";

export interface SceneElement {
  id: string;
  name: string;
  element_type: ElementType;
  description?: string;
  reference_image_urls: string[];
  created_at?: string;
  is_global?: boolean;
  parent_element_id?: string | null;
}

async function authHeaders() {
  const token = await auth.currentUser?.getIdToken();
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function listSceneElements(element_type?: ElementType, parent_id?: string): Promise<SceneElement[]> {
  const params = new URLSearchParams();
  if (element_type) params.set("element_type", element_type);
  if (parent_id) params.set("parent_id", parent_id);
  const qs = params.toString();
  const url = qs ? `${BASE}?${qs}` : BASE;
  const res = await fetch(url, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.elements;
}

export async function createSceneElement(
  payload: Omit<SceneElement, "id" | "created_at" | "is_global"> & { is_global?: boolean }
): Promise<SceneElement> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateSceneElement(
  id: string,
  payload: Omit<SceneElement, "id" | "created_at" | "is_global"> & { is_global?: boolean }
): Promise<SceneElement> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteSceneElement(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}
