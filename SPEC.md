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

Voice-to-text pipelines — whether using the browser's native Web Speech API or cloud-based ASR — sometimes produce transcriptions that differ from what the user actually said. This problem has two forms:

| Problem | Example |
|---|---|
| **Phonetic substitution** | User says "set a timer for three minutes" → transcribed as "set a timer for free minutes" |
| **Domain hallucination** | User says "Feraligatr" → transcribed as "feral gator" |

The Web Speech API is particularly prone to these errors because it uses a general-purpose language model with no domain context. The result is that voice prompts become unreliable in production apps.

This project builds a layered pipeline to solve both problems and documents every layer so engineers can understand *why* each one exists.

---

## 2. Goals & Non-Goals

### Goals

- **Learn** how browser Voice APIs, ASR, TTS, and local LLMs interact
- **Solve** the ASR accuracy/hallucination problem for standard English and domain vocabulary
- **Explore** intent extraction on top of raw transcription
- **Document** each pipeline layer and the reasoning behind every design decision
- **Run entirely locally** — no cloud API keys, no latency from remote services
- **Be a public reference repo** for engineers facing the same problems

### Non-Goals

- This is not a production application
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

The UI makes the relationship between text and voice explicit, showing the raw transcription and the corrected intent as separate stages.

### How should the user trigger voice input?

**Tap to start, tap to stop.** This is the standard pattern for longer-form voice input (used by Siri, voice messages, Google Assistant).

| Approach | Pros | Cons |
|---|---|---|
| **Hold to record** | Feels immediate, like a walkie-talkie | Fatigue on long prompts, accidental cutoffs, bad mobile UX |
| **Tap start / tap stop** ✓ | Natural for sentences, no fatigue, clear visual state | Requires deliberate stop action |

The record button has three visual states: **idle**, **recording** (pulsing red), and **processing**.

---

## 4. How the Voice Pipeline Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VOICE PIPELINE                             │
│                                                                     │
│  Microphone                                                         │
│      │                                                              │
│      ▼                                                              │
│  ┌─────────────────────────────┐                                   │
│  │  Layer 1: Audio Capture     │  MediaRecorder API (browser)      │
│  │  getUserMedia()             │  Raw PCM/WebM audio blob          │
│  └──────────────┬──────────────┘                                   │
│                 │                                                    │
│                 ▼                                                    │
│  ┌─────────────────────────────┐                                   │
│  │  Layer 2: ASR               │  Web Speech API  → fast, cloud    │
│  │                             │  OR Whisper      → slower, local  │
│  │                             │  → raw transcript + confidence    │
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
│  │  Layer 3.5: Vocab Hints     │  Fetch domain words from          │
│  │                             │  Static / PokeAPI / RAG phonetic  │
│  │                             │  → inject into LLM prompt         │
│  └──────────────┬──────────────┘                                   │
│                 │                                                    │
│                 ▼                                                    │
│  ┌─────────────────────────────┐                                   │
│  │  Layer 4: LLM Correction    │  Ollama (local LLM)               │
│  │                             │  Fixes errors, extracts intent    │
│  └──────────────┬──────────────┘                                   │
│                 │                                                    │
│                 ▼                                                    │
│  ┌─────────────────────────────┐                                   │
│  │  Layer 5: Intent Output     │  Structured JSON:                 │
│  │                             │  corrected, intent, changes,      │
│  │                             │  confidence, vocabHints           │
│  └─────────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Layer Breakdown

#### Layer 1 — Audio Capture (`MediaRecorder API`)

