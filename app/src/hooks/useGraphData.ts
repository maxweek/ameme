import { useMemo } from 'react';
import { MemoryStore } from '../store/store';
import type { Link, Node } from '../components/graph';

export interface GraphNodeData {
  id: string;
  name: string;
  type: string;
  summary: string;
  activated: boolean;
  isNew: boolean;
}

export interface GraphLinkData {
  source: string;
  target: string;
  name: string;
  fact: string;
  activated: boolean;
}

export function useGraphData() {
  const nodes = MemoryStore.nodes;
  const edges = MemoryStore.edges;

  return useMemo(() => ({
    nodes: nodes.map(n => ({
      id: n.uuid,
      uuid: n.uuid,
      name: n.name,
      type: n.type,
      summary: n.summary,
      createdAt: n.createdAt,
      embeddingsCount: n.embeddingsCount,
      groupId: n.groupId,
      activated: MemoryStore.isNodeActivated(n.uuid),
      isNew: false,
    })) as Node[],
    links: edges.map(e => ({
      source: e.sourceUuid,
      target: e.targetUuid,
      uuid: e.uuid,
      validAt: e.validAt,
      invalidAt: e.invalidAt,
      groupId: e.groupId,
      createdAt: e.createdAt,
      embeddingsCount: e.embeddingsCount,
      sourceUuid: e.sourceUuid,
      targetUuid: e.targetUuid,
      id: e.uuid,
      name: e.name,
      fact: e.fact,
      activated: MemoryStore.isEdgeActivated(e),
    })) as Link[],
  }), [nodes, edges]);
}