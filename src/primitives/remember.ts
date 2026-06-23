import { GraphitiService, type AddEpisodeResult } from '../services/graphiti';
import { RedisService } from '../services/redis';

export interface RememberResult {
  status: 'ok' | 'error';
  entityCount: number;
  relationCount: number;
  error?: string;
}

export async function remember(fact: string, source = 'agent_remember'): Promise<RememberResult> {
  if (!fact || fact.length < 10) {
    return { status: 'error', entityCount: 0, relationCount: 0, error: 'Fact too short (min 10 chars)' };
  }

  if (fact.length > 2000) {
    fact = fact.slice(0, 2000);
  }

  try {
    // 1. Записать в Graphiti (dedup + conflict resolution — внутри)
    const result = await GraphitiService.addEpisode(fact, source);

    // 2. Инвалидировать core memory block — следующий startup пересоберёт
    await RedisService.del('judy:core_memory_block');

    return {
      status: 'ok',
      entityCount: result.entityCount,
      relationCount: result.relationCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[remember] failed:`, message);
    return { status: 'error', entityCount: 0, relationCount: 0, error: message };
  }
}