The browser provides `getUserMedia()` to access the microphone and `MediaRecorder` to record audio chunks. This layer produces raw audio (WebM/Opus by default in Chrome) and is completely separate from speech recognition.

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream);
const chunks = [];
recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  // blob is now ready to send to Whisper or play back
};
```

**Key insight:** `MediaRecorder` and `SpeechRecognition` are two completely separate browser APIs. You run both in parallel — one captures raw audio for Whisper, the other transcribes in real-time via Google's servers.

#### Layer 2 — ASR (Automatic Speech Recognition)

**Option A: Web Speech API (`SpeechRecognition`)**
- Built into Chrome and Edge — no install required
- Sends audio to Google's servers under the hood (not actually local)
- Fast (~200–500ms), good for general English
- Provides a `confidence` score per result
- Fails on domain vocabulary (Pokémon names, uncommon proper nouns)

```js
const recognition = new webkitSpeechRecognition();
recognition.continuous = false;
recognition.interimResults = true;
recognition.lang = 'en-US';
recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  const confidence = event.results[0][0].confidence;
};
```

**Option B: Whisper (`whisper.cpp`)**
- Open-source model from OpenAI, runs entirely locally via Metal on M1
- More accurate on domain vocabulary and proper nouns
- ~5 seconds slower than Web Speech API due to cold-start cost (model loaded from disk each call)
- Audio must be converted from WebM to WAV 16kHz mono before processing

**The cold-start problem with Whisper:** Every request spawns a new `whisper-cli` process which reads the model weights from disk. The model load time (~3–4s) dominates the total latency. The actual inference on a short phrase is fast once the model is loaded. The fix is a warm server mode — keep the process alive between requests.

#### Layer 3 — Confidence Filter

ASR results include a confidence score (0.0–1.0). Before sending to the LLM:
- If `confidence >= threshold` → proceed
- If `confidence < threshold` → display a warning and offer the user a chance to re-record

This prevents the LLM from wasting time trying to correct deeply garbled audio. The threshold is configurable in the UI — users with accents or in noisy environments may need a lower threshold.

**Important:** Whisper does not provide a per-utterance confidence score. When Whisper is selected, the app sets confidence to `1.0` and bypasses the threshold check.

#### Layer 3.5 — Vocabulary Hints

This layer is the solution to domain hallucination. Before sending to the LLM, the app fetches words from a domain vocabulary source and injects them into the prompt as hints:

```
Known vocabulary for this domain. The transcript may contain phonetic
approximations of these words — including cases where multiple transcript
words collapse into a single vocabulary word (e.g. "pick a chew" → "Pikachu"):
Draco Meteor, Feraligatr

Input transcript: "I want to use feral gator and draco meteor"
```

See [Section 7](#7-the-accuracy-layers) for full detail on the three vocab sources.

#### Layer 4 — LLM Intent Correction

The LLM receives the transcript (plus any vocab hints) and:
1. Fixes transcription errors caused by phonetic substitution
2. Infers intent — what the user actually meant to do
3. Returns structured JSON

**Why a local LLM?**
- Free to run, no API keys
- Runs on M1 Pro via Ollama
- Small models (3B–7B params) are fast enough for interactive use
- User data stays on-device

**Prompt design matters enormously.** The system prompt includes:
- A strict rule list ("ONLY fix phonetic errors", "do NOT change proper nouns")
- Few-shot examples covering each class of error
- The structured JSON output format

The LLM's self-reported confidence is not always reliable — see the WER safety check in Section 7.

#### Layer 5 — Intent Output

The final output shown to the user is a structured breakdown of every stage, making the pipeline fully transparent. TTS speaks the detected intent back as confirmation.

---

### TTS (Text-to-Speech)

TTS is the reverse pipeline: text → audio. Used for:
1. **Confirmation** — speak back the corrected intent so the user can verify it
2. **Error feedback** — audio cue when the pipeline fails

```js
const utterance = new SpeechSynthesisUtterance("Use Feraligatr with Draco Meteor");
utterance.lang = 'en-US';
window.speechSynthesis.speak(utterance);
```

**Gotcha:** `speechSynthesis.getVoices()` returns an empty array until the browser has loaded its voice list. You need to listen for the `voiceschanged` event before selecting a voice.

---

## 5. Architecture

```
┌────────────────────────────────────────────────────┐
│                   Browser (Frontend)               │
│                                                    │
│  MediaRecorder ─────────────────────────────────┐  │
│  (raw audio blob)                               │  │
│                                                 │  │
│  Web Speech API ────────────────────────────┐   │  │
│  (transcript + confidence)                  │   │  │
│                                             ▼   ▼  │
│                                      main.ts router│
│                                             │      │
│                                  ASR mode? │      │
│                              Web Speech ───┘      │
│                              Whisper ─────────────┼─→ POST /api/whisper
│                                             │      │
│                                             ▼      │
│                                   POST /api/correct│
└─────────────────────────────────────────────────── ┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│                 Node.js Backend                    │
│                                                    │
│  POST /api/correct                                 │
│    → vocab/index.ts  (fetch + filter hints)        │
│    → prompts.ts      (build prompt with hints)     │
│    → ollama.ts       (call Ollama, WER check)      │
│                                                    │
│  POST /api/whisper                                 │
│    → whisper.ts      (ffmpeg convert, whisper-cli) │
│                                                    │
│  GET  /api/health   → check Ollama + list models   │
└────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
  Ollama (port 11434)      whisper-cli (subprocess)
  gemma4:e4b               ggml-base.en.bin
