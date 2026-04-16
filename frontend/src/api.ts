export interface CorrectionRequest {
  transcript: string;
  confidence: number;
  model?: string;
}

export interface CorrectionResponse {
  corrected: string;
  intent: string;
  changes: string[];
  confidence: number;
  latency_ms: number;
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
