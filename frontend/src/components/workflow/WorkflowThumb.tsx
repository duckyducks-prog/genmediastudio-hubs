import { useMemo } from "react";

interface ThumbNode {
  type?: string;
  x?: number;
  y?: number;
}

interface WorkflowThumbProps {
  nodes: ThumbNode[];
  thumbnail?: string; // existing screenshot thumbnail
}

const PALETTE: Record<string, string[]> = {
  image: ["#1F0E1A", "#3A1428", "#5A1F3A", "#1A0C15"],
  video: ["#1A1028", "#2A1A45", "#4A2A65", "#140E1F"],
  text:  ["#0E1A1A", "#183030", "#264848", "#0C1515"],
  audio: ["#0E1A12", "#183220", "#264E30", "#0C1510"],
};

const DOT_COLORS: Record<string, string> = {
  generateImage: "#B9CDBE",
  generateVideo: "#D6C2D9",
  generateMusic: "#B9CDBE",
  llm: "#FF4800",
  prompt: "#FF4800",
  imageInput: "#B9CDBE",
  videoInput: "#D6C2D9",
};

function getDominantType(nodes: ThumbNode[]): string {
  const counts: Record<string, number> = { image: 0, video: 0, audio: 0, text: 0 };
  nodes.forEach(n => {
    const t = n.type ?? "";
    if (t.includes("Image") || t.includes("image")) counts.image++;
    else if (t.includes("Video") || t.includes("video")) counts.video++;
    else if (t.includes("Music") || t.includes("audio")) counts.audio++;
    else counts.text++;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "image";
}

export function WorkflowThumb({ nodes, thumbnail }: WorkflowThumbProps) {
  const style = useMemo(() => {
    if (thumbnail) {
      return {
        backgroundImage: `url(${thumbnail})`,
        backgroundSize: "cover" as const,
        backgroundPosition: "center" as const,
      };
    }

    const dom = getDominantType(nodes);
    const pal = PALETTE[dom] ?? PALETTE.image;

    // Normalize node positions and build dot radial gradients
    const visibleNodes = nodes.filter(n => n.x !== undefined && n.y !== undefined).slice(0, 8);
    const xs = visibleNodes.map(n => n.x!);
    const ys = visibleNodes.map(n => n.y!);
    const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1);
    const minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;

    const dots = visibleNodes.map(n => {
      const px = ((n.x! - minX) / rangeX) * 80 + 10;
      const py = ((n.y! - minY) / rangeY) * 80 + 10;
      const color = DOT_COLORS[n.type ?? ""] ?? "rgba(185,205,190,0.4)";
      return `radial-gradient(circle at ${px}% ${py}%, ${color} 2px, transparent 3px)`;
    });

    const bg = `linear-gradient(135deg, ${pal[0]} 0%, ${pal[1]} 40%, ${pal[2]} 70%, ${pal[3]} 100%)`;
    const backgroundImage = dots.length > 0 ? [bg, ...dots].join(", ") : bg;

    return { backgroundImage };
  }, [nodes, thumbnail]);

  // Use padding-bottom trick for reliable aspect ratio in any flex/grid context
  return (
    <div style={{ width: "100%", position: "relative", paddingBottom: "62.5%", flexShrink: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, ...style }} />
    </div>
  );
}
