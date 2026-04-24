import { useState } from 'react'

export default function LoginPage({ onLogin, error }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    onLogin(email.trim(), password)
  }

  return (
    <div className="login-screen">
      <div className="login-modal">
        <h2 className="login-title">Log in</h2>
        <p className="login-subtitle">
          Enter your membership credentials to access CodeLens analysis.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="email"
            className="login-input"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="login-continue-btn" type="submit" disabled={!email.trim() || !password}>
            Continue
          </button>
        </form>

        {error && <div className="login-error">⚠️ {error}</div>}
      </div>
    </div>
  )
}
