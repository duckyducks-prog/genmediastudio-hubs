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
  Package,
  Loader2,
} from "lucide-react";
import { NodeType } from "./types";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { useMyWorkflows } from "@/lib/workflow-queries";

interface PaletteNode {
  type: NodeType;
  label: string;
  icon: React.ReactNode;
  category: "input" | "modifier" | "action" | "output";
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
    category: "output",
    description: "Add documentation and notes to explain workflow steps",
  },
];

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void;
  onImportWorkflow?: (workflowId: string, workflowName: string) => void;
}

export default function NodePalette({
  onAddNode,
  onImportWorkflow,
}: NodePaletteProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: savedWorkflows, isLoading: workflowsLoading } = useMyWorkflows();

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

  const filteredWorkflows = useMemo(() => {
    if (!savedWorkflows) return [];
    if (!searchQuery.trim()) return savedWorkflows;
    const query = searchQuery.toLowerCase();
    return savedWorkflows.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        (w.description && w.description.toLowerCase().includes(query)),
    );
  }, [savedWorkflows, searchQuery]);

  const categories = {
    input: filteredNodes.filter((n) => n.category === "input"),
    modifier: filteredNodes.filter((n) => n.category === "modifier"),
    action: filteredNodes.filter((n) => n.category === "action"),
    output: filteredNodes.filter((n) => n.category === "output"),
  };


  const handleDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-64 bg-card border-r border-border pl-4 pt-4 pb-4 space-y-4 overflow-y-auto h-full flex flex-col">
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 pr-4">
          <Sparkles className="w-4 h-4 text-primary" />
          Node Library
        </h3>
        <p className="text-xs text-muted-foreground mb-4 pr-4">
          Drag nodes onto the canvas to build your AI workflow
        </p>
      </div>

      <div className="relative pr-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8 h-9 text-sm"
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

      <div className="flex-1 space-y-6 overflow-y-auto">
        {/* Input Nodes */}
        {categories.input.length > 0 && (
          <div className="pr-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 tracking-wide">
              Inputs
            </h4>
            <p className="text-xs text-muted-foreground/70 mb-3">
              Source nodes with only outputs
            </p>
            <div className="space-y-2">
              {categories.input.map((node) => (
                <button
                  key={node.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, node.type)}
                  onClick={() => onAddNode(node.type)}
                  className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing group"
                >
                  <div className="text-primary mt-0.5 group-hover:scale-110 transition-transform">
                    {node.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">{node.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {node.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modifier Nodes */}
        {categories.modifier.length > 0 && (
          <div className="pr-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 tracking-wide">
              Modifiers
            </h4>
            <p className="text-xs text-muted-foreground/70 mb-3">
              Transform and configure data
            </p>
            <div className="space-y-2">
              {categories.modifier.map((node) => (
                <button
                  key={node.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, node.type)}
                  onClick={() => onAddNode(node.type)}
                  className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing group"
                >
                  <div className="text-primary mt-0.5 group-hover:scale-110 transition-transform">
                    {node.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">{node.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {node.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Nodes */}
        {categories.action.length > 0 && (
          <div className="pr-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 tracking-wide">
              Actions
            </h4>
            <p className="text-xs text-muted-foreground/70 mb-3">
              Execute AI operations
            </p>
            <div className="space-y-2">
              {categories.action.map((node) => (
                <button
                  key={node.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, node.type)}
                  onClick={() => onAddNode(node.type)}
                  className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing group"
                >
                  <div className="text-primary mt-0.5 group-hover:scale-110 transition-transform">
                    {node.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">{node.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {node.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Output/Utility Nodes */}
        {categories.output.length > 0 && (
          <div className="pr-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 tracking-wide">
              Utilities
            </h4>
            <p className="text-xs text-muted-foreground/70 mb-3">
              Documentation and tools
            </p>
            <div className="space-y-2">
              {categories.output.map((node) => (
                <button
                  key={node.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, node.type)}
                  onClick={() => onAddNode(node.type)}
                  className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-grab active:cursor-grabbing group"
                >
                  <div className="text-primary mt-0.5 group-hover:scale-110 transition-transform">
                    {node.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">{node.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {node.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}


        {/* Saved Workflows */}
        {(filteredWorkflows.length > 0 || workflowsLoading) && (
          <div className="pr-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 tracking-wide">
              Saved Workflows
            </h4>
            <p className="text-xs text-muted-foreground/70 mb-3">
              Import as reusable compound node
            </p>
            {workflowsLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading...
              </div>
            ) : (
              <div className="space-y-2">
                {filteredWorkflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    onClick={() =>
                      onImportWorkflow?.(workflow.id!, workflow.name)
                    }
                    className="w-full flex items-start gap-2 p-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border transition-colors cursor-pointer group"
                  >
                    <div className="text-primary mt-0.5 group-hover:scale-110 transition-transform">
                      <Package className="w-4 h-4" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{workflow.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {workflow.description || `${workflow.node_count ?? "?"} nodes`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* No results message */}
        {searchQuery &&
          filteredNodes.length === 0 &&
          filteredWorkflows.length === 0 && (
          <div className="pr-4 text-center py-8">
            <p className="text-sm text-muted-foreground">
              No nodes found matching "{searchQuery}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
