import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { downloadDrop, formatBytes, getDrop } from './api.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function triggerDownload(url) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function Download() {
  const { slug } = useParams()
  const [drop, setDrop] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notfound | used | error
  const [errorMessage, setErrorMessage] = useState('')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getDrop(slug)
      .then((data) => {
        if (cancelled) return
        setDrop(data)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        if (err.status === 404) setStatus('notfound')
        else if (err.status === 410) setStatus('used')
        else {
          setErrorMessage(err.message || 'Something went wrong.')
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  async function handleDownload() {
    if (busy) return
    setBusy(true)
    setPasswordError('')
    setNote('')
    try {
      // Fetch the presigned URLs, then start the downloads. Do not reload or
      // re-fetch the drop metadata before the downloads have started — for a
      // self-destructing drop the metadata is gone once the counter ticks.
      const data = await downloadDrop(slug, drop.has_password ? password : undefined)
      const urls = data.urls || []
      if (urls.length === 1) {
        triggerDownload(urls[0].url)
        setNote('Your download has started.')
      } else {
        for (let i = 0; i < urls.length; i++) {
          triggerDownload(urls[i].url)
          if (i < urls.length - 1) await sleep(1000)
        }
        setNote(`${urls.length} downloads started one after another. If your browser asks, allow downloading multiple files.`)
      }
    } catch (err) {
      if (err.status === 401) {
        setPasswordError('wrong password')
      } else if (err.status === 404) {
        setStatus('notfound')
      } else if (err.status === 410) {
        setStatus('used')
      } else {
        setErrorMessage(err.message || 'Something went wrong.')
        setStatus('error')
      }
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return <div className="card center"><p className="muted">Loading…</p></div>
  }

  if (status === 'notfound') {
    return (
      <div className="card center">
        <h1>Link not found</h1>
        <p className="muted">This drop does not exist — it may have expired and been deleted.</p>
        <Link className="btn" to="/">Go to dropportal</Link>
      </div>
    )
  }

  if (status === 'used') {
    return (
      <div className="card center">
        <h1>This link has already been used</h1>
        <p className="muted">The files behind it have been deleted.</p>
        <Link className="btn" to="/">Go to dropportal</Link>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="card center">
        <h1>Something went wrong</h1>
        <p className="error">{errorMessage}</p>
        <Link className="btn" to="/">Go to dropportal</Link>
      </div>
    )
  }

  const remaining =
    drop.download_limit != null
      ? drop.download_limit - drop.download_count
      : null

  return (
    <div className="card">
      <h1>Files for you</h1>
      <ul className="filelist">
        {drop.files.map((f) => (
          <li key={f.name}>
            <span className="name">{f.name}</span>
            <span className="muted small">{formatBytes(f.size)}</span>
          </li>
        ))}
      </ul>
      <p className="total">
        {drop.files.length} {drop.files.length === 1 ? 'file' : 'files'} · {formatBytes(drop.total_size)}
      </p>
      <p className="small muted">Expires: {new Date(drop.expires_at).toLocaleString()}</p>
      {remaining != null && (
        <p className="small muted">
          {remaining} of {drop.download_limit} downloads left
        </p>
      )}

      {drop.has_password && (
        <div className="passwordbox">
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDownload()
              }}
              placeholder="required"
            />
          </label>
          {passwordError && <p className="error">{passwordError}</p>}
        </div>
      )}

      {drop.delete_after_download && (
        <p className="note">This file will be deleted after you download it.</p>
      )}

      {note && <p className="small ok">{note}</p>}

      <button className="btn primary" onClick={handleDownload} disabled={busy}>
        {busy ? 'Starting download…' : 'Download'}
      </button>
    </div>
  )
}
