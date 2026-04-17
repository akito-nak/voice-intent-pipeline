import type { CorrectionResponse, HealthResponse } from './api.js';

function el<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element #${id} not found in DOM`);
  return element as T;
}

export const elements = {
  promptInput:         el<HTMLTextAreaElement>('prompt-input'),
  recordBtn:           el<HTMLButtonElement>('record-btn'),
  recordBtnIcon:       el<HTMLButtonElement>('record-btn').querySelector<HTMLSpanElement>('.btn-icon')!,
  recordBtnLabel:      el<HTMLButtonElement>('record-btn').querySelector<HTMLSpanElement>('.btn-label')!,
  submitBtn:           el<HTMLButtonElement>('submit-btn'),
  clearBtn:            el<HTMLButtonElement>('clear-btn'),
  healthStatus:        el<HTMLDivElement>('health-status'),
  pipelineSection:     el<HTMLElement>('pipeline-section'),
  rawText:             el<HTMLDivElement>('raw-text'),
  rawConfidence:       el<HTMLSpanElement>('raw-confidence'),
  correctedText:       el<HTMLDivElement>('corrected-text'),
  correctedChanges:    el<HTMLSpanElement>('corrected-changes'),
  intentText:          el<HTMLDivElement>('intent-text'),
  intentConfidence:    el<HTMLSpanElement>('intent-confidence'),
  speakBtn:            el<HTMLButtonElement>('speak-btn'),
  latencyValue:        el<HTMLSpanElement>('latency-value'),
  errorBanner:         el<HTMLDivElement>('error-banner'),
  modelSelect:         el<HTMLSelectElement>('model-select'),
  asrSelect:           el<HTMLSelectElement>('asr-select'),
  confidenceThreshold: el<HTMLInputElement>('confidence-threshold'),
  thresholdValue:      el<HTMLSpanElement>('threshold-value'),
};

export type RecordState = 'idle' | 'recording' | 'processing' | 'error';

export function setRecordState(state: RecordState): void {
  const btn = elements.recordBtn;
  btn.setAttribute('data-state', state);

  const icons: Record<RecordState, string> = {
    idle:       '&#x1F399;',
    recording:  '&#x23F9;',
    processing: '',
    error:      '&#x2715;',
  };

  const labels: Record<RecordState, string> = {
    idle:       'Start Recording',
    recording:  'Stop Recording',
    processing: 'Processing...',
    error:      'Try Again',
  };

  elements.recordBtnIcon.innerHTML = icons[state];
  elements.recordBtnLabel.textContent = labels[state];
  btn.disabled = state === 'processing';
}

export function setHealthStatus(health: HealthResponse): void {
  const badge = elements.healthStatus;
  badge.classList.remove('health-checking', 'health-ok', 'health-error');

  if (!health.ollama) {
    badge.classList.add('health-error');
    badge.textContent = 'Ollama not running — start with: ollama serve';
    return;
  }

  badge.classList.add('health-ok');
  badge.textContent = `Ollama ready — ${health.models.length} model${health.models.length === 1 ? '' : 's'}`;

  elements.modelSelect.innerHTML = '';
  health.models.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    if (model === health.default_model) option.selected = true;
    elements.modelSelect.appendChild(option);
  });
}

export function renderPipeline(
  rawTranscript: string,
  rawConfidence: number,
  result: CorrectionResponse
): void {
  elements.pipelineSection.classList.remove('hidden');

  elements.rawText.textContent = rawTranscript;
  elements.rawConfidence.textContent = `confidence: ${Math.round(rawConfidence * 100)}%`;

  elements.correctedText.textContent = result.corrected;
  elements.correctedChanges.textContent = result.changes.length > 0
    ? result.changes.join(', ')
    : 'no changes';

  elements.intentText.textContent = result.intent;
  elements.intentConfidence.textContent = `${Math.round(result.confidence * 100)}% confidence`;

  elements.latencyValue.textContent = `${result.latency_ms}ms`;
}

export function clearPipeline(): void {
  elements.pipelineSection.classList.add('hidden');
  elements.rawText.textContent = '';
  elements.correctedText.textContent = '';
  elements.intentText.textContent = '';
  elements.latencyValue.textContent = '—';
}

export function showError(message: string): void {
  elements.errorBanner.textContent = message;
  elements.errorBanner.classList.remove('hidden');
}

export function clearError(): void {
  elements.errorBanner.classList.add('hidden');
  elements.errorBanner.textContent = '';
}
