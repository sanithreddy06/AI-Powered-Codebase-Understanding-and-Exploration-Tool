import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

function MermaidBlock({ code }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const render = async () => {
      try {
        ref.current.innerHTML = ''
        // Validate first; avoids Mermaid's built-in "Syntax error in text" SVG banner.
        await mermaid.parse(code)
        const id = `mm-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, code)
        if (ref.current) ref.current.innerHTML = svg
      } catch {
        // Keep the page clean on invalid diagrams.
        if (ref.current) ref.current.innerHTML = ''
      }
    }
    render()
  }, [code])

  return <div ref={ref} className="diagram-container" style={{ margin: '16px 0' }} />
}

function isLikelyFileName(value) {
  return /^[\w./-]+\.[a-z0-9]{1,8}$/i.test(value)
}

export default function ChapterViewer({ chapter, chapters, currentIndex, onNavigate, fileContents = {} }) {
  const contentRef = useRef(null)
  const [hoveredFile, setHoveredFile] = useState(null)

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
    window.scrollTo({ top: 0 })
    setHoveredFile(null)
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

            const codeText = String(children).trim()
            const fullCode = fileContents[codeText]

            if (isLikelyFileName(codeText) && fullCode) {
              return (
                <button
                  type="button"
                  className="file-chip"
                  onMouseEnter={(e) => {
                    setHoveredFile({
                      name: codeText,
                      content: fullCode,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }}
                  onMouseMove={(e) => {
                    setHoveredFile((prev) =>
                      prev ? { ...prev, x: e.clientX, y: e.clientY } : prev
                    )
                  }}
                  onMouseLeave={() => setHoveredFile(null)}
                >
                  {codeText}
                </button>
              )
            }

            return <code className={className} {...props}>{children}</code>
          }
        }}
      >
        {chapter.content}
      </ReactMarkdown>

      {hoveredFile && (
        <div
          className="file-hover-preview"
          style={{
            left: `${Math.min(hoveredFile.x + 16, window.innerWidth - 560)}px`,
            top: `${Math.min(hoveredFile.y + 16, window.innerHeight - 420)}px`,
          }}
        >
          <div className="file-hover-title">{hoveredFile.name}</div>
          <pre>{hoveredFile.content}</pre>
        </div>
      )}

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
