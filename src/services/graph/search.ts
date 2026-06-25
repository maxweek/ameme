import { GraphClient } from './client';
import { EmbeddingService } from '../embeddings';
import type { GraphSearchResult } from './types';
import { cosineSimilarity } from './_utils';

interface CandidateItem {
  uuid: string;
  content: string;
  name: string;
  type: 'node' | 'edge';
  validAt?: string | null;
  invalidAt?: string | null;
}

/**
 * Candidate retrieval: cosine + keyword + traversal.
 * Возвращает кандидатов БЕЗ reranking — rerank делается в primitives/search.ts
 */
export async function graphSearch(
  query: string,
  groupId: string,
  limit = 10,
  centerNodeUuid?: string,
): Promise<GraphSearchResult[]> {
  const queryEmbedding = await EmbeddingService.embedQuery(query);

  const [cosineResults, keywordResults, traversalResults] = await Promise.allSettled([
    cosineSearch(queryEmbedding, groupId, limit * 2),
    keywordSearch(query, groupId, limit * 2),
    centerNodeUuid ? traversalSearch(centerNodeUuid, limit) : Promise.resolve([]),
  ]);

  // Dedup по uuid
  const candidateMap = new Map<string, CandidateItem>();

  for (const result of [cosineResults, keywordResults, traversalResults]) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      if (item.uuid && item.content && !candidateMap.has(item.uuid)) {
        candidateMap.set(item.uuid, item);
      }
    }
  }

  return Array.from(candidateMap.values())
    .slice(0, limit)
    .map(item => ({
      type: item.type,
      uuid: item.uuid,
      content: item.content,
      name: item.name,
      score: 0,
      validAt: item.validAt ?? null,
      invalidAt: item.invalidAt ?? null,
    }));
}

// ── Cosine search ───────────────────────────────────────

async function cosineSearch(
  queryEmbedding: number[],
  groupId: string,
  limit: number,
): Promise<CandidateItem[]> {
  const edgeResult = await GraphClient.roQuery(`
    MATCH (a)-[r]->(b)
    WHERE r.group_id = $groupId AND r.invalid_at IS NULL AND r.embedding IS NOT NULL
    RETURN r, type(r) AS relType
  `, { groupId } as Record<string, any>);

  const nodeResult = await GraphClient.roQuery(`
    MATCH (n {group_id: $groupId})
    WHERE n.embedding IS NOT NULL
    RETURN n
  `, { groupId } as Record<string, any>);

  const scored: Array<CandidateItem & { cosine: number }> = [];

  for (const row of (edgeResult.data ?? []) as any[]) {
    const r = row.r?.properties ?? row.r ?? {};
    const embedding = r.embedding as number[];
    if (!embedding?.length) continue;
    scored.push({
      uuid: r.uuid,
      content: r.fact,
      name: row.relType,
      type: 'edge',
      validAt: r.valid_at,
      cosine: cosineSimilarity(queryEmbedding, embedding),
    });
  }

  for (const row of (nodeResult.data ?? []) as any[]) {
    const n = row.n?.properties ?? row.n ?? {};
    const embedding = n.embedding as number[];
    if (!embedding?.length) continue;
    scored.push({
      uuid: n.uuid,
      content: n.summary,
      name: n.name,
      type: 'node',
      cosine: cosineSimilarity(queryEmbedding, embedding),
    });
  }

  return scored
    .sort((a, b) => b.cosine - a.cosine)
    .slice(0, limit);
}

// ── Keyword search ──────────────────────────────────────

async function keywordSearch(
  query: string,
  groupId: string,
  limit: number,
): Promise<CandidateItem[]> {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return [];

  const items: CandidateItem[] = [];

  const edgeResult = await GraphClient.roQuery(`
    MATCH (a)-[r]->(b)
    WHERE r.group_id = $groupId AND r.invalid_at IS NULL
    RETURN r, type(r) AS relType
  `, { groupId } as Record<string, any>);

  for (const row of (edgeResult.data ?? []) as any[]) {
    const r = row.r?.properties ?? row.r ?? {};
    const text = ((r.fact ?? '') + ' ' + (row.relType ?? '')).toLowerCase();
    if (words.some(w => text.includes(w))) {
      items.push({
        uuid: r.uuid,
        content: r.fact,
        name: row.relType,
        type: 'edge',
        validAt: r.valid_at,
      });
    }
  }

  const nodeResult = await GraphClient.roQuery(`
    MATCH (n {group_id: $groupId})
    RETURN n
  `, { groupId } as Record<string, any>);

  for (const row of (nodeResult.data ?? []) as any[]) {
    const n = row.n?.properties ?? row.n ?? {};
    const text = ((n.name ?? '') + ' ' + (n.summary ?? '')).toLowerCase();
    if (words.some(w => text.includes(w))) {
      items.push({
        uuid: n.uuid,
        content: n.summary,
        name: n.name,
        type: 'node',
      });
    }
  }

  return items.slice(0, limit);
}

// ── Graph traversal ─────────────────────────────────────

async function traversalSearch(
  centerUuid: string,
  limit: number,
): Promise<CandidateItem[]> {
  const edges = await GraphClient.getNeighbours(centerUuid, 2);
  return edges.slice(0, limit).map(e => ({
    uuid: e.uuid,
    content: e.fact,
    name: e.name,
    type: 'edge' as const,
    validAt: e.validAt,
  }));
}
