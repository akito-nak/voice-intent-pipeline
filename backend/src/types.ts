export interface CorrectionRequest {
  transcript: string;
  confidence: number;
  model?: string;
  vocabSource?: VocabSource;
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

export interface WhisperResponse {
  transcript: string;
  latency_ms: number;
}

export type VocabSource = 'none' | 'static' | 'pokeapi' | 'rag';

export interface VocabResult {
  words: string[];
  source: VocabSource;
}
