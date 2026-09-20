import { memo, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import useTilt from './useTilt.js'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { CloudUpload, Clock, Lock, Download, Flame, QrCode, Files } from 'lucide-react'
import { createDrop, deleteDrop, formatBytes, uploadAll } from './api.js'
import BorderGlow from './BorderGlow.jsx'
import FlowButton from './FlowButton.jsx'
import GlideSelect from './GlideSelect.jsx'
import HoldButton from './HoldButton.jsx'
import SpringCheck from './SpringCheck.jsx'
import FolderFloat from './FolderFloat.jsx'
import NavPills from './NavPills.jsx'
import ScrollVelocity from './ScrollVelocity.jsx'
import TiltedCard from './TiltedCard.jsx'
import StrokeText from './StrokeText.jsx'

const EXPIRY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
]

const EXPIRY_SELECT_OPTIONS = EXPIRY_OPTIONS.map((o) => ({
  value: String(o.hours),
  label: o.label,
}))

// Bento grid feature cards, ordered to fill every grid row. `span` sets the
// column span; `detail` marks the two cards with live display-only details.
const BENTO_ITEMS = [
  { id: 'expiring', icon: Clock, title: 'Auto-expiring links', line: 'Choose 1 hour, 24 hours, or 7 days.', span: 2, detail: 'countdown' },
  { id: 'password', icon: Lock, title: 'Password protection', line: 'Lock any drop with a password.', span: 1 },
  { id: 'limits', icon: Download, title: 'Download limits', line: 'Cap how many times a file can be downloaded.', span: 1 },
  { id: 'burn', icon: Flame, title: 'Burn after reading', line: 'Delete it right after the first download.', span: 2, detail: 'chip' },
  { id: 'qr', icon: QrCode, title: 'QR code sharing', line: 'Scan to open the link on your phone.', span: 2 },
  { id: 'files', icon: Files, title: 'Multiple files', line: 'Send up to 20 files in one link.', span: 1 },
]

const MARQUEE_TEXTS = [
  'Upload • Share • Vanish •',
  'No account needed • Auto-deletes • Password protected •',
]

const MARQUEE_VELOCITY_MAPPING = { input: [0, 1000], output: [0, 0] }

const STEPS = [
  '1 · Upload files, pick an expiry',
  '2 · Share the link or QR code',
  '3 · Files vanish when time is up',
]

// Picks the pill-cloud spread from the viewport width so the three pills sit
// in one row on desktop and wrap on smaller screens.
function useResponsiveSpread() {
  const get = () => {
    const w = typeof window === 'undefined' ? 1024 : window.innerWidth
    if (w > 1000) return 370
    if (w >= 600) return 250
    return 140
  }
  const [spread, setSpread] = useState(get)
  useEffect(() => {
    const onResize = () => setSpread(get())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return spread
}

// Isolated so page re-renders (uploads, countdown ticks) never restart the physics.
const HowItWorksFolder = memo(function HowItWorksFolder() {
  const spread = useResponsiveSpread()
  return (
    <FolderFloat
      items={STEPS}
      label="How it works"
      sublabel=""
      trigger="hover"
      closeOnSelect={true}
      physics={true}
      drift={0.5}
      folderColor="#ab8308"
      frontColor="#eab308"
      paperColor="#f5f5f5"
      itemColor="#ffffff"
      itemTextColor="#18181b"
      labelColor="#000000"
      width={200}
      height={148}
      radius={14}
      spread={spread}
      lift={26}
      tilt={8}
      flapAngle={34}
      restAngle={16}
      openDuration={520}
      stagger={45}
      bounce={0.3}
    />
  )
})

// Own component + state so its 1-second ticks don't re-render the whole page.
function CountdownPill() {
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [secondsLeft, setSecondsLeft] = useState(23 * 3600 + 59 * 60 + 59)

  useEffect(() => {
    if (reduceMotion) return undefined
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(t)
  }, [reduceMotion])

  const countdown = [
    Math.floor(secondsLeft / 3600),
    Math.floor((secondsLeft % 3600) / 60),
    secondsLeft % 60,
  ]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')

  return (
    <span className="bento-countdown" aria-hidden="true">
      {countdown}
    </span>
  )
}

// Feature card with the same tilt effect as the upload card (useTilt copies
// TiltedCard's math and springs). Skipped under prefers-reduced-motion and
// resets to flat on mouse leave.
function BentoCard({ item, rotateAmplitude = 2 }) {
  const tilt = useTilt(rotateAmplitude)

  return (
    <article
      ref={tilt.ref}
      className={`bento-card${item.span === 2 ? ' bento-card--span2' : ''}`}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
    >
      <motion.div className="bento-card__inner" style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY }}>
        <span className="bento-icon" aria-hidden="true">
          <item.icon size={28} strokeWidth={1.8} />
        </span>
        <h3 className="bento-title">{item.title}</h3>
        <p className="bento-line">{item.line}</p>
        {item.detail === 'countdown' && <CountdownPill />}
        {item.detail === 'chip' && (
          <span className="bento-burn" aria-hidden="true">
            <span className="bento-chip">report.pdf</span>
          </span>
        )}
      </motion.div>
    </article>
  )
}


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

  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return undefined
    const t = setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
    }, 0)
    return () => clearTimeout(t)
  }, [])

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
    <div className="home-column">
      <header className="topbar">
        <Link to="/" className="brand">
          <img className="logo" src="/logo.png" alt="" />
          DropPortal
        </Link>
        <nav className="topbar-nav" aria-label="Main">
          <NavPills />
        </nav>
      </header>

      <section className="hero" aria-label="Drop Portal">
      <div className="hero-word" aria-hidden="true">
        <StrokeText
          text="Drop Portal"
          strokeColor="#ffc100"
          fillColor="#ffc100"
          strokeWidth={1.4}
          drawDuration={2}
          fillDelay={0.2}
          stagger={0.05}
          ease="power2.out"
          trigger="loop"
          fillMode="wipe"
          fontSize={128}
          fontWeight={800}
          letterSpacing={-4}
          reverse={false}
        />
      </div>
        <p className="hero-tagline">Share files that disappear.</p>
        <p className="hero-subtitle">No account. No trace. Your files delete themselves.</p>
        <div className="hero-badges" aria-hidden="false">
          <span className="hero-badge">No account needed</span>
          <span className="hero-badge">Auto-deletes</span>
          <span className="hero-badge">Password protected</span>
        </div>
      </section>

      <section className="features-bento" id="features" aria-label="Features">
        <p className="section-label">Features</p>
        <h2 className="section-heading">Everything you need, nothing you don't</h2>
        <div className="bento-grid">
          {BENTO_ITEMS.map((item) => (
            <BentoCard key={item.id} item={item} rotateAmplitude={2} />
          ))}
        </div>
      </section>

    <section className="upload-section" id="upload">
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
            <span className="dropzone-tile" aria-hidden="true">
              <CloudUpload size={30} />
            </span>
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
              className="no-spinner"
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
    </section>

      <section className="how-section" id="how-it-works" aria-label="How it works">
        <p className="section-label">How it works</p>
        <h2 className="section-heading">Three steps to a vanished file</h2>
        <div className="how-folder">
          <HowItWorksFolder />
        </div>
      </section>

      <div className="velocity-marquee">
        <ScrollVelocity
          texts={MARQUEE_TEXTS}
          velocity={40}
          className="marquee-text"
          numCopies={4}
          velocityMapping={MARQUEE_VELOCITY_MAPPING}
        />
      </div>
    </div>
  )
}
