import { ChromaClient, Collection } from 'chromadb';
import type { VocabResult } from '../../types.js';

const COLLECTION_NAME = 'pokemon-vocab';
const OLLAMA_BASE     = 'http://localhost:11434';
const EMBED_MODEL     = 'nomic-embed-text';
const TOP_K           = 8; // how many similar words to return per query

let collection: Collection | null = null;
let client: ChromaClient | null = null;

/**
 * Calls Ollama's embedding endpoint to convert text into a vector.
 * An embedding is a list of numbers that represents the semantic
 * and phonetic meaning of the text in mathematical space.
 */
async function embed(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_BASE}/api/embed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: EMBED_MODEL, input: text }),
  });

  const data = (await response.json()) as { embeddings: number[][] };
  return data.embeddings[0];
}

/**
 * Returns the ChromaDB collection, creating and populating it if it
 * doesn't exist yet. ChromaDB persists data to disk so this only
 * runs once — subsequent startups reuse the existing collection.
 */
async function getCollection(): Promise<Collection> {
  if (collection) return collection;

  client = new ChromaClient();

  // Check if the collection already exists on disk
  try {
    // getCollection throws if it doesn't exist — use that as our existence check
    collection = await client.getCollection({ name: COLLECTION_NAME });
    const count = await collection.count();
    console.log(`RAG: loaded existing collection (${count} items)`);
  } catch {
    console.log('RAG: building vector index for the first time...');
    collection = await client.createCollection({ name: COLLECTION_NAME });
    await populateCollection(collection);
  }

  return collection;
}

/**
 * Fetches Pokémon names from PokeAPI, embeds each one, and stores
 * them in ChromaDB. This is a one-time operation that takes ~2 minutes.
 */
async function populateCollection(col: Collection): Promise<void> {
  // Fetch a smaller set for now — just Pokémon names (not moves/items)
  const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=300');
  const data     = (await response.json()) as { results: { name: string }[] };

  const words = data.results.map(p =>
    p.name
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );

  console.log(`RAG: embedding ${words.length} Pokémon names...`);

  // Embed in batches of 10 to avoid overwhelming Ollama
  const batchSize = 10;
  for (let i = 0; i < words.length; i += batchSize) {
    const batch      = words.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map(w => embed(w)));

    await col.add({
      ids:        batch.map((_, j) => `pokemon-${i + j}`),
      embeddings: embeddings,
      documents:  batch,
    });

    process.stdout.write(`\r  ${i + batchSize}/${words.length}`);
  }

  console.log('\nRAG: index built successfully');
}

/**
 * Given a transcript, finds the most phonetically/semantically similar
 * vocabulary words in the vector database.
 */
export async function getVocab(transcript: string): Promise<VocabResult> {
  try {
    const col            = await getCollection();
    const queryEmbedding = await embed(transcript);

    const results = await col.query({
      queryEmbeddings: [queryEmbedding],
      nResults:        TOP_K,
    });

    const words = (results.documents[0] ?? []).filter(Boolean) as string[];
    return { words, source: 'rag' };

  } catch (err) {
    console.error('RAG error:', err);
    return { words: [], source: 'rag' };
  }
}
