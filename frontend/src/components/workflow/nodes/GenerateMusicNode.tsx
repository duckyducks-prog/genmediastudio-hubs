import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GenerateMusicNodeData, NODE_CONFIGURATIONS, NodeType, MusicDuration } from "../types";
import {
  Music,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Play,
  Pause,
  Volume2,
  Clock,
} from "lucide-react";
import { RunNodeButton } from "./RunNodeButton";

const DURATION_OPTIONS: { label: string; value: MusicDuration }[] = [
  { label: "Auto", value: "auto" },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "2m", value: 120 },
  { label: "4m", value: 240 },
  { label: "6m", value: 360 },
];

function GenerateMusicNode({ data, id }: NodeProps<GenerateMusicNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.GenerateMusic];
  const status = data.status || "ready";
  const isGenerating = data.isGenerating || status === "executing";
  const isCompleted = status === "completed";
  const isError = status === "error";
  const audioUrl = data.audioUrl;
  const selectedDuration = data.selectedDuration || "auto";

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [customDurationInput, setCustomDurationInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Parse custom duration input (format: "M:SS" or just seconds)
  const parseCustomDuration = (input: string): number | null => {
    if (!input) return null;
    if (input.includes(":")) {
      const [mins, secs] = input.split(":").map(Number);
      if (!isNaN(mins) && !isNaN(secs)) {
        return mins * 60 + secs;
      }
    } else {
      const num = Number(input);
      if (!isNaN(num)) return num;
    }
    return null;
  };

  // Format duration for display
  const formatDurationDisplay = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle audio time updates
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioUrl]);

  const handleUpdate = (field: keyof GenerateMusicNodeData, value: any) => {
    if (data.readOnly) return;

    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          [field]: value,
        },
      },
    });
    window.dispatchEvent(event);
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
    if (!audioUrl) return;

    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `generated-music-${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getBorderColor = () => {
    if (isError) return "border-red-500";
    return "border-border";
  };

  const getStatusText = () => {
    if (isGenerating) return "Generating...";
    if (isCompleted) return "Completed";
    if (isError) return "Error";
    return "Ready";
  };

  return (
    <div
      className={`bg-card border-2 rounded-lg p-4 min-w-[300px] shadow-lg transition-colors ${getBorderColor()}`}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Generate Music"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isGenerating && (
            <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          )}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          {isError && <AlertCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>

      {/* Input Handle - Left side */}
      <div className="space-y-3 mb-4">
        {config.inputConnectors.map((input) => (
          <div key={input.id} className="flex items-center gap-2 relative h-6">
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              data-connector-type={input.type}
              className="!w-3 !h-3 !border-2 !border-background !-left-[18px] !absolute !top-1/2 !-translate-y-1/2"
            />
            <div className="text-xs font-medium text-muted-foreground">
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Node Content */}
      <div className="space-y-3">
        {/* Duration Selector */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-2">
            Duration
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DURATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  if (!data.readOnly && !isGenerating) {
                    handleUpdate("selectedDuration", option.value);
                    setShowCustomInput(false);
                  }
                }}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  selectedDuration === option.value && !showCustomInput
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted border-border hover:bg-muted/80"
                } ${isGenerating || data.readOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                disabled={isGenerating || data.readOnly}
              >
                {option.label}
              </button>
            ))}
            {/* Custom duration input */}
            <div className="relative">
              <button
                onClick={() => {
                  if (!data.readOnly && !isGenerating) {
                    setShowCustomInput(true);
                  }
                }}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors flex items-center gap-1 ${
                  showCustomInput || (typeof selectedDuration === "number" && !DURATION_OPTIONS.some(o => o.value === selectedDuration))
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted border-border hover:bg-muted/80"
                } ${isGenerating || data.readOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                disabled={isGenerating || data.readOnly}
              >
                <Clock className="w-3 h-3" />
                {typeof selectedDuration === "number" && !DURATION_OPTIONS.some(o => o.value === selectedDuration)
                  ? formatDurationDisplay(selectedDuration)
                  : customDurationInput || "0:00"}
              </button>
            </div>
          </div>
          {showCustomInput && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="text"
                placeholder="M:SS (e.g., 1:30)"
                value={customDurationInput}
                onChange={(e) => setCustomDurationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const parsed = parseCustomDuration(customDurationInput);
                    if (parsed && parsed >= 30 && parsed <= 300) {
                      handleUpdate("selectedDuration", parsed);
                      setShowCustomInput(false);
                    }
                  }
                }}
                className="h-7 text-xs w-24 nodrag"
                disabled={isGenerating || data.readOnly}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const parsed = parseCustomDuration(customDurationInput);
                  if (parsed && parsed >= 30 && parsed <= 300) {
                    handleUpdate("selectedDuration", parsed);
                    setShowCustomInput(false);
                  }
                }}
                disabled={isGenerating || data.readOnly}
              >
                Set
              </Button>
              <span className="text-xs text-muted-foreground">30s - 5min</span>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="text-xs text-muted-foreground">
          Status: <span className="font-medium">{getStatusText()}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Music className="w-3 h-3" />
          <span>ElevenLabs Music</span>
        </div>

        {/* Audio Player */}
        {isCompleted && audioUrl && (
          <div className="space-y-2">
            <audio ref={audioRef} src={audioUrl} preload="metadata" />

            {/* Player UI */}
            <div className="bg-muted rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-3">
                <Button
                  onClick={handlePlayPause}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>

                <div className="flex-1">
                  {/* Progress bar */}
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                <Volume2 className="w-4 h-4 text-muted-foreground" />
              </div>

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Download Button */}
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Download className="w-3 h-3 mr-1" />
              Download Audio
            </Button>

            <RunNodeButton
              nodeId={id}
              isExecuting={isGenerating}
              disabled={data.readOnly}
              label="Regenerate"
              loadingLabel="Generating..."
            />
          </div>
        )}

        {/* No Audio Yet */}
        {!isCompleted && !audioUrl && (
          <div className="space-y-2">
            <div className="flex flex-col items-center justify-center h-[100px] border-2 border-dashed border-border rounded-lg bg-muted/30">
              <Music className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">
                {isGenerating ? "Generating music..." : "No audio yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {!isGenerating && "Click Generate to create"}
              </p>
            </div>

            <RunNodeButton
              nodeId={id}
              isExecuting={isGenerating}
              disabled={data.readOnly || !data.prompt}
              label="Generate Music"
              loadingLabel="Generating..."
            />
          </div>
        )}

        {/* Error Display */}
        {isError && data.error && (
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
            {data.error}
          </div>
        )}
      </div>

      {/* Output Handle - Right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="audio"
        data-connector-type="audio"
        className="!w-3 !h-3 !border-2 !border-background"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
    </div>
  );
}

export default memo(GenerateMusicNode);
