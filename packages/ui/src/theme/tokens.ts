/**
 * 4pt spacing scale. Every gap in the app is one of these.
 *
 * One-for-one with the web client's `--space-1` … `--space-12`.
 */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/** Mirrors the web's `--radius-sm` … `--radius-full`. */
export const radius = {
  none: 0,
  sm: 5,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  pill: 9999,
} as const;

/**
 * The web draws depth with a 1px border on a lighter surface, not with shadow —
 * shadows there are reserved for things that float over the page. Cards match
 * that and stay flat; only genuinely overlaid surfaces cast one.
 */
export const elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  /** Cards sit *in* the page, so they carry no shadow — web `--shadow-sm` is a 1px hairline. */
  card: { shadowOpacity: 0, elevation: 0 },
  /** Popovers and floating actions — web `--shadow-md`. */
  popover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 8,
  },
  /** Sheets — web `--shadow-lg`. */
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.36,
    shadowRadius: 48,
    elevation: 16,
  },
} as const;

/**
 * The web draws every divider and control edge at a true 1px. React Native's
 * hairline is thinner than that on a 2x/3x screen, which reads as a different
 * design — so borders are an explicit token rather than `hairlineWidth`.
 */
export const borderWidth = { hairline: 1, thick: 2 } as const;

/**
 * Motion tokens. Durations are short on purpose: motion here communicates a
 * state change, it does not perform. `fast`/`base` match the web's
 * `--transition-fast` and `--transition-normal`.
 */
export const motion = {
  duration: { instant: 80, fast: 120, base: 180, slow: 320 },
  /** Reanimated easing-friendly cubic-bezier control points. */
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
    accelerate: [0.3, 0, 1, 1] as const,
  },
  spring: { damping: 20, stiffness: 220, mass: 0.9 },
  pressScale: 0.97,
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radius;
