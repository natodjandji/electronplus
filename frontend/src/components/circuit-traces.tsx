/**
 * Animated "circuit board" decorations — brand-blue traces with yellow
 * current pulses traveling along them. Pure SVG (`animateMotion`), so the
 * animation costs no JS and pauses automatically for users with
 * prefers-reduced-motion (see styles.css).
 */

const TRACES = [
  "M0 40 H180 L220 80 H420 L460 40 H720 L760 80 H1100",
  "M0 120 H260 L300 80 H560 L600 120 H900 L940 80 H1100",
  "M60 0 V60 L100 100 V180",
  "M840 0 V50 L880 90 V180",
];

const NODES: [number, number][] = [
  [180, 40],
  [420, 80],
  [720, 40],
  [260, 120],
  [560, 80],
  [900, 120],
  [100, 100],
  [880, 90],
];

function Pulse({ path, dur, begin }: { path: string; dur: number; begin: number }) {
  return (
    <circle r="3" fill="#ffb703" className="circuit-pulse">
      <animateMotion
        dur={`${dur}s`}
        begin={`${begin}s`}
        repeatCount="indefinite"
        path={path}
        keyPoints="0;1"
        keyTimes="0;1"
        calcMode="linear"
      />
      <animate
        attributeName="opacity"
        values="0;1;1;0"
        keyTimes="0;0.1;0.9;1"
        dur={`${dur}s`}
        begin={`${begin}s`}
        repeatCount="indefinite"
      />
    </circle>
  );
}

export function CircuitBackground({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1100 180"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      {TRACES.map((d) => (
        <path key={d} d={d} fill="none" stroke="#0056b3" strokeOpacity="0.14" strokeWidth="1.5" />
      ))}
      {NODES.map(([cx, cy]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="3"
          fill="none"
          stroke="#0056b3"
          strokeOpacity="0.25"
          strokeWidth="1.5"
        />
      ))}
      <Pulse path={TRACES[0]} dur={9} begin={0} />
      <Pulse path={TRACES[1]} dur={11} begin={3.5} />
      <Pulse path={TRACES[2]} dur={6} begin={1.5} />
    </svg>
  );
}

export function CircuitDivider({ className = "" }: { className?: string }) {
  const path = "M0 8 H320 L340 2 H700 L720 8 H1100";
  return (
    <div aria-hidden className={`relative h-4 w-full overflow-hidden ${className}`}>
      <svg viewBox="0 0 1100 16" preserveAspectRatio="none" className="h-full w-full">
        <path d={path} fill="none" stroke="#0056b3" strokeOpacity="0.18" strokeWidth="1.5" />
        <Pulse path={path} dur={7} begin={0} />
      </svg>
    </div>
  );
}
