import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChatPanel } from "./chat-panel";

type IconMode = "idle" | "smile" | "wave";

const SMILE_FRAME_COUNT = 23;
const WAVE_FRAME_COUNT = 46;
const FRAME_INTERVAL_MS = 1000 / 18;

const SMILE_FRAMES = Array.from(
  { length: SMILE_FRAME_COUNT },
  (_, i) => `/mascot/smile/frame-${String(i + 1).padStart(2, "0")}.png`,
);
const WAVE_FRAMES = Array.from(
  { length: WAVE_FRAME_COUNT },
  (_, i) => `/mascot/wave/frame-${String(i + 1).padStart(2, "0")}.png`,
);

/**
 * Floating mascot button, fixed over the storefront shell. Hover plays a
 * looping "smile" PNG frame sequence and click plays a one-shot "wave"
 * sequence — real transparent PNG frames (no video, so no black backdrop
 * from a missing alpha channel). Idle is the static poster frame. Only
 * motion left is the float loop; no scale-based zoom on hover/tap.
 */
export function MascotChatWidget() {
  const [iconMode, setIconMode] = useState<IconMode>("idle");
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    for (const src of [...SMILE_FRAMES, ...WAVE_FRAMES]) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  useEffect(() => {
    if (iconMode === "idle") return;
    const frameCount = iconMode === "smile" ? SMILE_FRAME_COUNT : WAVE_FRAME_COUNT;
    const id = setInterval(() => {
      setFrameIndex((i) => {
        const next = i + 1;
        if (next < frameCount) return next;
        if (iconMode === "smile") return 0; // loop while hovered
        setIconMode(hovered ? "smile" : "idle"); // wave played once
        return 0;
      });
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  }, [iconMode, hovered]);

  const handleEnter = () => {
    setHovered(true);
    setIconMode((current) => {
      if (current !== "idle") return current;
      setFrameIndex(0);
      return "smile";
    });
  };

  const handleLeave = () => {
    setHovered(false);
    setIconMode((current) => (current === "smile" ? "idle" : current));
  };

  const handleToggle = () => {
    setOpen((current) => !current);
    setFrameIndex(0);
    setIconMode("wave");
  };

  const src =
    iconMode === "idle"
      ? "/mascot/mascot-idle.png"
      : iconMode === "smile"
        ? SMILE_FRAMES[frameIndex]
        : WAVE_FRAMES[frameIndex];

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
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-contain drop-shadow-lg"
        />
      </motion.button>
    </div>
  );
}
