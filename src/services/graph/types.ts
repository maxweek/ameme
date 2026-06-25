// ── Node (сущность в графе) ──────────────────────────────

export interface GraphNode {
  uuid: string;
  name: string;
  type: NodeType;
  summary: string;
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
