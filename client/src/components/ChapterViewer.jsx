import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

function MermaidBlock({ code }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const render = async () => {
      try {
        ref.current.innerHTML = ''
        const id = `mm-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, code)
        if (ref.current) ref.current.innerHTML = svg
      } catch {
        ref.current.innerHTML = `<pre style="color:var(--text-muted)">${code}</pre>`
      }
    }
    render()
  }, [code])

  return <div ref={ref} className="diagram-container" style={{ margin: '16px 0' }} />
}

export default function ChapterViewer({ chapter, chapters, currentIndex, onNavigate }) {
  const contentRef = useRef(null)

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
    window.scrollTo({ top: 0 })
  }, [currentIndex])

  if (!chapter) return null

  const prev = currentIndex > 0 ? chapters[currentIndex - 1] : null
  const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null

  return (
    <div className="chapter-content" ref={contentRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const lang = match ? match[1] : ''

            if (!inline && lang === 'mermaid') {
              return <MermaidBlock code={String(children).trim()} />
            }

            if (!inline) {
              return (
                <pre>
                  <code className={className} {...props}>{children}</code>
                </pre>
              )
            }

            return <code className={className} {...props}>{children}</code>
          }
        }}
      >
        {chapter.content}
      </ReactMarkdown>

      <div className="chapter-nav">
        {prev ? (
          <button className="btn btn-ghost" onClick={() => onNavigate(currentIndex - 1)} id="prev-chapter-btn">
            ← {prev.name}
          </button>
        ) : <div />}
        {next ? (
          <button className="btn btn-ghost" onClick={() => onNavigate(currentIndex + 1)} id="next-chapter-btn">
            {next.name} →
          </button>
        ) : <div />}
      </div>
    </div>
  )
}
