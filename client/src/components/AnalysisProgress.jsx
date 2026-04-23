const STEPS = [
  { label: 'Fetching repository files', icon: '📥' },
  { label: 'Identifying core abstractions', icon: '🧩' },
  { label: 'Analyzing relationships', icon: '🔗' },
  { label: 'Ordering tutorial chapters', icon: '📋' },
  { label: 'Writing tutorial content', icon: '✍️' },
]

export default function AnalysisProgress({ repoUrl }) {
  // Since we use a single POST call, we show an indeterminate progress
  return (
    <div className="progress-container">
      <div className="card progress-card glow-border">
        <h2>Analyzing Repository</h2>
        <p className="subtitle">{repoUrl}</p>

        <div className="steps">
          {STEPS.map((step, i) => (
            <div key={i} className="step active">
              <div className="step-indicator">{step.icon}</div>
              <span className="step-label">{step.label}</span>
            </div>
          ))}
        </div>

        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: '100%', animation: 'progressPulse 2s ease-in-out infinite' }}
          />
        </div>

        <p className="progress-message">
          This may take 2-5 minutes depending on repository size...
        </p>

        <style>{`
          @keyframes progressPulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  )
}
