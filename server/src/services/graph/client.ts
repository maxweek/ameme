import { FalkorDB, type Graph } from 'falkordb';
import { CONFIG } from '../../config';
import type { GraphNode, GraphEdge } from './types';

class _GraphClient {
  private db: FalkorDB | null = null;
  private graph: Graph | null = null;

  connect = async () => {
    this.db = await FalkorDB.connect({
      socket: {
        host: CONFIG.falkordb.host,
        port: CONFIG.falkordb.port,
      },
      password: CONFIG.falkordb.password || undefined,
    });
    this.graph = this.db.selectGraph(CONFIG.falkordb.database);
    console.log(`[graph] Connected to FalkorDB ${CONFIG.falkordb.host}:${CONFIG.falkordb.port}, graph: ${CONFIG.falkordb.database}`);
  }

  close = async () => {
    if (this.db) await this.db.close();
  }

  // ── Nodes ─────────────────────────────────────────────

  createNode = async (node: Omit<GraphNode, 'uuid' | 'createdAt'>): Promise<string> => {
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.query(`
      CREATE (n:${node.type} {
        uuid: $uuid,
        name: $name,
        summary: $summary,
        group_id: $groupId,
        created_at: $now
      })
    `, { uuid, name: node.name, summary: node.summary, groupId: node.groupId, now } as Record<string, any>);
    return uuid;
  }

  updateNodeSummary = async (uuid: string, summary: string) => {
    await this.query(`
      MATCH (n {uuid: $uuid})
      SET n.summary = $summary
    `, { uuid, summary } as Record<string, any>);
  }

  setNodeEmbedding = async (uuid: string, embedding: number[]) => {
    await this.query(`
      MATCH (n {uuid: $uuid})
      SET n.embedding = $embedding
    `, { uuid, embedding } as Record<string, any>);
  }

  findNodeByName = async (name: string, groupId: string): Promise<GraphNode | null> => {
    const result = await this.roQuery(`
      MATCH (n {name: $name, group_id: $groupId})
      RETURN n
      LIMIT 1
    `, { name, groupId } as Record<string, any>);
    if (!result.data || result.data.length === 0) return null;
    return this.parseNode(result.data[0] as any);
  }

  findNodeByUuid = async (uuid: string): Promise<GraphNode | null> => {
    const result = await this.roQuery(`
      MATCH (n {uuid: $uuid})
      RETURN n
      LIMIT 1
    `, { uuid } as Record<string, any>);
    if (!result.data || result.data.length === 0) return null;
    return this.parseNode(result.data[0] as any);
  }

  // ── Edges ─────────────────────────────────────────────

  createEdge = async (edge: Omit<GraphEdge, 'uuid' | 'createdAt'>): Promise<string> => {
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.query(`
      MATCH (a {uuid: $sourceUuid}), (b {uuid: $targetUuid})
      CREATE (a)-[r:${edge.name} {
        uuid: $uuid,
        fact: $fact,
        group_id: $groupId,
        valid_at: $validAt,
        invalid_at: $invalidAt,
        created_at: $now
      }]->(b)
    `, {
      uuid,
      sourceUuid: edge.sourceUuid,
      targetUuid: edge.targetUuid,
      fact: edge.fact,
      groupId: edge.groupId,
      validAt: edge.validAt,
      invalidAt: edge.invalidAt,
      now,
    } as Record<string, any>);
    return uuid;
  }

  setEdgeEmbedding = async (uuid: string, embedding: number[]) => {
    await this.query(`
      MATCH ()-[r {uuid: $uuid}]->()
      SET r.embedding = $embedding
    `, { uuid, embedding } as Record<string, any>);
  }

  invalidateEdge = async (uuid: string) => {
    const now = new Date().toISOString();
    await this.query(`
      MATCH ()-[r {uuid: $uuid}]->()
      SET r.invalid_at = $now
    `, { uuid, now } as Record<string, any>);
  }

  findEdgesByNodes = async (sourceUuid: string, targetUuid: string, groupId: string): Promise<GraphEdge[]> => {
    const result = await this.roQuery(`
      MATCH (a {uuid: $sourceUuid})-[r]->(b {uuid: $targetUuid})
      WHERE r.group_id = $groupId AND r.invalid_at IS NULL
      RETURN r, type(r) AS relType
    `, { sourceUuid, targetUuid, groupId } as Record<string, any>);
    return this.parseEdges(result.data, sourceUuid, targetUuid);
  }

