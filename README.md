# Voice Prompt Explorer

A learning-first application for exploring browser Voice APIs, ASR accuracy, and LLM-powered intent correction. Built to understand and solve the hallucination problem in voice-to-text pipelines.

> **Goal:** Before integrating voice into a production AI application, understand *why* ASR makes mistakes and build a layered pipeline that catches and corrects them.

---

## The Problem

Voice-to-text pipelines frequently produce transcriptions that differ from what the user actually said. This happens in two ways:

| Problem | Example |
|---|---|
| **Phonetic substitution** | User says "three minutes" → ASR hears "free minutes" |
| **Domain hallucination** | User says "Charizard" → ASR hears "Charles R" |

The Web Speech API uses a general-purpose acoustic model. When it encounters an ambiguous sound, it substitutes the closest word from its training data — confidently and silently. This project builds a layered pipeline that catches and corrects these errors.

---

## How the Pipeline Works

Every voice input flows through five layers:

```
Microphone
    │
    ▼
Layer 1 — Audio Capture       MediaRecorder API  →  raw audio blob (WebM)
    │
    ▼
Layer 2 — ASR                 Web Speech API     →  raw transcript + confidence score
    │
    ▼
Layer 3 — Confidence Filter   if score < threshold, warn the user before proceeding
    │
    ▼
Layer 4 — LLM Correction      Ollama (local LLM) →  corrected text + intent + changes
    │
    ▼
Layer 5 — Intent Output       structured JSON displayed in the UI + spoken via TTS
```

Each layer is visible in the UI so you can see exactly what changed and why.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Vanilla HTML + CSS + TypeScript | No framework — every line is visible and educational |
| Build tool | Vite | TypeScript out of the box, fast dev server, proxy support |
| Backend | Node.js + TypeScript + Express | Proxy between browser and Ollama, prompt engineering lives here |
| ASR | Web Speech API (`SpeechRecognition`) | Built into Chrome/Edge, zero install |
| LLM | Ollama (local) | Free, runs on-device, no API keys, M1 Metal acceleration |
| TTS | Web Speech Synthesis API | Built into all browsers, zero install |
| Styling | Plain CSS with CSS variables | No dependencies, responsive by default |

---

## Prerequisites

Before you start, you need the following installed:

### 1. Node.js (v18 or higher)

```bash
node --version   # should print v18.x or higher
```

