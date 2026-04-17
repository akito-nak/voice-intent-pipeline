import { readFile } from 'fs/promises';
import { join } from 'path';
import type { VocabResult } from '../../types.js';

// Path to the JSON file relative to the project root
const VOCAB_FILE = join(process.cwd(), 'data/vocab.json');

// Cache the words in memory after first load so we don't hit the
// filesystem on every request
let cachedWords: string[] | null = null;

export async function getVocab(): Promise<VocabResult> {
  if (!cachedWords) {
    const raw  = await readFile(VOCAB_FILE, 'utf-8');
    const data = JSON.parse(raw) as { words: string[] };
    cachedWords = data.words;
  }

  return { words: cachedWords, source: 'static' };
}
