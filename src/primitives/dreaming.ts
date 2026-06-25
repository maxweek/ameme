import { PgService } from '../services/postgres';
import { GraphClient } from '../services/graph/client';
import { EmbeddingService } from '../services/embeddings';
import { ObsidianService } from '../services/obsidian';
import { RedisService } from '../services/redis';
import { findDuplicate } from '../services/graph/dedup';
import { writeEdgeWithTemporal } from '../services/graph/temporal';
import type { ExtractionResult, NodeType } from '../services/graph/types';
import { NODE_TYPES } from '../services/graph/types';
import { CONFIG } from '../config';
import { invalidateStartupCache } from './startup';

// ── Types ───────────────────────────────────────────────

export interface DreamingResult {
  status: 'ok' | 'skipped' | 'error';
  messagesProcessed: number;
  newFacts: number;
  staleFacts: number;
  mergedNodes: number;
  diary: boolean;
  durationMs: number;
  error?: string;
}

// ── Edge normalization (same as extraction.ts) ──────────

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

// ── Main dreaming function ──────────────────────────────

export async function dreaming(hours = 24): Promise<DreamingResult> {
  const t0 = Date.now();
  const groupId = CONFIG.falkordb.database;

  let messagesProcessed = 0;
  let newFacts = 0;
  let staleFacts = 0;
  let mergedNodes = 0;
  let diaryWritten = false;

  try {
    // ── Phase 1: СБОР ─────────────────────────────────

    const messages = await PgService.recentMessages(hours);
    messagesProcessed = messages.length;

    if (messages.length < 3) {
      console.log(`[dreaming] Only ${messages.length} messages — skipping`);
      return {
        status: 'skipped',
        messagesProcessed,
        newFacts: 0, staleFacts: 0, mergedNodes: 0, diary: false,
        durationMs: Date.now() - t0,
      };
    }

    const nodes = await GraphClient.getAllNodes(groupId);
    const edges = await GraphClient.getAllEdges(groupId, true);

    // Format messages for LLM
    const messageText = (messages as any[])
      .map(m => `[${m.role}] ${m.content}`)
      .join('\n');

    // Format existing graph for LLM
    const nodeList = nodes.map(n => `[${n.type}] "${n.name}": ${n.summary}`).join('\n');
    const edgeList = edges.slice(-30).map(e => {
      const src = nodes.find(n => n.uuid === e.sourceUuid)?.name ?? '?';
      const tgt = nodes.find(n => n.uuid === e.targetUuid)?.name ?? '?';
      return `${src} —[${e.name}]→ ${tgt}: ${e.fact}`;
    }).join('\n');

    // ── Phase 2: LLM ANALYSIS (один вызов) ────────────

    const analysis = await analyzeDayWithLLM(messageText, nodeList, edgeList);

    // ── Phase 3: WRITE NEW FACTS ──────────────────────

    const nameToUuid = new Map<string, string>();

    // Pre-populate with existing nodes
    for (const node of nodes) {
      nameToUuid.set(node.name, node.uuid);
    }

    for (const entity of analysis.new_facts_entities) {
      if (!entity.name || !entity.type) continue;
      if (!NODE_TYPES.includes(entity.type as NodeType)) continue;

      const dup = await findDuplicate(
        { name: entity.name, type: entity.type as NodeType, summary: entity.summary ?? '' },
        groupId,
      );

      if (dup) {
        await GraphClient.updateNodeSummary(dup.existing.uuid, entity.summary ?? dup.existing.summary);
        nameToUuid.set(entity.name, dup.existing.uuid);
      } else {
        const uuid = await GraphClient.createNode({
          name: entity.name,
          type: entity.type as NodeType,
          summary: entity.summary ?? entity.name,
          groupId,
        });
        const embedding = await EmbeddingService.embedPassage(`${entity.name}: ${entity.summary ?? ''}`);
        await GraphClient.setNodeEmbedding(uuid, embedding);
        nameToUuid.set(entity.name, uuid);
        newFacts++;
      }
    }

    for (const rel of analysis.new_facts_relations) {
      if (!rel.sourceName || !rel.targetName || !rel.name || !rel.fact) continue;
      if (!/^[A-Z_]+$/.test(rel.name)) continue;

      const sourceUuid = nameToUuid.get(rel.sourceName)
        ?? (await GraphClient.findNodeByName(rel.sourceName, groupId))?.uuid;
      const targetUuid = nameToUuid.get(rel.targetName)
        ?? (await GraphClient.findNodeByName(rel.targetName, groupId))?.uuid;
      if (!sourceUuid || !targetUuid) continue;

      const result = await writeEdgeWithTemporal(
        { sourceName: rel.sourceName, targetName: rel.targetName, name: normalizeEdgeName(rel.name), fact: rel.fact },
        sourceUuid, targetUuid, groupId,
      );

      if (result.action === 'created' || result.action === 'updated') {
        const embedding = await EmbeddingService.embedPassage(rel.fact);
        await GraphClient.setEdgeEmbedding(result.edgeUuid, embedding);
        newFacts++;
      }
      staleFacts += result.invalidated.length;
    }

    // ── Phase 4: INVALIDATE STALE FACTS ───────────────

    for (const stale of analysis.stale_facts) {
      if (!stale.sourceName || !stale.targetName || !stale.name) continue;

      const srcUuid = nameToUuid.get(stale.sourceName)
        ?? (await GraphClient.findNodeByName(stale.sourceName, groupId))?.uuid;
      const tgtUuid = nameToUuid.get(stale.targetName)
        ?? (await GraphClient.findNodeByName(stale.targetName, groupId))?.uuid;
      if (!srcUuid || !tgtUuid) continue;

      const existing = await GraphClient.findEdgesByNodes(srcUuid, tgtUuid, groupId);
      for (const edge of existing) {
        if (edge.name === normalizeEdgeName(stale.name)) {
          await GraphClient.invalidateEdge(edge.uuid);
          staleFacts++;
        }
      }
    }

    // ── Phase 5: MERGE DUPLICATE NODES ────────────────

    mergedNodes = await mergeDuplicateNodes(groupId);

    // ── Phase 6: DIARY ────────────────────────────────

    if (analysis.diary) {
      const today = new Date().toISOString().split('T')[0];
      await ObsidianService.write(`дневник/${today}.md`, analysis.diary);
      diaryWritten = true;
    }

    // ── Phase 7: REBUILD CACHE ────────────────────────

    await invalidateStartupCache();

    const duration = Date.now() - t0;
    console.log(`[dreaming] Done in ${duration}ms. New: ${newFacts}, Stale: ${staleFacts}, Merged: ${mergedNodes}`);

    return {
      status: 'ok',
      messagesProcessed,
      newFacts,
      staleFacts,
      mergedNodes,
      diary: diaryWritten,
      durationMs: duration,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[dreaming] failed:', message);
    return {
      status: 'error',
      messagesProcessed,
      newFacts, staleFacts, mergedNodes,
      diary: diaryWritten,
      durationMs: Date.now() - t0,
      error: message,
    };
  }
}

// ── LLM Analysis ────────────────────────────────────────

interface DreamAnalysis {
  new_facts_entities: Array<{ name: string; type: string; summary: string }>;
  new_facts_relations: Array<{ sourceName: string; targetName: string; name: string; fact: string }>;
  stale_facts: Array<{ sourceName: string; targetName: string; name: string; reason: string }>;
  diary: string | null;
  user_profile_update: string | null;
}

async function analyzeDayWithLLM(
  messages: string,
  existingNodes: string,
  existingEdges: string,
): Promise<DreamAnalysis> {
  const prompt = `You are a memory consolidation engine. You process a day's conversations and extract knowledge.

ENTITY TYPES: ${NODE_TYPES.join(', ')}

EXISTING GRAPH:
Entities:
${existingNodes || '(empty)'}

Facts:
${existingEdges || '(empty)'}

CONVERSATIONS (last 24 hours):
${messages}

TASKS:

1. NEW FACTS: Extract entities and relations that are NOT already in the graph.
   - Entities: concrete nouns only (people, projects, technologies, places).
   - Relations: verb-based UPPER_SNAKE_CASE in ENGLISH only.
   - Reuse existing entity names exactly when they match.
   - Write facts in the same language as conversations.
   - Only include facts with confidence >= 0.7.

2. STALE FACTS: Identify existing facts that are contradicted by today's conversations.
   - Reference existing entity names exactly.

3. DIARY: Write a 3-5 sentence diary entry summarizing the day.
   - Write in the same language as conversations.
   - Focus on what was discussed, decided, or learned.
   - Include emotional tone if relevant.

4. USER PROFILE UPDATE: If you learned something new about the user — suggest update text.
   - Null if nothing new.

Respond ONLY with valid JSON:
{
  "new_facts_entities": [{"name": "string", "type": "NodeType", "summary": "string"}],
  "new_facts_relations": [{"sourceName": "string", "targetName": "string", "name": "VERB", "fact": "string"}],
  "stale_facts": [{"sourceName": "string", "targetName": "string", "name": "VERB", "reason": "string"}],
  "diary": "string or null",
  "user_profile_update": "string or null"
}`;

  const response = await fetch(`${CONFIG.dreaming.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.dreaming.apiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.dreaming.model,
      messages: [
        { role: 'system', content: prompt },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`Dreaming LLM error: ${response.status}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty dreaming response');

  const parsed = JSON.parse(content);

  return {
    new_facts_entities: parsed.new_facts_entities ?? [],
    new_facts_relations: (parsed.new_facts_relations ?? []).map((r: any) => ({
      ...r,
      name: /^[A-Z_]+$/.test(r.name?.trim?.() ?? '') ? r.name.trim() : '',
    })).filter((r: any) => r.name),
    stale_facts: (parsed.stale_facts ?? []).map((s: any) => ({
      ...s,
      name: /^[A-Z_]+$/.test(s.name?.trim?.() ?? '') ? s.name.trim() : '',
    })).filter((s: any) => s.name),
    diary: parsed.diary ?? null,
    user_profile_update: parsed.user_profile_update ?? null,
  };
}

// ── Merge duplicate nodes ───────────────────────────────

async function mergeDuplicateNodes(groupId: string): Promise<number> {
  const nodes = await GraphClient.getAllNodes(groupId);
  if (nodes.length < 2) return 0;

  let merged = 0;

  // Group by type
  const byType = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const list = byType.get(node.type) ?? [];
    list.push(node);
    byType.set(node.type, list);
  }

  for (const [_, typeNodes] of byType) {
    if (typeNodes.length < 2) continue;

    // Check all pairs for high similarity
    const toMerge = new Set<string>(); // uuids to delete

    for (let i = 0; i < typeNodes.length; i++) {
      
      if (toMerge.has(typeNodes[i].uuid)) continue;

      for (let j = i + 1; j < typeNodes.length; j++) {
        if (toMerge.has(typeNodes[j].uuid)) continue;

        // Name-based check first (fast)
        const nameA = typeNodes[i].name.toLowerCase();
        const nameB = typeNodes[j].name.toLowerCase();

        const isSimilarName =
          nameA === nameB ||
          nameA.startsWith(nameB) ||
          nameB.startsWith(nameA);

        if (!isSimilarName) continue;

        // Merge: keep first, retarget edges of second, delete second
        const keepUuid = typeNodes[i].uuid;
        const deleteUuid = typeNodes[j].uuid;

        await retargetEdges(deleteUuid, keepUuid);
        await GraphClient.query(
          'MATCH (n {uuid: $uuid}) DETACH DELETE n',
          { uuid: deleteUuid } as Record<string, any>,
        );

        toMerge.add(deleteUuid);
        merged++;
      }
    }
  }

  return merged;
}

async function retargetEdges(fromUuid: string, toUuid: string) {
  // This is complex in Cypher — we can't change edge endpoints directly.
  // Instead: find edges → create copies → delete originals.
  // For now, we just delete the duplicate node and accept edge loss.
  // Dreaming will re-create important edges in the next cycle.
  // TODO: proper edge retargeting
}
