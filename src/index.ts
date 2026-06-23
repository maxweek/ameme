console.log("Hello, world!");


import { FastMCP } from "fastmcp";
import { z } from "zod";
import { CONFIG } from "./config";
import { search } from "./primitives/search";
import { remember } from "./primitives/remember";
import { startup } from "./primitives/startup";
import { PgService } from "./services/postgres";
import { GraphitiService } from "./services/graphiti";
import { log } from "./primitives/log";

const server = new FastMCP({
  name: "demo",
  version: "1.0.0",

});



server.addTool({
  name: 'memory_search',
  description: `Поиск по памяти. Используй ОБЯЗАТЕЛЬНО когда:
- пользователь ссылается на прошлое ("мы обсуждали", "помнишь", "как в прошлый раз")
- спрашивает "мы это делали?" / "что решили?"
- ты не уверена в факте о пользователе или его проектах
НИКОГДА не говори "я не помню" без вызова этого инструмента.`,
  parameters: z.object({
    query: z.string().describe('Что искать — ключевые слова или вопрос'),
    limit: z.number().optional().default(8).describe('Кол-во результатов (1-20)'),
  }),
  execute: async ({ query, limit }) => {
    const results = await search(query, limit);
    if (results.length === 0) return 'Ничего не найдено.';

    return results
      .map((r, i) => {
        const icon = r.source === 'fact' ? '📊' : '💬';
        const time = r.timestamp ? ` [${r.timestamp}]` : '';
        return `${i + 1}. ${icon} ${r.content}${time}`;
      })
      .join('\n');
  },
});


server.addTool({
  name: 'memory_remember',
  description: `Запомнить факт. Используй когда:
- пользователь сообщает решение, предпочтение или новый факт о себе
- пользователь корректирует старый факт
- принято важное техническое решение
НЕ запоминай: эмоции момента, временные конфиги, то что уже известно.`,
  parameters: z.object({
    fact: z.string().describe('Факт для запоминания — естественным языком'),
  }),
  execute: async ({ fact }) => {
    const result = await remember(fact);
    if (result.status === 'error') return `Ошибка: ${result.error}`;
    return `Запомнила. Entities: ${result.entityCount}, relations: ${result.relationCount}`;
  },
});

server.addTool({
  name: 'memory_startup',
  description: 'Получить контекст памяти. Вызывается автоматически при старте сессии.',
  parameters: z.object({}),
  execute: async () => {
    return startup();
  },
});

server.addTool({
  name: 'memory_log',
  description: 'Внутренний: логирование сообщения. Не для агента.',
  parameters: z.object({
    sessionId: z.string(),
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string(),
    channel: z.string().optional(),
    agentId: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  execute: async (params) => {
    const id = await log(params);
    return `Logged: ${id}`;
  },
});


async function main() {
  console.log('[ameme] Initializing...');

  // Schema
  await PgService.initSchema();
  console.log('[ameme] Postgres schema ready');

  // Graphiti connection
  await GraphitiService.connect();
  console.log('[ameme] Graphiti connected');

  // Start MCP server
  server.start({
    transportType: 'httpStream',
    httpStream: {
      port: CONFIG.mcp.port,
    },
  });

  console.log(`[ameme] MCP server running on port ${CONFIG.mcp.port}`);
}

main().catch((err) => {
  console.error('[ameme] Fatal:', err);
  process.exit(1);
});


console.log(CONFIG)