Download from [nodejs.org](https://nodejs.org) if not installed.

### 2. Ollama

Ollama runs open-source LLMs locally via a simple REST API.

```bash
# Install on macOS
brew install ollama

# Verify installation
ollama --version
```

Or download from [ollama.com](https://ollama.com).

### 3. A supported LLM model

Pull at least one model. The app defaults to `gemma4:e4b` which gives the best balance of speed and instruction-following accuracy:

```bash
# Recommended — best instruction following, fast on M1
ollama pull gemma4:e4b

# Alternative — good for comparison, already common
ollama pull mistral:7b-instruct-q4_K_M

# Fastest — lowest latency, less accurate
ollama pull phi4-mini:3.8b
```

### 4. Chrome or Edge browser

The Web Speech API (`SpeechRecognition`) is only available in Chromium-based browsers. Firefox does not support it.

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/vocal-intent-pipeline.git
cd vocal-intent-pipeline
```

### 2. Install dependencies

```bash
npm install
```

This installs dependencies for both the `frontend` and `backend` packages in one command, using npm workspaces.

### 3. Start Ollama

Ollama must be running before you start the app. In a separate terminal:

```bash
ollama serve
```

If Ollama is already running in the background (e.g. started at login), you can skip this step. You can check with:

```bash
curl http://localhost:11434/api/tags
```

---

## Running the App

From the project root, start both servers with one command:

```bash
npm run dev
```

This runs the backend (Express) and frontend (Vite) concurrently. You should see:

```
[0] Backend running at http://localhost:3001
[1] VITE v6.x  ready at http://localhost:5173
```

Open **http://localhost:5173** in Chrome or Edge.

---

## Using the App

### Voice input

1. Click **Start Recording** — the button turns red and pulses
2. Speak your prompt clearly
3. Click **Stop Recording** — the app processes your speech automatically

### Text input

1. Type directly into the text area
2. Click **Submit**

### Reading the pipeline output

After submitting, three stages appear:

| Stage | What it shows |
|---|---|
| **Raw Transcript** | Exactly what the ASR engine heard, plus its confidence score |
| **Corrected Text** | The LLM's corrected version, with a list of changes made |
| **Intent** | What the LLM determined you meant to accomplish |

Click **Speak Intent** to hear the detected intent read back to you via TTS.

### Settings

- **LLM Model** — switch between any model installed in Ollama. Results and latency vary significantly between models
- **Confidence threshold** — ASR results below this score trigger a warning before sending to the LLM. Lower this if you speak with a strong accent or in a noisy environment

---

## Project Structure

```
vocal-intent-pipeline/
├── package.json              ← workspace root, runs both packages together
├── SPEC.md                   ← full project specification and design decisions
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts         ← Express entry point, middleware setup
│       ├── types.ts          ← shared TypeScript interfaces (request/response shapes)
│       ├── routes/
│       │   ├── correct.ts    ← POST /api/correct  — receives transcript, calls LLM
│       │   └── health.ts     ← GET  /api/health   — checks Ollama, lists models
│       └── services/
│           ├── ollama.ts     ← Ollama REST client + WER safety check
│           └── prompts.ts    ← LLM system prompt and few-shot examples
│
└── frontend/
    ├── index.html            ← page structure, all element IDs
    ├── vite.config.ts        ← Vite config + dev proxy to backend
    ├── tsconfig.json
    └── src/
        ├── main.ts           ← entry point, wires all modules together
        ├── voice.ts          ← MediaRecorder + Web Speech API (ASR)
        ├── api.ts            ← fetch calls to the Express backend
        ├── tts.ts            ← Web Speech Synthesis (TTS)
        ├── ui.ts             ← all DOM reads and writes
        └── style.css         ← dark theme, CSS variables, animations
```

---

## API Reference

The backend runs at `http://localhost:3001`. During development, Vite proxies `/api/*` requests so the frontend can use relative paths.

### `POST /api/correct`

Sends a raw transcript to the LLM for correction and intent extraction.

**Request:**
```json
{
  "transcript": "can you set a timer for free minutes",
  "confidence": 0.82,
  "model": "gemma4:e4b"
}
```

**Response:**
```json
{
  "corrected": "can you set a timer for three minutes",
  "intent": "Set a 3-minute timer",
  "changes": ["free → three"],
  "confidence": 0.97,
  "latency_ms": 1250
}
```

### `GET /api/health`

Returns Ollama status and available models. Called on page load to populate the model selector.

**Response:**
```json
{
  "ollama": true,
  "models": ["gemma4:e4b", "mistral:7b-instruct-q4_K_M", "phi4-mini:3.8b"],
  "default_model": "gemma4:e4b"
}
```

---

## Accuracy Layers Explained

### Why ASR hallucinates

The Web Speech API is a general acoustic model. When it encounters an ambiguous phoneme sequence, it substitutes the statistically most likely word — not the correct one. Common failure patterns:

| Said | Heard | Reason |
|---|---|---|
| "three" | "free" | Phonetically similar |
| "write code" | "right code" | Homophones |
| "neural net" | "new URL net" | Partial phonetic match |
| "medication" | "medic asian" | Compound word split |
| "Ollama" | "a llama" | Unknown proper noun |

### How the LLM corrects this

The LLM has two advantages over raw ASR:

1. **Context** — it understands that "free minutes" in the context of a timer almost certainly means "three minutes"
2. **Instruction following** — it can be given explicit rules like "do not change proper nouns" and "only fix clear phonetic errors"

### The WER safety check

LLMs can overcorrect — changing words that were correct to begin with (e.g. "corn muffin" → "carnation muffin"). The backend measures **Word Error Rate** after every LLM response:

```
WER = words changed ÷ total words in original
```

If the LLM changed more than 40% of the words, its confidence score is automatically capped at 50% to signal to the UI that the correction is uncertain. Additionally, if the LLM reports "no changes" but the text actually changed, the original transcript is restored.

---

## Recommended Models (Apple M1 Pro, 32GB RAM)

| Model | Size | Speed | Best for |
|---|---|---|---|
| `gemma4:e4b` | ~3GB | Fast | Best instruction following, default choice |
| `mistral:7b-instruct-q4_K_M` | 4.4GB | Medium | Strong alternative, good accuracy |
| `gemma3:4b` | 3.3GB | Fast | Comparison against Gemma 4 |
| `phi4-mini:3.8b` | 2.5GB | Fastest | Lowest latency, less reliable rule-following |

Switch between models using the dropdown in the Settings panel. The latency display shows how long each model takes so you can compare directly.

---

## Troubleshooting

**"Ollama not running" in the health badge**
Start Ollama: `ollama serve`

**"Web Speech API not supported"**
Switch to Chrome or Edge. Firefox does not support `SpeechRecognition`.

**Microphone permission denied**
Click the lock icon in your browser's address bar → Site settings → Microphone → Allow, then refresh.

**No speech detected after recording**
The Web Speech API requires an internet connection — it sends audio to Google's servers. Check your connection.

**LLM changes words it shouldn't**
Try switching to `gemma4:e4b` or `mistral:7b-instruct-q4_K_M` in the Settings panel. Larger, instruction-tuned models follow the "do not change" rules more reliably.

**High latency**
Use a smaller model (`phi4-mini:3.8b`) or lower the confidence threshold to skip the LLM on high-confidence ASR results.

---

## Roadmap

- **Phase 2 — Whisper integration:** Replace or augment the Web Speech API with a local Whisper model for higher accuracy and offline support
- **Phase 3 — Domain vocabulary:** Solve the Pokémon / proper noun problem with vocabulary hint lists and phonetic similarity matching
- **Phase 4 — Evaluation suite:** Automated WER benchmarking across a test phrase library, with results displayed in the UI

See [SPEC.md](./SPEC.md) for the full specification.

---

## License

MIT
