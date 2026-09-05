import { useEffect, useState } from 'react';
import type { Transition, Variants } from 'framer-motion';

/**
 * SCRIVIA Cloud motion language.
 *
 * Every screen transition and card animation in the app derives from these
 * shared variants so the feel stays consistent: pages fade-up in 0.4s with an
 * easeOut, cards stagger in at 0.05s apart (scale 0.96 → 1), and the sidebar
 * animates with a spring (stiffness 300 / damping 30).
 */

export const pageTransition: Transition = { duration: 0.4, ease: 'easeOut' };

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: pageTransition },
  exit: { opacity: 0, y: -12, transition: { duration: 0.22, ease: 'easeIn' } },
};

/** Parent container that staggers its fadeUpItem children at 0.05s. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

/** Card entrance: fade-up with a subtle scale (0.96 → 1), 0.4s easeOut. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

/** Lighter variant for lists/rows. */
export const fadeUpItemSoft: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

/** Scale-in used by modals and the command palette. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
};

/** Slide-in from the right — used for panels and AI-feeds. */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 40 },
  show: { opacity: 1, x: 0, transition: { duration: 0.32, ease: 'easeOut' } },
};

/** Sidebar expand/collapse spring (spec: stiffness 300, damping 30). */
export const sidebarSpring = { type: 'spring', stiffness: 300, damping: 30 } as const;

/** Softer spring for the active-nav indicator and badges. */
export const springSoft = { type: 'spring', stiffness: 380, damping: 32 } as const;

/** Animated count-up for premium KPI numbers (easeOutCubic, rAF-driven).
 *
 * No "started" guard here: under React StrictMode (dev) effects mount →
 * cleanup → remount, so a once-only guard cancels the first rAF and then
 * bails on the remount, leaving the value frozen at 0. Re-running the
 * animation on every (target) change is what makes the KPI cards always
 * settle on the real number. */
export function useCountUpValue(target: number, duration = 900): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setValue(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/** Deterministic decorative sparkline series (stable across re-renders). */
export function sparkSeries(seed: string, points = 8, min = 0.4, max = 1): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    out.push(min + rand() * (max - min));
  }
  return out;
}
