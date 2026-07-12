import { makeAutoObservable, runInAction } from 'mobx';
import { memoryApi, type GraphNode, type GraphEdge, type SearchResult, type RememberResult, type DreamingResult, type Message, type OpLogEntry, type DocGraph, type DreamingProgress, type DreamingLogEntry } from '../api/memory';
import { ACTIVATION_FADE_DELAY, ACTIVATION_HOLD_DURATION, ACTIVATION_WAVE_DELAY } from '../components/graph/constants';

export class _MemoryStore {
  // Graph
  nodes: GraphNode[] = [];
  edges: GraphEdge[] = [];
  graphLoading = false;
  showInvalid = false;

  // Activation (synapse pulse)
  activatedNodeIds: Set<string> = new Set();
  activatedEdgeKeys: Set<string> = new Set();
  pulseQueue: Array<{ nodeIds: string[]; edgeKeys: string[] }> = [];
  isPulsing = false;

  selectedNodeId: string | null = null;
  selectedEdgeKey: string | null = null;

  // Search
  searchQuery = '';
  searchResults: SearchResult[] = [];
  searchLoading = false;

  // Remember
  rememberLoading = false;
  lastRememberResult: RememberResult | null = null;

  // Startup
  coreMemoryBlock = '';
  startupLoading = false;

  // Dreaming
  dreamingLoading = false;
  lastDreamingResult: DreamingResult | null = null;

  dreamingProgress: DreamingProgress | null = null;
  dreamingHistory: DreamingLogEntry[] = [];
  dreamingHistoryLoading = false;

  activationVersion = 0

  messages: Message[] = [];
  messagesLoading = false;

  obsidianDocs: string[] = [];
  obsidianContent: string | null = null;
  obsidianContentPath: string | null = null;
  obsidianLoading = false;
  obsidianDocLoading = false;

  obsidianDocGraph: DocGraph = { nodes: [], links: [] };
  obsidianDocGraphLoading = false;


  opLog: OpLogEntry[] = [];
  opLogLoading = false;



  // Health
  serverStatus: 'ok' | 'error' | 'unknown' = 'unknown';

  constructor() {
    makeAutoObservable(this, {
      activatedNodeIds: false,
      // activatedEdgeKeys: false,
    });
  }

  setSelectedNode = (nodeId: string | null) => {
    this.selectedNodeId = nodeId;
  }

  setSelectedEdge = (edgeKey: string | null) => {
    this.selectedEdgeKey = edgeKey;
  }

  // ── Graph ─────────────────────────────────────────

  loadGraph = async () => {
    this.graphLoading = true;
    try {
      const { nodes, edges } = await memoryApi.getGraph(this.showInvalid);
      console.log("RES", nodes, edges)
      runInAction(() => {
        this.nodes = nodes;
        this.edges = edges;
      });
    } catch (err) {
      console.error('Failed to load graph:', err);
    } finally {
      runInAction(() => { this.graphLoading = false; });
    }
  }

  toggleInvalid = () => {
    this.showInvalid = !this.showInvalid;
    this.loadGraph();
  }

  // ── Activation / Pulse ────────────────────────────

  /** Подсветить цепочку узлов и связей с плавным затуханием */
  activateChain = (nodeIds: string[]) => {
    const edgeKeys: string[] = [];

    // Найти edges между activated nodes
    for (const edge of this.edges) {
      if (nodeIds.includes(edge.sourceUuid) || nodeIds.includes(edge.targetUuid)) {
        edgeKeys.push(edgeKey(edge));
      }
    }

    this.pulseQueue.push({ nodeIds, edgeKeys });
    if (!this.isPulsing) this.processPulseQueue();
  }

  /** Подсветить по результатам search */
  activateFromSearch = (results: SearchResult[]) => {
    // Найти uuid узлов чьи имена/факты совпали
    const matchedNodeIds: string[] = [];

    for (const result of results) {
      for (const node of this.nodes) {
        if (result.content.includes(node.name)) {
          matchedNodeIds.push(node.uuid);
        }
      }
    }

    if (matchedNodeIds.length > 0) {
      this.activateChain(matchedNodeIds);
    }
  }

  /** Подсветить новый узел (после remember) */
  activateNew = (nodeIds: string[]) => {
    this.activateChain(nodeIds);
  }

  clearActivation = () => {
    this.activatedNodeIds = new Set();
    this.activatedEdgeKeys = new Set();
  }

  isNodeActivated = (uuid: string): boolean => {
    return this.activatedNodeIds.has(uuid);
  }

  isEdgeActivated = (edge: GraphEdge): boolean => {
    return this.activatedEdgeKeys.has(edgeKey(edge));
  }

  private processPulseQueue = async () => {
    this.isPulsing = true;

    while (this.pulseQueue.length > 0) {
      const pulse = this.pulseQueue.shift()!;

      // Wave activation
      for (let i = 0; i < pulse.nodeIds.length; i++) {
        runInAction(() => {
          this.activatedNodeIds.add(pulse.nodeIds[i]);
          for (const key of pulse.edgeKeys) {
            const edge = this.edges.find(e => edgeKey(e) === key);
            if (edge && (edge.sourceUuid === pulse.nodeIds[i] || edge.targetUuid === pulse.nodeIds[i])) {
              this.activatedEdgeKeys.add(key);
            }
          }
          // this.activationVersion++;
        });
        await sleep(ACTIVATION_WAVE_DELAY);
      }

      await sleep(ACTIVATION_HOLD_DURATION);

      // Fade out
      for (let i = 0; i < pulse.nodeIds.length; i++) {
        runInAction(() => {
          this.activatedNodeIds.delete(pulse.nodeIds[i]);
          // this.activationVersion++;
        });
        await sleep(ACTIVATION_FADE_DELAY);
      }

      runInAction(() => {
        this.activatedEdgeKeys = new Set();
        // this.activationVersion++;
      });
    }

    runInAction(() => {
      this.isPulsing = false;
      // this.activationVersion++;
    });
  }

