import { useState } from 'react'
import MermaidDiagram from './MermaidDiagram'
import ChapterViewer from './ChapterViewer'

export default function Dashboard({ data, onBack }) {
  const [activeView, setActiveView] = useState('overview') // 'overview' | index number

  const { projectName, summary, abstractions, mermaidDiagram, chapters, fileCount, relationships, fileContents } = data

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 title={projectName}>📚 {projectName}</h2>
          <p>{fileCount} files · {chapters.length} chapters</p>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeView === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveView('overview')}
            id="nav-overview"
          >
            <span className="num">🏠</span>
            <span>Overview</span>
          </button>

          {chapters.map((ch, i) => (
            <button
              key={i}
              className={`nav-item ${activeView === i ? 'active' : ''}`}
              onClick={() => setActiveView(i)}
              id={`nav-chapter-${i}`}
            >
              <span className="num">{i + 1}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ch.name}
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="back-btn" onClick={onBack} id="back-btn">
            ← Analyze Another Repo
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeView === 'overview' ? (
          <OverviewPage
            projectName={projectName}
            summary={summary}
            abstractions={abstractions}
            mermaidDiagram={mermaidDiagram}
            chapters={chapters}
            fileCount={fileCount}
            relationships={relationships}
            onChapterClick={(i) => setActiveView(i)}
          />
        ) : (
          <ChapterViewer
            chapter={chapters[activeView]}
            chapters={chapters}
            fileContents={fileContents}
            currentIndex={activeView}
            onNavigate={(i) => setActiveView(i)}
          />
        )}
      </main>
    </div>
  )
}

function OverviewPage({ projectName, summary, abstractions, mermaidDiagram, chapters, fileCount, relationships, onChapterClick }) {
  return (
    <>
      <div className="overview-header">
        <h1 className="gradient-text">{projectName}</h1>
      </div>

      <div className="stats-row">
        <div className="stat-badge">
          <span>📄</span> <span className="num">{fileCount}</span> files analyzed
        </div>
        <div className="stat-badge">
          <span>🧩</span> <span className="num">{abstractions.length}</span> abstractions
        </div>
        <div className="stat-badge">
          <span>📖</span> <span className="num">{chapters.length}</span> chapters
        </div>
        <div className="stat-badge">
          <span>🔗</span> <span className="num">{relationships?.length || 0}</span> relationships
        </div>
      </div>

      <div className="card summary-card">
        <h3>📝 Project Summary</h3>
        <p>{summary}</p>
      </div>

      {mermaidDiagram && (
        <div className="card diagram-card">
          <h3>🗺️ Architecture Map</h3>
          <MermaidDiagram chart={mermaidDiagram} />
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: '14px', color: 'var(--accent-light)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          📚 Tutorial Chapters
        </h3>
        <div className="abstractions-grid">
          {chapters.map((ch, i) => (
            <div
              key={i}
              className="card abstraction-card"
              onClick={() => onChapterClick(i)}
              id={`chapter-card-${i}`}
            >
              <div style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '6px', fontWeight: 600 }}>
                Chapter {ch.number}
              </div>
              <h4>{ch.name}</h4>
              <p>{ch.description}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
