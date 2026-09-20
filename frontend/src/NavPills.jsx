import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { LayoutGrid, Workflow, Upload } from 'lucide-react';
import './NavPills.css';

const NAV_PILL_ITEMS = [
  { label: 'Features', icon: LayoutGrid, target: 'features' },
  { label: 'How it works', icon: Workflow, target: 'how-it-works' },
  { label: 'Send files', icon: Upload, target: 'upload' },
];

// Section that is most in view wins; null while the hero is on screen.
function useActiveSection(targets) {
  const [active, setActive] = useState(null);

  useEffect(() => {
    const sections = targets
      .map(id => document.getElementById(id))
      .filter(Boolean);
    if (!sections.length || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const ratios = new Map(sections.map(s => [s.id, 0]));
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        });
        let best = null;
        let bestRatio = 0;
        ratios.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        });
        setActive(best);
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );

    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [targets]);

  return active;
}

const NavPills = () => {
  const targetsRef = useRef(NAV_PILL_ITEMS.map(i => i.target));
  const activeSection = useActiveSection(targetsRef.current);
  const [clicked, setClicked] = useState(null);
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Click wins immediately; otherwise follow the section most in view.
  const activeId = clicked ?? activeSection;
  const activeIndex = NAV_PILL_ITEMS.findIndex(item => item.target === activeId);

  const scrollTo = id => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="nav-pills" aria-label="Main">
      {NAV_PILL_ITEMS.map((item, idx) => {
        const Icon = item.icon;
        const isActive = idx === activeIndex;
        return (
          <motion.button
            key={item.label}
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            className={`nav-pill${isActive ? ' nav-pill--active' : ''}`}
            onClick={() => {
              setClicked(item.target);
              scrollTo(item.target);
            }}
            aria-label={item.label}
            aria-current={isActive ? 'true' : undefined}
          >
            <Icon size={20} strokeWidth={2} aria-hidden="true" />
            <motion.span
              className="nav-pill__label"
              initial={false}
              animate={{
                width: isActive ? 'auto' : '0px',
                opacity: isActive ? 1 : 0,
                marginLeft: isActive ? '8px' : '0px',
              }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      width: { type: 'spring', stiffness: 350, damping: 32 },
                      opacity: { duration: 0.19 },
                      marginLeft: { duration: 0.19 },
                    }
              }
            >
              {item.label}
            </motion.span>
          </motion.button>
        );
      })}
    </nav>
  );
};

export default NavPills;