```

### Why a Backend?

The LLM call goes through a Node.js backend rather than directly from the browser for three reasons:

1. **CORS** — Ollama's server does not accept browser requests by default
2. **Prompt engineering** — system prompts live on the server, not in client-side JS
3. **Whisper** — spawning a subprocess and doing file I/O requires Node.js, not a browser

---

## 6. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Vanilla HTML + CSS + TypeScript | Nothing hidden, every line is visible |
| Build tool | Vite | Fast dev server, TypeScript out of the box, proxy support |
| Backend | Node.js + TypeScript + Express | Same language as frontend, simple REST API |
| ASR (primary) | Web Speech API | Zero install, built into Chrome/Edge |
| ASR (secondary) | whisper.cpp | Higher accuracy, fully local, M1 Metal via Metal |
| LLM | Ollama | Free, local, M1 Metal acceleration |
| Phonetic matching | `natural` (DoubleMetaphone) | Converts words to phonetic codes for similarity matching |
| TTS | Web Speech Synthesis API | Zero install, built into all browsers |
| Styling | Plain CSS with CSS variables | No dependencies |

### Recommended Ollama Models (M1 Pro 32GB)

| Model | Size | Speed | Best For |
|---|---|---|---|
| `gemma4:e4b` | ~3GB | Fast | Best instruction following, default |
| `mistral:7b-instruct-q4_K_M` | 4.4GB | Medium | Strong alternative |
| `phi4-mini:3.8b` | 2.5GB | Fastest | Low latency, less reliable on rules |

**Observed behaviour:** `phi4-mini` frequently ignores the "do not change proper nouns" instruction and produces hallucinated intent descriptions. `gemma4:e4b` and `mistral:7b` follow the rules reliably. Use small models for speed experiments, not for production-like accuracy.

---

## 7. The Accuracy Layers

### Why ASR Hallucinates

The Web Speech API uses a general acoustic model trained on broad English. When it encounters a phoneme sequence it cannot confidently resolve, it substitutes the statistically most likely word — not the correct one. This is not random noise — it is systematic bias toward common words.

| What user said | What ASR heard | Why |
|---|---|---|
| "three" | "free" | Phonetically similar in some accents |
| "write code" | "right code" | Homophones |
| "neural net" | "new URL net" | Partial phonetic match |
| "Feraligatr" | "feral gator" | Unknown proper noun split into common words |
| "Pikachu" | "pick a chew" | Each syllable matched to nearest English word |

### How the LLM Corrects This

The LLM has two advantages over raw ASR:
1. **Context** — "free minutes" in a timer context almost certainly means "three minutes"
2. **Instruction following** — it can be given explicit rules like "do not change proper nouns"

#### The overcorrection problem

LLMs can overcorrect — changing words that were correct to begin with. Observed example during development: "corn muffin" was corrected to "carnation muffin". The LLM saw an unusual phrase and substituted something more familiar.

The fix is a **Word Error Rate (WER) safety check** on every response:

```
WER = number of words changed ÷ total words in original transcript
```

If the LLM changed more than 40% of the words, its confidence score is capped at 50% — signalling to the UI that the correction is uncertain.

**Important caveat:** The WER cap is skipped when vocabulary hints are provided. Domain corrections (e.g. "feral gator" → "Feraligatr") legitimately change word count and position, which would incorrectly trip the WER threshold.

#### The "silent change" problem

A subtler bug: the LLM sometimes modifies the transcript but reports an empty `changes` array ("no changes made"). The backend includes a safety check: if `changes` is empty but `corrected !== transcript`, the original transcript is restored. Never trust the LLM's self-report — verify it.

### Vocabulary Hint System

The vocab system solves domain hallucination by fetching relevant domain words before the LLM call and injecting them into the prompt. Three sources are available.

#### Source 1: Static

Reads a curated word list from `backend/data/vocab.json`. Useful when you know exactly what domain vocabulary your users will say.

#### Source 2: PokeAPI

Fetches all Pokémon names, move names, and item names from the public PokeAPI (cached in memory for 24 hours). Before injecting hints into the prompt, the list is filtered down to only the words that are plausibly relevant to the transcript — otherwise you would be sending thousands of names to the LLM.

**The filtering algorithm (two-pass word claiming):**

A naive substring filter ("keep any vocab word that appears in the transcript") produces too much noise. For example, searching for "draco meteor" in the transcript causes both "Draco Meteor" (correct) and "Meteorite", "Dracozolt", "Dracovish" (noise) to match.

The solution uses two passes:

**Pass 1 — Multi-word terms:**
A multi-word vocab term (e.g. "Draco Meteor") only matches if ALL of its component words are present in the transcript as exact word matches. This prevents "Meteor Mash" from matching just because "meteor" is in the transcript.

When a multi-word term matches, its component words are marked as **claimed** — they can no longer be used to match single-word terms.

**Pass 2 — Single-word terms:**
A single-word vocab term (e.g. "Feraligatr") matches if unclaimed transcript words have sufficient combined character coverage of the vocab word (≥45%). For example, "feral"(5 chars) alone covers 50% of "feraligatr"(10 chars) — enough to include it. But "draco"(5 chars) cannot match "Dracozolt"(9 chars) because "draco" was already claimed by "Draco Meteor".

```typescript
// Pass 1: multi-word matching + claiming
const claimedWords = new Set<string>();
for (const word of words) {
  const parts = word.toLowerCase().split(' ');
  if (parts.length < 2) continue;
  const allPartsMatch = parts.every(p => transcriptWords.some(tw => p === tw));
  if (allPartsMatch) {
    parts.forEach(p => {
      const matched = transcriptWords.find(tw => p === tw);
      if (matched) claimedWords.add(matched);
    });
  }
}

