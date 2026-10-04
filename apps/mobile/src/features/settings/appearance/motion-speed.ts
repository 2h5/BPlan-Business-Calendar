/**
 * Fast animations: every animation in the app plays at twice its normal speed,
 * like Android's 0.5× animator duration scale. Device-local, as the theme is.
 */
export const FAST_MOTION_STORAGE_KEY = 'bcal_fast_motion';

/** How long motion takes with Fast animations on, relative to normal. */
export const FAST_MOTION_SCALE = 0.5;

export function parseFastMotion(stored: string | null): boolean {
  return stored === 'true';
}

export function motionScaleFor(fastMotion: boolean): number {
  return fastMotion ? FAST_MOTION_SCALE : 1;
}
