/**
 * Purely visual QR-code placeholder. Deterministic pattern derived from the
 * seed so different products render distinct blocks. Replace with a real
 * QR generator when wiring to backend.
 */
export function QrBlock({ seed, size = 128 }: { seed: string; size?: number }) {
  const grid = 21;
  const cells: boolean[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < grid * grid; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    cells.push((h & 1) === 1);
  }
  // Force finder patterns in three corners
  const finder = (r: number, c: number) => {
    for (let dr = 0; dr < 7; dr++)
      for (let dc = 0; dc < 7; dc++) {
        const on =
          dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        cells[(r + dr) * grid + (c + dc)] = on;
      }
  };
  finder(0, 0);
  finder(0, grid - 7);
  finder(grid - 7, 0);

  const cell = size / grid;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-sm bg-white">
      {cells.map((on, i) =>
        on ? (
          <rect
            key={i}
            x={(i % grid) * cell}
            y={Math.floor(i / grid) * cell}
            width={cell}
            height={cell}
            fill="#0b2545"
          />
        ) : null,
      )}
    </svg>
  );
}
