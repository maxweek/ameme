import { PgService } from '../services/postgres';
import { EmbeddingService } from '../services/embeddings';

async function run() {
  console.log('[backfill] Starting...');

  await PgService.initSchema();

  const rows = await PgService.getWithoutEmbedding(50);
  if (!rows.length) {
    console.log('[backfill] Nothing to backfill');
    process.exit(0);
  }

  console.log(`[backfill] Found ${rows.length} messages without embedding`);

  let success = 0;
  let failed = 0;

  for (const row of rows as any[]) {
    try {
      const embedding = await EmbeddingService.embedPassage(row.content);
      await PgService.updateEmbedding(row.id, embedding);
      success++;
    } catch (err) {
      console.error(`[backfill] Failed id=${row.id}:`, err);
      failed++;
    }
  }

  console.log(`[backfill] Done: ${success} success, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});