  // ── Search ────────────────────────────────────────

  setSearchQuery = (query: string) => {
    this.searchQuery = query;
  }

  doSearch = async () => {
    if (!this.searchQuery.trim()) return;
    this.searchLoading = true;
    try {
      const results = await memoryApi.search(this.searchQuery);
      runInAction(() => { this.searchResults = results; });
      this.activateFromSearch(results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      runInAction(() => { this.searchLoading = false; });
    }
  }

  // ── Remember ──────────────────────────────────────

  doRemember = async (fact: string) => {
    this.rememberLoading = true;
    try {
      const result = await memoryApi.remember(fact);
      runInAction(() => { this.lastRememberResult = result; });
      if (result.ok) {
        const oldIds = new Set(this.nodes.map(n => n.uuid));
        await this.loadGraph();
        // Подсветить новые узлы
        const newIds = this.nodes
          .filter(n => !oldIds.has(n.uuid))
          .map(n => n.uuid);
        if (newIds.length > 0) this.activateNew(newIds);
      }
      return result;
    } catch (err) {
      console.error('Remember failed:', err);
      return null;
    } finally {
      runInAction(() => { this.rememberLoading = false; });
    }
  }

  // ── Startup ───────────────────────────────────────

  loadStartup = async (userId = 'default') => {
    this.startupLoading = true;
    try {
      const block = await memoryApi.getStartup(userId);
      runInAction(() => { this.coreMemoryBlock = block; });
    } catch (err) {
      console.error('Startup failed:', err);
    } finally {
      runInAction(() => { this.startupLoading = false; });
    }
  }

  // ── Dreaming ──────────────────────────────────────

  triggerDreaming = async (hours = 24) => {
    this.dreamingLoading = true;
    try {
      const result = await memoryApi.triggerDreaming(hours);
      runInAction(() => { this.lastDreamingResult = result; });
      if (result.status === 'ok') await this.loadGraph();
      return result;
    } catch (err) {
      console.error('Dreaming failed:', err);
      return null;
    } finally {
      runInAction(() => { this.dreamingLoading = false; });
    }
  }

  // ── Health ────────────────────────────────────────

  checkHealth = async () => {
    try {
      const { status } = await memoryApi.getHealth();
      runInAction(() => { this.serverStatus = status as 'ok' | 'error'; });
    } catch {
      runInAction(() => { this.serverStatus = 'error'; });
    }
  }


  loadMessages = async (limit = 50, offset = 0) => {
    this.messagesLoading = true;
    try {
      const msgs = await memoryApi.getMessages(limit, offset);
      runInAction(() => { this.messages = msgs; });
    } catch (err) {
      console.error('Messages load failed:', err);
    } finally {
      runInAction(() => { this.messagesLoading = false; });
    }
  }

  loadObsidianList = async (prefix?: string) => {
    this.obsidianLoading = true;
    try {
      const docs = await memoryApi.getObsidianList(prefix);
      runInAction(() => { this.obsidianDocs = docs; });
    } catch (err) {
      console.error('Obsidian list failed:', err);
    } finally {
      runInAction(() => { this.obsidianLoading = false; });
    }
  }

  loadObsidianDoc = async (path: string) => {
    this.obsidianDocLoading = true;
    try {
      const doc = await memoryApi.getObsidianDoc(path);
      runInAction(() => {
        this.obsidianContent = doc.content;
        this.obsidianContentPath = doc.path;
      });
    } catch (err) {
      console.error('Obsidian read failed:', err);
    } finally {
      runInAction(() => { this.obsidianDocLoading = false; });
    }
  }

  loadObsidianDocGraph = async () => {
    this.obsidianDocGraphLoading = true;
    try {
      const graph = await memoryApi.getObsidianGraph();
      runInAction(() => { this.obsidianDocGraph = graph; });
    } catch (err) {
      console.error('Doc graph load failed:', err);
    } finally {
      runInAction(() => { this.obsidianDocGraphLoading = false; });
    }
  }


  loadOpLog = async (limit = 50) => {
    this.opLogLoading = true;
    try {
      const entries = await memoryApi.getOpLog(limit);
      console.log(entries)
      runInAction(() => { this.opLog = entries; });
    } catch (err) {
      console.error('OpLog load failed:', err);
    } finally {
      runInAction(() => { this.opLogLoading = false; });
    }
  }

  addOpLogEntry = (entry: OpLogEntry) => {
    this.opLog.unshift(entry);
    if (this.opLog.length > 500) {
      this.opLog = this.opLog.slice(0, 500);
    }
  }

  setDreamingProgress = (progress: DreamingProgress | null) => {
    this.dreamingProgress = progress;
  }

  loadDreamingHistory = async (limit = 20) => {
    try {
      this.dreamingHistoryLoading = true;

      const logs = await memoryApi.getDreamingHistory(limit);

      console.log(logs)
      runInAction(() => { this.dreamingHistory = logs; });
      this.dreamingHistoryLoading = false;
    } catch (err) {
      this.dreamingHistoryLoading = false;
      console.error('Dreaming history failed:', err);
    }
  }

}

// ── Helpers ──────────────────────────────────────────

function edgeKey(edge: GraphEdge): string {
  return `${edge.sourceUuid}→${edge.targetUuid}:${edge.name}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const MemoryStore = new _MemoryStore();