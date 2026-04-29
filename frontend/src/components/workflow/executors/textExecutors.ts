import { API_ENDPOINTS } from "@/lib/api-config";
import { ExecutionResult, ExecutionContext } from "./types";
import { WorkflowNode } from "../types";

export async function executePromptConcatenator(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const separator = (node.data as any).separator || "Space";
  const combined = ctx.executeConcatenator(inputs, separator);
  return { success: true, data: { combined } };
}

export async function executeTextIterator(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const outputs = ctx.executeTextIterator(inputs, node.data as any);
  return {
    success: true,
    data: {
      outputs,
      itemPreviews: Object.values(outputs),
      dynamicOutputCount: Object.keys(outputs).length,
    },
  };
}

export async function executeLLM(
  node: WorkflowNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const prompt = inputs.prompt;
  const context = inputs.context || null;
  const systemPrompt = (node.data as any).systemPrompt || null;
  const temperature = (node.data as any).temperature || 0.7;

  if (!prompt) {
    return { success: false, error: "No prompt connected" };
  }

  try {
    const token = await ctx.getAuthToken();

    const response = await fetch(API_ENDPOINTS.generate.text, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt,
        system_prompt: systemPrompt,
        context,
        temperature,
        mode: ctx.mode,
      }),
    });

    if (response.status === 403) {
      return {
        success: false,
        error: "Access denied. Contact administrator.",
      };
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const apiData = await response.json();
    return {
      success: true,
      data: {
        response: apiData.response,
        responsePreview: apiData.response, // For UI display
        generatedMode: ctx.mode,
        outputs: { response: apiData.response },
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Text generation failed",
    };
  }
}
