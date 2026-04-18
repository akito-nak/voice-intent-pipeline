import type { VocabResult, VocabSource } from '../../types.js';
import { getVocab as getNone }     from './none.js';
import { getVocab as getStatic }   from './static.js';
import { getVocab as getPokeapi }  from './pokeapi.js';
import { getVocab as getRag }      from './rag.js';

/**
 * Routes to the correct vocabulary source based on the selected option.
 * All four sources return the same VocabResult shape — the caller
 * never needs to know which source was used.
 */
export async function getVocab(
  source: VocabSource,
  transcript: string
): Promise<VocabResult> {
  switch (source) {
    case 'none':    return getNone();
    case 'static':  return getStatic();
    case 'pokeapi': return getPokeapi();
    case 'rag':     return getRag(transcript);
    default:        return getNone();
  }
}

/**
 * Filters a vocabulary list down to words that are plausibly relevant
 * to the transcript. Used for large sources (PokeAPI) to avoid
 * injecting thousands of words into the LLM prompt.
 *
 * Strategy: keep a word if any of its parts appear as a substring
 * in the transcript (case-insensitive). This catches partial matches
 * like "Feral" matching "Feraligatr".
 */
export function filterRelevantWords(
  words: string[],
  transcript: string,
  maxWords = 8
): string[] {
  const transcriptWords = transcript
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4);

  if (transcriptWords.length === 0) return [];

  // ── Pass 1: multi-word terms ──────────────────────────────────────────────
  // ALL component words must have an exact transcript word match.
  // Words used by a matching multi-word term are "claimed" so they can't
  // inflate single-word scores (e.g. "meteor" claimed by "Draco Meteor"
  // must not also match "Meteorite").
  const claimedWords = new Set<string>();
  const multiWordResults: { word: string; score: number }[] = [];

  for (const word of words) {
    const wordLower  = word.toLowerCase();
    const vocabParts = wordLower.split(' ');
    if (vocabParts.length < 2) continue;

    const allPartsMatch = vocabParts.every(vp =>
      transcriptWords.some(tw => vp === tw)
    );
    if (allPartsMatch) {
      multiWordResults.push({ word, score: vocabParts.length });
      vocabParts.forEach(vp => {
        const matched = transcriptWords.find(tw => vp === tw);
        if (matched) claimedWords.add(matched);
      });
    }
  }

  // ── Pass 2: single-word terms ─────────────────────────────────────────────
  // Use only the transcript words NOT already claimed by a multi-word match.
  // This prevents "meteor" (claimed by "Draco Meteor") from also pulling in
  // "Meteorite". The combined length of unclaimed matches must cover ≥45%
  // of the vocab word, so "feral" alone (5/10 = 50%) still matches
  // "Feraligatr" even though "gator" isn't actually a substring of it.
  const unclaimedWords = transcriptWords.filter(tw => !claimedWords.has(tw));
  const singleWordResults: { word: string; score: number }[] = [];

  for (const word of words) {
    const wordLower  = word.toLowerCase();
    const vocabParts = wordLower.split(' ');
    if (vocabParts.length > 1) continue;

    const matchingWords = unclaimedWords.filter(tw => wordLower.includes(tw));
    const combinedLen   = matchingWords.reduce((sum, tw) => sum + tw.length, 0);
    if (combinedLen / wordLower.length >= 0.45) {
      singleWordResults.push({ word, score: matchingWords.length });
    }
  }

  // ── Combine, rank, cap ────────────────────────────────────────────────────
  return [...multiWordResults, ...singleWordResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxWords)
    .map(({ word }) => word);
}
