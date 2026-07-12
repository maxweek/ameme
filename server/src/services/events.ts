import type { ServerWebSocket } from 'bun';
import type { GraphNode, GraphEdge } from './graph/types';
import type { OpLogEntry } from './oplog';
import type { DreamingPhase } from '../primitives/dreaming';

export type MemoryEvent =
  | { type: 'search'; nodeIds: string[]; edgeKeys: string[]; query: string }
  | { type: 'remember'; nodesCreated: GraphNode[]; nodesUpdated: string[]; edgesCreated: GraphEdge[]; edgesInvalidated: string[] }
  | { type: 'dreaming'; status: string; newFacts: number; staleFacts: number; mergedNodes: number }
  | { type: 'graph_updated' }
  | { type: 'oplog'; entry: OpLogEntry }
  | { type: 'dreaming_progress'; phase: DreamingPhase; message: string; progress: number };



class _EventBus {
  private clients: Set<ServerWebSocket<unknown>> = new Set();

  addClient = (ws: ServerWebSocket<unknown>) => {
    this.clients.add(ws);
    console.log(`[events] Client connected (${this.clients.size} total)`);
  }

  removeClient = (ws: ServerWebSocket<unknown>) => {
    this.clients.delete(ws);
    console.log(`[events] Client disconnected (${this.clients.size} total)`);
  }

  emit = (event: MemoryEvent) => {
    const data = JSON.stringify(event);
    for (const client of this.clients) {
      try {
        client.send(data);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}

export const EventBus = new _EventBus();