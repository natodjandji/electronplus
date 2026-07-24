import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const spring = { type: "spring", stiffness: 300, damping: 30 } as const;

/** ease-out-quint — confident, decisive settle, no bounce. Shared across the
 * app's hand-rolled (non-spring) motion so timing feels like one system. */
export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: spring },
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
