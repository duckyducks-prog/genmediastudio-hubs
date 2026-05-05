import { useState, useCallback } from "react";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS } from "@/lib/api-config";

export interface Folder {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  asset_count: number;
}

async function getToken(): Promise<string | undefined> {
  return auth.currentUser?.getIdToken();
}

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchFolders = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(API_ENDPOINTS.folders.list, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch folders: ${res.status}`);
      const data = await res.json();
      setFolders(data.folders || []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createFolder = useCallback(async (name: string): Promise<Folder> => {
    const token = await getToken();
    const res = await fetch(API_ENDPOINTS.folders.create, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`Failed to create folder: ${res.status}`);
    const folder: Folder = await res.json();
    setFolders((prev) => [...prev, folder]);
    return folder;
  }, []);

  const renameFolder = useCallback(
    async (folderId: string, name: string): Promise<Folder> => {
      const token = await getToken();
      const res = await fetch(API_ENDPOINTS.folders.rename(folderId), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`Failed to rename folder: ${res.status}`);
      const updated: Folder = await res.json();
      setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
      return updated;
    },
    []
  );

  const deleteFolder = useCallback(async (folderId: string): Promise<void> => {
    const token = await getToken();
    const res = await fetch(API_ENDPOINTS.folders.delete(folderId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to delete folder: ${res.status}`);
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
  }, []);

  const deleteFolderWithContents = useCallback(async (folderId: string): Promise<void> => {
    const token = await getToken();
    const res = await fetch(API_ENDPOINTS.folders.deleteWithContents(folderId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to delete folder with contents: ${res.status}`);
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
  }, []);

  const moveAssetToFolder = useCallback(
    async (assetId: string, folderId: string | null): Promise<void> => {
      const token = await getToken();
      const url = API_ENDPOINTS.assets.moveToFolder(assetId, folderId);
      const res = await fetch(url, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to move asset: ${res.status}`);
    },
    []
  );

  return {
    folders,
    isLoading,
    fetchFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    deleteFolderWithContents,
    moveAssetToFolder,
  };
}
