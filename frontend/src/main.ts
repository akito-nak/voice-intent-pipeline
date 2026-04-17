import { VoiceRecorder, isASRSupported, type TranscriptResult } from './voice.js';
import { correctTranscript, checkHealth, whisperTranscript, type ApiError, WhisperResponse } from './api.js';
import { speak, isTTSSupported }                                  from './tts.js';
import {
  elements,
  setRecordState,
  setHealthStatus,
  renderPipeline,
  clearPipeline,
  showError,
  clearError,
} from './ui.js';

let lastTranscript = '';
let lastConfidence = 0;

async function init(): Promise<void> {
  if (!isASRSupported()) {
    showError('Web Speech API not supported. Please use Chrome or Edge.');
    elements.recordBtn.disabled = true;
  }

  if (!isTTSSupported()) {
    elements.speakBtn.disabled = true;
  }

  try {
    const health = await checkHealth();
    setHealthStatus(health);
  } catch {
    setHealthStatus({ ollama: false, models: [], default_model: '' });
  }
}

const recorder = new VoiceRecorder({
  onInterim: (text: string) => {
    elements.promptInput.value = text;
  },

  onFinal: (result: TranscriptResult) => {
  lastTranscript = result.transcript;
  lastConfidence = result.confidence;
  elements.promptInput.value = result.transcript;

  const asrMode = elements.asrSelect.value;

  if (asrMode === 'whisper' && result.audioBlob && result.audioBlob.size > 0) {
    // Whisper path — send audio blob to backend, bypass Web Speech transcript
    setRecordState('processing');
    whisperTranscript(result.audioBlob)
      .then((whisperResult: WhisperResponse) => {
        lastTranscript = whisperResult.transcript;
        lastConfidence = 1.0;
        elements.promptInput.value = whisperResult.transcript;
        void runCorrectionPipeline(whisperResult.transcript, 1.0);
      })
      .catch((err: ApiError) => {
        setRecordState('error');
        showError(err.error ?? 'Whisper transcription failed');
      });
    } else {
    // Web Speech API path — use the transcript we already have
    if (!result.transcript) {
      setRecordState('error');
      showError('No speech detected. Try again.');
      return;
    }
    void runCorrectionPipeline(result.transcript, result.confidence);
  }
},

  onError: (message: string) => {
    setRecordState('error');
    showError(message);
  },
});

elements.recordBtn.addEventListener('click', async () => {
  clearError();

  if (recorder.isRecording) {
    setRecordState('processing');
    await recorder.stop();
  } else {
    clearPipeline();
    elements.promptInput.value = '';
    setRecordState('recording');
    await recorder.start();
  }
});

elements.submitBtn.addEventListener('click', () => {
  clearError();
  const text = elements.promptInput.value.trim();
  if (!text) {
    showError('Please type or speak a prompt first.');
    return;
  }
  const confidence = text === lastTranscript ? lastConfidence : 1.0;
  void runCorrectionPipeline(text, confidence);
});

elements.clearBtn.addEventListener('click', () => {
  elements.promptInput.value = '';
  lastTranscript = '';
  lastConfidence = 0;
  clearPipeline();
  clearError();
  setRecordState('idle');
});

elements.speakBtn.addEventListener('click', () => {
  const intentText = elements.intentText.textContent;
  if (intentText) void speak(intentText);
});

elements.confidenceThreshold.addEventListener('input', () => {
  elements.thresholdValue.textContent = elements.confidenceThreshold.value;
});

async function runCorrectionPipeline(
  transcript: string,
  confidence: number
): Promise<void> {
  const threshold = parseFloat(elements.confidenceThreshold.value);

  if (confidence < threshold && confidence < 1.0) {
    showError(
      `ASR confidence (${Math.round(confidence * 100)}%) is below threshold ` +
      `(${Math.round(threshold * 100)}%). ` +
      `Try speaking more clearly, or lower the threshold in Settings.`
    );
    setRecordState('idle');
    return;
  }

  const model = elements.modelSelect.value;
  const vocabSource = elements.vocabSelect.value;
  elements.submitBtn.disabled = true;

  try {
    const result = await correctTranscript({ transcript, confidence, model, vocabSource });
    renderPipeline(transcript, confidence, result);
    if (isTTSSupported()) void speak(result.intent);
  } catch (err) {
    const apiError = err as ApiError;
    showError(apiError.error ?? 'Unknown error from backend');
  } finally {
    setRecordState('idle');
    elements.submitBtn.disabled = false;
  }
}

void init();
