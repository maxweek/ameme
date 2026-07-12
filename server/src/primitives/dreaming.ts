import { PgService } from '../services/postgres';
import { GraphClient } from '../services/graph/client';
import { EmbeddingService } from '../services/embeddings';
import { ObsidianService } from '../services/obsidian';
import { RedisService } from '../services/redis';
import { findDuplicate } from '../services/graph/dedup';
import { writeEdgeWithTemporal } from '../services/graph/temporal';
import type { ExtractionResult, NodeType } from '../services/graph/types';
import { NODE_TYPES, normalizeEdgeName } from '../services/graph/types';
import { CONFIG } from '../config';
import { invalidateStartupCache } from './startup';
import { EventBus } from '../services/events';

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


export type DreamingPhase =
  | 'idle'
  | 'collecting'
  | 'analyzing'
  | 'writing_facts'
  | 'invalidating'
  | 'merging'
  | 'diary'
  | 'rebuilding'
  | 'complete'
  | 'error';

// ── Edge normalization (same as extraction.ts) ──────────


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
    emitProgress('collecting', 'Собираю сообщения за день...', 0);

    const messages = await PgService.recentMessages(hours);
    messagesProcessed = messages.length;

    if (messages.length < 3) {
      emitProgress('complete', `Мало сообщений (${messages.length}), пропускаю`, 100);

      console.log(`[dreaming] Only ${messages.length} messages — skipping`);
      return {
        status: 'skipped',
        messagesProcessed,
        newFacts: 0, staleFacts: 0, mergedNodes: 0, diary: false,
        durationMs: Date.now() - t0,
      };
    }

    emitProgress('collecting', `Найдено ${messages.length} сообщений`, 10);

    const nodes = await GraphClient.getAllNodes(groupId);
    const edges = await GraphClient.getAllEdges(groupId, true);

    emitProgress('collecting', `Граф: ${nodes.length} узлов, ${edges.length} связей`, 15);


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

    emitProgress('analyzing', 'Анализирую разговоры...', 20);

    const analysis = await analyzeDayWithLLM(messageText, nodeList, edgeList);

    emitProgress('analyzing', `Извлечено: ${analysis.new_facts_entities.length} сущностей, ${analysis.new_facts_relations.length} связей, ${analysis.stale_facts.length} устаревших`, 40);

    // ── Phase 3: WRITE NEW FACTS ──────────────────────

    emitProgress('writing_facts', 'Записываю новые факты...', 45);

    const nameToUuid = new Map<string, string>();

    // Pre-populate with existing nodes
    for (const node of nodes) {
      nameToUuid.set(node.name, node.uuid);
    }

    const totalEntities = analysis.new_facts_entities.length;
    for (let i = 0; i < totalEntities; i++) {
      const entity = analysis.new_facts_entities[i];
      if (!entity) continue;
      if (!entity.name || !entity.type) continue;
      if (!NODE_TYPES.includes(entity.type as NodeType)) continue;

      emitProgress('writing_facts', `Сущность ${i + 1}/${totalEntities}: ${entity.name}`, 45 + (i / totalEntities) * 15);


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

    const totalRelations = analysis.new_facts_relations.length;
    for (let i = 0; i < totalRelations; i++) {
      const rel = analysis.new_facts_relations[i];
      if (!rel) continue;
      if (!rel.sourceName || !rel.targetName || !rel.name || !rel.fact) continue;
      if (!/^[A-Z_]+$/.test(rel.name)) continue;


      emitProgress('writing_facts', `Связь ${i + 1}/${totalRelations}: ${rel.sourceName} → ${rel.targetName}`, 60 + (i / totalRelations) * 10);


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
    emitProgress('invalidating', `Инвалидирую ${analysis.stale_facts.length} устаревших фактов...`, 72);


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

    emitProgress('merging', 'Мержу дубликаты...', 80);

    mergedNodes = await mergeDuplicateNodes(groupId);

    emitProgress('merging', `Смержено: ${mergedNodes}`, 85);

    // ── Phase 6: DIARY ────────────────────────────────

    emitProgress('diary', 'Пишу дневник...', 88);


    if (analysis.diary) {
      try {
        const today = new Date().toISOString().split('T')[0];
        await ObsidianService.write(`дневник/${today}.md`, analysis.diary);
        diaryWritten = true;
      } catch (err) {
        console.warn('[dreaming] Diary write failed, skipping:', err);
        // Не ломаем весь dreaming из-за Obsidian
      }
    }

    // ── Phase 6b: USER PROFILE UPDATE ─────────────────

    if (analysis.user_profile_update) {
      try {
        const existing = await ObsidianService.read('пользователи/default.md');
        const updated = existing?.content
          ? `${existing.content}\n\n---\n_Обновлено ${new Date().toISOString().split('T')[0]}:_\n${analysis.user_profile_update}`
          : analysis.user_profile_update;
        await ObsidianService.write('пользователи/default.md', updated);
        console.log('[dreaming] User profile updated');
      } catch (err) {
        console.warn('[dreaming] Profile update failed:', err);
      }
    }

    // ── Phase 7: REBUILD CACHE ────────────────────────
    emitProgress('rebuilding', 'Пересобираю кэш...', 95);

    await invalidateStartupCache();

    const duration = Date.now() - t0;
    console.log(`[dreaming] Done in ${duration}ms. New: ${newFacts}, Stale: ${staleFacts}, Merged: ${mergedNodes}`);
    emitProgress('complete', `Готово за ${(duration / 1000).toFixed(1)}s. Новых: ${newFacts}, устаревших: ${staleFacts}, смержено: ${mergedNodes}`, 100);

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
    emitProgress('error', `Ошибка: ${message}`, 0);

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
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
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
  const deleted = new Set<string>();

  // Group by type
  const byType = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const list = byType.get(node.type) ?? [];
    list.push(node);
    byType.set(node.type, list);
  }

  for (const [_, typeNodes] of byType) {
    if (typeNodes.length < 2) continue;

    for (let i = 0; i < typeNodes.length; i++) {
      if (deleted.has(typeNodes[i].uuid)) continue;

      for (let j = i + 1; j < typeNodes.length; j++) {
        if (deleted.has(typeNodes[j].uuid)) continue;

        const nameA = typeNodes[i].name.toLowerCase();
        const nameB = typeNodes[j].name.toLowerCase();

        const isSimilar =
          nameA === nameB ||
          nameA.startsWith(nameB) ||
          nameB.startsWith(nameA);

        if (!isSimilar) continue;

        const keepNode = typeNodes[i];
        const deleteNode = typeNodes[j];

        console.log(`[dreaming] Merging "${deleteNode.name}" → "${keepNode.name}"`);

        // 1. Перенести edges
        await retargetEdges(deleteNode.uuid, keepNode.uuid);

        // 2. Обновить summary если у удаляемого лучше
        if (deleteNode.summary.length > keepNode.summary.length) {
          await GraphClient.updateNodeSummary(keepNode.uuid, deleteNode.summary);
        }

        // 3. Удалить дубликат
        await GraphClient.query(
          'MATCH (n {uuid: $uuid}) DETACH DELETE n',
          { uuid: deleteNode.uuid } as Record<string, any>,
        );

        deleted.add(deleteNode.uuid);
        merged++;
      }
    }
  }

  return merged;
}


