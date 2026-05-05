/**
 * Centralized API Configuration
 *
 * This file is the single source of truth for all API endpoints.
 * Update the API_BASE_URL here and all requests will use the new URL.
 */

// The base URL for the Veo API
// Uses environment variable set at build time
export const VEO_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://veo-api-otfo2ctxma-uc.a.run.app";

// Construct full endpoint URLs
export const API_ENDPOINTS = {
  // Workflow endpoints
  workflows: {
    save: `${VEO_API_BASE_URL}/v1/workflows`,
    list: (scope: string) => `${VEO_API_BASE_URL}/v1/workflows?scope=${scope}`,
    get: (id: string) => `${VEO_API_BASE_URL}/v1/workflows/${id}`,
    update: (id: string) => `${VEO_API_BASE_URL}/v1/workflows/${id}`,
    delete: (id: string) => `${VEO_API_BASE_URL}/v1/workflows/${id}`,
    clone: (id: string) => `${VEO_API_BASE_URL}/v1/workflows/${id}/clone`,
  },

  // Generation endpoints
  generate: {
    image: `${VEO_API_BASE_URL}/v1/generate/image`,
    video: `${VEO_API_BASE_URL}/v1/generate/video`,
    videoStatus: (operationId: string, prompt: string) =>
      `${VEO_API_BASE_URL}/v1/generate/video/status?operation_id=${encodeURIComponent(operationId)}&prompt=${encodeURIComponent(prompt)}`,
    videoStream: (operationId: string, prompt: string) =>
      `${VEO_API_BASE_URL}/v1/generate/video/stream?operation_id=${encodeURIComponent(operationId)}&prompt=${encodeURIComponent(prompt)}`,
    text: `${VEO_API_BASE_URL}/v1/generate/text`,
    upscale: `${VEO_API_BASE_URL}/v1/generate/upscale`,
    music: `${VEO_API_BASE_URL}/v1/generate/music`,
  },

  // ElevenLabs endpoints
  elevenlabs: {
    voices: `${VEO_API_BASE_URL}/v1/elevenlabs/voices`,
    voiceChange: `${VEO_API_BASE_URL}/v1/elevenlabs/voice-change`,
    generateMusic: `${VEO_API_BASE_URL}/v1/elevenlabs/generate-music`,
  },

  // Video processing endpoints
  video: {
    merge: `${VEO_API_BASE_URL}/v1/video/merge`,
    addMusic: `${VEO_API_BASE_URL}/v1/video/add-music`,
    applyFilters: `${VEO_API_BASE_URL}/v1/video/apply-filters`,
    addWatermark: `${VEO_API_BASE_URL}/v1/video/add-watermark`,
    segmentReplace: `${VEO_API_BASE_URL}/v1/video/segment-replace`,
  },

  // Assets endpoints
  assets: {
    save: `${VEO_API_BASE_URL}/v1/assets`,
    list: (assetType?: string, folderId?: string) => {
      const params = new URLSearchParams();
      if (assetType) params.set("asset_type", assetType);
      if (folderId) params.set("folder_id", folderId);
      const qs = params.toString();
      return qs ? `${VEO_API_BASE_URL}/v1/assets?${qs}` : `${VEO_API_BASE_URL}/v1/assets`;
    },
    get: (id: string) => `${VEO_API_BASE_URL}/v1/assets/${id}`,
    delete: (id: string) => `${VEO_API_BASE_URL}/v1/assets/${id}`,
    moveToFolder: (assetId: string, folderId: string | null) => {
      const base = `${VEO_API_BASE_URL}/v1/assets/${assetId}/folder`;
      return folderId ? `${base}?folder_id=${folderId}` : base;
    },
  },

  // Folder endpoints
  folders: {
    list: `${VEO_API_BASE_URL}/v1/folders`,
    create: `${VEO_API_BASE_URL}/v1/folders`,
    rename: (id: string) => `${VEO_API_BASE_URL}/v1/folders/${id}`,
    delete: (id: string) => `${VEO_API_BASE_URL}/v1/folders/${id}`,
    deleteWithContents: (id: string) => `${VEO_API_BASE_URL}/v1/folders/${id}/contents`,
    downloadZip: (id: string) => `${VEO_API_BASE_URL}/v1/folders/${id}/download`,
  },

  // Legacy library alias for backward compatibility during migration
  library: {
    save: `${VEO_API_BASE_URL}/v1/assets`,
    list: (assetType?: string, folderId?: string) => {
      const params = new URLSearchParams();
      if (assetType) params.set("asset_type", assetType);
      if (folderId) params.set("folder_id", folderId);
      const qs = params.toString();
      return qs ? `${VEO_API_BASE_URL}/v1/assets?${qs}` : `${VEO_API_BASE_URL}/v1/assets`;
    },
    get: (id: string) => `${VEO_API_BASE_URL}/v1/assets/${id}`,
    delete: (id: string) => `${VEO_API_BASE_URL}/v1/assets/${id}`,
  },
} as const;

/**
 * How to use:
 *
 * Instead of:
 *   fetch('https://veo-api-otfo2ctxma-uc.a.run.app/generate/image', ...)
 *
 * Use:
 *   import { API_ENDPOINTS } from '@/lib/api-config'
 *   fetch(API_ENDPOINTS.generate.image, ...)
 *
 * When the API URL needs to change, update VEO_API_BASE_URL above.
 * All requests will automatically use the new URL.
 */
