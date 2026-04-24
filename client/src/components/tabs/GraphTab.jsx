import { useMemo, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

function limitGraph(graph, maxNodes) {
  const nodes = graph?.nodes || []
  const edges = graph?.edges || []
  if (!nodes.length) return { nodes: [], edges: [] }

  const limitedNodes = nodes.slice(0, Math.max(10, maxNodes))
  const allowed = new Set(limitedNodes.map((n) => n.id))
  const limitedEdges = edges.filter((e) => allowed.has(e.source) && allowed.has(e.target))
  return { nodes: limitedNodes, edges: limitedEdges }
}

export default function GraphTab({ data }) {
  const [maxNodes, setMaxNodes] = useState(80)
  const [showExternal, setShowExternal] = useState(false)

  if (!data) {
    return <div className="explorer-empty">Analyze a project to see the knowledge graph.</div>
  }

  const baseGraph = data.graph || { nodes: [], edges: [] }

  const graph = useMemo(() => {
    let g = baseGraph
    if (!showExternal) {
      const nodes = (g.nodes || []).filter((n) => n.type !== 'external')
      const allowed = new Set(nodes.map((n) => n.id))
      const edges = (g.edges || []).filter((e) => allowed.has(e.source) && allowed.has(e.target))
      g = { nodes, edges }
    }
    return limitGraph(g, maxNodes)
  }, [baseGraph, maxNodes, showExternal])

  return (
    <div className="tab-page">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Knowledge Graph</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <input type="checkbox" checked={showExternal} onChange={(e) => setShowExternal(e.target.checked)} />
            Show external deps
          </label>
        </div>

        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', width: '90px' }}>Max nodes</div>
          <input
            type="range"
            min={20}
            max={200}
            value={maxNodes}
            onChange={(e) => setMaxNodes(parseInt(e.target.value, 10))}
            style={{ flex: 1 }}
          />
          <div style={{ width: '50px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '13px' }}>
            {maxNodes}
          </div>
        </div>

        <div style={{ height: '560px', marginTop: '14px', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg-primary)' }}>
          <ForceGraph2D
            graphData={{ nodes: graph.nodes, links: graph.edges.map((e) => ({ source: e.source, target: e.target })) }}
            nodeLabel={(n) => n.label || n.id}
            nodeRelSize={5}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const label = (node.label || node.id).split('/').pop()
              const fontSize = 10 / globalScale
              ctx.font = `${fontSize}px Inter`
              ctx.fillStyle = node.type === 'external' ? '#f59e0b' : '#818cf8'
              ctx.beginPath()
              ctx.arc(node.x, node.y, 4, 0, 2 * Math.PI, false)
              ctx.fill()
              ctx.fillStyle = '#94a3b8'
              ctx.fillText(label, node.x + 6, node.y + 3)
            }}
          />
        </div>
      </div>
    </div>
  )
}

