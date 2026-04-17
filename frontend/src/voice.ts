interface SpeechRecognitionResult {
  readonly 0: { transcript: string; confidence: number };
  readonly isFinal: boolean;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: { [index: number]: SpeechRecognitionResult; length: number };
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult:  ((e: SpeechRecognitionEvent) => void) | null;
  onend:     (() => void) | null;
  onerror:   ((e: SpeechRecognitionErrorEvent) => void) | null;
  onnomatch: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export interface TranscriptResult {
  transcript: string;
  confidence: number;
  audioBlob?: Blob;
}

export interface VoiceCallbacks {
  onInterim?: (text: string) => void;
  onFinal?:   (result: TranscriptResult) => void;
  onError?:   (message: string) => void;
}

export function isASRSupported(): boolean {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

export class VoiceRecorder {
  private recognition: SpeechRecognition | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private finalTranscript = '';
  private finalConfidence = 0;
  private callbacks: VoiceCallbacks;
  private _isRecording = false;

  constructor(callbacks: VoiceCallbacks) {
    this.callbacks = callbacks;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  async start(): Promise<void> {
    if (this._isRecording) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Please allow it in your browser settings.'
        : 'Could not access microphone. Is it connected?';
      this.callbacks.onError?.(msg);
      return;
    }

    this.audioChunks = [];
    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };
    this.mediaRecorder.start(100);

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    this.recognition = new SpeechRecognitionCtor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.finalTranscript = '';
    this.finalConfidence = 0;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          this.finalTranscript += text + ' ';
          this.finalConfidence = result[0].confidence;
        } else {
          interimText += text;
        }
      }

      const display = (this.finalTranscript + interimText).trim();
      this.callbacks.onInterim?.(display);
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'aborted') return;
      this.callbacks.onError?.(`ASR error: ${event.error}`);
    };

    this.recognition.onend = () => {
      if (!this._isRecording) return;
      void this._finalize();
    };

    this.recognition.start();
    this._isRecording = true;
  }

  async stop(): Promise<void> {
    if (!this._isRecording) return;
    this._isRecording = false;
    await this._finalize();
  }

  private async _finalize(): Promise<void> {
    this.recognition?.stop();
    this.recognition = null;

    const audioBlob = await new Promise<Blob>((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(new Blob());
        return;
      }
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        resolve(blob);
      };
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    });

    const transcript = this.finalTranscript.trim();

    // Only block if we have neither a transcript nor any audio.
    // In Whisper mode the caller doesn't need the transcript — just the blob.
    if (!transcript && audioBlob.size === 0) {
      this.callbacks.onError?.('No speech detected. Try again.');
      return;
    }

    this.callbacks.onFinal?.({
      transcript,
      confidence: this.finalConfidence,
      audioBlob,
    });
  }
}
