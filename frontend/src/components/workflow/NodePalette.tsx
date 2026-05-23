import {
  Type,
  Image,
  Sparkles,
  Combine,
  Brain,
  Upload,
  Video,
  Download,
  Eye,
  Sun,
  Blend,
  Focus,
  Palette,
  Radio,
  Circle,
  Crop,
  Layers,
  Search,
  X,
  Film,
  List,
  ListOrdered,
  MessageSquare,
  Music,
  Mic,
  Scissors,
  Captions,
} from "lucide-react";
import { NodeType } from "./types";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useEffect, useRef } from "react";
import { SceneElementsPanel } from "./SceneElementsPanel";

interface PaletteNode {
  type: NodeType;
  label: string;
  icon: React.ReactNode;
  category: "input" | "modifier" | "action" | "output" | "utility";
  description: string;
}

const paletteNodes: PaletteNode[] = [
  // INPUT NODES
  {
    type: NodeType.ImageInput,
    label: "Image Input",
    icon: <Upload className="w-4 h-4" />,
    category: "input",
    description: "Upload or load an image",
  },
  {
    type: NodeType.Moodboard,
    label: "Moodboard",
    icon: <Layers className="w-4 h-4" />,
    category: "input",
    description: "Aggregate images into a reference pack · save as character or location",
  },
  {
    type: NodeType.VideoInput,
    label: "Video Input",
    icon: <Video className="w-4 h-4" />,
    category: "input",
    description: "Upload or load a video file",
  },
  {
    type: NodeType.Prompt,
    label: "Text Input",
    icon: <Type className="w-4 h-4" />,
    category: "input",
    description: "Text input for AI generation",
  },
  {
    type: NodeType.WorkflowQueue,
    label: "Workflow Queue",
    icon: <ListOrdered className="w-4 h-4" />,
    category: "input",
    description: "Batch input - queue items for compound node iteration",
  },

  // MODIFIER NODES
  {
    type: NodeType.PromptConcatenator,
    label: "Prompt Concatenator",
    icon: <Combine className="w-4 h-4" />,
    category: "modifier",
    description: "Combine multiple prompts",
  },
  {
    type: NodeType.TextIterator,
    label: "Text Iterator",
    icon: <List className="w-4 h-4" />,
    category: "modifier",
    description: "Combine fixed text with multiple variables",
  },
  {
    type: NodeType.BrightnessContrast,
    label: "Brightness/Contrast",
    icon: <Sun className="w-4 h-4" />,
    category: "modifier",
    description: "Adjust brightness and contrast",
  },
  {
    type: NodeType.Blur,
    label: "Blur",
    icon: <Blend className="w-4 h-4" />,
    category: "modifier",
    description: "Add blur effect to images",
  },
  {
    type: NodeType.Sharpen,
    label: "Sharpen",
    icon: <Focus className="w-4 h-4" />,
    category: "modifier",
    description: "Sharpen image details",
  },
  {
    type: NodeType.HueSaturation,
    label: "Hue/Saturation",
    icon: <Palette className="w-4 h-4" />,
    category: "modifier",
    description: "Adjust hue and saturation",
  },
  {
    type: NodeType.Noise,
    label: "Noise",
    icon: <Radio className="w-4 h-4" />,
    category: "modifier",
    description: "Add noise texture",
  },
  {
    type: NodeType.FilmGrain,
    label: "Film Grain",
    icon: <Film className="w-4 h-4" />,
    category: "modifier",
    description: "Add realistic film grain",
  },
  {
    type: NodeType.Vignette,
    label: "Vignette",
    icon: <Circle className="w-4 h-4" />,
    category: "modifier",
    description: "Add vignette effect",
  },
  {
    type: NodeType.Crop,
    label: "Crop",
    icon: <Crop className="w-4 h-4" />,
    category: "modifier",
    description: "Crop image to aspect ratio",
  },
  {
    type: NodeType.ImageComposite,
    label: "Image Composite",
    icon: <Layers className="w-4 h-4" />,
    category: "modifier",
    description: "Blend multiple images together",
  },
  {
    type: NodeType.VideoWatermark,
    label: "Video Compositing",
    icon: <Layers className="w-4 h-4" />,
    category: "modifier",
    description: "Add watermark or overlay to video",
  },
  {
    type: NodeType.VideoSegmentReplace,
    label: "Video Segment Replace",
    icon: <Scissors className="w-4 h-4" />,
    category: "modifier",
    description: "Replace a segment of video while keeping audio",
  },
  {
    type: NodeType.ExtractLastFrame,
    label: "Extract Last Frame",
    icon: <Film className="w-4 h-4" />,
    category: "modifier",
    description: "Extract the last frame from a video",
  },
  {
    type: NodeType.BurnCaptions,
    label: "Burn Captions",
    icon: <Captions className="w-4 h-4" />,
    category: "modifier",
    description: "Burn captions permanently into video frames",
  },

  // ACTION NODES
  {
    type: NodeType.GenerateImage,
    label: "Generate Image",
    icon: <Image className="w-4 h-4" />,
    category: "action",
    description: "Create AI image with Gemini 3",
  },
  {
    type: NodeType.GenerateVideo,
    label: "Generate Video",
    icon: <Video className="w-4 h-4" />,
    category: "action",
    description: "Create AI video with Veo 3.1",
  },
  {
    type: NodeType.GenerateMusic,
    label: "Generate Music",
    icon: <Music className="w-4 h-4" />,
    category: "action",
    description: "Create AI music with ElevenLabs",
  },
  {
    type: NodeType.VoiceChanger,
    label: "Voice Changer",
    icon: <Mic className="w-4 h-4" />,
    category: "action",
    description: "Change voice in video with ElevenLabs",
  },
  {
    type: NodeType.MergeVideos,
    label: "Merge Videos",
    icon: <Combine className="w-4 h-4" />,
    category: "action",
    description: "Concatenate multiple videos into one",
  },
  {
    type: NodeType.AddMusicToVideo,
    label: "Merge Audio",
    icon: <Music className="w-4 h-4" />,
    category: "action",
    description: "Mix multiple audio tracks into a video",
  },
  {
    type: NodeType.LLM,
    label: "LLM",
    icon: <Brain className="w-4 h-4" />,
    category: "action",
    description: "Text generation and enhancement",
  },
  {
    type: NodeType.Preview,
    label: "Preview",
    icon: <Eye className="w-4 h-4" />,
    category: "output",
    description: "Preview images, videos, or text",
  },
  {
    type: NodeType.Download,
    label: "Download",
    icon: <Download className="w-4 h-4" />,
    category: "output",
    description: "Download media result",
  },
  {
    type: NodeType.ImageOutput,
    label: "Image Output",
    icon: <Image className="w-4 h-4" />,
    category: "output",
    description: "Save image to library",
  },
  {
    type: NodeType.VideoOutput,
    label: "Video Output",
    icon: <Video className="w-4 h-4" />,
    category: "output",
    description: "Save video to library",
  },
  {
    type: NodeType.TextOutput,
    label: "Text Output",
    icon: <Type className="w-4 h-4" />,
    category: "output",
    description: "Display text output from LLM",
  },

  // UTILITY NODES
  {
    type: NodeType.StickyNote,
    label: "Sticky Note",
    icon: <MessageSquare className="w-4 h-4" />,
    category: "utility",
    description: "Add documentation and notes to explain workflow steps",
  },
];

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void;
}

