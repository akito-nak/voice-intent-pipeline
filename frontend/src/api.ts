export interface CorrectionRequest {
  transcript: string;
  confidence: number;
  model?: string;
  vocabSource?: string;
}

export interface CorrectionResponse {
  corrected: string;
  intent: string;
  changes: string[];
  confidence: number;
  latency_ms: number;
  vocabHints: string[];
  vocabSource: string;
}

export interface HealthResponse {
  ollama: boolean;
  models: string[];
  default_model: string;
}

export interface ApiError {
  error: string;
  code: string;
}

export async function correctTranscript(
  req: CorrectionRequest
): Promise<CorrectionResponse> {
  const response = await fetch('/api/correct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  const data = await response.json() as CorrectionResponse | ApiError;

  if (!response.ok) {
    throw data as ApiError;
  }

  return data as CorrectionResponse;
}

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  return response.json() as Promise<HealthResponse>;
}

export interface WhisperResponse {
  transcript: string;
  latency_ms: number;
}

export async function whisperTranscript(audioBlob: Blob): Promise<WhisperResponse> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const response = await fetch('/api/whisper', {
    method: 'POST',
    body: formData,
    // No Content-Type header — the browser sets it automatically for FormData
    // including the boundary string that multer needs to parse the body
  });

  const data = await response.json() as WhisperResponse | ApiError;

  if (!response.ok) {
    throw data as ApiError;
  }

  return data as WhisperResponse;
}