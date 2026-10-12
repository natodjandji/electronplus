import { useEffect, useRef, useState } from "react";
import { CameraOff, Loader2, X } from "lucide-react";
import { createCodeReader } from "@/lib/code-reader";
import { Button } from "@/components/ui/button";

/** A label held under the camera keeps being read; it counts again only
 * after it has been out of view this long. */
const SAME_CODE_COOLDOWN_MS = 1500;
const DETECT_INTERVAL_MS = 150;

function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Permite el acceso a la cámara en el navegador para escanear las etiquetas.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No encontramos una cámara en este dispositivo.";
  }
  if (name === "NotReadableError") {
    return "Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo.";
  }
  return "No pudimos abrir la cámara. Busca el producto por nombre o código.";
}

/**
 * Live camera view that reads the labels' QR codes and barcodes. Reports
 * each code once while it stays in view; to count the same product again,
 * the seller moves the label away for a moment and back.
 */
export function CodeScanner({
  onCode,
  onClose,
}: {
  onCode: (raw: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [state, setState] = useState<
    { kind: "starting" | "scanning" } | { kind: "error"; message: string }
  >({
    kind: "starting",
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = { code: "", at: 0 };

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("getUserMedia unavailable"), { name: "NotFoundError" });
        }
        const [media, reader] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          }),
          createCodeReader(),
        ]);
        stream = media;
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = media;
        await video.play();
        if (stopped) return;
        setState({ kind: "scanning" });

        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            try {
              const [found] = await reader.detect(video);
              const now = Date.now();
              if (
                found?.rawValue &&
                (found.rawValue !== last.code || now - last.at > SAME_CODE_COOLDOWN_MS)
              ) {
                onCodeRef.current(found.rawValue);
              }
              if (found?.rawValue) last = { code: found.rawValue, at: now };
            } catch {
              // A frame that can't be decoded; the next one usually can.
            }
          }
          timer = setTimeout(() => void tick(), DETECT_INTERVAL_MS);
        };
        void tick();
      } catch (error) {
        if (!stopped) setState({ kind: "error", message: cameraErrorMessage(error) });
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl bg-brand-navy">
      <div className="relative aspect-[4/3] w-full">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
        />

        {state.kind === "scanning" && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative aspect-square w-[58%] max-w-64">
              {[
                "left-0 top-0 border-l-4 border-t-4 rounded-tl-xl",
                "right-0 top-0 border-r-4 border-t-4 rounded-tr-xl",
                "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl",
                "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl",
              ].map((corner) => (
                <span key={corner} className={`absolute h-8 w-8 border-brand-yellow ${corner}`} />
              ))}
            </div>
          </div>
        )}

        {state.kind === "starting" && (
          <div className="absolute inset-0 grid place-items-center text-white/80">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Abriendo la cámara…
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            <div className="flex max-w-xs flex-col items-center gap-2 text-sm">
              <CameraOff className="h-6 w-6 text-brand-yellow" />
              {state.message}
            </div>
          </div>
        )}

        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={onClose}
          aria-label="Cerrar la cámara"
          className="absolute right-2 top-2 h-9 w-9 rounded-full bg-black/50 text-white hover:bg-black/70"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {state.kind === "scanning" && (
        <p className="px-3 py-2 text-center text-xs text-white/80">
          Apunta al código QR o de barras de la etiqueta. Cada lectura suma una unidad.
        </p>
      )}
    </div>
  );
}
