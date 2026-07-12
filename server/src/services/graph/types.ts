// ── Node (сущность в графе) ──────────────────────────────

export interface GraphNode {
  uuid: string;
  name: string;
  type: NodeType;
  summary: string;
  embeddingsCount?: number | null
  embedding?: number[];
  groupId: string;
  createdAt: string;
}

export type NodeType =
  | 'Person'
  | 'Project'
  | 'Technology'
  | 'Preference'
  | 'Principle'
  | 'Infrastructure'
  | 'Hardware'
  | 'Organization'
  | 'Skill'
  | 'Event'
  | 'Habit'
  | 'Place'
  | 'Health'
  | 'Goal';

export const NODE_TYPES: NodeType[] = [
  'Person', 'Project', 'Technology', 'Preference', 'Principle',
  'Infrastructure', 'Hardware', 'Organization', 'Skill', 'Event',
  'Habit', 'Place', 'Health', 'Goal',
];

// ── Edge (факт-связь между двумя узлами) ─────────────────

export interface GraphEdge {
  uuid: string;
  sourceUuid: string;
  targetUuid: string;
  name: string;
  fact: string;
  embedding?: number[];
  embeddingsCount?: number | null
  validAt: string | null;
  invalidAt: string | null;
  createdAt: string;
  groupId: string;
}

// ── Результат LLM extraction ────────────────────────────

export interface ExtractedEntity {
  name: string;
  type: NodeType;
  summary: string;
}

export interface ExtractedRelation {
  sourceName: string;
  targetName: string;
  name: string;
  fact: string;
}

export interface InvalidatedRelation {
  sourceName: string;
  targetName: string;
  name: string;
  reason: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  invalidated: InvalidatedRelation[];
}

// ── Результат поиска ────────────────────────────────────

export interface GraphSearchResult {
  type: 'node' | 'edge';
  uuid: string;
  content: string;
  score: number;
  name: string;
  validAt?: string | null;
  invalidAt?: string | null;
}

// ── Результат записи ────────────────────────────────────

export interface WriteResult {
  ok: boolean;
  nodesCreated: number;
  nodesUpdated: number;
  edgesCreated: number;
  edgesInvalidated: number;
  error?: string;
}


export const EDGE_ALIASES: Record<string, string> = {
  UTILIZES: 'USES', EMPLOYS: 'USES', WORKS_WITH: 'USES',
  RUNS_ON: 'USES', BUILT_WITH: 'USES', POWERED_BY: 'USES',
  BUILT: 'CREATED', DEVELOPED: 'CREATED', MADE: 'CREATED',
  WROTE: 'CREATED', DESIGNED: 'CREATED',
  LOVES: 'LIKES', ENJOYS: 'LIKES', FAVORS: 'LIKES',
  HATES: 'DISLIKES',
  LOCATED_IN: 'LIVES_IN', RESIDES_IN: 'LIVES_IN', BASED_IN: 'LIVES_IN',
  EMPLOYED_AT: 'WORKS_AT', HIRED_BY: 'WORKS_AT',
  QUIT: 'LEFT', RESIGNED: 'LEFT', FIRED_FROM: 'LEFT',
  STOPPED_USING: 'LEFT',
  MIGRATED_FROM: 'REPLACES', SWITCHED_FROM: 'REPLACES',
  MOVED_FROM: 'REPLACES', UPGRADED_TO: 'REPLACES',
  LEARNING: 'STUDIES', STUDYING: 'STUDIES',
  RELATED_TO: 'KNOWS', ACQUAINTED_WITH: 'KNOWS',
  PURCHASED: 'BOUGHT', HAS: 'OWNS',
  PREVIOUSLY_USED: 'USED', USED_TO: 'USED', FORMERLY: 'USED',
};


export function normalizeEdgeName(name: string): string {
  const upper = name.toUpperCase().replace(/\s+/g, '_');
  return EDGE_ALIASES[upper] ?? upper;
}