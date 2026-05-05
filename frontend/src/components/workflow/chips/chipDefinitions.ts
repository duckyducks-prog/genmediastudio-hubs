export type ChipCategory = "angle" | "movement" | "lighting" | "style";

export interface ChipMeta {
  id: string;
  category: ChipCategory;
  thumbnail?: string; // reserved for camera map images (future)
}

// Color per category — used for highlighting @tokens in the textarea
export const CHIP_CATEGORY_COLORS: Record<ChipCategory, string> = {
  angle:    "#7c3aed", // violet
  movement: "#0891b2", // cyan
  lighting: "#d97706", // amber
  style:    "#16a34a", // green
};

export const CHIPS: ChipMeta[] = [
  // Camera angles
  { id: "ECU",        category: "angle" },
  { id: "CU",         category: "angle" },
  { id: "MCU",        category: "angle" },
  { id: "MS",         category: "angle" },
  { id: "LS",         category: "angle" },
  { id: "ELS",        category: "angle" },
  { id: "OTS",        category: "angle" },
  { id: "POV",        category: "angle" },
  { id: "DutchAngle", category: "angle" },
  { id: "BirdsEye",   category: "angle" },
  { id: "WormEye",    category: "angle" },
  // Camera movements
  { id: "DollyIn",   category: "movement" },
  { id: "DollyOut",  category: "movement" },
  { id: "PanLeft",   category: "movement" },
  { id: "PanRight",  category: "movement" },
  { id: "TiltUp",    category: "movement" },
  { id: "TiltDown",  category: "movement" },
  { id: "Tracking",  category: "movement" },
  { id: "Handheld",  category: "movement" },
  { id: "Crane",     category: "movement" },
  { id: "Orbit",     category: "movement" },
  { id: "ZoomIn",    category: "movement" },
  { id: "ZoomOut",   category: "movement" },
  // Lighting
  { id: "GoldenHour", category: "lighting" },
  { id: "BlueHour",   category: "lighting" },
  { id: "Neon",       category: "lighting" },
  { id: "Hardlight",  category: "lighting" },
  { id: "Softlight",  category: "lighting" },
  { id: "Backlit",    category: "lighting" },
  { id: "Practical",  category: "lighting" },
  // Visual styles
  { id: "Cinematic",   category: "style" },
  { id: "Documentary", category: "style" },
  { id: "Commercial",  category: "style" },
  { id: "Noir",        category: "style" },
  { id: "Drone",       category: "style" },
  { id: "SlowMo",      category: "style" },
];

export const CATEGORY_LABELS: Record<ChipCategory, string> = {
  angle:    "Camera Angle",
  movement: "Camera Movement",
  lighting: "Lighting",
  style:    "Style",
};
