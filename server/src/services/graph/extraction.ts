import { CONFIG } from '../../config';
import { EmbeddingService } from '../embeddings';
import { cosineSimilarity } from './_utils';
import { GraphClient } from './client';
import { NODE_TYPES, normalizeEdgeName, type ExtractionResult, type NodeType } from './types';

// ── Edge name normalization ─────────────────────────────


const MAX_FULL_CONTEXT_NODES = 200;
const TARGETED_CONTEXT_LIMIT = 50;


// ── Prompt builder ──────────────────────────────────────

function buildPrompt(existingContext: string): string {
  return `You are a knowledge graph extraction engine.
From the given text, extract entities and relationships.

ENTITY TYPES (use ONLY these):
${NODE_TYPES.join(', ')}

${existingContext}

RULES:
- Entities must be CONCRETE nouns: people, projects, technologies, animals, places, organizations.
- NEVER create entities from abstract concepts, preference descriptions, event descriptions, or habit descriptions.
- BAD entities: "Предпочтение кошек", "Вчерашний укус", "Шутливое прозвище"
- GOOD entities: "кошки", "собаки", "панда"
- Preferences, habits, events should be encoded as RELATIONS between concrete entities, not as entity nodes.
- If an existing entity matches what you want to create — use the EXISTING name exactly, do NOT create a new one.
- If a new fact contradicts an existing fact — include both the new relation AND mark the old one in "invalidated".
- Each relation must have a clear verb-based name in UPPER_SNAKE_CASE.
- The "fact" field must be a complete human-readable sentence.
- Write ALL summaries and facts in the same language as the input text. Never mix languages.
- Extract at most 7 entities and 10 relations. Focus on the most important ones.

RELATION NAMING RULES:
- Use simple, generic verbs: USES not UTILIZES, LIKES not ADORES
- One word when possible: USES, OWNS, CREATED, LIKES
- Two words for direction: WORKS_ON, WORKS_AT, MOVED_TO, PART_OF

- Respond ONLY with valid JSON, no markdown, no preamble.

- NEVER create relations like PREVIOUSLY_USED, USED_TO, FORMERLY. 
  Instead, add the old fact to "invalidated" and create only the current fact.
  Example: "Игорь перешёл с Java на Kotlin" →
    relations: [{Игорь → USES → Kotlin}]
    invalidated: [{Игорь → USES → Java, reason: "перешёл на Kotlin"}]

OUTPUT FORMAT:
{
  "entities": [
    {"name": "exact name", "type": "NodeType", "summary": "one line description"}
  ],
  "relations": [
    {"sourceName": "entity name", "targetName": "entity name", "name": "VERB_TYPE", "fact": "Human readable fact sentence"}
  ],
  "invalidated": [
    {"sourceName": "entity name", "targetName": "entity name", "name": "OLD_RELATION_TYPE", "reason": "why this is no longer true"}
  ]
}`;
}

// ── Context recall ──────────────────────────────────────

async function getRelevantContext(text: string, groupId: string): Promise<string> {
  try {
    const nodes = await GraphClient.getAllNodes(groupId);
    if (nodes.length === 0) return '';

    let contextNodes: typeof nodes;

    if (nodes.length <= MAX_FULL_CONTEXT_NODES) {
      // Small graph — all nodes
      contextNodes = nodes;
    } else {
      // Large graph — top-N by cosine to input text
      const queryEmbedding = await EmbeddingService.embedQuery(text);

      const scored = nodes
        .filter(n => n.embedding && (n.embedding as number[]).length > 0)
        .map(n => ({
          node: n,
          score: cosineSimilarity(queryEmbedding, n.embedding as number[]),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, TARGETED_CONTEXT_LIMIT);

      contextNodes = scored.map(s => s.node);
    }

    const nodeLines = contextNodes
      .map(n => `[${n.type}] "${n.name}"`)
      .join('\n');

    // Edges — only between context nodes (relevant slice)
    const contextUuids = new Set(contextNodes.map(n => n.uuid));
    const edges = await GraphClient.getAllEdges(groupId, true);
    const relevantEdges = edges.filter(e =>
      contextUuids.has(e.sourceUuid) || contextUuids.has(e.targetUuid)
    );

    let context = `EXISTING ENTITIES (reuse these exact names, do NOT create duplicates):\n${nodeLines}`;

    if (relevantEdges.length > 0) {
      const edgeLines = relevantEdges
        .slice(-30)
        .map(e => {
          const src = nodes.find(n => n.uuid === e.sourceUuid)?.name ?? '?';
          const tgt = nodes.find(n => n.uuid === e.targetUuid)?.name ?? '?';
          return `${src} —[${e.name}]→ ${tgt}: ${e.fact}`;
        })
        .join('\n');

      context += `\n\nEXISTING FACTS (if new info contradicts these, add to "invalidated"):\n${edgeLines}`;
    }

    return context;
  } catch {
    return '';
  }
}

// ── Main extraction ─────────────────────────────────────

export async function extractFromText(text: string, groupId: string): Promise<ExtractionResult> {
  const existingContext = await getRelevantContext(text, groupId);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${CONFIG.dreaming.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CONFIG.dreaming.apiKey}`,
        },
        body: JSON.stringify({
          model: CONFIG.dreaming.model,
          messages: [
            { role: 'system', content: buildPrompt(existingContext) },
            { role: 'user', content: text },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty LLM response');

      const result = validate(JSON.parse(content));

      if (result.entities.length > 0 || result.relations.length > 0 || result.invalidated.length > 0) {
        return result;
      }

      console.warn(`[extraction] empty on attempt ${attempt + 1}, retrying`);
    } catch (err) {
      console.error(`[extraction] attempt ${attempt + 1} failed:`, err);
    }
  }

  return { entities: [], relations: [], invalidated: [] };
}

// ── Validation ──────────────────────────────────────────

function validate(raw: any): ExtractionResult {
  const entities = (raw.entities ?? [])
    .filter((e: any) =>
      e.name &&
      e.type &&
      NODE_TYPES.includes(e.type as NodeType) &&
      e.name.length >= 2
    )
    .map((e: any) => ({
      name: e.name.trim(),
      type: e.type as NodeType,
      summary: (e.summary ?? e.name).trim(),
    }));

  const entityNames = new Set(entities.map((e: any) => e.name));

  const relations = (raw.relations ?? [])
    .filter((r: any) =>
      r.sourceName &&
      r.targetName &&
      r.name &&
      r.fact &&
      entityNames.has(r.sourceName) &&
      entityNames.has(r.targetName)
    )
    .map((r: any) => ({
      sourceName: r.sourceName.trim(),
      targetName: r.targetName.trim(),
      name: normalizeEdgeName(r.name),
      fact: r.fact.trim(),
    }));

  const invalidated = (raw.invalidated ?? [])
    .filter((inv: any) => inv.sourceName && inv.targetName && inv.name)
    .map((inv: any) => ({
      sourceName: inv.sourceName.trim(),
      targetName: inv.targetName.trim(),
      name: normalizeEdgeName(inv.name),
      reason: inv.reason?.trim() ?? '',
    }));

  return { entities, relations, invalidated };
}
