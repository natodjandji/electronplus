import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "./chat-panel";

type IconMode = "idle" | "smile" | "wave";

/**
 * Floating mascot button, fixed over the storefront shell. Idle is a static
 * poster frame with a gentle float; hover crossfades to a looping "smile"
 * clip; click opens the chat panel and plays a one-shot "wave" clip, then
 * falls back to whichever of the two idle states applies.
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
    setOpen((current) => {
      const next = !current;
      if (next) setIconMode("wave");
      return next;
    });
  };

  const handleWaveEnded = () => {
    setIconMode((current) => (current === "wave" ? (hovered ? "smile" : "idle") : current));
  };

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
        animate={iconMode === "idle" ? { y: [0, -6, 0] } : { y: 0 }}
        transition={
          iconMode === "idle"
            ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.2 }
        }
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.96 }}
        className="pointer-events-auto relative h-24 w-24 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow focus-visible:ring-offset-2 sm:h-32 sm:w-32"
      >
        <img
          src="/mascot/mascot-idle.png"
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-contain drop-shadow-lg transition-opacity duration-150",
            iconMode === "idle" ? "opacity-100" : "opacity-0",
          )}
        />
        {iconMode !== "idle" && (
          <video
            key={iconMode}
            className="absolute inset-0 h-full w-full object-contain drop-shadow-lg"
            autoPlay
            muted
            playsInline
            loop={iconMode === "smile"}
            onEnded={iconMode === "wave" ? handleWaveEnded : undefined}
          >
            <source src={`/mascot/mascot-${iconMode}.webm`} type="video/webm" />
            <source src={`/mascot/mascot-${iconMode}.mov`} type='video/mp4; codecs="hvc1"' />
          </video>
        )}
      </motion.button>
    </div>
  );
}
