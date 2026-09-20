import { useRef } from 'react'
import { useMotionValue, useSpring } from 'motion/react'

// Same spring configuration TiltedCard uses for the upload card.
const springValues = {
  damping: 30,
  stiffness: 100,
  mass: 2
}

// Shared pointer tilt with the exact same math as TiltedCard: cursor offset
// from the element center scaled by rotateAmplitude, spring-smoothed, and
// reset to flat on mouse leave so the card returns smoothly. Skipped entirely
// when the user prefers reduced motion.
export default function useTilt(rotateAmplitude = 2) {
  const ref = useRef(null)
  const rotateX = useSpring(useMotionValue(0), springValues)
  const rotateY = useSpring(useMotionValue(0), springValues)

  const onMouseMove = (e) => {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    if (!ref.current) return

    const rect = ref.current.getBoundingClientRect()
    const offsetX = e.clientX - rect.left - rect.width / 2
    const offsetY = e.clientY - rect.top - rect.height / 2

    rotateX.set((offsetY / (rect.height / 2)) * -rotateAmplitude)
    rotateY.set((offsetX / (rect.width / 2)) * rotateAmplitude)
  }

  const onMouseLeave = () => {
    rotateX.set(0)
    rotateY.set(0)
  }

  return { ref, rotateX, rotateY, onMouseMove, onMouseLeave }
}
