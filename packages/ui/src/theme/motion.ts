import { motion } from './tokens';

/**
 * Reanimated 4's `withSpring` defaults (its Gentle preset), for any field a
 * spring config leaves out.
 */
const SPRING_DEFAULT_MASS = 4;
const SPRING_DEFAULT_DAMPING = 120;

export interface SpringTokens {
  damping: number;
  stiffness: number;
  mass: number;
}

export interface MotionTokens {
  /**
   * How long motion takes relative to normal: 1 normally, 0.5 with Fast
   * animations on. Multiply any duration that is not a token by this.
   */
  scale: number;
  duration: Record<keyof typeof motion.duration, number>;
  easing: typeof motion.easing;
  spring: SpringTokens;
  pressScale: number;
}

interface SpringConfigLike {
  damping?: number;
  stiffness?: number;
  mass?: number;
  duration?: number;
}

/**
 * Runs a spring at `scale` times its normal duration without changing its
 * character: multiplying mass by `scale²` and damping by `scale` scales the
 * natural period by `scale` and leaves the damping ratio untouched.
 */
export function scaleSpring<T extends SpringConfigLike>(config: T, scale: number): T {
  if (scale === 1) return config;
  if (config.duration !== undefined) return { ...config, duration: config.duration * scale };
  return {
    ...config,
    mass: (config.mass ?? SPRING_DEFAULT_MASS) * scale * scale,
    damping: (config.damping ?? SPRING_DEFAULT_DAMPING) * scale,
  };
}

/** The motion tokens at a given speed; `scale` 0.5 is everything twice as fast. */
export function motionAt(scale: number): MotionTokens {
  const { duration } = motion;
  return {
    scale,
    duration: {
      instant: duration.instant * scale,
      fast: duration.fast * scale,
      base: duration.base * scale,
      slow: duration.slow * scale,
    },
    easing: motion.easing,
    spring: scaleSpring({ ...motion.spring }, scale),
    pressScale: motion.pressScale,
  };
}
