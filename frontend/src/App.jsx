import { useState } from 'react'
import { Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { deleteDrop } from './api.js'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import HoldButton from './HoldButton.jsx'
import { ToastStack, useToasts } from './toast.jsx'
import Home from './Home.jsx'
import Download from './Download.jsx'
import GradientBlinds from './GradientBlinds.jsx'

// Module-level constant: GradientBlinds re-inits its WebGL context when the
// gradientColors identity changes, so it must not be recreated per render.
const GRADIENT_COLORS = ['#eab308', '#916f08']


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
            icon={<HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />}
            doneIcon={<HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} />}
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
      <div className="bg-gradientblinds" aria-hidden="true">
        <GradientBlinds
          gradientColors={GRADIENT_COLORS}
          angle={20}
          noise={0.5}
          blindCount={16}
          blindMinWidth={60}
          spotlightRadius={1}
          spotlightSoftness={1}
          spotlightOpacity={1}
          mouseDampening={0.15}
          distortAmount={0}
          shineDirection="left"
          mixBlendMode="lighten"
        />
      </div>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="" className="logo" />
          <span>dropportal</span>
        </Link>
      </header>
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
