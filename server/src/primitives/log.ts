import { PgService } from '../services/postgres';
import { EmbeddingService } from '../services/embeddings';

export interface LogParams {
  sessionId: string;
  agentId?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}

export async function log(params: LogParams): Promise<bigint> {
  const id = await PgService.insertMessage(params);

  // Embedding async — fire and forget
  embedAsync(id, params.content);

  return id;
}

async function embedAsync(id: bigint, content: string) {
  try {
    const embedding = await EmbeddingService.embedPassage(content);
    await PgService.updateEmbedding(id, embedding);
  } catch (err) {
    console.error(`[log] embedding failed for id=${id}:`, err);
  }
}
