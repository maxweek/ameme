import { graphSearch } from '../services/graph/search';
import { PgService } from '../services/postgres';
import { EmbeddingService } from '../services/embeddings';
import { RerankerService } from '../services/reranker';
import { CONFIG } from '../config';

export interface SearchResult {
  source: 'fact' | 'conversation';
  content: string;
  score: number;
  name?: string;
  timestamp?: string;
}

export async function search(
  query: string,
  limit = 8,
  maxAgeHours = 168,
): Promise<SearchResult[]> {
  const groupId = CONFIG.falkordb.database;

  // Stage 1: collect candidates from both sources
  const [graphResults, pgResults] = await Promise.allSettled([
    graphSearch(query, groupId, limit * 2),
    pgCosineSearch(query, limit * 2, maxAgeHours),
  ]);

  const candidates: SearchResult[] = [];

  if (graphResults.status === 'fulfilled') {
    for (const r of graphResults.value) {
      candidates.push({
        source: 'fact',
        content: r.content,
        score: 0,
        name: r.name,
        timestamp: r.validAt ?? undefined,
      });
    }
  }

  if (pgResults.status === 'fulfilled') {
    for (const r of pgResults.value) {
      candidates.push({
        source: 'conversation',
        content: `[${r.role}] ${r.content}`,
        score: 0,
        timestamp: r.createdAt.toISOString(),
      });
    }
  }

  if (candidates.length === 0) return [];

  // Stage 2: rerank ALL together
  const texts = candidates.map(c => c.content);
  const scores = await RerankerService.rerank(query, texts);

  for (let i = 0; i < candidates.length; i++) {
    candidates[i].score = scores[i] ?? 0;
  }

  // Dedup + filter + sort
  return dedup(candidates)
    .filter(r => r.score >= 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Postgres: fetch candidates only ─────────────────────

async function pgCosineSearch(query: string, limit: number, maxAgeHours: number) {
  const embedding = await EmbeddingService.embedQuery(query);
  return PgService.cosineSearch(embedding, limit, maxAgeHours);
}

// ── Dedup ────────────────────────────────────────────────

function dedup(results: SearchResult[]): SearchResult[] {
  const facts = results.filter(r => r.source === 'fact');
  const convs = results.filter(r => r.source === 'conversation');

  const kept = [...facts];

  for (const conv of convs) {
    const convWords = new Set(conv.content.toLowerCase().split(/\s+/));
    const isDup = facts.some(fact => {
      const factWords = fact.content.toLowerCase().split(/\s+/);
      const overlap = factWords.filter(w => convWords.has(w)).length;
      return overlap / factWords.length > 0.6;
    });
    if (!isDup) kept.push(conv);
  }

  return kept;
}
