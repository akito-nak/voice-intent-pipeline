# Voice Prompt Explorer

A learning-first application for exploring browser Voice APIs, ASR accuracy, and LLM-powered intent correction. Built to understand and solve the hallucination problem in voice-to-text pipelines.

> **Goal:** Before integrating voice into a production AI application, understand *why* ASR makes mistakes and build a layered pipeline that catches and corrects them.

---

## The Problem

Voice-to-text pipelines frequently produce transcriptions that differ from what the user actually said. This happens in two ways:

| Problem | Example |
|---|---|
| **Phonetic substitution** | User says "three minutes" → ASR hears "free minutes" |
| **Domain hallucination** | User says "Feraligatr" → ASR hears "feral gator" |

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
                              OR Whisper (local) →  higher accuracy, ~5s more latency
    │
    ▼
Layer 3 — Confidence Filter   if score < threshold, warn the user before proceeding
    │
    ▼
Layer 3.5 — Vocabulary Hints  fetch domain words from Static / PokeAPI / RAG phonetic index
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
| ASR (primary) | Web Speech API (`SpeechRecognition`) | Built into Chrome/Edge, zero install |
| ASR (secondary) | whisper.cpp (local) | Fully private, higher accuracy on domain vocabulary |
| LLM | Ollama (local) | Free, runs on-device, no API keys, M1 Metal acceleration |
| TTS | Web Speech Synthesis API | Built into all browsers, zero install |
| Vocab (phonetic) | Double Metaphone via `natural` | Finds vocab words that sound like the ASR output |
| Styling | Plain CSS with CSS variables | No dependencies, responsive by default |

---

## Prerequisites

### 1. Node.js (v18 or higher)

```bash
node --version   # should print v18.x or higher
```

### 2. Ollama

```bash
brew install ollama
ollama --version
```

