import { CONFIG } from '../../config';
import { GraphClient } from './client';
import { NODE_TYPES, type ExtractionResult, type NodeType } from './types';

// ── Edge normalization ──────────────────────────────────

const EDGE_ALIASES: Record<string, string> = {
  UTILIZES: 'USES', EMPLOYS: 'USES', WORKS_WITH: 'USES',
  RUNS_ON: 'USES', BUILT_WITH: 'USES', POWERED_BY: 'USES',
  BUILT: 'CREATED', DEVELOPED: 'CREATED', MADE: 'CREATED',
  WROTE: 'CREATED', DESIGNED: 'CREATED',
  LOVES: 'LIKES', ENJOYS: 'LIKES', FAVORS: 'LIKES',
  HATES: 'DISLIKES',
  LOCATED_IN: 'LIVES_IN', RESIDES_IN: 'LIVES_IN', BASED_IN: 'LIVES_IN',
  EMPLOYED_AT: 'WORKS_AT', HIRED_BY: 'WORKS_AT',
  QUIT: 'LEFT', RESIGNED: 'LEFT', FIRED_FROM: 'LEFT', STOPPED_USING: 'LEFT',
  MIGRATED_FROM: 'REPLACES', SWITCHED_FROM: 'REPLACES',
  MOVED_FROM: 'REPLACES', UPGRADED_TO: 'REPLACES',
  LEARNING: 'STUDIES', STUDYING: 'STUDIES',
  RELATED_TO: 'KNOWS', ACQUAINTED_WITH: 'KNOWS',
  PURCHASED: 'BOUGHT', HAS: 'OWNS',
};

function normalizeEdgeName(name: string): string {
  const upper = name.toUpperCase().replace(/\s+/g, '_');
  return EDGE_ALIASES[upper] ?? upper;
}

// ── Phase 1: Pure extraction ────────────────────────────

const EXTRACTION_PROMPT = `You are a knowledge graph extraction engine.
From the given text, extract entities and relationships.

ENTITY TYPES (use ONLY these):
${NODE_TYPES.join(', ')}

RULES:
- Entities must be CONCRETE nouns: people, projects, technologies, animals, places, organizations.
- NEVER create entities from abstract concepts, preference descriptions, event descriptions, or habit descriptions.
- BAD entities: "Предпочтение кошек", "Вчерашний укус", "Шутливое прозвище"
- GOOD entities: "кошки", "собаки", "панда"
- Each relation must have a verb-based name in UPPER_SNAKE_CASE.
- Prefer simple verbs: USES, LIKES, OWNS, WORKS_ON, WORKS_AT, CREATED, STUDIES, LIVES_IN.
- The "fact" field must be a complete human-readable sentence.
- Write ALL output in the same language as the input text. Never mix languages.
- Extract at most 7 entities and 10 relations.
- Respond ONLY with valid JSON.

- Relation names must be in ENGLISH UPPER_SNAKE_CASE only. Never use Cyrillic in relation names.
- Examples: USES, LIKES, DISLIKES, WORKS_ON — never ИСПОЛЬЗУЕТ, ЛЮБИТ, РАБОТАЕТ.

OUTPUT:
{
  "entities": [
    {"name": "exact name", "type": "NodeType", "summary": "one line description"}
  ],
  "relations": [
    {"sourceName": "entity name", "targetName": "entity name", "name": "VERB", "fact": "Full sentence"}
  ]
}`;

async function extractRaw(text: string): Promise<{ entities: any[]; relations: any[] }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${CONFIG.dreaming.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.dreaming.apiKey}`,
      },
      body: JSON.stringify({
        model: CONFIG.dreaming.model,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM extraction error: ${response.status}`);
    }

    let ar: any[] = [];
    ar.reduce((el, acc) => !b.includes(el) && acc.push(el), [])

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty extraction response');

    const parsed = JSON.parse(content);

    if (parsed.entities?.length > 0 || parsed.relations?.length > 0) {
      return parsed;
    }

    console.warn(`[extraction] empty on attempt ${attempt + 1}, retrying`);
  }

  return { entities: [], relations: [] };
}

// ── Phase 2: Reconciliation with graph ──────────────────

