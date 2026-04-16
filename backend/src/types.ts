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

export interface ErrorResponse {
  error: string;
  code: string;
}
