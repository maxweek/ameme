import { useEffect, useRef, useCallback, type FC, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ForceGraph2D from 'react-force-graph-2d';
import { MemoryStore } from '../../store/store';

const FOLDER_COLORS: Record<string, string> = {
  'система': '#90a4ae',
  'инструкции': '#ffb74d',
  'проекты': '#81c784',
  'люди': '#4fc3f7',
  'агенты': '#ce93d8',
  '': '#666666',
};

function getFolderColor(folder: string): string {
  return FOLDER_COLORS[folder.split('/')[0]] ?? '#888888';
}

interface Props {
  onNavigate: (path: string) => void;
}

export const ObsidianDocGraph: FC<Props> = observer(({
  onNavigate,
}) => {
  const fgRef = useRef<any>(null);
  const { obsidianDocGraph, obsidianDocGraphLoading } = MemoryStore;

  useEffect(() => {
    MemoryStore.loadObsidianDocGraph();
  }, []);

  // Zoom to fit on load
  useEffect(() => {
    if (obsidianDocGraph.nodes.length > 0 && fgRef.current) {
      setTimeout(() => fgRef.current?.zoomToFit(400, 50), 500);
    }
  }, [obsidianDocGraph]);

  const graphData = {
    nodes: obsidianDocGraph.nodes.map(n => ({
      id: n.id,
      name: n.name,
      folder: n.folder,
      val: 1,
    })),
    links: obsidianDocGraph.links.map(l => ({
      source: l.source,
      target: l.target,
    })),
  };

  const handleNodeClick = useCallback((node: any) => {
    onNavigate(node.id);
  }, [onNavigate]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);


  if (obsidianDocGraphLoading) return <div>Loading graph...</div>;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="transparent"
        width={dimensions.width}
        height={dimensions.height}

        // Nodes
        nodeLabel={(node: any) => `${node.folder ? node.folder + '/' : ''}${node.name}`}
        nodeColor={(node: any) => getFolderColor(node.folder)}
        nodeRelSize={5}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const fontSize = Math.max(12 / globalScale, 2);
          const radius = 4;

          // Circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = getFolderColor(node.folder);
          ctx.fill();

          // Label (only when zoomed enough)
          if (globalScale > 0.8) {
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#cccccc';
            ctx.fillText(node.name, node.x, node.y + radius + fontSize);
          }
        }}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}

        // Links
        linkColor={() => 'rgba(150, 150, 150, 0.3)'}
        linkWidth={1}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={() => 'rgba(150, 150, 150, 0.5)'}

        // Interaction
        onNodeClick={handleNodeClick}
        onNodeHover={(node: any) => {
          document.body.style.cursor = node ? 'pointer' : 'default';
        }}

        // Physics
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.3}
        cooldownTime={3000}
      />
    </div>
  );
});