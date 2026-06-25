import { GraphClient } from './client';
import { NODE_TYPES } from './types';

export async function ensureGraphSchema() {
  for (const type of NODE_TYPES) {
    await safeIndex(`CREATE INDEX FOR (n:${type}) ON (n.uuid)`);
    await safeIndex(`CREATE INDEX FOR (n:${type}) ON (n.name)`);
    await safeIndex(`CREATE INDEX FOR (n:${type}) ON (n.group_id)`);
  }

  console.log(`[graph] Schema indices ready (${NODE_TYPES.length} types)`);
}

async function safeIndex(cypher: string) {
  try {
    await GraphClient.query(cypher);
  } catch {
    // Index already exists
  }
}
