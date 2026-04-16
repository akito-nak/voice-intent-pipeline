import { CORRECTION_SYSTEM_PROMPT, buildCorrectionPrompt } from './prompts.js';
import type { CorrectionResponse } from '../types.js';

const OLLAMA_BASE_URL = 'http://localhost:11434';
// export const DEFAULT_MODEL = 'phi4-mini:3.8b';
// export const DEFAULT_MODEL = 'mistral:7b-instruct-q4_K_M';
export const DEFAULT_MODEL = 'gemma4:e4b';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  format?: string;
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
}

function calculateWER(original: string, corrected: string): number {
  const originalWords  = original.trim().split(/\s+/).length;
  const correctedWords = corrected.trim().split(/\s+/);
  const originalArr    = original.trim().split(/\s+/);

  let changes = 0;
  const maxLen = Math.max(originalArr.length, correctedWords.length);
  for (let i = 0; i < maxLen; i++) {
    if (originalArr[i] !== correctedWords[i]) changes++;
  }

  return changes / originalWords;
}

export async function correctTranscript(
  transcript: string,
  model: string = DEFAULT_MODEL
): Promise<CorrectionResponse> {
  const start = Date.now();

  const messages: OllamaMessage[] = [
    { role: 'system', content: CORRECTION_SYSTEM_PROMPT },
    { role: 'user',   content: buildCorrectionPrompt(transcript) },
  ];

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        format: 'json',
      } satisfies OllamaChatRequest),
    });
  } catch {
    throw new Error('OLLAMA_UNAVAILABLE');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama returned ${response.status}: ${text}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const rawContent = data.message.content;

  let parsed: Omit<CorrectionResponse, 'latency_ms'>;
  try {
    parsed = JSON.parse(rawContent) as Omit<CorrectionResponse, 'latency_ms'>;
  } catch {
    throw new Error(`Model returned non-JSON: ${rawContent.slice(0, 200)}`);
  }

    // Safety check: if the LLM claims no changes but text differs, discard correction
  if (parsed.changes.length === 0 && parsed.corrected !== transcript) {
    parsed.corrected = transcript;
  }

  // Compute Word Error Rate — what fraction of words did the LLM change?
  // This is an objective measure, unlike the LLM's self-reported confidence.
  const wer = calculateWER(transcript, parsed.corrected);

  // If more than 40% of words changed, the LLM almost certainly overcorrected.
  // Cap its confidence so the UI reflects the uncertainty.
  const computedConfidence = wer > 0.4
    ? Math.min(parsed.confidence, 0.5)
    : parsed.confidence;

  return {
    corrected:  parsed.corrected,
    intent:     parsed.intent,
    changes:    Array.isArray(parsed.changes) ? parsed.changes : [],
    confidence: computedConfidence,
    latency_ms: Date.now() - start,
  };
}

export async function listModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) return [];
    const data = (await response.json()) as { models: { name: string }[] };
    return data.models.map((m) => m.name);
  } catch {
    return [];
  }
}
