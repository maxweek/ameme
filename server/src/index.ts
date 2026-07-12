
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { CONFIG } from "./config";
import { search } from "./primitives/search";
import { remember } from "./primitives/remember";
import { startup } from "./primitives/startup";
import { PgService } from "./services/postgres";
import { GraphitiService } from "./services/graphiti";
import { log, type LogParams } from "./primitives/log";
import { ensureGraphSchema, GraphClient } from "./services/graph";
import { ObsidianService } from "./services/obsidian";
import { dreaming } from "./primitives/dreaming";
import { EventBus } from "./services/events";
import { OpLog } from "./services/oplog";

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
  await PgService.ensureDreamingLog();

  console.log('[ameme] Postgres schema ready');

  await ObsidianService.ensureDb();

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


const httpServer = Bun.serve({
  port: CONFIG.mcp.port + 1,

  websocket: {
    open(ws) { EventBus.addClient(ws); },
    close(ws) { EventBus.removeClient(ws); },
    message() { },  // фронт не шлёт — только слушает
  },

  async fetch(req, server) {
    const url = new URL(req.url);
    console.log(`[http] ${req.method} ${url.pathname}`);

    // WebSocket upgrade
    if (url.pathname === '/ws') {

      console.log(`[ws] Upgrade request from ${req.headers.get('origin')}`);
      const upgraded = server.upgrade(req);
      if (!upgraded) return new Response('WebSocket upgrade failed', { status: 400 });
      return undefined as any;
    }

    // CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Health
    if (url.pathname === '/health') {
      return json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Log (for OpenClaw)
    if (url.pathname === '/log' && req.method === 'POST') {
      try {
        const body = await req.json() as LogParams;
        const id = await log(body);
        return json({ ok: true, id: String(id) });
      } catch (err) {
        return json({ ok: false, error: errMsg(err) }, 400);
      }
    }

    // ── Frontend API ─────────────────────────────────

    // Graph: all nodes + edges
    if (url.pathname === '/api/graph') {
      const groupId = CONFIG.falkordb.database;
      const includeInvalid = url.searchParams.get('includeInvalid') === 'true';
      const [nodes, edges] = await Promise.all([
        GraphClient.getAllNodes(groupId),
        GraphClient.getAllEdges(groupId, !includeInvalid),
      ]);
      return json({ nodes, edges });
    }

    // Search
    if (url.pathname === '/api/search' && req.method === 'POST') {
      try {
        const t0 = Date.now();
        const { query, limit } = await req.json() as { query: string; limit?: number };
        const results = await search(query, limit ?? 8);

        // Emit для фронта
        const groupId = CONFIG.falkordb.database;
        const allNodes = await GraphClient.getAllNodes(groupId);
        const matchedNodeIds = allNodes
          .filter(n => results.some(r => r.content.includes(n.name)))
          .map(n => n.uuid);

        OpLog.add({
          operation: 'search',
          input: { query, limit },
          result: { count: results.length, results },
          durationMs: Date.now() - t0,
        });
        EventBus.emit({ type: 'oplog', entry: OpLog.getRecent(1)[0] });

        EventBus.emit({
          type: 'search',
          nodeIds: matchedNodeIds,
          edgeKeys: [],
          query,
        });


        return json({ results });
      } catch (err) {
        return json({ error: errMsg(err) }, 400);
      }
    }

    // Remember
    if (url.pathname === '/api/remember' && req.method === 'POST') {
      try {
        const t0 = Date.now();
        const { fact } = await req.json() as { fact: string };

        const nodesBefore = await GraphClient.getAllNodes(CONFIG.falkordb.database);
        const result = await remember(fact);

        if (result.ok) {
          const nodesAfter = await GraphClient.getAllNodes(CONFIG.falkordb.database);
          const edgesAfter = await GraphClient.getAllEdges(CONFIG.falkordb.database, true);
          const beforeIds = new Set(nodesBefore.map(n => n.uuid));

          const newNodes = nodesAfter.filter(n => !beforeIds.has(n.uuid));
          const updatedIds = nodesAfter
            .filter(n => beforeIds.has(n.uuid))
            .filter(n => {
              const old = nodesBefore.find(o => o.uuid === n.uuid);
              return old && old.summary !== n.summary;
            })
            .map(n => n.uuid);


          OpLog.add({
            operation: 'remember',
            input: { fact },
            result,
            durationMs: Date.now() - t0,
          });
          EventBus.emit({ type: 'oplog', entry: OpLog.getRecent(1)[0] });

          EventBus.emit({
            type: 'remember',
            nodesCreated: newNodes,
            nodesUpdated: updatedIds,
            edgesCreated: edgesAfter.slice(-result.edgesCreated),
            edgesInvalidated: [],
          });

          EventBus.emit({ type: 'graph_updated' });
        }

        return json(result);
      } catch (err) {
        return json({ error: errMsg(err) }, 400);
      }
    }

    // Startup / core memory block
    if (url.pathname === '/api/startup') {
      const userId = url.searchParams.get('userId') ?? 'default';
      const block = await startup({ userId });
      return json({ block });
    }

    if (url.pathname === '/api/dreaming/history') {
      const limit = parseInt(url.searchParams.get('limit') ?? '20');
      const logs = await PgService.getDreamingLogs(limit);
      return json({ logs });
    }

    // Dreaming (manual trigger)
    if (url.pathname === '/api/dreaming' && req.method === 'POST') {
      try {
        const t0 = Date.now();

        const { hours } = await req.json() as { hours?: number };
        const result = await dreaming(hours ?? 24);

        await PgService.insertDreamingLog(result);

        OpLog.add({
          operation: 'dreaming',
          input: { hours },
          result,
          durationMs: Date.now() - t0,
        });
        EventBus.emit({ type: 'oplog', entry: OpLog.getRecent(1)[0] });

        return json(result);
      } catch (err) {
        return json({ error: errMsg(err) }, 400);
      }
    }


    // ── Verbatim messages ───────────────────────────

    if (url.pathname === '/api/messages') {
      const limit = parseInt(url.searchParams.get('limit') ?? '50');
      const offset = parseInt(url.searchParams.get('offset') ?? '0');
      const rows = await PgService.getMessages(limit, offset);
      return json({ messages: rows });
    }

    // ── Obsidian documents ──────────────────────────

    if (url.pathname === '/api/obsidian/list') {
      const prefix = url.searchParams.get('prefix') ?? undefined;
      const docs = await ObsidianService.list(prefix);
      return json({ docs });
    }

    if (url.pathname === '/api/obsidian/read' && req.method === 'POST') {
      const { path } = await req.json() as { path: string };
      const result = await ObsidianService.read(path);
      return json(result ?? { path, content: null });
    }

    if (url.pathname === '/api/obsidian/graph') {
      const graph = await ObsidianService.getDocGraph();
      return json(graph);
    }

    // ── Operation log ───────────────────────────────

    if (url.pathname === '/api/oplog') {
      const limit = parseInt(url.searchParams.get('limit') ?? '50');
      return json({ entries: OpLog.getRecent(limit) });
    }

    return new Response('Not found', { status: 404 });
  },
});

function json(data: any, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders(),
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}


console.log(`Listening on ${httpServer.hostname}:${httpServer.port}`);
