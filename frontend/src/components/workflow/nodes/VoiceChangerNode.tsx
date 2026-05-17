import { memo, useState, useEffect, useRef } from "react";
import { Position, NodeProps } from "reactflow";
import { ConnectedHandle } from './ConnectedHandle';
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceChangerNodeData, NODE_CONFIGURATIONS, NodeType } from "../types";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  Mic,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Volume2,
  Download,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { RunNodeButton } from "./RunNodeButton";

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  preview_url?: string;
  labels?: Record<string, string>;
}

function VoiceChangerNode({ data, id }: NodeProps<VoiceChangerNodeData>) {
  const config = NODE_CONFIGURATIONS[NodeType.VoiceChanger];
  const status = data.status || "ready";
  const isChanging = data.isChanging || status === "executing";
  const isCompleted = status === "completed";
  const isError = status === "error";
  const outputVideoUrl = data.outputVideoUrl;

  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  // Fetch voices on mount
  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    setLoadingVoices(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(API_ENDPOINTS.elevenlabs.voices, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }

      const data = await response.json();
      setVoices(data.voices || []);
    } catch (error) {
      console.error("Failed to fetch voices:", error);
      toast({
        title: "Error",
        description: "Failed to load voices. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleUpdate = (field: keyof VoiceChangerNodeData, value: any) => {
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

  const handleVoiceSelect = (voiceId: string) => {
    if (data.readOnly) return;

    const voice = voices.find((v) => v.voice_id === voiceId);
    // Update both fields in a single event to avoid race condition
    const event = new CustomEvent("node-update", {
      detail: {
        id,
        data: {
          ...data,
          selectedVoiceId: voiceId,
          selectedVoiceName: voice?.name || "",
        },
      },
    });
    window.dispatchEvent(event);
  };

  const handlePlayPreview = (voice: ElevenLabsVoice) => {
    if (!voice.preview_url) return;

    // Stop currently playing preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    // If clicking the same voice, just stop
    if (playingVoiceId === voice.voice_id) {
      setPlayingVoiceId(null);
      return;
    }

    // Play new preview
    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlayingVoiceId(null);
    audio.onerror = () => {
      setPlayingVoiceId(null);
      toast({
        title: "Error",
        description: "Failed to play voice preview",
        variant: "destructive",
      });
    };
    audio.play();
    previewAudioRef.current = audio;
    setPlayingVoiceId(voice.voice_id);
  };

  const handleDownload = () => {
    if (!outputVideoUrl) return;

    const link = document.createElement("a");
    link.href = outputVideoUrl;
    link.download = `voice-changed-${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getBorderColor = () => {
    if (isError) return "border-red-500";
    return "border-border";
  };

  const getStatusText = () => {
    if (isChanging) return "Changing voice...";
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
          <Mic className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">
            {data.label || "Voice Changer"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isChanging && (
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
            <ConnectedHandle
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
        {/* Voice Selection */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Select Voice
          </label>
          {loadingVoices ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading voices...
            </div>
          ) : (
            <Select
              value={data.selectedVoiceId || ""}
              onValueChange={handleVoiceSelect}
              disabled={isChanging || data.readOnly}
            >
              <SelectTrigger className="w-full nodrag">
                <SelectValue placeholder="Choose a voice..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {voices.map((voice) => (
                  <div
                    key={voice.voice_id}
                    className="flex items-center justify-between"
                  >
                    <SelectItem
                      value={voice.voice_id}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span>{voice.name}</span>
                        {voice.labels?.accent && (
                          <span className="text-xs text-muted-foreground">
                            ({voice.labels.accent})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                    {voice.preview_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 mr-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPreview(voice);
                        }}
                      >
                        {playingVoiceId === voice.voice_id ? (
                          <Pause className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Selected Voice Info */}
        {data.selectedVoiceName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded px-2 py-1">
            <Volume2 className="w-3 h-3" />
            <span>Selected: {data.selectedVoiceName}</span>
          </div>
        )}

        {/* Status */}
        <div className="text-xs text-muted-foreground">
          Status: <span className="font-medium">{getStatusText()}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mic className="w-3 h-3" />
          <span>ElevenLabs Speech-to-Speech</span>
        </div>

        {/* Output Video Preview */}
        {isCompleted && outputVideoUrl && (
          <div className="space-y-2">
            <div className="bg-muted rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                src={outputVideoUrl}
                controls
                className="w-full max-h-[150px] object-contain"
              />
            </div>

            {/* Download Button */}
            <Button
              onClick={handleDownload}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Download className="w-3 h-3 mr-1" />
              Download Video
            </Button>
          </div>
        )}

        {/* No Audio State */}
        {!isCompleted && !outputVideoUrl && (
          <div className="bg-muted/50 border border-dashed border-border rounded-lg p-4 text-center">
            <Mic className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground">
              Connect video & select voice
            </p>
            <p className="text-xs text-muted-foreground">
              Click Run to change voice
            </p>
          </div>
        )}

        {/* Error Display */}
        {isError && data.error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-2 text-xs text-red-500">
            {data.error}
          </div>
        )}

        {/* Run Node Button */}
        <RunNodeButton nodeId={id} isExecuting={isChanging} disabled={data.readOnly || !data.selectedVoiceId} label="Change Voice" loadingLabel="Changing..." />
      </div>

      {/* Output Handle - Right side */}
      <div className="mt-4 space-y-3">
        {config.outputConnectors.map((output) => (
          <div
            key={output.id}
            className="flex items-center justify-end gap-2 relative h-6"
          >
            <div className="text-xs font-medium text-muted-foreground">
              {output.label}
            </div>
            <ConnectedHandle
              type="source"
              position={Position.Right}
              id={output.id}
              data-connector-type={output.type}
              className="!w-3 !h-3 !border-2 !border-background !-right-[18px] !absolute !top-1/2 !-translate-y-1/2"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(VoiceChangerNode);
