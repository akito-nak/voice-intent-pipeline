import natural from 'natural';
const dm = new natural.DoubleMetaphone();
import type { VocabResult } from '../../types.js';

const TOP_K = 8;

interface PhoneticEntry {
  code: string;
  word: string;
}

let index: PhoneticEntry[] | null = null;

function getCode(word: string): string {
  const [primary] = dm.process(word);
  return primary ?? '';
}

async function buildIndex(): Promise<PhoneticEntry[]> {
  console.log('RAG: building phonetic index...');
  const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=300');
  const data     = await response.json() as { results: { name: string }[] };

  const words = data.results.map(p =>
    p.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
  );

  const entries: PhoneticEntry[] = [];
  for (const word of words) {
    // Index each part of multi-word names separately so "Draco" and "Meteor"
    // in "Draco Meteor" can each be found by a transcript word
    const parts = word.split(' ');
    for (const part of parts) {
      const code = getCode(part);
      if (code) entries.push({ code, word });
    }
  }

  console.log(`RAG: phonetic index built (${words.length} names, ${entries.length} entries)`);
  return entries;
}

export async function getVocab(transcript: string): Promise<VocabResult> {
  if (!index) index = await buildIndex();

  const transcriptWords = transcript.split(/\s+/).filter(w => w.length > 2);
  const candidates      = new Set<string>();

  for (const tw of transcriptWords) {
    const twCode = getCode(tw);
    if (!twCode) continue;

    for (const entry of index) {
      // Match if either code is a prefix of the other:
      // "pick" (PK) vs "Pikachu" part (PKX) → PK is prefix of PKX ✓
      // "chew" (X)  vs "Pikachu" part (PKX) → X is suffix... won't match
      // That's fine — one matching part is enough to surface the full name
      if (entry.code.startsWith(twCode) || twCode.startsWith(entry.code)) {
        candidates.add(entry.word);
      }
    }
  }

  return {
    words: Array.from(candidates).slice(0, TOP_K),
    source: 'rag',
  };
}
