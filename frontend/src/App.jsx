import { useState } from 'react'
import { Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { deleteDrop } from './api.js'
import { Trash2, Check } from 'lucide-react'
import HoldButton from './HoldButton.jsx'
import { ToastStack, useToasts } from './toast.jsx'
import Home from './Home.jsx'
import Download from './Download.jsx'
import Aurora from './Aurora.jsx'


// Small confirm-and-delete page for the private delete link:
// /delete/:slug?token=...
function Delete({ notify }) {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [state, setState] = useState(token ? 'confirm' : 'no-token')
  const [message, setMessage] = useState('')

  async function handleDelete() {
    setState('busy')
    try {
      await deleteDrop(slug, token)
      setState('done')
      notify?.('Link deleted', 'The drop and its files are gone.')
    } catch (err) {
      setMessage(err.message || 'Something went wrong.')
      setState('error')
    }
  }

  return (
    <div className="card center">
      <h1>Delete drop</h1>
      {state === 'no-token' && <p className="muted">This link is missing its delete token.</p>}
      {state === 'confirm' && (
        <>
          <p className="muted">Delete this drop and its files immediately? This cannot be undone.</p>
          <HoldButton
            fillColor="#8b1a1a"
            backgroundColor="rgba(22, 22, 26, 0.45)"
            textColor="#f2f2f2"
            fillTextColor="#ffffff"
            radius={9}
            holdTime={1200}
            doneLabel="Deleted"
            icon={<Trash2 size={16} strokeWidth={2} />}
            doneIcon={<Check size={16} strokeWidth={2} />}
            onHold={handleDelete}
          >
            Hold to delete
          </HoldButton>
        </>
      )}
      {state === 'busy' && <p className="muted">Deleting…</p>}
      {state === 'done' && <p>The drop and its files have been deleted.</p>}
      {state === 'error' && <p className="error">{message}</p>}
      {(state === 'done' || state === 'error' || state === 'no-token') && (
        <Link className="btn" to="/">Back to dropportal</Link>
      )}
    </div>
  )
}

export default function App() {
  const { toasts, notify, dismiss } = useToasts()

  return (
    <div className="app">
      <div className="bg-aurora" aria-hidden="true">
        <Aurora
          colorStops={['#eab308', '#f97316', '#eab308']}
          speed={1.2}
          blend={0.75}
        />
      </div>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home notify={notify} />} />
          <Route path="/d/:slug" element={<Download />} />
          <Route path="/delete/:slug" element={<Delete notify={notify} />} />
          <Route path="*" element={<Home notify={notify} />} />
        </Routes>
      </main>
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
