import { useState } from 'react'

export default function HeroSection({ onAnalyze, error }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!url.trim() || !url.includes('github.com')) return
    setLoading(true)
    onAnalyze(url.trim())
  }

  return (
    <div className="hero">
      <div className="hero-badge">
        <span>✨</span>
        <span>AI-Powered Codebase Intelligence</span>
      </div>

      <h1>
        Turn Any Codebase Into<br />
        <span className="gradient-text">Interactive Tutorials</span>
      </h1>

      <p>
        Paste a GitHub repository URL and our AI will analyze the entire codebase,
        identify core concepts, and generate beginner-friendly tutorials with
        interactive diagrams.
      </p>

      {error && (
        <div style={{
          color: 'var(--error)', background: 'rgba(239,68,68,0.1)',
          padding: '10px 20px', borderRadius: '8px', marginBottom: '16px',
          fontSize: '14px', border: '1px solid rgba(239,68,68,0.2)'
        }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="input-group">
        <input
          type="url"
          className="input-glow"
          placeholder="https://github.com/owner/repository"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          id="repo-url-input"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !url.trim()}
          id="analyze-btn"
        >
          {loading ? '⏳' : '🚀'} Analyze
        </button>
      </form>

      <div className="hero-features">
        <div className="card feature-card">
          <div className="icon">🔍</div>
          <h3>Deep Analysis</h3>
          <p>AI identifies core abstractions, patterns, and architecture from your codebase</p>
        </div>
        <div className="card feature-card">
          <div className="icon">📖</div>
          <h3>Auto Tutorials</h3>
          <p>Generates beginner-friendly chapters with code examples and diagrams</p>
        </div>
        <div className="card feature-card">
          <div className="icon">🗺️</div>
          <h3>Visual Maps</h3>
          <p>Interactive Mermaid diagrams showing how components connect and interact</p>
        </div>
        <div className="card feature-card">
          <div className="icon">💬</div>
          <h3>AI Chatbot</h3>
          <p>Ask questions about the codebase and get instant AI-powered answers</p>
        </div>
      </div>
    </div>
  )
}
