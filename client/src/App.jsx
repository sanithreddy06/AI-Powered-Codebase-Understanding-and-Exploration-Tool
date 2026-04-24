import { useEffect, useState } from 'react'
import './index.css'
import LoginPage from './components/LoginPage'
import ExplorerLayout from './components/ExplorerLayout'

const API = '/api'

const parseApiResponse = async (res) => {
  const raw = await res.text()
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function App() {
  const [analysisData, setAnalysisData] = useState(null)
  const [error, setError] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [authToken, setAuthToken] = useState(localStorage.getItem('authToken') || '')
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('authUser')
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!authToken) return

    const validate = async () => {
      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        if (!res.ok) throw new Error('Session expired')
      } catch {
        setAuthToken('')
        setUser(null)
        localStorage.removeItem('authToken')
        localStorage.removeItem('authUser')
      }
    }
    validate()
  }, [authToken])

  const handleLogin = async (email, password) => {
    setError(null)
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await parseApiResponse(res)
      if (!res.ok) {
        throw new Error(json?.error || `Login failed (${res.status})`)
      }

      setAuthToken(json.token)
      setUser(json.user)
      localStorage.setItem('authToken', json.token)
      localStorage.setItem('authUser', JSON.stringify(json.user))
    } catch (err) {
      setError(err.message)
    }
  }

  const handleLogout = async () => {
    try {
      if (authToken) {
        await fetch(`${API}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        })
      }
    } catch {
      // best effort logout
    } finally {
      setAuthToken('')
      setUser(null)
      setAnalysisData(null)
      setError(null)
      localStorage.removeItem('authToken')
      localStorage.removeItem('authUser')
    }
  }

  const analyzeGithub = async (url) => {
    if (!authToken) {
      setError('Please login first')
      return
    }

    setAnalyzing(true)
    setError(null)

    try {
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ repoUrl: url }),
      })

      const json = await parseApiResponse(res)
      if (!res.ok) {
        throw new Error(json?.error || `Analysis failed (${res.status})`)
      }
      if (!json?.data) {
        throw new Error('Server returned an invalid response')
      }

      setAnalysisData(json.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const analyzeZip = async (file) => {
    if (!authToken) {
      setError('Please login first')
      return
    }
    if (!file) return

    setAnalyzing(true)
    setError(null)

    try {
      const form = new FormData()
      form.append('zip', file)

      const res = await fetch(`${API}/analyze-zip`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: form,
      })

      const json = await parseApiResponse(res)
      if (!res.ok) {
        throw new Error(json?.error || `ZIP analysis failed (${res.status})`)
      }
      if (!json?.data) {
        throw new Error('Server returned an invalid response')
      }

      setAnalysisData(json.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <>
      {!user && (
        <LoginPage onLogin={handleLogin} error={error} />
      )}
      {user && (
        <ExplorerLayout
          user={user}
          onLogout={handleLogout}
          error={error}
          analysisData={analysisData}
          onAnalyzeGithub={analyzeGithub}
          onAnalyzeZip={analyzeZip}
          analyzing={analyzing}
          authToken={authToken}
        />
      )}
    </>
  )
}

export default App
