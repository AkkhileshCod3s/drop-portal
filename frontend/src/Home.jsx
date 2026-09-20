import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { createDrop, deleteDrop, formatBytes, uploadAll } from './api.js'
import BorderGlow from './BorderGlow.jsx'
import FlowButton from './FlowButton.jsx'
import GlideSelect from './GlideSelect.jsx'
import HoldButton from './HoldButton.jsx'
import SpringCheck from './SpringCheck.jsx'
import TiltedCard from './TiltedCard.jsx'

const EXPIRY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
]

const EXPIRY_SELECT_OPTIONS = EXPIRY_OPTIONS.map((o) => ({
  value: String(o.hours),
  label: o.label,
}))

export default function Home({ notify }) {
  const [files, setFiles] = useState([])
  const [expiryHours, setExpiryHours] = useState(24)
  const [password, setPassword] = useState('')
  const [maxDownloads, setMaxDownloads] = useState('')
  const [deleteAfterDownload, setDeleteAfterDownload] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState('')
  const inputRef = useRef(null)

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)

  function addFiles(incoming) {
    setError('')
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name))
      const next = [...prev]
      for (const file of incoming) {
        if (!seen.has(file.name)) {
          seen.add(file.name)
          next.push(file)
        }
      }
      return next
    })
  }

  function removeFile(name) {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  async function copyText(text, which) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      el.remove()
    }
    setCopied(which)
    setTimeout(() => setCopied(''), 1500)
  }

  async function handleCreate() {
    if (files.length === 0 || uploading) return
    const limit = maxDownloads === '' ? null : Number(maxDownloads)
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      setError('Max downloads must be a whole number of at least 1.')
      return
    }
    setError('')
    setUploading(true)
    setProgress(0)
    let created = null
    try {
      created = await createDrop(files, {
        expiry_hours: expiryHours,
        download_limit: limit,
        delete_after_download: deleteAfterDownload,
        ...(password ? { password } : {}),
      })
      await uploadAll(files, created.uploads, setProgress)
      setResult(created)
      setFiles([])
    } catch (err) {
      // If the drop was created but the upload failed, clean it up so no
      // broken link is left behind. The files stay selected, so trying again
      // is a single click.
      if (created && created.slug && created.delete_token) {
        deleteDrop(created.slug, created.delete_token).catch(() => {})
      }
      setError(err.message || 'Something went wrong.')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  function sendMore() {
    setResult(null)
    setError('')
    setPassword('')
    setMaxDownloads('')
    setDeleteAfterDownload(false)
  }

  if (result) {
    const shareLink = `${window.location.origin}/d/${result.slug}`
    const deletePath = `/delete/${result.slug}?token=${result.delete_token}`
    return (
      <div className="card center">
        <h1>Your link is ready</h1>
        <div className="linkrow">
          <input
            className="link"
            type="text"
            readOnly
            value={shareLink}
            onFocus={(e) => e.target.select()}
          />
          <button className="btn" onClick={() => copyText(shareLink, 'share')}>
            {copied === 'share' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="qr">
          <div className="qrbox">
            <QRCodeSVG value={shareLink} size={160} marginSize={2} />
          </div>
          <p className="small muted">Scan to open on your phone</p>
        </div>
        <p className="small muted">Expires: {new Date(result.expires_at).toLocaleString()}</p>
        <div className="create-row">
          <FlowButton text="Send more files" onClick={sendMore} />
          <Link className="flow-button flow-button--danger" to={deletePath}>
            Open delete page
          </Link>
        </div>
      </div>
    )
  }

  return (
    <TiltedCard
      className="tilted-main-card"
      containerHeight="auto"
      containerWidth="100%"
      imageHeight="auto"
      imageWidth="100%"
      rotateAmplitude={2}
      scaleOnHover={1.02}
      showMobileWarning={false}
      showTooltip={false}
    >
      <div className="card">
        <h1>Send files that self-destruct</h1>
        <p className="muted">
          Upload files and share the link. They are removed when they expire, when the
          download limit is reached, or right after the first download.
        </p>

        <BorderGlow
          className="dropzone-glow"
          backgroundColor="rgba(22, 22, 26, 0.45)"
          borderRadius={9}
          edgeSensitivity={25}
          glowRadius={30}
          glowIntensity={1.1}
          glowColor="56 89 63"
          colors={['#f5e94a', '#fbf6b0', '#e8dc4e']}
        >
          <div
            className={`dropzone${dragging ? ' dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(Array.from(e.dataTransfer.files || []))
            }}
          >
            <p><strong>Drag files here</strong> or click to choose</p>
            <p className="small">Up to 20 files per drop</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []))
                e.target.value = ''
              }}
            />
          </div>
        </BorderGlow>

        {files.length > 0 && (
          <>
            <ul className="filelist">
              {files.map((f) => (
                <li key={f.name}>
                  <span className="name">{f.name}</span>
                  <span className="muted small">{formatBytes(f.size)}</span>
                  <HoldButton
                    size="sm"
                    radius={7}
                    holdTime={800}
                    backgroundColor="rgba(22, 22, 26, 0.45)"
                    fillColor="#8b1a1a"
                    textColor="#f2f2f2"
                    fillTextColor="#ffffff"
                    doneLabel="Removed"
                    onHold={() => {
                      removeFile(f.name)
                      notify?.('File removed', f.name)
                    }}
                  >
                    Hold to remove
                  </HoldButton>
                </li>
              ))}
            </ul>
            <p className="total">
              {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(totalSize)}
            </p>
          </>
        )}

        <div className="options">
          <div className="field">
            Expires after
            <GlideSelect
              options={EXPIRY_SELECT_OPTIONS}
              value={String(expiryHours)}
              onChange={(value) => setExpiryHours(Number(value))}
              disabled={uploading}
              ariaLabel="Expires after"
              showTags={false}
              size="lg"
              menuWidth={160}
              accentColor="#e8825a"
              surfaceColor="rgba(22, 22, 26, 0.45)"
              highlightColor="rgba(255, 255, 255, 0.12)"
              textColor="#f2f2f2"
            />
          </div>
          <label>
            Password (optional)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="none"
              disabled={uploading}
            />
          </label>
          <label>
            Max downloads (optional)
            <input
              type="number"
              min="1"
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
              placeholder="unlimited"
              disabled={uploading}
            />
          </label>
        </div>

        <SpringCheck
          className="spring-check-row"
          label="Delete right after the first download"
          checked={deleteAfterDownload}
          onChange={setDeleteAfterDownload}
          disabled={uploading}
          color="#f2f2f2"
          fillColor="#EAB308"
          checkColor="#1a1210"
          boxSize={18}
          boxRadius={6}
          fontSize={14}
        />

        {uploading && (
          <>
            <div className="progress">
              <div className="bar" style={{ width: `${progress}%` }} />
            </div>
            <p className="small muted">Uploading… {progress}%</p>
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="create-row">
          <FlowButton
            text={uploading ? 'Uploading…' : 'Create link'}
            onClick={handleCreate}
            disabled={files.length === 0 || uploading}
          />
        </div>
      </div>
    </TiltedCard>
  )
}
