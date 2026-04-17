import type { VocabResult } from '../../types.js';

const POKEAPI_BASE = 'https://pokeapi.co/api/v2';

// How long to keep the cached data before fetching again (24 hours)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface Cache {
  words:     string[];
  fetchedAt: number;
}

let cache: Cache | null = null;

/**
 * Fetches a paginated PokeAPI endpoint and returns all names.
 * PokeAPI returns results in pages of up to 1000 items.
 */
async function fetchNames(endpoint: string): Promise<string[]> {
  const response = await fetch(`${POKEAPI_BASE}/${endpoint}?limit=1000`);
  if (!response.ok) return [];

  const data = (await response.json()) as { results: { name: string }[] };

  // PokeAPI returns lowercase hyphenated names like "draco-meteor"
  // Convert to Title Case: "draco-meteor" → "Draco Meteor"
  return data.results.map(item =>
    item.name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

export async function getVocab(): Promise<VocabResult> {
  const now = Date.now();

  // Return cached data if it's still fresh
  if (cache && (now - cache.fetchedAt) < CACHE_TTL_MS) {
    return { words: cache.words, source: 'pokeapi' };
  }

  console.log('Fetching vocabulary from PokeAPI...');

  // Fetch Pokémon names, move names, and item names in parallel
  const [pokemon, moves, items] = await Promise.all([
    fetchNames('pokemon'),
    fetchNames('move'),
    fetchNames('item'),
  ]);

  // Combine and deduplicate
  const words = [...new Set([...pokemon, ...moves, ...items])];

  cache = { words, fetchedAt: now };
  console.log(`PokeAPI vocab loaded: ${words.length} terms`);

  return { words, source: 'pokeapi' };
}
