import { useCallback, useState } from 'react'
import SwipeToast from './SwipeToast.jsx'

// Shared success-feedback toasts, rendered as a fixed stack in the
// bottom-right corner. Pages call notify() and render <ToastStack />.
export function useToasts() {
  const [toasts, setToasts] = useState([])

  const notify = useCallback((title, description = '') => {
    setToasts((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, title, description }])
  }, [])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, notify, dismiss }
}

export function ToastStack({ toasts, dismiss }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <SwipeToast
          key={t.id}
          inline
          title={t.title}
          description={t.description}
          duration={4000}
          background="rgba(255, 255, 255, 0.85)"
          color="#111111"
          fuseColor="#eab308"
          onClose={() => dismiss(t.id)}
        />
      ))}
    </div>
  )
}
