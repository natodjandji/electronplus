import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const spring = { type: "spring", stiffness: 300, damping: 30 } as const;

/** ease-out-quint — confident, decisive settle, no bounce. Shared across the
 * app's hand-rolled (non-spring) motion so timing feels like one system. */
export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

/** Lists cascade in at STAGGER_STEP per item, capped at STAGGER_MAX_STEPS so
 * a long list (orders, quotes) never makes its last rows wait — the cascade
 * tops out at ~0.3s however many items there are. Items pass their index as
 * `custom`; without it they simply appear together. */
const STAGGER_STEP = 0.04;
const STAGGER_MAX_STEPS = 8;

export const staggerContainer: Variants = {
  hidden: {},
  show: {},
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...spring, delay: Math.min(index, STAGGER_MAX_STEPS) * STAGGER_STEP },
  }),
};

/** Fade + rise on mount — used for page-level content in the shells.
 * `print:contents` drops this wrapper's own box at print time so it can't
 * add stray spacing/positioning context around whatever the page prints. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="print:contents"
    >
      {children}
    </motion.div>
  );
}
