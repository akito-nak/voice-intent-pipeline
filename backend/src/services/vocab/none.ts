import type { VocabResult } from '../../types.js';

export async function getVocab(): Promise<VocabResult> {
  return { words: [], source: 'none' };
}
