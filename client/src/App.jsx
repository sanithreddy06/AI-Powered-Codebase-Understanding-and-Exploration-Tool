import { useState } from 'react'
import './index.css'
import HeroSection from './components/HeroSection'
import AnalysisProgress from './components/AnalysisProgress'
import Dashboard from './components/Dashboard'
import ChatBot from './components/ChatBot'

const API = '/api'

function App() {
  const [view, setView] = useState('hero') // hero | progress | dashboard
  const [repoUrl, setRepoUrl] = useState('')
  const [progress, setProgress] = useState({ step: 0, message: '' })
  const [analysisData, setAnalysisData] = useState(null)
  const [error, setError] = useState(null)

  const handleAnalyze = async (url) => {
    setRepoUrl(url)
    setView('progress')
    setError(null)
    setProgress({ step: 1, message: 'Starting analysis...' })

    try {
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: url }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Analysis failed')

      setAnalysisData(json.data)
      setView('dashboard')
    } catch (err) {
      setError(err.message)
      setView('hero')
    }
  }

  const handleBack = () => {
    setView('hero')
    setAnalysisData(null)
  }

  return (
    <>
      {view === 'hero' && (
        <HeroSection onAnalyze={handleAnalyze} error={error} />
      )}
      {view === 'progress' && (
        <AnalysisProgress repoUrl={repoUrl} />
      )}
      {view === 'dashboard' && analysisData && (
        <Dashboard data={analysisData} onBack={handleBack} />
      )}
      {view === 'dashboard' && analysisData && (
        <ChatBot
          repoUrl={repoUrl}
          codebaseContext={analysisData.codebaseContext}
          projectName={analysisData.projectName}
        />
      )}
    </>
  )
}

export default App
