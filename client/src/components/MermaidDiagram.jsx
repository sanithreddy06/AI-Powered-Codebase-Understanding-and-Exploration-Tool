import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#6366f1',
    primaryTextColor: '#f1f5f9',
    primaryBorderColor: '#818cf8',
    lineColor: '#818cf8',
    secondaryColor: '#1e1b4b',
    tertiaryColor: '#111827',
    background: '#0a0e1a',
    mainBkg: '#1e1b4b',
    nodeBorder: '#818cf8',
    clusterBkg: '#111827',
    titleColor: '#f1f5f9',
    edgeLabelBackground: '#111827',
  },
  flowchart: { curve: 'basis', padding: 16 },
  fontFamily: 'Inter, sans-serif',
})

export default function MermaidDiagram({ chart }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!chart || !containerRef.current) return

    const render = async () => {
      try {
        containerRef.current.innerHTML = ''
        // Mermaid can sometimes return an "error SVG" instead of throwing.
        // Parse first so invalid charts render nothing (no error banner).
        await mermaid.parse(chart)
        const id = `mermaid-${Date.now()}`
        const { svg } = await mermaid.render(id, chart)
        if (containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      } catch (err) {
        console.warn('Mermaid render error:', err)
        // Keep the UI clean—don't show Mermaid's error output or raw chart text.
        if (containerRef.current) containerRef.current.innerHTML = ''
      }
    }

    render()
  }, [chart])

  return <div ref={containerRef} className="diagram-container" />
}