  // ── Traversal ─────────────────────────────────────────

  getNeighbours = async (uuid: string, maxHops = 2): Promise<GraphEdge[]> => {
    const result = await this.roQuery(`
      MATCH (center {uuid: $uuid})-[r*1..${maxHops}]-(neighbour)
      WITH r AS rels
      UNWIND rels AS rel
      WITH DISTINCT rel
      MATCH (a)-[rel]->(b)
      WHERE rel.invalid_at IS NULL
      RETURN rel, type(rel) AS relType, a.uuid AS sourceUuid, b.uuid AS targetUuid
    `, { uuid } as Record<string, any>);

    if (!result.data) return [];
    return (result.data as any[]).map(row => {
      const r = row.rel?.properties ?? row.rel ?? {};
      return {
        uuid: r.uuid ?? '',
        sourceUuid: row.sourceUuid ?? '',
        targetUuid: row.targetUuid ?? '',
        name: row.relType ?? '',
        fact: r.fact ?? '',
        groupId: r.group_id ?? '',
        validAt: r.valid_at ?? null,
        invalidAt: r.invalid_at ?? null,
        embeddingsCount: r.embedding?.length ?? null,
        createdAt: r.created_at ?? '',
      };
    });
  }

  // ── All nodes/edges ───────────────────────────────────

  getAllNodes = async (groupId: string): Promise<GraphNode[]> => {
    const result = await this.roQuery(`
      MATCH (n {group_id: $groupId})
      RETURN n
    `, { groupId } as Record<string, any>);
    if (!result.data) return [];
    return (result.data as any[]).map(row => this.parseNode(row));
  }

  getAllEdges = async (groupId: string, onlyValid = true): Promise<GraphEdge[]> => {
    const filter = onlyValid ? 'AND r.invalid_at IS NULL' : '';
    const result = await this.roQuery(`
      MATCH (a)-[r]->(b)
      WHERE r.group_id = $groupId ${filter}
      RETURN r, type(r) AS relType, a.uuid AS sourceUuid, b.uuid AS targetUuid
    `, { groupId } as Record<string, any>);

    if (!result.data) return [];
    
    return (result.data as any[]).map(row => {
      const r = row.r?.properties ?? row.r ?? {};
      return {
        uuid: r.uuid ?? '',
        sourceUuid: row.sourceUuid ?? '',
        targetUuid: row.targetUuid ?? '',
        name: row.relType ?? '',
        fact: r.fact ?? '',
        embeddingsCount: r.embedding?.length ?? null,
        groupId: r.group_id ?? '',
        validAt: r.valid_at ?? null,
        invalidAt: r.invalid_at ?? null,
        createdAt: r.created_at ?? '',
      };
    });
  }

  // ── Raw query ─────────────────────────────────────────

  query = async (cypher: string, params: Record<string, unknown> = {}) => {
    if (!this.graph) throw new Error('GraphClient not connected. Call connect() first.');
    return this.graph.query(cypher, { params: params as Record<string, any> });
  }

  roQuery = async (cypher: string, params: Record<string, unknown> = {}) => {
    if (!this.graph) throw new Error('GraphClient not connected. Call connect() first.');
    return this.graph.roQuery(cypher, { params: params as Record<string, any> });
  }

  // ── Internal parsers ──────────────────────────────────

  private parseNode = (row: any): GraphNode => {
    const n = row.n?.properties ?? row.n ?? {};
    const labels = row.n?.labels ?? [];
    return {
      uuid: n.uuid ?? '',
      name: n.name ?? '',
      embeddingsCount: n.embedding?.length ?? null,
      type: labels[0] ?? 'Unknown',
      summary: n.summary ?? '',
      groupId: n.group_id ?? '',
      createdAt: n.created_at ?? '',
    };
  }

  private parseEdges = (data: unknown[] | undefined, sourceUuid: string, targetUuid: string): GraphEdge[] => {
    if (!data) return [];
    return (data as any[]).map(row => {
      const r = row.r?.properties ?? row.r ?? {};
      return {
        uuid: r.uuid ?? '',
        sourceUuid,
        targetUuid,
        name: row.relType ?? '',
        fact: r.fact ?? '',
        groupId: r.group_id ?? '',
        validAt: r.valid_at ?? null,
        invalidAt: r.invalid_at ?? null,
        createdAt: r.created_at ?? '',
      };
    });
  }
}

export const GraphClient = new _GraphClient();
