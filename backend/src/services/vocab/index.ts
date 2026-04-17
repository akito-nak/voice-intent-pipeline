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
  maxWords = 20
): string[] {
  const transcriptWords = transcript
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3); // ignore short words like "a", "to", "the"

  const scored = words
    .map(word => {
      const wordLower = word.toLowerCase();
      // Score: how many transcript words appear as substrings of this vocab word?
      // "feral" inside "feraligatr" → match
      // "draco" inside "draco meteor" → match
      const score = transcriptWords.filter(tw => wordLower.includes(tw)).length;
      return { word, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxWords)
    .map(({ word }) => word);

  return scored;
}
