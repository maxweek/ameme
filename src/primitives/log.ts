import { EmbeddingService } from '../services/embeddings';
import { PgService, type InsertMessageParams } from '../services/postgres';

export interface LogParams {
  sessionId: string;
  agentId?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}

/** Записать сообщение и асинхронно посчитать embedding */
export async function log(params: LogParams): Promise<bigint> {
  // 1. Insert verbatim — не блокируем
  const id = await PgService.insertMessage(params);

  // 2. Embedding async — fire and forget
  embedAsync(id, params.content);

  return id;
}

async function embedAsync(id: bigint, content: string) {
  try {
    const embedding = await EmbeddingService.embedPassage(content);
    await PgService.updateEmbedding(id, embedding);
  } catch (err) {
    console.error(`[log] embedding failed for id=${id}:`, err);
    // Backfill cron подберёт позже
  }
}