// Pass 2: single-word matching using only unclaimed transcript words
const unclaimedWords = transcriptWords.filter(tw => !claimedWords.has(tw));
for (const word of words) {
  if (word.includes(' ')) continue;
  const matching = unclaimedWords.filter(tw => word.toLowerCase().includes(tw));
  const coverage = matching.reduce((n, tw) => n + tw.length, 0) / word.length;
  if (coverage >= 0.45) { /* include this word */ }
}
```

#### Source 3: RAG (Phonetic)

RAG stands for Retrieval-Augmented Generation — retrieving relevant context before generation. The "retrieval" here is phonetic rather than semantic.

**Why semantic embeddings don't work for this problem:**
The original RAG implementation used ChromaDB with `nomic-embed-text` embeddings. The idea was that the vector for "feral gator" would be close to the vector for "Feraligatr". It isn't. Embedding models capture *meaning*, not *sound*. "Feral gator" (a wild alligator) and "Feraligatr" (a Pokémon) are semantically unrelated. The query returned completely wrong results.

**The right tool: phonetic encoding**

[Double Metaphone](https://en.wikipedia.org/wiki/Metaphone#Double_Metaphone) is an algorithm that converts a word to a phonetic fingerprint — a string that represents how the word sounds, ignoring spelling. Words that sound similar produce the same or similar codes.

Examples:
| Word | Double Metaphone code |
|---|---|
| "pick" | PK |
| "Pikachu" (first syllable) | PK |
| "chew" | X (CH sound) |
| "Pikachu" (full) | PKX |

The RAG index works like this:

1. **Build phase:** fetch all Pokémon names, compute Double Metaphone code for each component word, store as `{ code → [vocabWords] }` in memory
2. **Query phase:** for each word in the transcript, compute its code, then find vocab entries where one code is a prefix of the other

The prefix check (`entry.code.startsWith(twCode) || twCode.startsWith(entry.code)`) handles the case where a transcript word is a partial phonetic match — "pick" (PK) is a prefix of "pikachu"'s code (PKX).

**What RAG catches that PokeAPI substring matching misses:**
- "pick a chew" → Pikachu (ASR replaces syllables with similar English words)
- "bulk a saw" → Bulbasaur (no substring overlap with the transcript words)

**What it still misses:** Cases where ASR produces a phonetically distant substitution, or where the Metaphone algorithm itself produces a bad encoding for a Japanese-origin name.

### Prompt Engineering for Vocab Corrections

When hints are provided, the LLM needs a specific instruction to handle multi-word → single-word corrections. Without it, the LLM treats each word independently and may apply standard English corrections instead of recognising a phonetic split.

The key addition to `buildCorrectionPrompt`:

```
Known vocabulary for this domain. The transcript may contain phonetic
approximations of these words — including cases where multiple transcript
words collapse into a single vocabulary word (e.g. "pick a chew" → "Pikachu")
```

And the few-shot example that demonstrated the pattern:

```json
Input (with hints: Pikachu, Raichu): "I want to catch pick a chew"
Output:
{
  "corrected": "I want to catch Pikachu",
  "changes": ["pick a chew → Pikachu"],
  "confidence": 0.92
}
```

Without this example, `gemma4:e4b` corrected "chew" to "choice" (standard English correction) and ignored the Pikachu hint entirely.

---

## 8. UI/UX Design

### Layout

```
┌─────────────────────────────────────────────────┐
│  Voice Prompt Explorer                          │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  Type or speak your prompt...           │   │ ← Textarea
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [ 🎙 Start Recording ]  [ ▶ Submit ] [Clear]  │
│                                                 │
│  ─────────────────────────────────────────────  │
│  Pipeline Stages                                │
│                                                 │
│  ① Raw Transcript     "feral gator"  conf: 95% │
│  ② Vocabulary Hints   Feraligatr, Draco Meteor  │
│  ③ Corrected Text     "Feraligatr"  changes: 1 │
│  ④ Intent             Use Feraligatr  conf: 98%│
│                                                 │
│  [ 🔊 Speak Intent ]                            │
│                                                 │
│  Settings                                       │
│  ASR: [Web Speech ▼]  Vocab: [PokeAPI ▼]       │
│  Model: [gemma4:e4b ▼]  Threshold: [0.75]      │
└─────────────────────────────────────────────────┘
```

### Recording Button States

| State | Appearance | Behavior |
|---|---|---|
| **Idle** | Neutral colour | Click to start recording |
| **Recording** | Pulsing red ring | Click to stop recording |
| **Processing** | Spinner, disabled | Waiting for ASR + LLM |
| **Error** | Red, error message | Click to retry |

### CSS Variable Palette

```css
:root {
  --bg:          #0f0f0f;
  --surface:     #1a1a1a;
  --border:      #2a2a2a;
  --text:        #e8e8e8;
  --text-muted:  #888;
  --accent:      #4f8ef7;
  --danger:      #e55353;
  --success:     #4caf7d;
}
```

---

## 9. API Design

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

**Error response:**
```json
{ "error": "Ollama not running", "code": "OLLAMA_UNAVAILABLE" }
```

---

### `POST /api/whisper`

**Request:** `multipart/form-data` with an `audio` field containing a WebM blob

**How it works internally:**
1. multer stores the blob in memory (no temp files at this stage)
2. ffmpeg converts the WebM to WAV (16kHz, mono) and writes to a temp file
3. `whisper-cli` is called as a subprocess on that temp file
4. The temp file is cleaned up in a `finally` block regardless of success or failure

**Response:**
```json
{
  "transcript": "I want to use Feraligatr and Draco Meteor",
  "latency_ms": 4230
}
```

---

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

## 10. Implementation Phases

### Phase 1 — Foundation ✅

**Goal:** Working voice pipeline with Web Speech API + LLM correction

- [x] Project scaffolding (Vite + TypeScript frontend, Express + TypeScript backend)
- [x] Microphone permission and `MediaRecorder` setup
- [x] Web Speech API integration (start/stop, interim results, confidence)
- [x] Record button with idle/recording/processing states
- [x] Text input as fallback and debug tool
- [x] `POST /api/correct` endpoint calling Ollama
- [x] Pipeline stages UI (raw → corrected → intent)
- [x] TTS playback of corrected intent
- [x] `GET /api/health` status check on startup
- [x] Model selector in settings panel
- [x] LLM overcorrection safety: WER check + silent-change detection
- [x] README with setup instructions

**Key learnings from Phase 1:**
- The LLM's self-reported confidence is not reliable — verify changes independently with WER
- Few-shot examples in the system prompt are critical — without them the LLM ignores your rules
- LLMs can overcorrect as readily as under-correct. A WER threshold catches gross overcorrections but won't catch subtle ones
- `gemma4:e4b` outperformed all other tested models on instruction following at comparable latency

---

### Phase 2 — Whisper Integration ✅

**Goal:** Compare Web Speech API vs Whisper accuracy on the same input

- [x] `whisper.cpp` running locally as a subprocess via `whisper-cli`
- [x] ffmpeg conversion from WebM (browser output) to WAV 16kHz mono (Whisper input)
- [x] `POST /api/whisper` endpoint with multer file handling
- [x] ASR toggle in UI (Web Speech vs Whisper)
- [x] Latency display

**Key learnings from Phase 2:**

**The audio format mismatch problem:** Browsers record audio as WebM/Opus by default. Whisper only accepts WAV. There is no native Node.js API to decode audio — you need ffmpeg as an external dependency. Always convert: `ffmpeg -i input.webm -ar 16000 -ac 1 output.wav`.

**Whisper cold-start latency:** Spawning a new `whisper-cli` process for every request means loading model weights from disk each time. This adds ~3–4 seconds of startup cost to every transcription. The actual inference is fast — the load time dominates. The proper solution is a warm server mode where `whisper-cpp`'s built-in HTTP server is kept running and requests are sent to it instead.

**Comparing the two ASR engines:**

| | Web Speech API | Whisper (base.en) |
|---|---|---|
| Latency | ~0.5s | ~5s (cold start) |
| General English | ✅ Excellent | ✅ Excellent |
| Domain vocabulary | ❌ Struggles | ✅ More reliable |
| Privacy | ❌ Sends to Google | ✅ Fully local |
| Offline | ❌ Requires internet | ✅ Works offline |
| Setup | Zero install | brew + model download |

**The `onFinal` timing issue:** `MediaRecorder` fires `onstop` and `SpeechRecognition` fires `onresult` asynchronously and independently. In Web Speech mode, the transcript arrives before the audio blob is ready. In Whisper mode, you need the audio blob but not the transcript. The solution: collect both, then route based on the selected ASR mode when the recording completes.

---

### Phase 3 — Domain Vocabulary ✅

**Goal:** Solve the Pokémon / proper noun problem through vocabulary hint injection

- [x] Vocab source abstraction: `VocabSource` type, `getVocab()` router, shared `VocabResult` shape
- [x] Static source — reads `backend/data/vocab.json`
- [x] PokeAPI source — fetches all names, 24hr in-memory cache, two-pass relevance filter
- [x] RAG source — Double Metaphone phonetic index, replaces ChromaDB semantic embeddings
- [x] Vocab hints injected into LLM prompt with multi-word collapse example
- [x] WER cap bypassed when vocab hints are provided
- [x] Vocabulary Hints stage added to pipeline UI

**Key learnings from Phase 3:**

**Semantic embeddings are the wrong tool for phonetic correction.** The original RAG implementation used ChromaDB with `nomic-embed-text`. The assumption was that the embedding for "feral gator" would be close to "Feraligatr" in vector space. It isn't. Embedding models encode *meaning*. "Feral gator" (a wild reptile) is semantically far from "Feraligatr" (a Pokémon). The correct tool is a phonetic encoding algorithm.

**Vocabulary filtering is harder than it looks.** The first naive filter ("include any vocab word that shares a substring with the transcript") produced noise: searching for "draco meteor" pulled in Meteorite, Dracozolt, Dracovish, Meteor Mash, Meteor Assault, and Meteor Beam. Each fix revealed a new edge case:
1. Multi-word terms needed all parts to match → fixed Meteor Mash
2. Single-word terms with large overlap (Dracozolt) still matched → solved by word claiming: words consumed by multi-word matches can't also match single-word terms
3. Threshold tuning — "feral" covers exactly 50% of "feraligatr", so the threshold had to be ≤50%

**The word claiming approach** is the key insight: instead of scoring every vocab word independently, run two passes — multi-word terms first, and any transcript word they consume cannot be reused to match single-word terms. This prevents "draco" (used by "Draco Meteor") from also pulling in "Dracozolt".

**Few-shot examples must cover every correction pattern.** The LLM had all the right hints but still failed to correct "pick a chew" → Pikachu until a few-shot example explicitly showed the multi-word → single-word collapse pattern. The model needed to *see* the pattern, not just read an instruction about it. Whenever you add a new correction type, add a corresponding example.

---

### Phase 4 — Evaluation Suite *(planned)*

**Goal:** Quantify accuracy improvements across layers and vocab sources

- [ ] Test phrase library covering standard English and domain vocabulary
- [ ] Automated WER scoring: run each phrase through every layer combination
- [ ] Results table in UI: accuracy per layer × phrase × model
- [ ] Export as JSON/CSV

---

## 11. Latency Budget

**Observed latencies (M1 Pro, 32GB RAM):**

| Stage | Web Speech path | Whisper path |
|---|---|---|
| ASR | ~500ms | ~5000ms (cold start) |
| Vocab hints (PokeAPI, cached) | ~10ms | ~10ms |
| Vocab hints (RAG, index built) | ~5ms | ~5ms |
| LLM correction (gemma4:e4b) | ~8–13s | ~8–13s |
| **Total** | **~9–14s** | **~13–18s** |

The dominant cost is the LLM, not ASR. The difference between Web Speech API and Whisper (~5s) is large relative to the total because the LLM is slow enough to dominate regardless. A faster LLM (or streamed output) would make the ASR choice more noticeable.

### Optimisations (not yet implemented)

- **Whisper warm server:** Keep `whisper-cpp`'s built-in HTTP server running to eliminate the model load cost
- **Streaming LLM output:** Display tokens as they arrive — eliminates perceived wait even if total latency is the same
- **Abort stale requests:** If the user re-records before the LLM responds, cancel the in-flight request

---

## 12. Testing Strategy

### Manual Testing Checklist

- [ ] Speak a clear sentence — verify transcript is accurate
- [ ] Speak with a deliberate error ("free minutes") — verify LLM corrects it
- [ ] Speak a Pokémon name with PokeAPI enabled — verify correction
- [ ] Speak a syllable-split Pokémon name ("pick a chew") with RAG — verify phonetic match
- [ ] Deny microphone permission — verify graceful error
- [ ] Stop Ollama — verify backend returns clear error, UI shows message
- [ ] Toggle between Web Speech and Whisper — verify both paths work
- [ ] Type in text box — verify same LLM pipeline fires

### Benchmark Phrases

| Phrase | ASR error | Vocab source needed |
|---|---|---|
| "set a timer for three minutes" | "free minutes" | None |
| "remind me to take my medication" | "medic asian" | None |
| "the neural network needs training" | "new URL network" | None |
| "I want to use Feraligatr" | "feral gator" | PokeAPI |
| "use Draco Meteor" | "draco meteor" (lowercase) | PokeAPI |
| "I choose Pikachu" | "pick a chew" | RAG |

---

## 13. Repository Structure

```
vocal-intent-pipeline/
├── SPEC.md                       ← This document
├── README.md                     ← Setup and run instructions
├── package.json                  ← Workspace root
│
├── frontend/
│   ├── index.html                ← Page structure, all element IDs
│   ├── vite.config.ts            ← Vite config + dev proxy to backend
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts               ← Entry point, wires all modules, ASR routing
│       ├── voice.ts              ← MediaRecorder + Web Speech API
│       ├── api.ts                ← fetch calls to Express backend
│       ├── tts.ts                ← Speech Synthesis wrapper
│       ├── ui.ts                 ← All DOM reads and writes
│       └── style.css             ← Dark theme, CSS variables, animations
│
└── backend/
    ├── package.json
    ├── tsconfig.json             ← module: Node16 (required for .js extensions in imports)
    ├── data/
    │   └── vocab.json            ← Static vocabulary word list
    └── src/
        ├── server.ts             ← Express entry point, middleware
        ├── types.ts              ← Shared TypeScript interfaces
        ├── routes/
        │   ├── correct.ts        ← POST /api/correct
        │   ├── whisper.ts        ← POST /api/whisper (multer + subprocess)
        │   └── health.ts         ← GET /api/health
        └── services/
            ├── ollama.ts         ← Ollama client, WER safety check
            ├── prompts.ts        ← System prompt + few-shot examples
            ├── whisper.ts        ← ffmpeg conversion + whisper-cli subprocess
            └── vocab/
                ├── index.ts      ← Router + two-pass filterRelevantWords
                ├── none.ts       ← Returns empty VocabResult
                ├── static.ts     ← Reads vocab.json with in-memory cache
                ├── pokeapi.ts    ← PokeAPI client, 24hr TTL cache
                └── rag.ts        ← Double Metaphone phonetic index
