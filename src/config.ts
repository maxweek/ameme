// src/config.ts
// Bun auto-loads .env, no dotenv needed

export const CONFIG = {
  agent: {
    defaultName: process.env.AGENT_DEFAULT_NAME || 'judy',
    defaultChannel: process.env.AGENT_DEFAULT_CHANNEL || 'webchat',
  },
  postgres: {
    url: process.env.DATABASE_URL || 'postgres://judy:password@192.168.3.40:5432/judy',
    db: process.env.POSTGRES_DB || 'judy',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://:password@192.168.3.40:6379',
  },
  embedding: {
    url: process.env.EMBEDDING_URL || 'http://192.168.3.40:7997',
  },
  graphiti: {
    mcpUrl: process.env.GRAPHITI_MCP_URL || 'http://192.168.3.40:8000/mcp/',
    groupId: process.env.GRAPHITI_GROUP_ID || 'judy',
  },
  couchdb: {
    url: process.env.COUCHDB_URL || 'http://192.168.3.40:5984',
    db: process.env.COUCHDB_DB || 'obsidian',
    user: process.env.COUCHDB_USER || 'admin',
    password: process.env.COUCHDB_PASSWORD || 'password',
  },
  dreaming: {
    model: process.env.DREAMING_MODEL || 'deepseek/deepseek-v4-pro',
    apiUrl: process.env.DREAMING_API_URL || 'https://api.deepseek.com/v1',
    apiKey: process.env.DREAMING_API_KEY || '',
  },
  mcp: {
    port: parseInt(process.env.MCP_PORT || '3100'),
  },
} as const;