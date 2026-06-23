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

  addEpisode = async (fact: string, source: string = 'agent_remember'): Promise<AddEpisodeResult> => {
    const result = await this.call('add_memory', {
      name: fact.slice(0, 100),
      episode_body: fact,
      source: source,
      source_description: source,
      group_id: this.groupId,
      reference_time: new Date().toISOString(),
    });
    console.log(`[GraphitiService] addEpisode result:`, result);
    return {
      entityCount: result?.entity_count ?? 0,
      relationCount: result?.relation_count ?? 0,
    };
  }


  // -- Поиск узлов (семантический) --------------------------------------

  searchNodes = async (query: string, limit = 10): Promise<GraphitiNode[]> => {
    const result = await this.call('search_nodes', {
      query,
      group_ids: [this.groupId],
      num_results: limit,
    });
    if (!Array.isArray(result)) return [];
    return result.map((n: any) => ({
      uuid: n.uuid,
      name: n.name,
      summary: n.summary ?? '',
      labels: n.labels ?? [],
    }));
  }


  // -- Поиск фактов (spreading activation если есть center_node) --------------------------------------

  searchFacts = async (query: string, limit = 10, centerNodeUuid?: string): Promise<GraphitiFact[]> => {
    const args: Record<string, unknown> = {
      query,
      group_ids: [this.groupId],
      num_results: limit,
    };
    if (centerNodeUuid) {
      args.center_node_uuid = centerNodeUuid;
    }
    const result = await this.call('search_facts', args);
    if (!Array.isArray(result)) return [];
    return result.map((f: any) => ({
      uuid: f.uuid,
      fact: f.fact ?? f.name ?? '',
      validAt: f.valid_at ?? null,
      invalidAt: f.invalid_at ?? null,
    }));
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

    // MCP возвращает content как массив блоков
    if (response.content && Array.isArray(response.content)) {
      const textBlock = response.content.find((b: any) => b.type === 'text');
      if (textBlock?.text) {
        try {
          return JSON.parse(textBlock.text);
        } catch {
          return textBlock.text;
        }
      }
    }
    return response.content;
  }
}

export const GraphitiService = new _GraphitiService(
  CONFIG.graphiti.mcpUrl,
  CONFIG.graphiti.groupId,
);