```

---

## 14. Future Phases

| Phase | Description |
|---|---|
| **Phase 4 — Evaluation suite** | Test phrase library with automated WER benchmarking per layer, per model, per vocab source |
| **Whisper warm server** | Keep whisper-cpp running as a persistent HTTP server to eliminate cold-start latency |
| **Streaming LLM output** | Stream tokens to the UI as they are generated to eliminate perceived wait |
| **Context memory** | Feed previous turns to the LLM so it can resolve pronouns ("do that again") |
| **Whisper fine-tuning** | Fine-tune Whisper on domain vocabulary for better accuracy on proper nouns |
| **Offline mode** | Full offline operation — Whisper + Ollama with no network calls at all |

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
| **WER** | Word Error Rate — the percentage of words that differ between two strings |
| **Phonetic substitution** | ASR error where a word is replaced by a similar-sounding word |
| **Domain hallucination** | ASR error where an unknown proper noun is replaced by familiar words |
| **Few-shot prompting** | Giving an LLM examples of the desired input/output pattern in the prompt itself |
| **Double Metaphone** | A phonetic encoding algorithm that maps words to codes representing how they sound |
| **RAG** | Retrieval-Augmented Generation — retrieving relevant context before generating a response |
| **Word claiming** | In the vocab filter: transcript words consumed by a multi-word match are excluded from single-word matching to prevent false positives |
| **Ollama** | A tool for running open-source LLMs locally via a simple REST API |
| **whisper.cpp** | A C++ port of OpenAI's Whisper that runs locally with Metal acceleration on Apple Silicon |
| **Web Speech API** | A browser-native API for speech recognition (`SpeechRecognition`) and synthesis (`SpeechSynthesis`) |
| **MediaRecorder** | A browser API for recording audio/video from `getUserMedia` streams |
| **LLM** | Large Language Model — a neural network trained to understand and generate text |
| **Cold start** | The overhead of loading a model from disk before the first inference request |

---

*This spec is a living document. Update it as each phase completes and new decisions are made.*
