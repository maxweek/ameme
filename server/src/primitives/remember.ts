import { extractFromText } from '../services/graph/extraction';
import { findDuplicate } from '../services/graph/dedup';
import { writeEdgeWithTemporal } from '../services/graph/temporal';
import { GraphClient } from '../services/graph/client';
import { EmbeddingService } from '../services/embeddings';
import { RedisService } from '../services/redis';
import type { WriteResult } from '../services/graph/types';
import { CONFIG } from '../config';

export async function remember(text: string, source = 'agent_remember'): Promise<WriteResult> {
  if (!text || text.length < 10) {
    return { ok: false, nodesCreated: 0, nodesUpdated: 0, edgesCreated: 0, edgesInvalidated: 0, error: 'Text too short (min 10 chars)' };
  }

  if (text.length > 2000) {
    text = text.slice(0, 2000);
  }

  const groupId = CONFIG.falkordb.database;
  let nodesCreated = 0;
  let nodesUpdated = 0;
  let edgesCreated = 0;
  let edgesInvalidated = 0;

  try {
    // 1. LLM extraction with graph context
    const extracted = await extractFromText(text, groupId);

    if (extracted.entities.length === 0) {
      return { ok: true, nodesCreated: 0, nodesUpdated: 0, edgesCreated: 0, edgesInvalidated: 0 };
    }

    // 2. Upsert entities
    const nameToUuid = new Map<string, string>();

    for (const entity of extracted.entities) {
      const dup = await findDuplicate(entity, groupId);

      if (dup) {
        // Existing node — replace summary (not append)
        await GraphClient.updateNodeSummary(dup.existing.uuid, entity.summary);
        nameToUuid.set(entity.name, dup.existing.uuid);
        nodesUpdated++;
      } else {
        // New node
        const uuid = await GraphClient.createNode({
          name: entity.name,
          type: entity.type,
          summary: entity.summary,
          groupId,
        });

        const embedding = await EmbeddingService.embedPassage(`${entity.name}: ${entity.summary}`);
        await GraphClient.setNodeEmbedding(uuid, embedding);

        nameToUuid.set(entity.name, uuid);
        nodesCreated++;
      }
    }

    // 3. Write edges with temporal logic
    for (const relation of extracted.relations) {
      const sourceUuid = nameToUuid.get(relation.sourceName);
      const targetUuid = nameToUuid.get(relation.targetName);
      if (!sourceUuid || !targetUuid) continue;

      const result = await writeEdgeWithTemporal(relation, sourceUuid, targetUuid, groupId);

      if (result.action === 'created' || result.action === 'updated') {
        const embedding = await EmbeddingService.embedPassage(relation.fact);
        await GraphClient.setEdgeEmbedding(result.edgeUuid, embedding);
        edgesCreated++;
      }

      edgesInvalidated += result.invalidated.length;
    }

    // 4. Invalidate old facts by LLM instruction
    for (const inv of extracted.invalidated) {
      const srcUuid = nameToUuid.get(inv.sourceName)
        ?? (await GraphClient.findNodeByName(inv.sourceName, groupId))?.uuid;
      const tgtUuid = nameToUuid.get(inv.targetName)
        ?? (await GraphClient.findNodeByName(inv.targetName, groupId))?.uuid;

      if (!srcUuid || !tgtUuid) continue;

      const existing = await GraphClient.findEdgesByNodes(srcUuid, tgtUuid, groupId);
      for (const edge of existing) {
        if (edge.name === inv.name) {
          await GraphClient.invalidateEdge(edge.uuid);
          edgesInvalidated++;
        }
      }

      // Обновить summary целевого узла — убрать устаревшую информацию
      if (tgtUuid) {
        const node = await GraphClient.findNodeByUuid(tgtUuid);
        if (node && node.summary.toLowerCase().includes(inv.sourceName.toLowerCase())) {
          await GraphClient.updateNodeSummary(tgtUuid, node.name);
        }
      }
    }


    // 5. Invalidate startup cache
    await RedisService.del('judy:core_memory_block');

    return { ok: true, nodesCreated, nodesUpdated, edgesCreated, edgesInvalidated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[remember] failed:', message);
    return { ok: false, nodesCreated, nodesUpdated, edgesCreated, edgesInvalidated, error: message };
  }
}
