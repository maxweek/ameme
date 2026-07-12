import { SQL } from 'bun';
import { CONFIG } from '../config';



export interface InsertMessageParams {
  sessionId: string;
  agentId?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}

export interface CosineSearchResult {
  id: bigint;
  sessionId: string;
  role: string;
  content: string;
  createdAt: Date;
  similarity: number;
}


class _PgService {
  sql!: InstanceType<typeof SQL>;

  constructor(url: string) {
    console.log(`[PgService] connecting to Postgres at ${url}`);
    this.sql = new SQL(url);
  }


  getDb = () => {
    return this.sql;
  }

  // ── Init Schema ───────────────────────────────────────────────

  initSchema = async () => {

    await this.sql`CREATE EXTENSION IF NOT EXISTS vector`;

    await this.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS messages (
      id          BIGSERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL,
      agent_id    TEXT NOT NULL DEFAULT '${CONFIG.agent.defaultName}',
      role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content     TEXT NOT NULL,
      channel     TEXT DEFAULT '${CONFIG.agent.defaultChannel}',
      metadata    JSONB DEFAULT '{}',
      embedding   vector(768),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

    await this.sql`
    CREATE INDEX IF NOT EXISTS idx_cm_created_at ON messages (created_at DESC)
  `;
    await this.sql`
    CREATE INDEX IF NOT EXISTS idx_cm_session ON messages (session_id)
  `;

    try {
      await this.sql`
      CREATE INDEX idx_cm_embedding_hnsw
      ON messages
      USING hnsw (embedding vector_cosine_ops)
      WHERE embedding IS NOT NULL
    `;
    } catch {
      // Index already exists
    }
  }


  // ── Insert message ───────────────────────────────────────────────

  insertMessage = async (params: InsertMessageParams): Promise<bigint> => {
    const rows = await this.sql`
    INSERT INTO messages (session_id, agent_id, role, content, channel, metadata)
    VALUES (
      ${params.sessionId},
      ${params.agentId ?? CONFIG.agent.defaultName},
      ${params.role},
      ${params.content},
      ${params.channel ?? CONFIG.agent.defaultChannel},
      ${JSON.stringify(params.metadata ?? {})}::jsonb
    )
    RETURNING id
  `;
    return rows[0].id;
  }


  // ── Update embedding ─────────────────────────────────────────────

  updateEmbedding = async (id: bigint, embedding: number[]) => {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.sql`
    UPDATE messages
    SET embedding = ${vectorStr}::vector
    WHERE id = ${id}
  `;
  }


  // ── Cosine search ────────────────────────────────────────────────

  cosineSearch = async (queryEmbedding: number[], limit = 20, maxAgeHours = 168): Promise<CosineSearchResult[]> => {
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    const rows = await this.sql`
      SELECT
        id,
        session_id,
        role,
        content,
        created_at,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM messages
      WHERE embedding IS NOT NULL
        AND created_at > now() - make_interval(hours => ${maxAgeHours})
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;

    return rows.map((r: any) => ({
      id: r.id,
      sessionId: r.session_id,
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
      similarity: parseFloat(r.similarity),
    }));
  }


  // ── Fetch messages without embedding (for backfill) ──────────────

  getWithoutEmbedding = async (limit = 50) => {
    return this.sql`
      SELECT id, content
      FROM messages
      WHERE embedding IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }


  getMessages = async (limit = 50, offset = 0) => {
    return this.sql`
    SELECT id, session_id, role, content, channel, metadata, created_at
    FROM messages
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  }


  // ── Recent messages for dreaming ─────────────────────────────────

  recentMessages = async (hours = 24) => {
    const seconds = Math.max(Math.floor(hours * 3600), 1);
    return this.sql`
    SELECT id, session_id, role, content, channel, metadata, created_at
    FROM messages
    WHERE created_at > now() - make_interval(secs => ${seconds})
    ORDER BY created_at ASC
  `;
  }

  ensureDreamingLog = async () => {
    await this.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS dreaming_log (
      id          BIGSERIAL PRIMARY KEY,
      status      TEXT NOT NULL,
      messages    INT DEFAULT 0,
      new_facts   INT DEFAULT 0,
      stale_facts INT DEFAULT 0,
      merged      INT DEFAULT 0,
      diary       BOOLEAN DEFAULT false,
      duration_ms INT DEFAULT 0,
      error       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  }
  
  insertDreamingLog = async (result: any) => {
    return this.sql`
    INSERT INTO dreaming_log (status, messages, new_facts, stale_facts, merged, diary, duration_ms, error)
    VALUES (
      ${result.status},
      ${result.messagesProcessed},
      ${result.newFacts},
      ${result.staleFacts},
      ${result.mergedNodes},
      ${result.diary},
      ${result.durationMs},
      ${result.error ?? null}
    )
    RETURNING id
  `;
  }

  getDreamingLogs = async (limit = 20) => {
    return this.sql`
    SELECT * FROM dreaming_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  }

}

export const PgService = new _PgService(CONFIG.postgres.url);

export async function clearRecentMessages() {
  const sql = PgService.getDb();
  await sql`DELETE FROM messages WHERE created_at > now() - interval '2 hours'`;
}