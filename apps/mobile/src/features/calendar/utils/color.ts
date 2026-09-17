/**
 * Hex → rgba, so a calendar colour can tint a surface at low opacity.
 *
 * Calendar colours arrive from providers as hex. Tinting rather than filling
 * keeps several events on one surface readable instead of turning the surface
 * into a block of colour.
 */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;

  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);

  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) return hex;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
