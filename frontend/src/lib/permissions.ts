import { ElementType } from "@/lib/scene-elements-api";

export const ADMIN_EMAILS = ["ldebortolialves@hubspot.com"];

export function isAdmin(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email);
}

// Categories that require admin role to create/edit
export const ADMIN_ONLY_TYPES = new Set<ElementType>(["style", "prop"]);

// Categories whose elements must start from reference images — no prompt generation in the studio
export const IMAGE_ONLY_TYPES = new Set<ElementType>(["character", "location", "prop"]);

export function isAdminOnly(type: ElementType): boolean {
  return ADMIN_ONLY_TYPES.has(type);
}

export function isImageOnly(type: ElementType): boolean {
  return IMAGE_ONLY_TYPES.has(type);
}
