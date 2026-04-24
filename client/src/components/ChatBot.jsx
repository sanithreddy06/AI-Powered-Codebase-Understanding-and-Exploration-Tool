import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

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

export default function ChatBot({ repoUrl, codebaseContext, projectName, authToken, variant = 'floating' }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'ai', text: `Hi! I've analyzed **${projectName}**. Ask me anything about the codebase! 🤖` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const suggestions = [
    'How does this project work?',
    'What are the main components?',
    'Explain the architecture',
    'How do I get started?',
  ]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return
    const userMsg = text.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ message: userMsg, repoUrl, codebaseContext }),
      })
      const json = await parseApiResponse(res)
      if (!res.ok) {
        throw new Error(json?.error || `Chat request failed (${res.status})`)
      }

      const responseText = json?.response
      if (!responseText) {
        throw new Error('Server returned an invalid chat response')
      }

      setMessages(prev => [...prev, { role: 'ai', text: responseText }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Sorry, I encountered an error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    sendMessage(input)
  }

  const panel = (
    <div className={`chat-panel glass ${variant === 'embedded' ? 'chat-panel-embedded' : ''}`}>
          <div className="chat-header">
            <h3>🤖 AI Assistant — {projectName}</h3>
            {variant !== 'embedded' && (
              <button className="chat-close" onClick={() => setOpen(false)}>×</button>
            )}
          </div>

          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                {msg.role === 'ai' ? (
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            ))}
            {loading && (
              <div className="typing-indicator">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && (
            <div className="chat-suggestions">
              {suggestions.map((s, i) => (
                <button key={i} className="suggestion-chip" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <form className="chat-input-area" onSubmit={handleSubmit}>
            <input
              className="chat-input"
              placeholder="Ask about the codebase..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              id="chat-input"
            />
            <button
              type="submit"
              className="chat-send"
              disabled={loading || !input.trim()}
              id="chat-send-btn"
            >
              ➤
            </button>
          </form>
    </div>
  )

  if (variant === 'embedded') return panel

  return (
    <>
      <button
        className={`chat-toggle ${!open ? 'has-dot' : ''}`}
        onClick={() => setOpen(!open)}
        id="chat-toggle-btn"
        title="AI Assistant"
      >
        {open ? '✕' : '💬'}
      </button>
      {open && panel}
    </>
  )
}
