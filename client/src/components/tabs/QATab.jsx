import ChatBot from '../ChatBot'

export default function QATab({ data, authToken }) {
  if (!data) {
    return <div className="explorer-empty">Analyze a project to ask questions about it.</div>
  }

  return (
    <div className="tab-page">
      <div className="card">
        <h3>Ask Questions About Your Codebase</h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
          Use the assistant to ask about architecture, entry points, and how things work.
        </p>
      </div>

      <div style={{ height: '12px' }} />

      <ChatBot
        repoUrl=""
        codebaseContext={data.codebaseContext}
        projectName={data.projectName}
        authToken={authToken}
        variant="embedded"
      />
    </div>
  )
}

