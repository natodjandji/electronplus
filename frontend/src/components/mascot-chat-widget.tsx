import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChatPanel } from "./chat-panel";
import mascotIdle from "@/assets/mascot/mascot-idle.webp";
import smileSheet from "@/assets/mascot/smile.webp";
import waveSheet from "@/assets/mascot/wave.webp";

type Animation = "smile" | "wave";
type IconMode = "idle" | Animation;

/** Each animation is one WebP strip of 220×252 frames, left to right. */
const ANIMATIONS: Record<Animation, { sheet: string; frames: number }> = {
  smile: { sheet: smileSheet, frames: 23 },
  wave: { sheet: waveSheet, frames: 46 },
};
const FRAME_INTERVAL_MS = 1000 / 18;

/**
 * Floating mascot button, fixed over the storefront shell. Hover plays a
 * looping "smile" and click plays a one-shot "wave"; idle is the static
 * poster frame. Only motion left is the float loop; no scale-based zoom on
 * hover/tap.
 *
 * The frames come as two transparent WebP strips (~640 KB) fetched on the
 * first hover, focus or tap — every visitor used to download 69 separate
 * PNGs (4.7 MB) on page load whether they touched the mascot or not. Until
 * a strip has loaded, the idle frame stays up.
 */
export function MascotChatWidget() {
  const [iconMode, setIconMode] = useState<IconMode>("idle");
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [loaded, setLoaded] = useState<Record<Animation, boolean>>({ smile: false, wave: false });
  const requested = useRef(false);

  const loadAnimations = () => {
    if (requested.current) return;
    requested.current = true;
    for (const [name, { sheet }] of Object.entries(ANIMATIONS) as [
      Animation,
      (typeof ANIMATIONS)[Animation],
    ][]) {
      const img = new Image();
      img.src = sheet;
      img
        .decode()
        .then(() => setLoaded((current) => ({ ...current, [name]: true })))
        .catch(() => {
          // Stays on the idle frame — nothing to recover.
        });
    }
  };

  const playing = iconMode !== "idle" && loaded[iconMode];

  useEffect(() => {
    if (iconMode === "idle" || !loaded[iconMode]) return;
    const frameCount = ANIMATIONS[iconMode].frames;
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
  }, [iconMode, hovered, loaded]);

  const handleEnter = () => {
    loadAnimations();
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
    loadAnimations();
    setOpen((current) => !current);
    setFrameIndex(0);
    setIconMode("wave");
  };

  const animation = iconMode === "idle" ? null : ANIMATIONS[iconMode];

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
        {playing && animation ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="aspect-[220/252] h-full bg-no-repeat drop-shadow-lg"
              style={{
                backgroundImage: `url(${animation.sheet})`,
                backgroundSize: `${animation.frames * 100}% 100%`,
                backgroundPosition: `${(frameIndex / (animation.frames - 1)) * 100}% 0`,
              }}
            />
          </span>
        ) : (
          <img
            src={mascotIdle}
            alt=""
            className="absolute inset-0 h-full w-full object-contain drop-shadow-lg"
          />
        )}
      </motion.button>
    </div>
  );
}
