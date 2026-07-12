import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CONFIG } from '../config';

export interface GraphitiNode {
  uuid: string;
  name: string;
  summary: string;
  labels: string[];
}

export interface GraphitiFact {
  uuid: string;
  fact: string;
  validAt: string | null;
  invalidAt: string | null;
}

export interface GraphitiResult<T> {
  ok: boolean;
  data: T | null;
  error?: string;
}

export interface AddEpisodeResult {
  entityCount: number;
  relationCount: number;
}

class _GraphitiService {
  private client: Client | null = null;
  private mcpUrl: string;
  private groupId: string;

  constructor(mcpUrl: string, groupId: string) {
    this.mcpUrl = mcpUrl;
    this.groupId = groupId;
  }


  // -- Подключиться к Graphiti MCP (вызвать при старте) --------------------------------------

  connect = async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL(this.mcpUrl),
    );
    this.client = new Client({
      name: 'ameme',
      version: '1.0.0',
    });
    await this.client.connect(transport);
  }


  // -- Добавить эпизод (remember / dreaming) --------------------------------------


  addEpisode = async (fact: string, source = 'agent_remember'): Promise<GraphitiResult<{ message: string }>> => {
    try {
      const result = await this.call('add_memory', {
        name: fact.slice(0, 100),
        episode_body: fact,
        source_description: source,
        source: 'text',
        group_id: this.groupId,
        reference_time: new Date().toISOString(),
      });
      return { ok: true, data: { message: result?.message ?? 'Queued' } };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  }


  // -- Поиск узлов (семантический) --------------------------------------

  searchNodes = async (query: string, limit = 10): Promise<GraphitiResult<GraphitiNode[]>> => {
    try {
      const result = await this.call('search_nodes', {
        query,
        group_ids: [this.groupId],
        max_nodes: limit,
      });
      const nodes = (result?.nodes ?? []).map((n: any) => ({
        uuid: n.uuid,
        name: n.name,
        summary: n.summary ?? '',
        labels: n.labels ?? [],
      }));
      return { ok: true, data: nodes };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  }


  // -- Поиск фактов (spreading activation если есть center_node) --------------------------------------

  searchFacts = async (query: string, limit = 10, centerNodeUuid?: string): Promise<GraphitiResult<GraphitiFact[]>> => {
    try {
      const args: Record<string, unknown> = {
        query,
        group_ids: [this.groupId],
        max_facts: limit,
      };
      if (centerNodeUuid) args.center_node_uuid = centerNodeUuid;

      const result = await this.call('search_memory_facts', args);
      const facts = (result?.facts ?? []).map((f: any) => ({
        uuid: f.uuid,
        fact: f.fact ?? f.name ?? '',
        validAt: f.valid_at ?? null,
        invalidAt: f.invalid_at ?? null,
      }));
      return { ok: true, data: facts };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
    }
  }


  // -- Низкоуровневый вызов MCP tool --------------------------------------

  private call = async (toolName: string, args: Record<string, unknown>): Promise<any> => {
    if (!this.client) {
      throw new Error('GraphitiService not connected. Call connect() first.');
    }

    const response = await this.client.callTool({
      name: toolName,
      arguments: args,
    });

    console.log(`[GraphitiService] callTool ${toolName} response:`, response);

    if (response.isError) {
      const errorText = Array.isArray(response.content)
        ? response.content.find((b: any) => b.type === 'text')?.text ?? 'Unknown error'
        : 'Unknown error';
      throw new Error(`Graphiti ${toolName}: ${errorText}`);
    }

    // structuredContent уже распарсен — используем его
    if (response.structuredContent?.result) {
      return response.structuredContent.result;
    }

    // Fallback на text block
    if (response.content && Array.isArray(response.content)) {
      const textBlock = response.content.find((b: any) => b.type === 'text');
      if (textBlock?.text) {
        try { return JSON.parse(textBlock.text); }
        catch { return textBlock.text; }
      }
    }

    return null;
  }
}

export const GraphitiService = new _GraphitiService(
  CONFIG.graphiti.mcpUrl,
  CONFIG.graphiti.groupId,
);