export default function NodePalette({
  onAddNode,
}: NodePaletteProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = paletteRef.current;
    if (!el) return;
    const handleMouseMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.palette-item') as HTMLElement | null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--glow-x', `${((e.clientX - rect.left) / rect.width) * 100}%`);
      target.style.setProperty('--glow-y', `${((e.clientY - rect.top) / rect.height) * 100}%`);
    };
    el.addEventListener('mousemove', handleMouseMove);
    return () => el.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) {
      return paletteNodes;
    }
    const query = searchQuery.toLowerCase();
    return paletteNodes.filter(
      (node) =>
        node.label.toLowerCase().includes(query) ||
        node.description.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  const categories = {
    input: filteredNodes.filter((n) => n.category === "input"),
    action: filteredNodes.filter((n) => n.category === "action"),
    output: filteredNodes.filter((n) => n.category === "output"),
    modifier: filteredNodes.filter((n) => n.category === "modifier"),
    utility: filteredNodes.filter((n) => n.category === "utility"),
  };


  const handleDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div ref={paletteRef} className="w-64 bg-card border-r border-border flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Node Library
        </h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8 h-9 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[rgba(252,195,220,0.5)] focus-visible:[box-shadow:0_0_2px_rgba(252,195,220,0.5)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
        {([
          { key: "input",    label: "Inputs"    },
          { key: "action",   label: "Generate"  },
          { key: "output",   label: "Outputs"   },
          { key: "modifier", label: "Modifiers" },
          { key: "utility",  label: "Utility"   },
        ] as const).map(({ key, label }) =>
          categories[key].length > 0 && (
            <div key={key}>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                {label}
              </h4>
              <div className="space-y-3">
                {categories[key].map((node) => (
                  <button
                    key={node.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, node.type)}
                    onClick={() => onAddNode(node.type)}
                    className="palette-item w-full flex items-center gap-2.5 px-3 py-3 rounded-lg cursor-grab active:cursor-grabbing group"
                  >
                    <div className="text-primary shrink-0 group-hover:scale-110 transition-transform">
                      {node.icon}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-medium leading-tight">{node.label}</div>
                      <div className="text-xs text-muted-foreground/70 leading-snug overflow-hidden max-h-0 opacity-0 group-hover:max-h-8 group-hover:opacity-100 transition-all duration-150">
                        {node.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {searchQuery && filteredNodes.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            No nodes found matching "{searchQuery}"
          </p>
        )}

        {!searchQuery && (
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Scene Elements
            </h4>
            <SceneElementsPanel />
          </div>
        )}
      </div>
    </div>
  );
}
