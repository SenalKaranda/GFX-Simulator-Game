// Photo mode: stamps the current frame with the only statistics that matter.
import { fidelityScore, rankName, simulatedFps } from '../game/logic';
import { review } from '../game/feed';
import type { GameState } from '../game/state';
import { fmt, fmtFps } from './format';

export function composePhoto(source: HTMLCanvasElement, s: GameState, resolutionLabel: string): HTMLCanvasElement {
  const out = document.createElement('canvas');
  const width = 1600;
  const height = Math.round((width * source.height) / Math.max(1, source.width));
  const banner = 150;
  out.width = width;
  out.height = height + banner;
  const ctx = out.getContext('2d')!;
  // Keep chunky pixels chunky: low resolutions are part of the joke.
  ctx.imageSmoothingEnabled = source.height >= 600;
  ctx.drawImage(source, 0, 0, width, height);

  ctx.fillStyle = '#0a0c11';
  ctx.fillRect(0, height, width, banner);
  const stripe = ctx.createLinearGradient(0, 0, width, 0);
  ['#ff2d6f', '#ffb300', '#2dff9a', '#2db4ff', '#b44dff'].forEach((c, i) => stripe.addColorStop(i / 4, c));
  ctx.fillStyle = stripe;
  ctx.fillRect(0, height, width, 5);

  const r = review(s);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillText('GFX SIMULATOR', 36, height + 62);
  ctx.font = '500 22px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = '#9aa6bd';
  const stats = [
    `Fidelity ${fmt(fidelityScore(s))}`,
    rankName(s),
    resolutionLabel,
    fmtFps(simulatedFps(s)),
    `Gen ${s.generation}`,
    'Gameplay: N/A',
  ].join('   ·   ');
  ctx.fillText(stats, 36, height + 104);
  ctx.font = 'italic 500 20px system-ui, sans-serif';
  ctx.fillStyle = '#6f7b93';
  ctx.fillText(`“${r.quote}”  —  ${r.overall}/10`, 36, height + 134);

  ctx.textAlign = 'right';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillStyle = stripe;
  ctx.fillText(r.graphics, width - 36, height + 92);
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = '#9aa6bd';
  ctx.fillText('GRAPHICS SCORE', width - 36, height + 122);
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
