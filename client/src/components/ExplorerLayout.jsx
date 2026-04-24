import { useMemo, useState } from 'react'
import OverviewTab from './tabs/OverviewTab'
import StructureTab from './tabs/StructureTab'
import GraphTab from './tabs/GraphTab'
import QATab from './tabs/QATab'
import TutorialsTab from './tabs/TutorialsTab'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'structure', label: 'Structure' },
  { id: 'graph', label: 'Graph' },
  { id: 'qa', label: 'Q&A' },
  { id: 'tutorials', label: 'Tutorials' },
]

export default function ExplorerLayout({
  user,
  onLogout,
  error,
  analysisData,
  onAnalyzeGithub,
  onAnalyzeZip,
  analyzing,
  authToken,
}) {
  const [sourceType, setSourceType] = useState('github') // github | zip
  const [repoUrl, setRepoUrl] = useState('')
  const [zipFile, setZipFile] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  const stats = useMemo(() => analysisData?.metrics || null, [analysisData])

  const handleAnalyze = async () => {
    if (sourceType === 'github') return onAnalyzeGithub(repoUrl)
    return onAnalyzeZip(zipFile)
  }

  return (
    <div className="explorer">
      <aside className="explorer-sidebar">
        <div className="explorer-brand">
          <div className="brand-title">CodeLens</div>
          <div className="brand-subtitle">AI-Powered Codebase Explorer</div>
        </div>

        <div className="sidebar-card">
          <div className="sidebar-card-title">Signed in</div>
          <div className="sidebar-user">
            <div className="sidebar-user-email" title={user?.email}>{user?.email}</div>
            <button className="btn btn-ghost" onClick={onLogout} type="button">
              Sign out
            </button>
          </div>
        </div>

        <div className="sidebar-card">
          <div className="sidebar-card-title">Source</div>
          <label className="radio-row">
            <input
              type="radio"
              name="sourceType"
              value="zip"
              checked={sourceType === 'zip'}
              onChange={() => setSourceType('zip')}
            />
            <span>Upload ZIP</span>
          </label>
          <label className="radio-row">
            <input
              type="radio"
              name="sourceType"
              value="github"
              checked={sourceType === 'github'}
              onChange={() => setSourceType('github')}
            />
            <span>GitHub URL</span>
          </label>

          {sourceType === 'github' ? (
            <div className="sidebar-field">
              <div className="sidebar-field-label">GitHub repository</div>
              <input
                className="sidebar-input"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                disabled={analyzing}
              />
            </div>
          ) : (
            <div className="sidebar-field">
              <div className="sidebar-field-label">Upload project ZIP</div>
              <div className="zip-drop">
                <div className="zip-drop-title">Drag and drop file here</div>
                <div className="zip-drop-subtitle">Limit 50MB per file · ZIP</div>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                  disabled={analyzing}
                />
              </div>
              {zipFile && (
                <div className="zip-selected" title={zipFile.name}>
                  {zipFile.name} ({Math.round(zipFile.size / 1024)} KB)
                </div>
              )}
            </div>
          )}

          <button
            className="btn btn-primary sidebar-analyze"
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || (sourceType === 'github' ? !repoUrl.trim() : !zipFile)}
          >
            {analyzing ? 'Analyzing…' : 'Analyze Project'}
          </button>

          {error && <div className="sidebar-error">⚠️ {error}</div>}
        </div>

        {stats && (
          <div className="sidebar-card">
            <div className="sidebar-card-title">Stats</div>
            <div className="sidebar-stats">
              <div><span className="k">Files</span><span className="v">{stats.files}</span></div>
              <div><span className="k">Functions</span><span className="v">{stats.functions}</span></div>
              <div><span className="k">Classes</span><span className="v">{stats.classes}</span></div>
              <div><span className="k">Edges</span><span className="v">{stats.edges}</span></div>
              <div><span className="k">Ext deps</span><span className="v">{stats.extDeps}</span></div>
            </div>
          </div>
        )}
      </aside>

      <main className="explorer-main">
        <div className="explorer-topbar">
          <div className="explorer-project">
            {analysisData ? (
              <>
                <div className="project-name">{analysisData.projectName}</div>
                <div className="project-sub">Exploring {analysisData.projectName}</div>
              </>
            ) : (
              <>
                <div className="project-name">No project loaded</div>
                <div className="project-sub">Analyze a GitHub repo or upload a ZIP</div>
              </>
            )}
          </div>
        </div>

        <div className="explorer-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="explorer-content">
          {activeTab === 'overview' && <OverviewTab data={analysisData} />}
          {activeTab === 'structure' && <StructureTab data={analysisData} />}
          {activeTab === 'graph' && <GraphTab data={analysisData} />}
          {activeTab === 'qa' && <QATab data={analysisData} authToken={authToken} />}
          {activeTab === 'tutorials' && <TutorialsTab data={analysisData} />}
        </div>
      </main>
    </div>
  )
}

