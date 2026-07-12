import { useEffect, useRef } from 'react';
import { MemoryStore } from '../store/store';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://192.168.3.41:3101/ws';

export function useMemoryEvents() {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => console.log('[ws] connected');
      ws.onclose = () => {
        console.log('[ws] disconnected, reconnecting...');
        setTimeout(connect, 2000);
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          console.log('[ws] event received:', event);

          switch (event.type) {
            case 'search':
              MemoryStore.activateChain(event.nodeIds);
              break;

            case 'remember':
              // Reload graph, then activate new nodes
              MemoryStore.loadGraph().then(() => {
                const newIds = (event.nodesCreated ?? []).map((n: any) => n.uuid);
                const updatedIds = event.nodesUpdated ?? [];
                MemoryStore.activateChain([...newIds, ...updatedIds]);
              });
              break;

            case 'oplog':
              MemoryStore.addOpLogEntry(event.entry);
              break;


            case 'graph_updated':
              MemoryStore.loadGraph();
              break;

            case 'dreaming':
              MemoryStore.loadGraph();
              break;

            case 'dreaming_progress':
              MemoryStore.setDreamingProgress({
                phase: event.phase,
                message: event.message,
                progress: event.progress,
              });
              if (event.phase === 'complete' || event.phase === 'error') {
                MemoryStore.loadDreamingHistory();
                setTimeout(() => MemoryStore.setDreamingProgress(null), 5000);
              }
              break;

          }
        } catch (err) {
          console.error('[ws] parse error:', err);
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);
}