import { GraphClient } from './client';
import type { GraphEdge, ExtractedRelation } from './types';

export interface TemporalResult {
  action: 'created' | 'updated' | 'duplicate';
  edgeUuid: string;
  invalidated: string[];
}

export async function writeEdgeWithTemporal(
  relation: ExtractedRelation,
  sourceUuid: string,
  targetUuid: string,
  groupId: string,
): Promise<TemporalResult> {
  const invalidated: string[] = [];

  // Find existing valid edges between these nodes (both directions)
  const existing = await GraphClient.findEdgesByNodes(sourceUuid, targetUuid, groupId);
  const reverse = await GraphClient.findEdgesByNodes(targetUuid, sourceUuid, groupId);
  const allExisting = [...existing, ...reverse];

  for (const edge of allExisting) {
    const conflict = detectConflict(edge, relation);

    if (conflict === 'duplicate') {
      return { action: 'duplicate', edgeUuid: edge.uuid, invalidated: [] };
    }

    if (conflict === 'supersedes') {
      await GraphClient.invalidateEdge(edge.uuid);
      invalidated.push(edge.uuid);
    }
  }

  const edgeUuid = await GraphClient.createEdge({
    sourceUuid,
    targetUuid,
    name: relation.name,
    fact: relation.fact,
    groupId,
    validAt: new Date().toISOString(),
    invalidAt: null,
  });

  return {
    action: invalidated.length > 0 ? 'updated' : 'created',
    edgeUuid,
    invalidated,
  };
}

type ConflictType = 'none' | 'duplicate' | 'supersedes';

function detectConflict(existing: GraphEdge, incoming: ExtractedRelation): ConflictType {
  const existingName = existing.name.toUpperCase();
  const incomingName = incoming.name.toUpperCase();

  if (existingName === incomingName) {
    if (textSimilarity(existing.fact, incoming.fact) > 0.8) {
      return 'duplicate';
    }
    return 'supersedes';
  }

  if (isAntonym(existingName, incomingName)) {
    return 'supersedes';
  }

  return 'none';
}

function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }

  return overlap / Math.max(wordsA.size, wordsB.size);
}

const ANTONYM_PAIRS: [string, string][] = [
  ['USES', 'LEFT'],
  ['LIKES', 'DISLIKES'],
  ['WORKS_AT', 'LEFT'],
  ['OWNS', 'SOLD'],
  ['STARTED', 'FINISHED'],
  ['ENABLED', 'DISABLED'],
  ['PREFERS', 'AVOIDS'],
];

function isAntonym(a: string, b: string): boolean {
  return ANTONYM_PAIRS.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x),
  );
}
