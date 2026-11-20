const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Compact number formatting: 1,234 → 1.23K, 1e15 → 1.00Qa. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return `-${fmt(-n)}`;
  if (n < 1000) {
    if (n === 0) return '0';
    if (n < 10 && n % 1 !== 0) return n.toFixed(1);
    return Math.floor(n).toString();
  }
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace('+', '');
  const scaled = n / 10 ** (tier * 3);
  // Guard against 999.999 rounding up to "1000K".
  const text = scaled >= 999.5 ? '999' : scaled.toPrecision(3);
  return `${text}${SUFFIXES[tier]}`;
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function fmtFps(fps: number): string {
  if (fps >= 10) return `${Math.round(fps)} FPS`;
  if (fps >= 1) return `${fps.toFixed(1)} FPS`;
  // Below 1 FPS it is more honest to count seconds per frame.
  return `${(1 / fps).toFixed(fps < 0.01 ? 0 : 1)} SPF`;
}