Or download from [ollama.com](https://ollama.com).

### 3. LLM models

```bash
# Recommended — best instruction following
ollama pull gemma4:e4b

# Alternatives
ollama pull mistral:7b-instruct-q4_K_M
ollama pull phi4-mini:3.8b
```

### 4. Embedding model (for RAG vocab source)

```bash
ollama pull nomic-embed-text
```

### 5. whisper.cpp (for Whisper ASR)

whisper.cpp is a C++ port of OpenAI's Whisper that runs natively on Apple Silicon via Metal.

```bash
brew install whisper-cpp
```

Then download the model weights:

```bash
# The install script bundled with whisper.cpp may not be on your PATH.
# Download the model directly from HuggingFace instead:
curl -L \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin \
  -o $(brew --prefix)/share/whisper.cpp/models/ggml-base.en.bin
```

Verify it works:

```bash
echo "test" | whisper-cli --model $(brew --prefix)/share/whisper.cpp/models/ggml-base.en.bin
```

### 6. ffmpeg (required for Whisper audio conversion)

The browser records audio as WebM/Opus. Whisper requires WAV (16kHz mono). ffmpeg handles the conversion automatically on each Whisper request.

```bash
brew install ffmpeg
ffmpeg -version
```

### 7. Chrome or Edge

The Web Speech API is only available in Chromium-based browsers. Firefox does not support it.

---

## Setup

```bash
git clone https://github.com/your-username/vocal-intent-pipeline.git
cd vocal-intent-pipeline
npm install
```

Start Ollama in a separate terminal:

```bash
ollama serve
```

---

## Running the App

```bash
npm run dev
```

This starts both the backend (Express, port 3001) and frontend (Vite, port 5173) together.

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

After submitting, four stages appear:

| Stage | What it shows |
|---|---|
| **Raw Transcript** | Exactly what the ASR engine heard, plus its confidence score |
| **Vocabulary Hints** | Domain words fetched from the selected vocab source, injected into the LLM prompt |
| **Corrected Text** | The LLM's corrected version, with a list of changes made |
| **Intent** | What the LLM determined you meant to accomplish |

Click **Speak Intent** to hear the detected intent via TTS.

### Settings

| Setting | Options | Notes |
|---|---|---|
| **ASR** | Web Speech API / Whisper | Whisper is ~5s slower but more accurate on proper nouns |
| **Vocabulary source** | None / Static / PokeAPI / RAG | See vocabulary section below |
| **LLM Model** | Any model installed in Ollama | Larger models follow correction rules more reliably |
| **Confidence threshold** | 0–1 slider | ASR results below this trigger a warning |

---

## Vocabulary Sources

The vocabulary system solves domain hallucination — ASR errors on words outside the general English vocabulary. Before sending a transcript to the LLM, the app fetches relevant domain words and injects them as hints into the prompt.

| Source | How it works | Best for |
|---|---|---|
| **None** | No hints — LLM uses general knowledge only | Standard English phrases |
| **Static** | Reads a curated word list from `backend/data/vocab.json` | Small, controlled domain vocabularies |
| **PokeAPI** | Fetches all Pokémon/move/item names from the public PokeAPI (cached 24h), then filters by substring match against the transcript | Multi-word splits like "feral gator" → Feraligatr |
| **RAG** | Builds a phonetic index using Double Metaphone, retrieves vocab words whose phonetic code matches transcript words | Pure phonetic errors like "pick a chew" → Pikachu |

### Why two different matching strategies?

- **Substring matching** (PokeAPI) catches cases where ASR splits a name into recognisable pieces — "feral" and "gator" are both substrings of "feraligatr"
- **Phonetic matching** (RAG) catches cases where ASR replaces syllables with similar-sounding English words — "pick" (PK) has the same Double Metaphone code as the start of "pikachu" (PKX)

Neither approach solves every case — they complement each other.

---

## Project Structure

```
vocal-intent-pipeline/
├── package.json                  ← workspace root
├── SPEC.md                       ← full specification + design decisions + learnings
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/
│   │   └── vocab.json            ← static vocabulary word list
│   └── src/
│       ├── server.ts             ← Express entry point
│       ├── types.ts              ← shared TypeScript interfaces
│       ├── routes/
│       │   ├── correct.ts        ← POST /api/correct
│       │   ├── whisper.ts        ← POST /api/whisper
│       │   └── health.ts         ← GET  /api/health
│       └── services/
│           ├── ollama.ts         ← Ollama REST client + WER safety check
│           ├── prompts.ts        ← LLM system prompt + few-shot examples
│           ├── whisper.ts        ← whisper-cli subprocess + ffmpeg conversion
│           └── vocab/
│               ├── index.ts      ← router + filterRelevantWords
│               ├── none.ts       ← returns empty result
│               ├── static.ts     ← reads vocab.json with in-memory cache
│               ├── pokeapi.ts    ← PokeAPI client with 24hr TTL cache
│               └── rag.ts        ← Double Metaphone phonetic index
│
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.ts               ← entry point, wires all modules
        ├── voice.ts              ← MediaRecorder + Web Speech API
        ├── api.ts                ← fetch calls to the Express backend
        ├── tts.ts                ← Web Speech Synthesis
        ├── ui.ts                 ← all DOM reads and writes
        └── style.css             ← dark theme, CSS variables, animations
```

---

## API Reference

### `POST /api/correct`

**Request:**
```json
{
  "transcript": "I want to use feral gator and draco meteor",
  "confidence": 0.95,
  "model": "gemma4:e4b",
  "vocabSource": "pokeapi"
}
```

**Response:**
```json
{
  "corrected": "I want to use Feraligatr and Draco Meteor",
  "intent": "Use Feraligatr with Draco Meteor",
  "changes": ["feral gator → Feraligatr", "draco meteor → Draco Meteor"],
  "confidence": 0.98,
  "latency_ms": 8551,
  "vocabHints": ["Draco Meteor", "Feraligatr"],
  "vocabSource": "pokeapi"
}
```

### `POST /api/whisper`

**Request:** `multipart/form-data` with an `audio` field containing a WebM blob

**Response:**
```json
{
  "transcript": "I want to use Feraligatr and Draco Meteor",
  "latency_ms": 4230
}
```

### `GET /api/health`

**Response:**
```json
{
  "ollama": true,
  "models": ["gemma4:e4b", "mistral:7b-instruct-q4_K_M"],
  "default_model": "gemma4:e4b"
}
```

---

## Recommended Models (Apple M1 Pro, 32GB RAM)

| Model | Size | Speed | Best for |
|---|---|---|---|
| `gemma4:e4b` | ~3GB | Fast | Best instruction following, default |
| `mistral:7b-instruct-q4_K_M` | 4.4GB | Medium | Strong alternative |
| `phi4-mini:3.8b` | 2.5GB | Fastest | Low latency, less reliable rule-following |

---

## Troubleshooting

**"Ollama not running"**
Run `ollama serve` in a separate terminal.

**"Web Speech API not supported"**
Switch to Chrome or Edge.

**Microphone permission denied**
Click the lock icon → Site settings → Microphone → Allow, then refresh.

**"No speech detected" with Whisper**
Make sure ffmpeg is installed (`brew install ffmpeg`). Whisper requires audio conversion from WebM to WAV before it can process audio.

**Whisper model not found**
Download the model manually:
```bash
curl -L \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin \
  -o $(brew --prefix)/share/whisper.cpp/models/ggml-base.en.bin
```

**LLM changes words it shouldn't**
Switch to `gemma4:e4b`. Smaller models follow the "do not change proper nouns" rule less reliably.

**PokeAPI returns no hints**
The PokeAPI cache is built on first use — it may take a few seconds. Check the backend terminal for `pokeapi: fetched N pokemon`.

**RAG phonetic index empty**
The RAG index builds on first use. Check backend logs for `RAG: phonetic index built`.

---

## Roadmap

- **Phase 4 — Evaluation suite:** Automated WER benchmarking across a test phrase library, comparing accuracy per layer and per vocab source
- **Streaming LLM output:** Display tokens as they arrive to eliminate the perceived wait
- **Whisper warm server:** Keep whisper-cpp running as a persistent process to eliminate the ~5s cold-start latency

See [SPEC.md](./SPEC.md) for the full specification and design learnings.

---

## License

MIT
