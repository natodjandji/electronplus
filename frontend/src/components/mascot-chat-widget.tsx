import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "./chat-panel";

type IconMode = "idle" | "smile" | "wave";

const WAVE_DURATION_MS = 1400;

/**
 * Floating mascot button, fixed over the storefront shell. Idle/hover/click
 * are all static PNGs crossfaded by opacity — the old hover "smile" and
 * click "wave" states used video clips with no alpha channel, which is what
 * rendered as an opaque black box on top of the mascot instead of
 * transparency. The only motion left is the idle float loop; no scale-based
 * zoom on hover/tap.
 */
export function MascotChatWidget() {
  const [iconMode, setIconMode] = useState<IconMode>("idle");
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);

  const handleEnter = () => {
    setHovered(true);
    setIconMode((current) => (current === "idle" ? "smile" : current));
  };

  const handleLeave = () => {
    setHovered(false);
    setIconMode((current) => (current === "smile" ? "idle" : current));
  };

  const handleToggle = () => {
    setOpen((current) => !current);
    setIconMode("wave");
  };

  useEffect(() => {
    if (iconMode !== "wave") return;
    const timer = setTimeout(() => {
      setIconMode(hovered ? "smile" : "idle");
    }, WAVE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [iconMode, hovered]);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      <ChatPanel open={open} onClose={() => setOpen(false)} />

      <motion.button
        type="button"
        aria-label={open ? "Cerrar asistente de Electron Plus" : "Abrir asistente de Electron Plus"}
        aria-expanded={open}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        onClick={handleToggle}
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-auto relative h-24 w-24 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow focus-visible:ring-offset-2 sm:h-32 sm:w-32"
      >
        {(["idle", "smile", "wave"] as const).map((mode) => (
          <img
            key={mode}
            src={`/mascot/mascot-${mode}.png`}
            alt=""
            className={cn(
              "absolute inset-0 h-full w-full object-contain drop-shadow-lg transition-opacity duration-150",
              iconMode === mode ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </motion.button>
    </div>
  );
}
