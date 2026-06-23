import { GraphitiService } from '../services/graphiti';
import { PgService } from '../services/postgres';
import { ObsidianService } from '../services/obsidian';
import { RedisService } from '../services/redis';

const CACHE_KEY = 'judy:core_memory_block';
const CACHE_TTL = 1800; // 30 минут

export async function startup(params: StartupParams = {}): Promise<string> {
  const userId = params.userId ?? 'default';
  const cacheKey = `judy:core_memory_block:${userId}`;

  const cached = await RedisService.get(cacheKey);
  if (cached) return cached;

  // Целевые запросы, не мусорный "всё обо всём"
  const [
    userProfile,
    userFacts,
    activeProjects,
    preferences,
    recentMessages,
  ] = await Promise.allSettled([
    ObsidianService.read(`пользователи/${userId}.md`),
    GraphitiService.searchNodes(userId, 5),
    GraphitiService.searchFacts('текущие проекты в работе', 5),
    GraphitiService.searchFacts('предпочтения привычки принципы', 5),
    PgService.recentMessages(24),
  ]);

  const sections: string[] = [];

  // Профиль из Obsidian
  if (userProfile.status === 'fulfilled' && userProfile.value) {
    sections.push(truncate(userProfile.value, 500));
  }

  // Факты о пользователе из графа
  if (userFacts.status === 'fulfilled' && userFacts.value.length > 0) {
    const lines = userFacts.value.map(n => `- ${n.name}: ${n.summary}`);
    sections.push('Ключевые факты:\n' + lines.join('\n'));
  }

  // Активные проекты
  if (activeProjects.status === 'fulfilled' && activeProjects.value.length > 0) {
    const lines = activeProjects.value.map(f => `- ${f.fact}`);
    sections.push('Активные проекты:\n' + lines.join('\n'));
  }

  // Предпочтения
  if (preferences.status === 'fulfilled' && preferences.value.length > 0) {
    const lines = preferences.value.map(f => `- ${f.fact}`);
    sections.push('Предпочтения:\n' + lines.join('\n'));
  }

  // Контекст последней сессии — что реально обсуждали
  if (recentMessages.status === 'fulfilled' && recentMessages.value.length > 0) {
    const msgs = recentMessages.value;
    // Берём последние user-сообщения как контекст
    const userMsgs = msgs
      .filter((m: any) => m.role === 'user')
      .slice(-5)
      .map((m: any) => truncate(m.content, 100));

    if (userMsgs.length > 0) {
      sections.push('Последние темы:\n' + userMsgs.map(m => `- ${m}`).join('\n'));
    }
  }

  const block = sections.length > 0
    ? sections.join('\n\n')
    : 'Нет данных в памяти.';

  await RedisService.set(cacheKey, block, CACHE_TTL);
  return block;
}

/** Инвалидировать кэш (вызывается из remember, dreaming) */
export async function invalidateStartupCache() {
  await RedisService.del(CACHE_KEY);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '…';
}