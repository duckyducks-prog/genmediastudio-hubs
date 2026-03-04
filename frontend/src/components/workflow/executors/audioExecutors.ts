import { logger } from "@/lib/logger";
import { API_ENDPOINTS } from "@/lib/api-config";
import { ExecutionResult, ExecutionContext } from "./types";
import { WorkflowNode } from "../types";

export async function executeGenerateMusic(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Get prompt from input connector or node data
  let prompt = inputs.prompt || (node.data as any).prompt || "";

  if (!prompt) {
    return { success: false, error: "No music prompt provided" };
  }

  // Get duration setting
  const selectedDuration = (node.data as any).selectedDuration || "auto";
  const durationSeconds = selectedDuration === "auto" ? null : Number(selectedDuration);

  logger.debug("[GenerateMusic] Starting execution with prompt:", {
    promptLength: prompt.length,
    promptPreview: prompt.substring(0, 50),
    selectedDuration,
    durationSeconds,
  });

  try {
    const token = await ctx.getAuthToken();

    // Use ElevenLabs Music API with duration support
    const response = await fetch(API_ENDPOINTS.elevenlabs.generateMusic, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt,
        duration_seconds: durationSeconds,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GenerateMusic] API Error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });

      // Parse error detail if JSON
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorJson.message || errorText;
      } catch {
        // Keep original text
      }

      if (response.status === 403) {
        // Could be auth issue or ElevenLabs API access issue
        return {
          success: false,
          error: `Access denied: ${errorDetail}`,
        };
      }

      if (response.status === 401) {
        return {
          success: false,
          error: "Unauthorized. Please sign out and sign in again.",
        };
      }

      throw new Error(`API error: ${response.status} - ${errorDetail}`);
    }

    const apiData = await response.json();

    logger.debug("[GenerateMusic] API Response:", {
      hasAudio: !!apiData.audio_base64,
      audioLength: apiData.audio_base64?.length || 0,
    });

    if (apiData.audio_base64) {
      const audioUrl = `data:${apiData.mime_type || 'audio/wav'};base64,${apiData.audio_base64}`;

      // Notify that an asset was generated
      if (ctx.onAssetGenerated) {
        logger.debug(
          "[useWorkflowExecution] Music generated, triggering asset refresh",
        );
        ctx.onAssetGenerated();
      }

      const resultData = {
        audioUrl,
        audioDuration: apiData.duration_seconds || 30,
        outputs: {
          audio: audioUrl,
        },
      };

      ctx.toast({
        title: "Music Generated",
        description: `Generated ${apiData.duration_seconds || 30}s of music`,
      });

      return {
        success: true,
        data: resultData,
      };
    } else {
      return { success: false, error: "No audio returned from API" };
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Music generation failed",
    };
  }
}
