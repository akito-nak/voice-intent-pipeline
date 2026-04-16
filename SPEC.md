# Voice Prompt Explorer — Project Specification

> A learning-first application for exploring browser Voice APIs, ASR accuracy, and LLM-powered intent correction. Built to understand and solve the hallucination problem in voice-to-text pipelines before integrating voice into production AI applications.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Answering the Key Design Questions](#3-answering-the-key-design-questions)
4. [How the Voice Pipeline Works](#4-how-the-voice-pipeline-works)
5. [Architecture](#5-architecture)
6. [Tech Stack](#6-tech-stack)
7. [The Accuracy Layers](#7-the-accuracy-layers)
8. [UI/UX Design](#8-uiux-design)
9. [API Design](#9-api-design)
10. [Implementation Phases](#10-implementation-phases)
11. [Latency Budget](#11-latency-budget)
12. [Testing Strategy](#12-testing-strategy)
13. [Repository Structure](#13-repository-structure)
14. [Future Phases](#14-future-phases)
15. [Glossary](#15-glossary)

---

## 1. Problem Statement

Voice-to-text pipelines — whether using the browser's native Web Speech API or cloud-based ASR — frequently produce transcriptions that differ significantly from what the user actually said. This problem has two forms:

| Problem | Example |
|---|---|
| **Phonetic substitution** | User says "set a timer for three minutes" → transcribed as "said a timer for free minutes" |
| **Domain hallucination** | User says "Charizard" → transcribed as "Charles R" or "charred" |

The Web Speech API is particularly prone to these errors because it uses a general-purpose language model with no domain context. The result is that voice prompts become unreliable in production apps.

This project builds a layered pipeline to solve both problems, starting with standard English, and documents every layer so engineers can understand *why* each one exists.

---

## 2. Goals & Non-Goals

### Goals

- **Learn** how browser Voice APIs, ASR, TTS, and local LLMs interact
- **Solve** the ASR accuracy/hallucination problem for standard English
- **Explore** intent extraction on top of raw transcription
- **Document** each pipeline layer so the repo is a useful reference
- **Run entirely locally** — no cloud API keys, no latency from remote services
- **Be a public reference repo** for engineers facing the same problems

### Non-Goals

- This is not a production application
- Non-standard vocabulary (Pokémon names, proper nouns) is **Phase 2**
- No authentication, user accounts, or persistence
- No mobile-native app (browser only)
- No streaming LLM responses in Phase 1

---

## 3. Answering the Key Design Questions

### Should we allow voice only, or text input as well?

**Allow both.** This is primarily a learning app, which means visibility into the pipeline is more important than pure voice-first UX. Text input gives you three things voice alone cannot:

1. **A ground truth** — type exactly what you meant, then compare it to what the ASR transcribed
2. **Pipeline bypass** — test LLM intent correction without needing perfect voice input
3. **Fallback** — users can correct a bad transcription before sending it onward

The UI will make the relationship between text and voice explicit, showing the raw transcription and the corrected intent as separate stages.

### How should the user trigger voice input?

**Tap to start, tap to stop.** This is the standard pattern for longer-form voice input (used by Siri, voice messages, Google Assistant). Here is why it is the right choice:

| Approach | Pros | Cons |
|---|---|---|
| **Hold to record** | Feels immediate, like a walkie-talkie | Fatigue on long prompts, accidental cutoffs, bad mobile UX |
| **Tap start / tap stop** ✓ | Natural for sentences, no fatigue, clear visual state | Requires deliberate stop action |

The record button will have three visual states: **idle**, **recording** (pulsing), and **processing**.

---

## 4. How the Voice Pipeline Works

Understanding the full pipeline is the core goal of this project. Here is how all the pieces connect.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VOICE PIPELINE                             │
│                                                                     │
│  Microphone                                                         │
│      │                                                              │
│      ▼                                                              │
│  ┌─────────────────────────────┐                                   │
│  │  Layer 1: Audio Capture     │  MediaRecorder API (browser)      │
│  │  getUserMedia()             │  Raw PCM/WebM audio stream        │
│  └──────────────┬──────────────┘                                   │
│                 │                                                    │
│                 ▼                                                    │
│  ┌─────────────────────────────┐                                   │
│  │  Layer 2: ASR               │  Web Speech API (built-in)        │
│  │  SpeechRecognition API      │  OR Whisper (local, more accurate)│
│  │                             │  → Raw transcript text            │
│  └──────────────┬──────────────┘                                   │
│                 │                                                    │
│                 ▼                                                    │
│  ┌─────────────────────────────┐                                   │
│  │  Layer 3: Confidence Filter │  If confidence < threshold,       │
│  │                             │  prompt user to repeat            │
│  └──────────────┬──────────────┘                                   │
│                 │                                                    │
│                 ▼                                                    │
│  ┌─────────────────────────────┐                                   │
│  │  Layer 4: LLM Intent        │  Ollama (local LLM)               │
│  │  Correction                 │  Fixes transcription errors,      │
│  │                             │  extracts user intent             │
│  └──────────────┬──────────────┘                                   │
│                 │                                                    │
│                 ▼                                                    │
│  ┌─────────────────────────────┐                                   │
│  │  Layer 5: Intent Output     │  Structured JSON with:            │
│  │                             │  - raw transcript                 │
│  │                             │  - corrected text                 │
│  │                             │  - intent / meaning               │
│  │                             │  - confidence score               │
│  └─────────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Layer Breakdown

#### Layer 1 — Audio Capture (`MediaRecorder API`)

The browser provides `getUserMedia()` to access the microphone and `MediaRecorder` to record audio chunks. This layer produces raw audio data (WebM/Opus by default on Chrome) and is completely separate from any speech recognition.

**Key concepts:**
- `getUserMedia({ audio: true })` — requests microphone permission
- `MediaRecorder` — records in chunks, fires `ondataavailable` events
- Audio is collected into a `Blob` and can be replayed or sent to a server

#### Layer 2 — ASR (Automatic Speech Recognition)

This is where audio becomes text. Two options exist:

**Option A: Web Speech API (`SpeechRecognition`)**
- Built into Chrome and Edge — no install required
- Uses Google's cloud ASR under the hood (even though it feels local)
- Fast (~200–500ms), but general-purpose — prone to errors on uncommon words
- Provides a `confidence` score per result

```js
const recognition = new webkitSpeechRecognition();
recognition.continuous = false;
recognition.interimResults = true; // shows partial results as user speaks
recognition.lang = 'en-US';
recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  const confidence = event.results[0][0].confidence;
};
```

**Option B: Whisper (via `whisper.cpp` or `faster-whisper`)**
- Open-source model from OpenAI, runs entirely locally
- Significantly more accurate than Web Speech API for tricky phrases
- Higher latency (~500ms–2s depending on model size and hardware)
- Runs well on M1 Pro via Metal acceleration
- Exposed as a local HTTP endpoint by the Node.js backend

> **Phase 1 uses Web Speech API as the primary ASR** to keep setup minimal, with a toggle to switch to a local Whisper endpoint for comparison.

#### Layer 3 — Confidence Filter

ASR results include a confidence score (0.0–1.0). Before sending to the LLM:
- If `confidence >= 0.75` → proceed to LLM
- If `confidence < 0.75` → display a warning and offer the user a chance to re-record or manually correct the transcript

This prevents the LLM from wasting time trying to correct deeply garbled audio.

#### Layer 4 — LLM Intent Correction (`Ollama`)

This is the most important layer for solving the hallucination problem. The raw ASR transcript is sent to a locally-running LLM with a prompt that:

1. **Corrects transcription errors** — e.g., "free minutes" → "three minutes"
2. **Infers intent** — what did the user actually mean?
3. **Returns structured JSON** — so the app can work with the result programmatically

**Why a local LLM?**
- Free to run, no API keys
- Runs on M1 Pro with Ollama
- Fast enough for interactive use with small models (3B–7B parameters)
- Keeps user data on-device

**Example prompt:**
```
You are a voice transcription corrector. The following text was produced by 
a speech-to-text system and may contain errors. 

Raw transcript: "can you set a timer for free minutes"

Fix any transcription errors, then state what the user intended to do.
Return JSON only:
{
  "corrected": "can you set a timer for three minutes",
  "intent": "Set a timer for 3 minutes",
  "changes": ["free → three"],
  "confidence": 0.95
}
```

#### Layer 5 — Intent Output

The final output shown to the user is a structured breakdown of what happened at each stage, making the pipeline transparent and educational.

---

### TTS (Text-to-Speech) — Where It Fits

TTS is the *reverse* pipeline: text → audio. It is used in this app for:
1. **Playback confirmation** — speak back the corrected intent so the user can confirm it was understood
2. **Error prompts** — "I didn't catch that clearly, please try again"

The browser's `SpeechSynthesis` API handles this for free:

```js
const utterance = new SpeechSynthesisUtterance("Set a timer for three minutes");
utterance.lang = 'en-US';
utterance.rate = 1.0;
window.speechSynthesis.speak(utterance);
```

No installation required, runs entirely in the browser.

---

### Intent vs. Transcription — The Distinction

| Term | Definition | Example |
|---|---|---|
| **Transcript** | The literal words the ASR heard | `"can you set a timer for free minutes"` |
| **Corrected text** | Transcript with errors fixed | `"can you set a timer for three minutes"` |
| **Intent** | What the user meant to accomplish | `"Set a 3-minute timer"` |

Intent extraction is the job of the LLM. It moves beyond literal words to understand meaning — "three minutes" and "180 seconds" and "three minute timer" all share the same intent.

---

## 5. Architecture

```
┌────────────────────────────────────────────────────┐
│                   Browser (Frontend)               │
│                                                    │
│  ┌──────────────┐     ┌──────────────────────────┐ │
│  │  Voice Input │     │     Text Input           │ │
│  │  (MediaRec.) │     │     (fallback/debug)      │ │
│  └──────┬───────┘     └────────────┬─────────────┘ │
│         │                          │               │
│         └──────────┬───────────────┘               │
│                    ▼                               │
│         ┌──────────────────┐                       │
│         │  Web Speech API  │ ← Layer 2 (primary)   │
│         │  SpeechRecognit. │                       │
│         └────────┬─────────┘                       │
│                  │ raw transcript + confidence      │
│                  ▼                                 │
│         ┌──────────────────┐                       │
│         │  Pipeline UI     │                       │
│         │  (shows stages)  │                       │
│         └────────┬─────────┘                       │
└──────────────────┼─────────────────────────────────┘
                   │ POST /api/correct
                   ▼
┌────────────────────────────────────────────────────┐
│                 Node.js Backend                    │
│                                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │  Express API Server                         │  │
│  │                                             │  │
│  │  POST /api/correct  →  Ollama REST API      │  │
│  │  POST /api/whisper  →  Whisper (opt. Phase2)│  │
│  │  GET  /api/health   →  status check         │  │
│  └─────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│               Ollama (local)                       │
│               llama3.2:3b or mistral:7b            │
│               REST API at localhost:11434           │
└────────────────────────────────────────────────────┘
```

### Why a Backend?

The LLM correction call goes through a Node.js backend (not directly from the browser to Ollama) for three reasons:

1. **CORS** — Ollama's local server does not accept browser requests by default
2. **Prompt engineering** — system prompts live on the server, not in client-side JS
3. **Future extensibility** — Whisper integration, logging, and domain vocabulary lists live here

---

## 6. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| **Frontend** | Vanilla HTML + CSS + TypeScript (no framework) | Barebones, nothing hidden, everything visible |
| **Build tool** | Vite | Fast dev server, TypeScript out of the box, minimal config |
| **Backend** | Node.js + TypeScript + Express | Same language as frontend, simple REST API, easy Ollama integration |
| **ASR (primary)** | Web Speech API (`SpeechRecognition`) | Zero install, built into Chrome/Edge, good enough for Phase 1 |
| **ASR (secondary)** | Whisper via `whisper.cpp` (togglable) | Higher accuracy, local, M1-optimized |
| **LLM** | Ollama (`llama3.2:3b` default, `mistral:7b` optional) | Free, local, M1 Metal acceleration, simple REST API |
| **TTS** | Web Speech Synthesis API | Zero install, built into all browsers |
| **Styling** | Plain CSS with CSS variables | No dependencies, responsive by default |

### Why TypeScript over Python?

This is a browser-first application. The core APIs (`MediaRecorder`, `SpeechRecognition`, `SpeechSynthesis`) are JavaScript/browser APIs. Using TypeScript for both frontend and backend means:
- One language throughout
- No context switching
- Type safety across the API boundary (shared types)
- Direct browser API access without a Python-to-browser bridge

Python would add value *only* if Whisper becomes the primary ASR layer (Phase 2), and even then it can be isolated as a microservice.

### Recommended Ollama Models (M1 Pro 32GB)

| Model | Size | RAM Usage | Speed | Best For |
|---|---|---|---|---|
| `llama3.2:3b` | 2GB | ~4GB | ~50–100 tok/s | Low latency, Phase 1 |
| `mistral:7b` | 4GB | ~6GB | ~30–60 tok/s | Better reasoning |
| `llama3.1:8b` | 5GB | ~7GB | ~25–50 tok/s | Highest quality |

**Start with `llama3.2:3b`** for low latency. The UI will have a model selector to compare results.

---

## 7. The Accuracy Layers

This is the core thesis of the project: accuracy improves as you add layers. Each layer is toggleable in the UI so you can see the difference.

```
Layer 1 (Audio)     → Raw audio from mic
Layer 2 (ASR)       → Raw text, may have errors
Layer 3 (Confidence)→ Low confidence triggers re-record
Layer 4 (LLM)       → Corrected text + intent
Layer 5 (Output)    → Structured result
```

### Why ASR Hallucinates

The Web Speech API uses a general acoustic model trained on broad English. When it encounters a phoneme sequence it hasn't seen in a clear context, it substitutes the closest match from its training data. This is not random noise — it is a systematic bias toward common words.

**Common failure patterns:**

| What user said | What ASR heard | Why |
|---|---|---|
| "three" | "free" | Phonetically similar in some accents |
| "write code" | "right code" | Homophones |
| "Ollama" | "a llama" | Unknown proper noun split into known words |
| "neural net" | "new URL net" | Partial match on "neural" |

### How the LLM Corrects This

The LLM has two advantages over raw ASR:
1. **Context understanding** — it knows "free minutes" in the context of timers likely means "three minutes"
2. **Common error patterns** — it can be prompted with known ASR error patterns

The correction prompt includes:
- The raw transcript
- The domain context (what kind of app this is)
- Examples of common ASR errors (few-shot prompting)
- Instruction to return structured JSON

---

## 8. UI/UX Design

### Layout

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   Voice Prompt Explorer                        │
│   ─────────────────────                        │
│                                                 │
│   ┌───────────────────────────────────────┐     │
│   │  Type or speak your prompt...         │     │  ← Textarea (editable)
│   │                                       │     │
│   └───────────────────────────────────────┘     │
│                                                 │
│   [ 🎙 Start Recording ]   [ ▶ Submit ]         │  ← Buttons
│                                                 │
│   ─────────────────────────────────────────     │
│                                                 │
│   Pipeline Stages                              │
│                                                 │
│   ① Raw Transcript      "can you set a timer    │
│                          for free minutes"      │
│                          Confidence: 0.82       │
│                                                 │
│   ② Corrected Text      "can you set a timer    │
│                          for three minutes"     │
│                          Changes: free → three  │
│                                                 │
│   ③ Intent              Set a 3-minute timer    │
│                          Confidence: 0.97       │
│                                                 │
│   [ 🔊 Speak Intent ]                           │  ← TTS playback
│                                                 │
│   ─────────────────────────────────────────     │
│   Settings                                     │
│   ASR: [Web Speech API ▼]  Model: [llama3.2:3b ▼] │
└─────────────────────────────────────────────────┘
```

### Recording Button States

| State | Appearance | Behavior |
|---|---|---|
| **Idle** | Solid microphone icon, neutral color | Click to start recording |
| **Recording** | Pulsing red ring animation | Click to stop recording |
| **Processing** | Spinner, disabled | Waiting for ASR + LLM |
| **Error** | Red X, error message below | Click to retry |

### Design Principles

- **Responsive** — single-column layout, works on any screen width
- **Barebones** — no icons library, no UI framework, minimal CSS
- **Transparent** — every pipeline stage is visible, not hidden
- **Dark mode** — CSS variables for easy theming, default dark
- **No page reloads** — single-page application, all state in memory

### CSS Variable Palette

```css
:root {
  --bg:          #0f0f0f;
  --surface:     #1a1a1a;
  --border:      #2a2a2a;
  --text:        #e8e8e8;
  --text-muted:  #888;
  --accent:      #4f8ef7;   /* blue — idle/active */
  --danger:      #e55353;   /* red — recording */
  --success:     #4caf7d;   /* green — intent confirmed */
}
```

---

## 9. API Design

All endpoints are served by the Express backend at `http://localhost:3001`.

### `POST /api/correct`

Sends a raw ASR transcript to the local LLM for correction and intent extraction.

**Request:**
```json
{
  "transcript": "can you set a timer for free minutes",
  "confidence": 0.82,
  "model": "llama3.2:3b"
}
```

**Response:**
```json
{
  "corrected": "can you set a timer for three minutes",
  "intent": "Set a 3-minute timer",
  "changes": ["free → three"],
  "confidence": 0.97,
  "latency_ms": 312
}
```

**Error response:**
```json
{
  "error": "Ollama not running",
  "code": "OLLAMA_UNAVAILABLE"
}
```

---

### `POST /api/whisper` *(Phase 2)*

Sends raw audio to a local Whisper instance for higher-accuracy transcription.

**Request:** `multipart/form-data` with audio blob

**Response:**
```json
{
  "transcript": "can you set a timer for three minutes",
  "confidence": 0.94,
  "language": "en",
  "latency_ms": 890
}
```

---

### `GET /api/health`

Returns the status of Ollama and available models.

**Response:**
```json
{
  "ollama": true,
  "models": ["llama3.2:3b", "mistral:7b"],
  "default_model": "llama3.2:3b"
}
```

---

## 10. Implementation Phases

### Phase 1 — Foundation (Start Here)

**Goal:** Working voice pipeline with Web Speech API + LLM correction

- [ ] Project scaffolding (Vite + TypeScript frontend, Express + TypeScript backend)
- [ ] Microphone permission and `MediaRecorder` setup
- [ ] Web Speech API integration (start/stop, interim results, confidence)
- [ ] Record button with idle/recording/processing states
- [ ] Text input as fallback and debug tool
- [ ] `POST /api/correct` endpoint calling Ollama
- [ ] Pipeline stages UI (raw → corrected → intent)
- [ ] TTS playback of corrected intent
- [ ] `GET /api/health` status check on startup
- [ ] Model selector in settings panel
- [ ] README with setup instructions

**Success criteria:** User can speak, see a corrected transcript, and hear the intent spoken back.

---

### Phase 2 — Whisper Integration

**Goal:** Compare Web Speech API vs Whisper accuracy on the same input

- [ ] `whisper.cpp` or `faster-whisper` running locally as a subprocess
- [ ] `POST /api/whisper` endpoint
- [ ] ASR toggle in UI (Web Speech vs Whisper)
- [ ] Side-by-side comparison view
- [ ] Latency comparison metrics

**Success criteria:** User can toggle between ASR engines and see accuracy differences on the same recording.

---

### Phase 3 — Domain Vocabulary (Non-Standard English)

**Goal:** Solve the Pokémon / proper noun problem

- [ ] Vocabulary hint system — provide domain word lists to the LLM
- [ ] Custom ASR grammar hints via `SpeechGrammarList` (where supported)
- [ ] Phonetic similarity matching for unknown words
- [ ] Vocabulary file format and UI for adding custom words
- [ ] Benchmark suite: record the same phrase with/without vocabulary hints

**Success criteria:** "Charizard" is recognized correctly without phonetic substitution.

---

### Phase 4 — Evaluation Suite

**Goal:** Quantify accuracy improvements across layers

- [ ] Test phrase library (standard + domain-specific)
- [ ] Automated accuracy scoring (WER — Word Error Rate)
- [ ] Results dashboard showing accuracy per layer per phrase
- [ ] Export results as JSON/CSV

---

## 11. Latency Budget

For the user experience to feel responsive, the total pipeline latency (from "stop recording" to "intent displayed") should be under **1.5 seconds**.

| Stage | Target Latency | Notes |
|---|---|---|
| Audio encoding | < 50ms | Browser-native, negligible |
| Web Speech API ASR | 200–500ms | Google's servers, unavoidable |
| Network to local backend | < 5ms | Localhost, negligible |
| LLM correction (3B model) | 200–500ms | M1 Metal, ~50–100 tok/s |
| JSON parse + UI update | < 10ms | Negligible |
| **Total** | **~500ms–1s** | Well within budget |

### Optimizations

- **Stream LLM output** — display tokens as they arrive (Phase 1.5)
- **Cache common corrections** — identical transcripts return instantly
- **Abort stale requests** — if user re-records before LLM responds, cancel the previous request

---

## 12. Testing Strategy

### Manual Testing Checklist (Phase 1)

- [ ] Speak a clear sentence — verify transcript is accurate
- [ ] Speak with a deliberate error ("free" instead of "three") — verify LLM corrects it
- [ ] Speak quickly — verify partial/interim results don't break state
- [ ] Deny microphone permission — verify graceful error message
- [ ] Stop Ollama — verify backend returns clear error, UI shows fallback message
- [ ] Type in text box instead of speaking — verify same LLM pipeline fires

### Benchmark Phrases (Phase 1 — Standard English)

| # | Phrase | Common ASR Error |
|---|---|---|
| 1 | "Set a timer for three minutes" | "free minutes" |
| 2 | "What is the weather like today" | Generally reliable |
| 3 | "Remind me to take my medication" | "medic asian" |
| 4 | "Write a function that sorts an array" | "right a function" |
| 5 | "Open a new terminal window" | Generally reliable |
| 6 | "The neural network needs training" | "new URL network" |

---

## 13. Repository Structure

```
vocal-intent-pipeline/
├── SPEC.md                    ← This document
├── README.md                  ← Setup and run instructions
├── package.json               ← Workspace root
│
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts            ← Entry point
│       ├── voice.ts           ← MediaRecorder + Web Speech API
│       ├── api.ts             ← Backend API calls
│       ├── tts.ts             ← Speech Synthesis
│       ├── ui.ts              ← DOM manipulation, state rendering
│       └── style.css
│
├── backend/
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts          ← Express app entry point
│       ├── routes/
│       │   ├── correct.ts     ← POST /api/correct
│       │   ├── whisper.ts     ← POST /api/whisper (Phase 2)
│       │   └── health.ts      ← GET /api/health
│       ├── services/
│       │   ├── ollama.ts      ← Ollama REST client
│       │   └── prompts.ts     ← LLM prompt templates
│       └── types.ts           ← Shared TypeScript types
│
└── docs/
    ├── pipeline-diagram.md    ← Detailed pipeline explanation
    ├── asr-comparison.md      ← Web Speech vs Whisper analysis
    └── intent-examples.md     ← Example inputs/outputs per layer
```

---

## 14. Future Phases

| Phase | Description |
|---|---|
| **Streaming** | Stream LLM tokens to the UI as they are generated — eliminates perceived wait |
| **Context memory** | Feed previous turns to the LLM so it can resolve pronouns ("do that again") |
| **Confidence calibration** | Learn from user corrections over time to improve thresholds |
| **Wake word** | Always-on listening with a trigger word ("Hey, prompt...") |
| **Whisper fine-tuning** | Fine-tune a Whisper model on domain vocabulary |
| **Offline mode** | Full offline operation using Whisper + Ollama with no network calls |

---

## 15. Glossary

| Term | Definition |
|---|---|
| **ASR** | Automatic Speech Recognition — converts audio to text |
| **TTS** | Text-to-Speech — converts text to spoken audio |
| **Intent** | What the user meant to accomplish, distinct from the literal words spoken |
| **Transcript** | The literal text output of an ASR system |
| **Confidence** | A 0.0–1.0 score indicating how certain the ASR is about its output |
| **Hallucination** | When ASR or an LLM produces output that is confidently wrong |
| **WER** | Word Error Rate — the percentage of words that differ between ASR output and ground truth |
| **Ollama** | A tool for running open-source LLMs locally via a REST API |
| **Whisper** | An open-source speech recognition model from OpenAI |
| **Web Speech API** | A browser-native API for speech recognition and synthesis |
| **MediaRecorder** | A browser API for recording audio/video from `getUserMedia` streams |
| **LLM** | Large Language Model — a neural network trained to understand and generate text |
| **Few-shot prompting** | Giving an LLM examples of the desired behavior in the prompt itself |

---

*This spec is a living document. Update it as each phase completes and new decisions are made.*
