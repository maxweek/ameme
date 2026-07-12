const API_URL = import.meta.env.VITE_API_URL || 'http://192.168.3.41:3101';

// ── Types ───────────────────────────────────────────────

export interface GraphNode {
  uuid: string;
  name: string;
  type: string;
  summary: string;
  groupId: string;
  createdAt: string;
  embeddingsCount?: number | null
}

export interface GraphEdge {
  uuid: string;
  sourceUuid: string;
  targetUuid: string;
  name: string;
  fact: string;
  validAt: string | null;
  invalidAt: string | null;
  createdAt: string;
  groupId: string;
  embeddingsCount?: number | null
}

export interface SearchResult {
  source: 'fact' | 'conversation';
  content: string;
  score: number;
  name?: string;
  timestamp?: string;
}

export interface RememberResult {
  ok: boolean;
  nodesCreated: number;
  nodesUpdated: number;
  edgesCreated: number;
  edgesInvalidated: number;
  error?: string;
}

export interface DreamingResult {
  status: 'ok' | 'skipped' | 'error';
  messagesProcessed: number;
  newFacts: number;
  staleFacts: number;
  mergedNodes: number;
  diary: boolean;
  durationMs: number;
  error?: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  channel: string;
  metadata: any;
  created_at: string;
}

export interface OpLogEntry {
  id: string;
  timestamp: string;
  operation: 'search' | 'remember' | 'dreaming' | 'startup';
  input: any;
  result: any;
  durationMs: number;
}

export interface DocGraphNode {
  id: string;
  name: string;
  folder: string;
}

export interface DocGraphLink {
  source: string;
  target: string;
}

export interface DocGraph {
  nodes: DocGraphNode[];
  links: DocGraphLink[];
}

export interface DreamingProgress {
  phase: string;
  message: string;
  progress: number;
}

export interface DreamingLogEntry {
  id: string;
  status: string;
  messages: number;
  new_facts: number;
  stale_facts: number;
  merged: number;
  diary: boolean;
  duration_ms: number;
  error: string | null;
  created_at: string;
}

// ── API calls ───────────────────────────────────────────

export const memoryApi = {

  async getGraph(includeInvalid = false): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const res = await fetch(`${API_URL}/api/graph?includeInvalid=${includeInvalid}`);
    return res.json();
  },

  async search(query: string, limit = 8): Promise<SearchResult[]> {
    const res = await fetch(`${API_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    const data = await res.json();
    return data.results;
  },

  async remember(fact: string): Promise<RememberResult> {
    const res = await fetch(`${API_URL}/api/remember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact }),
    });
    return res.json();
  },

  async getStartup(userId = 'default'): Promise<string> {
    const res = await fetch(`${API_URL}/api/startup?userId=${userId}`);
    const data = await res.json();
    return data.block;
  },

  async triggerDreaming(hours = 24): Promise<DreamingResult> {
    const res = await fetch(`${API_URL}/api/dreaming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours }),
    });
    return res.json();
  },

  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const res = await fetch(`${API_URL}/health`);
    return res.json();
  },

  async getMessages(limit = 50, offset = 0): Promise<Message[]> {
    const res = await fetch(`${API_URL}/api/messages?limit=${limit}&offset=${offset}`);
    const data = await res.json();
    return data.messages;
  },

  async getObsidianList(prefix?: string): Promise<string[]> {
    const params = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
    const res = await fetch(`${API_URL}/api/obsidian/list${params}`);
    const data = await res.json();
    return data.docs;
  },

  async getObsidianDoc(path: string): Promise<{ content: string, path: string } | null> {
    const res = await fetch(`${API_URL}/api/obsidian/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    return data;
  },

  async getOpLog(limit = 50): Promise<OpLogEntry[]> {
    const res = await fetch(`${API_URL}/api/oplog?limit=${limit}`);
    const data = await res.json();
    return data.entries;
  },

  async getObsidianGraph(): Promise<DocGraph> {
    const res = await fetch(`${API_URL}/api/obsidian/graph`);
    return res.json();
  },

  async getDreamingHistory(limit = 20): Promise<DreamingLogEntry[]> {
    const res = await fetch(`${API_URL}/api/dreaming/history?limit=${limit}`);
    const data = await res.json();
    return data.logs;
  },
};