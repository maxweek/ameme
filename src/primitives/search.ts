import { PgService, type CosineSearchResult } from '../services/postgres';

import { GraphitiService, type GraphitiNode, type GraphitiFact } from '../services/graphiti';
import { EmbeddingService } from '../services/embeddings';

export interface SearchResult {
  source: 'fact' | 'conversation';
  content: string;
  score: number;
  timestamp?: string;
}

export async function search(query: string, limit = 8, maxAgeHours = 168): Promise<SearchResult[]> {
  const queryEmbedding = await EmbeddingService.embedQuery(query);

  // Fan-out: Graphiti + Postgres параллельно
  const [graphitiNodes, graphitiFacts, pgResults] = await Promise.allSettled([
    GraphitiService.searchNodes(query, limit),
    GraphitiService.searchFacts(query, limit),
    PgService.cosineSearch(queryEmbedding, limit, maxAgeHours),
  ]);

  const results: SearchResult[] = [];

  // Graphiti nodes (вес 1.0)
  if (graphitiNodes.status === 'fulfilled') {
    for (const node of graphitiNodes.value) {
      results.push({
        source: 'fact',
        content: `${node.name}: ${node.summary}`,
        score: 1.0,
      });
    }
  }

  // Graphiti facts (вес 0.95)
  if (graphitiFacts.status === 'fulfilled') {
    for (const fact of graphitiFacts.value) {
      results.push({
        source: 'fact',
        content: fact.fact,
        score: 0.95,
        timestamp: fact.validAt ?? undefined,
      });
    }
  }

  // Postgres conversations (вес по similarity * recency)
  if (pgResults.status === 'fulfilled') {
    for (const row of pgResults.value) {
      const ageHours = (Date.now() - row.createdAt.getTime()) / 3_600_000;
      const recencyBoost = Math.exp(-ageHours / 72);
      const score = row.similarity * 0.7 + recencyBoost * 0.3;

      results.push({
        source: 'conversation',
        content: `[${row.role}] ${row.content}`,
        score: score * 0.85, // conversations ниже фактов
        timestamp: row.createdAt.toISOString(),
      });
    }
  }

  // Dedup: если fact и conversation говорят о том же — оставить fact
  const deduped = dedup(results);

  // Sort + trim
  return deduped
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Простая dedup по пересечению слов */
function dedup(results: SearchResult[]): SearchResult[] {
  const facts = results.filter(r => r.source === 'fact');
  const convs = results.filter(r => r.source === 'conversation');

  const kept = [...facts];

  for (const conv of convs) {
    const convWords = new Set(conv.content.toLowerCase().split(/\s+/));
    const isDuplicate = facts.some(fact => {
      const factWords = fact.content.toLowerCase().split(/\s+/);
      const overlap = factWords.filter(w => convWords.has(w)).length;
      return overlap / factWords.length > 0.6;
    });
    if (!isDuplicate) kept.push(conv);
  }

  return kept;
}