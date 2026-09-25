/** The browser pieces anchor tracking needs, injectable so the logic can be tested without a DOM. */
export interface AnchorMotionEnvironment {
  addEventListener: (type: string, listener: (event: Event) => void, capture: boolean) => void;
  removeEventListener: (type: string, listener: (event: Event) => void, capture: boolean) => void;
  requestAnimationFrame: (callback: () => void) => number;
  cancelAnimationFrame: (handle: number) => void;
}

// Animations and transitions both surface through Element.getAnimations().
const MOTION_START_EVENTS = ['animationstart', 'transitionrun'] as const;

/**
 * Running, finite animations on the anchor's ancestors: the motion that carries the anchor,
 * such as the page entrance or a calendar view change. The anchor's own effects are left out
 * on purpose, since a floating card positions against the anchor's final size. Looping
 * animations never finish, so they are left out too.
 */
export function ancestorMotion(anchor: Element): Animation[] {
  const motion: Animation[] = [];
  for (let element = anchor.parentElement; element; element = element.parentElement) {
    if (typeof element.getAnimations !== 'function') break;
    for (const animation of element.getAnimations()) {
      if (
        animation.playState === 'running' &&
        Number.isFinite(animation.effect?.getComputedTiming().endTime)
      ) {
        motion.push(animation);
      }
    }
  }
  return motion;
}

function isAncestorOf(candidate: unknown, anchor: Element): boolean {
  for (let element = anchor.parentElement; element; element = element.parentElement) {
    if (element === candidate) return true;
  }
  return false;
}

/**
 * Keep a floating element attached to an anchor while the anchor's containers animate.
 *
 * `reposition` runs every frame for exactly as long as that motion runs, then once more at
 * rest. Motion that starts later (for example a view change while the card is open) is picked
 * up from `animationstart` and `transitionrun`, but only when the animated element contains
 * the anchor. Returns a function that stops tracking.
 */
export function followAnchorMotion(
  getAnchor: () => Element | null,
  reposition: () => void,
  environment: AnchorMotionEnvironment,
): () => void {
  let frame = 0;
  let following = false;
  let stopped = false;

  const follow = () => {
    if (following || stopped) return;
    const anchor = getAnchor();
    const motion = anchor ? ancestorMotion(anchor) : [];
    if (motion.length === 0) return;

    following = true;
    const tick = () => {
      reposition();
      if (motion.some((animation) => animation.playState === 'running')) {
        frame = environment.requestAnimationFrame(tick);
        return;
      }
      following = false;
      // Pick up any motion that began while this batch was running.
      follow();
    };
    frame = environment.requestAnimationFrame(tick);
  };

  const handleMotionStart = (event: Event) => {
    const anchor = getAnchor();
    if (anchor && isAncestorOf(event.target, anchor)) follow();
  };

  follow();
  for (const type of MOTION_START_EVENTS) {
    environment.addEventListener(type, handleMotionStart, true);
  }

  return () => {
    stopped = true;
    environment.cancelAnimationFrame(frame);
    for (const type of MOTION_START_EVENTS) {
      environment.removeEventListener(type, handleMotionStart, true);
    }
  };
}
