import { GraphClient } from '../services/graph/client';
import { PgService } from '../services/postgres';
import { ObsidianService } from '../services/obsidian';
import { RedisService } from '../services/redis';
import { CONFIG } from '../config';

const CACHE_TTL = 1800; // 30 min

export interface StartupParams {
  userId?: string;
}

export async function startup(params: StartupParams = {}): Promise<string> {
  const userId = params.userId ?? 'default';
  const cacheKey = `judy:core_memory_block:${userId}`;

  const cached = await RedisService.get(cacheKey);
  if (cached) return cached;

  const groupId = CONFIG.falkordb.database;

  const [userProfile, allNodes, allEdges, recentMessages] = await Promise.allSettled([
    ObsidianService.read(`пользователи/${userId}.md`),
    GraphClient.getAllNodes(groupId),
    GraphClient.getAllEdges(groupId, true),
    PgService.recentMessages(24),
  ]);

  const sections: string[] = [];

  // User profile from Obsidian
  if (userProfile.status === 'fulfilled' && userProfile.value) {
    sections.push(truncate(userProfile.value, 500));
  }

  // Graph nodes — group by type dynamically
  if (allNodes.status === 'fulfilled' && allNodes.value.length > 0) {
    const nodes = allNodes.value;
    const byType = new Map<string, string[]>();

    for (const node of nodes) {
      const list = byType.get(node.type) ?? [];
      list.push(`${node.name}: ${node.summary}`);
      byType.set(node.type, list);
    }

    for (const [type, items] of byType) {
      sections.push(`${type}:\n` + items.map(i => `- ${i}`).join('\n'));
    }
  }

  // Graph edges — recent facts
  if (allEdges.status === 'fulfilled' && allEdges.value.length > 0) {
    const nodes = allNodes.status === 'fulfilled' ? allNodes.value : [];
    const facts = allEdges.value
      .slice(-10)
      .map(e => {
        const src = nodes.find(n => n.uuid === e.sourceUuid)?.name ?? '?';
        const tgt = nodes.find(n => n.uuid === e.targetUuid)?.name ?? '?';
        return `${src} → ${tgt}: ${e.fact}`;
      });
    sections.push('Факты:\n' + facts.map(f => `- ${f}`).join('\n'));
  }

  // Recent conversation topics
  if (recentMessages.status === 'fulfilled' && recentMessages.value.length > 0) {
    const userMsgs = recentMessages.value
      .filter((m: any) => m.role === 'user')
      .slice(-5)
      .map((m: any) => `- ${truncate(m.content, 100)}`);
    if (userMsgs.length > 0) {
      sections.push('Последние темы:\n' + userMsgs.join('\n'));
    }
  }

  const block = sections.length > 0
    ? sections.join('\n\n')
    : 'Нет данных в памяти.';

  await RedisService.set(cacheKey, block, CACHE_TTL);
  return block;
}

export async function invalidateStartupCache(userId = 'default') {
  await RedisService.del(`judy:core_memory_block:${userId}`);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '…';
}