async function retargetEdges(fromUuid: string, toUuid: string) {
  // FalkorDB не позволяет менять endpoints edge — копируем и удаляем

  // 1. Outgoing: (from)-[r]->(x) → (to)-[r]->(x)
  const outgoing = await GraphClient.roQuery(`
    MATCH (a {uuid: $fromUuid})-[r]->(b)
    WHERE b.uuid <> $toUuid
    RETURN r, type(r) AS relType, b.uuid AS targetUuid
  `, { fromUuid, toUuid } as Record<string, any>);

  for (const row of (outgoing.data ?? []) as any[]) {
    const r = row.r?.properties ?? row.r ?? {};
    const relType = row.relType;
    const targetUuid = row.targetUuid;
    if (!relType || !targetUuid) continue;

    // Проверить что такой edge ещё не существует у target node
    const existing = await GraphClient.findEdgesByNodes(toUuid, targetUuid, r.group_id ?? '');
    const isDup = existing.some(e => e.name === relType && textSimilarity(e.fact, r.fact ?? '') > 0.8);
    if (isDup) continue;

    await GraphClient.createEdge({
      sourceUuid: toUuid,
      targetUuid: targetUuid,
      name: relType,
      fact: r.fact ?? '',
      groupId: r.group_id ?? '',
      validAt: r.valid_at ?? null,
      invalidAt: r.invalid_at ?? null,
    });
  }

  // 2. Incoming: (x)-[r]->(from) → (x)-[r]->(to)
  const incoming = await GraphClient.roQuery(`
    MATCH (a)-[r]->(b {uuid: $fromUuid})
    WHERE a.uuid <> $toUuid
    RETURN r, type(r) AS relType, a.uuid AS sourceUuid
  `, { fromUuid, toUuid } as Record<string, any>);

  for (const row of (incoming.data ?? []) as any[]) {
    const r = row.r?.properties ?? row.r ?? {};
    const relType = row.relType;
    const sourceUuid = row.sourceUuid;
    if (!relType || !sourceUuid) continue;

    const existing = await GraphClient.findEdgesByNodes(sourceUuid, toUuid, r.group_id ?? '');
    const isDup = existing.some(e => e.name === relType && textSimilarity(e.fact, r.fact ?? '') > 0.8);
    if (isDup) continue;

    await GraphClient.createEdge({
      sourceUuid: sourceUuid,
      targetUuid: toUuid,
      name: relType,
      fact: r.fact ?? '',
      groupId: r.group_id ?? '',
      validAt: r.valid_at ?? null,
      invalidAt: r.invalid_at ?? null,
    });
  }
}

function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  return overlap / Math.max(wordsA.size, wordsB.size);
}


function emitProgress(phase: DreamingPhase, message: string, progress: number) {
  EventBus.emit({ type: 'dreaming_progress', phase, message, progress });
}