import { GraphClient } from './client';
import { CONFIG } from '../../config';
import type { GraphEdge, ExtractedRelation } from './types';
import { isAntonym, isReplacement, textSimilarity } from './_utils';

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

  // Find ALL valid edges between these nodes (both directions)
  const existing = await GraphClient.findEdgesByNodes(sourceUuid, targetUuid, groupId);
  const reverse = await GraphClient.findEdgesByNodes(targetUuid, sourceUuid, groupId);
  const allExisting = [...existing, ...reverse];

  if (allExisting.length > 0) {
    // Stage 1: fast deterministic checks
    for (const edge of allExisting) {
      const conflict = detectConflictFast(edge, relation);

      if (conflict === 'duplicate') {
        return { action: 'duplicate', edgeUuid: edge.uuid, invalidated: [] };
      }

      if (conflict === 'supersedes') {
        await GraphClient.invalidateEdge(edge.uuid);
        invalidated.push(edge.uuid);
      }
    }

    // Stage 2: LLM contradiction check for remaining valid edges
    if (invalidated.length === 0) {
      const stillValid = allExisting.filter(e => !invalidated.includes(e.uuid));
      if (stillValid.length > 0) {
        const contradictions = await detectContradictionsLLM(relation.fact, stillValid);
        for (const edge of contradictions) {
          await GraphClient.invalidateEdge(edge.uuid);
          invalidated.push(edge.uuid);
        }
      }
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

// ── Stage 1: Deterministic checks ───────────────────────

type ConflictType = 'none' | 'duplicate' | 'supersedes';

function detectConflictFast(existing: GraphEdge, incoming: ExtractedRelation): ConflictType {
  const existingName = existing.name.toUpperCase();
  const incomingName = incoming.name.toUpperCase();

  if (existingName === incomingName) {
    if (textSimilarity(existing.fact, incoming.fact) > 0.8) return 'duplicate';
    return 'supersedes';
  }

  if (isAntonym(existingName, incomingName)) return 'supersedes';
  if (isReplacement(existingName, incomingName)) return 'supersedes';

  return 'none';
}

// ── Stage 2: LLM contradiction detection ────────────────

async function detectContradictionsLLM(
  newFact: string,
  existingEdges: GraphEdge[],
): Promise<GraphEdge[]> {
  if (existingEdges.length === 0) return [];

  try {
    const pairs = existingEdges
      .map((e, i) => `[${i}] OLD: "${e.fact}" vs NEW: "${newFact}"`)
      .join('\n');

    const response = await fetch(`${CONFIG.dreaming.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.dreaming.apiKey}`,
      },
      body: JSON.stringify({
        model: CONFIG.dreaming.model,
        messages: [{
          role: 'user',
          content: `For each pair, classify the relationship between OLD and NEW fact.
Return ONLY a JSON object: {"results": ["CONTRADICT" | "COEXIST" | "DUPLICATE"]}
One result per pair, same order.

CONTRADICT = new fact makes old fact no longer true
COEXIST = both facts can be true simultaneously
DUPLICATE = same information, different wording

Pairs:
${pairs}`,
        }],
        temperature: 0,
        thinking: { type: 'enabled' },
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) return [];

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const results: string[] = Array.isArray(parsed) ? parsed : parsed.results ?? [];

    return existingEdges.filter((_, i) => {
      const verdict = (results[i] ?? '').toUpperCase();
      return verdict === 'CONTRADICT';
    });
  } catch (err) {
    console.error('[temporal] LLM contradiction check failed:', err);
    return [];
  }
}