function buildReconciliationPrompt(existingContext: string): string {
  return `You are a knowledge graph reconciliation engine.
You receive extracted entities and relations, plus the existing graph state.
Your job: match extracted data against existing entities and find contradictions.

${existingContext}

TASKS:
1. RENAME: If an extracted entity matches an existing one (same person, same thing, different spelling) — rename it to the EXISTING name.
   Example: extracted "Максим" but existing has "Макс" → rename to "Макс"
   Example: extracted "JS" but existing has "JavaScript" → rename to "JavaScript"

2. INVALIDATE: If a new relation contradicts an existing fact — add to "invalidated".
   Example: existing "Макс LIKES собаки", new "Макс DISLIKES собаки" → invalidate the old one
   Example: existing "Сергей USES Windows", new "Сергей USES Linux" (same relation type, incompatible) → invalidate

3. SKIP DUPLICATES: If a relation already exists with the same meaning — remove it from relations.

- Relation names must be in ENGLISH UPPER_SNAKE_CASE only. Never use Cyrillic in relation names.
- Examples: USES, LIKES, DISLIKES, WORKS_ON — never ИСПОЛЬЗУЕТ, ЛЮБИТ, РАБОТАЕТ.
Return the corrected data. Respond ONLY with valid JSON.

IMPORTANT: Do NOT re-extract entities from the graph context.
You receive ALREADY EXTRACTED data — only rename, deduplicate, and find contradictions.
Return ONLY the entities and relations that were in the input, possibly renamed.
Do NOT add new entities or relations that weren't in the input.

OUTPUT:
{
  "entities": [
    {"name": "corrected name", "type": "NodeType", "summary": "description"}
  ],
  "relations": [
    {"sourceName": "entity name", "targetName": "entity name", "name": "VERB", "fact": "sentence"}
  ],
  "invalidated": [
    {"sourceName": "existing entity", "targetName": "existing entity", "name": "RELATION_TYPE", "reason": "why invalidated"}
  ]
}`;
}

async function reconcile(
  raw: { entities: any[]; relations: any[] },
  existingContext: string,
): Promise<any> {
  const input = JSON.stringify(raw, null, 2);

  const response = await fetch(`${CONFIG.dreaming.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.dreaming.apiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.dreaming.model,
      messages: [
        { role: 'system', content: buildReconciliationPrompt(existingContext) },
        { role: 'user', content: input },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM reconciliation error: ${response.status}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty reconciliation response');

  return JSON.parse(content);
}

// ── Context builder ─────────────────────────────────────

async function getExistingContext(groupId: string): Promise<string> {
  try {
    const nodes = await GraphClient.getAllNodes(groupId);
    const edges = await GraphClient.getAllEdges(groupId, true);

    if (nodes.length === 0) return '';

    const nodeLines = nodes
      .map(n => `[${n.type}] "${n.name}"`)
      .join('\n');

    let context = `EXISTING ENTITIES:\n${nodeLines}`;

    if (edges.length > 0) {
      const edgeLines = edges
        .slice(-30)
        .map(e => {
          const src = nodes.find(n => n.uuid === e.sourceUuid)?.name ?? '?';
          const tgt = nodes.find(n => n.uuid === e.targetUuid)?.name ?? '?';
          return `${src} —[${e.name}]→ ${tgt}: ${e.fact}`;
        })
        .join('\n');

      context += `\n\nEXISTING FACTS:\n${edgeLines}`;
    }

    return context;
  } catch {
    return '';
  }
}

// ── Main entry point ────────────────────────────────────

export async function extractFromText(text: string, groupId: string): Promise<ExtractionResult> {
  try {
    // Phase 1: pure extraction (no graph context)
    const raw = await extractRaw(text);

    // Phase 2: reconciliation (with graph context)
    const existingContext = await getExistingContext(groupId);

    let reconciled: any;
    if (existingContext) {
      reconciled = await reconcile(raw, existingContext);
    } else {
      // Empty graph — nothing to reconcile
      reconciled = { ...raw, invalidated: [] };
    }

    return validate(reconciled);
  } catch (err) {
    console.error('[extraction] failed:', err);
    return { entities: [], relations: [], invalidated: [] };
  }
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
      /^[A-Z_]+$/.test(r.name.trim()) && // только английские буквы и _
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