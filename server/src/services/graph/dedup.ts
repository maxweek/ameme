import { GraphClient } from './client';
import { EmbeddingService } from '../embeddings';
import type { GraphNode, ExtractedEntity } from './types';
import { cosineSimilarity } from './_utils';

export interface DedupResult {
  existing: GraphNode;
  similarity: number;
}

const DEDUP_THRESHOLD = 0.85;

export async function findDuplicate(
  entity: ExtractedEntity,
  groupId: string,
): Promise<DedupResult | null> {
  // 1. Exact name match
  const exact = await GraphClient.findNodeByName(entity.name, groupId);
  if (exact) return { existing: exact, similarity: 1.0 };

  // 2. Lowercase match
  const lowerResult = await GraphClient.roQuery(`
    MATCH (n {group_id: $groupId})
    WHERE toLower(n.name) = toLower($name)
    RETURN n
    LIMIT 1
  `, { groupId, name: entity.name } as Record<string, any>);

  if (lowerResult.data && lowerResult.data.length > 0) {
    return parseDedupResult(lowerResult.data[0], groupId, 0.95);
  }

  // 3. Prefix match: "Макс" ↔ "Максим", "JS" ↔ "JavaScript"
  const prefixResult = await GraphClient.roQuery(`
    MATCH (n {group_id: $groupId})
    WHERE toLower(n.name) STARTS WITH toLower($name)
       OR toLower($name) STARTS WITH toLower(n.name)
    RETURN n
    LIMIT 1
  `, { groupId, name: entity.name } as Record<string, any>);

  if (prefixResult.data && prefixResult.data.length > 0) {
    return parseDedupResult(prefixResult.data[0], groupId, 0.9);
  }

  // 4. Semantic: cosine by embedding among same type
  const candidates = await GraphClient.roQuery(`
    MATCH (n:${entity.type} {group_id: $groupId})
    WHERE n.embedding IS NOT NULL
    RETURN n
  `, { groupId } as Record<string, any>);

  if (!candidates.data || candidates.data.length === 0) return null;

  const queryEmbedding = await EmbeddingService.embedQuery(entity.name);
  let bestMatch: DedupResult | null = null;

  for (const row of candidates.data as any[]) {
    const n = row.n?.properties ?? row.n ?? {};
    const labels = row.n?.labels ?? [];
    const candidateEmbedding = n.embedding as number[] | null;
    if (!candidateEmbedding || candidateEmbedding.length === 0) continue;

    const similarity = cosineSimilarity(queryEmbedding, candidateEmbedding);
    if (similarity >= DEDUP_THRESHOLD && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = {
        existing: {
          uuid: n.uuid ?? '', name: n.name ?? '', type: labels[0] ?? entity.type,
          summary: n.summary ?? '', groupId: n.group_id ?? groupId, createdAt: n.created_at ?? '',
        },
        similarity,
      };
    }
  }

  return bestMatch;
}

function parseDedupResult(row: any, groupId: string, similarity: number): DedupResult {
  const n = row.n?.properties ?? row.n ?? {};
  const labels = row.n?.labels ?? [];
  return {
    existing: {
      uuid: n.uuid ?? '', name: n.name ?? '', type: labels[0] ?? 'Unknown',
      summary: n.summary ?? '', groupId: n.group_id ?? groupId, createdAt: n.created_at ?? '',
    },
    similarity,
  };
}