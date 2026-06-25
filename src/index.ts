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
import { ensureGraphSchema, GraphClient } from "./services/graph";

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
    if (results.length === 0) return 'Ничего не найдено в памяти.';

    return results
      .map((r, i) => {
        const icon = r.source === 'fact' ? '📊' : '💬';
        const time = r.timestamp ? ` [${r.timestamp}]` : '';
        const score = ` (${(r.score * 100).toFixed(0)}%)`;
        return `${i + 1}. ${icon} ${r.content}${time}${score}`;
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
    fact: z.string().describe('Факт для запоминания — естественным языком, подробно'),
  }),
  execute: async ({ fact }) => {
    const result = await remember(fact);
    if (!result.ok) return `Ошибка: ${result.error}`;

    const parts = [];
    if (result.nodesCreated) parts.push(`узлов создано: ${result.nodesCreated}`);
    if (result.nodesUpdated) parts.push(`узлов обновлено: ${result.nodesUpdated}`);
    if (result.edgesCreated) parts.push(`связей создано: ${result.edgesCreated}`);
    if (result.edgesInvalidated) parts.push(`фактов устарело: ${result.edgesInvalidated}`);

    return parts.length > 0
      ? `Запомнила. ${parts.join(', ')}.`
      : 'Запомнила, но новых сущностей не извлечено.';
  },
});

server.addTool({
  name: 'memory_startup',
  description: 'Получить контекст памяти. Вызывается при старте сессии.',
  parameters: z.object({
    userId: z.string().optional().describe('ID пользователя'),
  }),
  execute: async ({ userId }) => {
    return startup({ userId });
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

server.addTool({
  name: 'memory_graph',
  description: 'Показать все узлы и связи в графе памяти. Для обзора, дебага и визуализации.',
  parameters: z.object({
    includeInvalid: z.boolean().optional().default(false).describe('Показать устаревшие факты'),
  }),
  execute: async ({ includeInvalid }) => {
    const groupId = CONFIG.falkordb.database;

    const [nodes, edges] = await Promise.all([
      GraphClient.getAllNodes(groupId),
      GraphClient.getAllEdges(groupId, !includeInvalid),
    ]);

    if (nodes.length === 0) return 'Граф пуст.';

    const lines: string[] = [];

    lines.push(`=== УЗЛЫ (${nodes.length}) ===`);
    for (const node of nodes) {
      lines.push(`• [${node.type}] ${node.name}: ${node.summary}`);
    }

    lines.push('');
    lines.push(`=== СВЯЗИ (${edges.length}) ===`);
    for (const edge of edges) {
      const sourceName = nodes.find(n => n.uuid === edge.sourceUuid)?.name ?? edge.sourceUuid;
      const targetName = nodes.find(n => n.uuid === edge.targetUuid)?.name ?? edge.targetUuid;
      const status = edge.invalidAt ? ' ❌' : '';
      lines.push(`• ${sourceName} —[${edge.name}]→ ${targetName}: ${edge.fact}${status}`);
    }

    return lines.join('\n');
  },
});

async function main() {
  console.log('[ameme] Initializing...');

  // Schema
  await PgService.initSchema();
  console.log('[ameme] Postgres schema ready');


  await GraphClient.connect();
  await ensureGraphSchema();
  console.log('[ameme] FalkorDB ready');

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