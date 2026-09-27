import { describe, expect, it, vi } from 'vitest';

import { ancestorMotion, followAnchorMotion, type AnchorMotionEnvironment } from './anchor-motion';

interface FakeAnimation {
  playState: AnimationPlayState;
  effect: { getComputedTiming: () => { endTime: number } };
}

function fakeAnimation(endTime = 180): FakeAnimation {
  return { playState: 'running', effect: { getComputedTiming: () => ({ endTime }) } };
}

interface FakeElement {
  parentElement: FakeElement | null;
  animations: FakeAnimation[];
  getAnimations: () => FakeAnimation[];
}

function fakeElement(parentElement: FakeElement | null = null): FakeElement {
  const element: FakeElement = {
    parentElement,
    animations: [],
    getAnimations: () => element.animations,
  };
  return element;
}

/** page > view > anchor, mirroring PageTransition > calendar view > event block. */
function fakeTree() {
  const page = fakeElement();
  const view = fakeElement(page);
  const anchor = fakeElement(view);
  return { page, view, anchor, asElement: anchor as unknown as Element };
}

function fakeEnvironment() {
  let nextHandle = 1;
  const frames = new Map<number, () => void>();
  const listeners = new Map<string, (event: Event) => void>();
  const environment: AnchorMotionEnvironment = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    requestAnimationFrame: (callback) => {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: (handle) => frames.delete(handle),
  };
  const runFrame = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  };
  const dispatch = (type: string, target: unknown) =>
    listeners.get(type)?.({ target } as unknown as Event);
  return { environment, runFrame, dispatch, frames, listeners };
}

describe('ancestorMotion', () => {
  it('collects running finite animations on ancestors only', () => {
    const { page, view, anchor, asElement } = fakeTree();
    const pageEnter = fakeAnimation();
    const viewZoom = fakeAnimation();
    page.animations = [pageEnter];
    view.animations = [viewZoom];
    anchor.animations = [fakeAnimation()];

    expect(ancestorMotion(asElement)).toEqual([viewZoom, pageEnter]);
  });

  it('ignores looping and finished animations', () => {
    const { page, view, asElement } = fakeTree();
    page.animations = [fakeAnimation(Infinity)];
    view.animations = [{ ...fakeAnimation(), playState: 'finished' }];

    expect(ancestorMotion(asElement)).toEqual([]);
  });
});

describe('followAnchorMotion', () => {
  it('repositions every frame while a container animates, then once at rest', () => {
    const { page, asElement } = fakeTree();
    const pageEnter = fakeAnimation();
    page.animations = [pageEnter];
    const reposition = vi.fn();
    const { environment, runFrame, frames } = fakeEnvironment();

    followAnchorMotion(() => asElement, reposition, environment);
    runFrame();
    runFrame();
    expect(reposition).toHaveBeenCalledTimes(2);

    pageEnter.playState = 'finished';
    runFrame();
    expect(reposition).toHaveBeenCalledTimes(3);
    expect(frames.size).toBe(0);
  });

  it('does nothing when no container is moving', () => {
    const { anchor, asElement } = fakeTree();
    anchor.animations = [fakeAnimation()];
    const reposition = vi.fn();
    const { environment, frames } = fakeEnvironment();

    followAnchorMotion(() => asElement, reposition, environment);

    expect(frames.size).toBe(0);
    expect(reposition).not.toHaveBeenCalled();
  });

  it('stops following when an animation is cancelled or paused', () => {
    const { page, asElement } = fakeTree();
    const pageEnter = fakeAnimation();
    page.animations = [pageEnter];
    const { environment, runFrame, frames } = fakeEnvironment();

    followAnchorMotion(() => asElement, vi.fn(), environment);
    pageEnter.playState = 'paused';
    runFrame();

    expect(frames.size).toBe(0);
  });

  it('picks up motion that starts later on a container of the anchor', () => {
    const { view, asElement } = fakeTree();
    const reposition = vi.fn();
    const { environment, runFrame, dispatch, frames } = fakeEnvironment();
    followAnchorMotion(() => asElement, reposition, environment);

    view.animations = [fakeAnimation()];
    dispatch('animationstart', view);
    runFrame();

    expect(reposition).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
  });

  it('ignores motion that does not carry the anchor', () => {
    const { view, anchor, asElement } = fakeTree();
    const unrelated = fakeElement();
    const { environment, dispatch, frames } = fakeEnvironment();
    followAnchorMotion(() => asElement, vi.fn(), environment);

    unrelated.animations = [fakeAnimation()];
    dispatch('animationstart', unrelated);
    anchor.animations = [fakeAnimation()];
    dispatch('transitionrun', anchor);
    expect(frames.size).toBe(0);

    view.animations = [fakeAnimation()];
    dispatch('transitionrun', view);
    expect(frames.size).toBe(1);
  });

  it('stops frames and listeners when disposed', () => {
    const { page, asElement } = fakeTree();
    page.animations = [fakeAnimation()];
    const reposition = vi.fn();
    const { environment, runFrame, frames, listeners } = fakeEnvironment();

    const stop = followAnchorMotion(() => asElement, reposition, environment);
    stop();
    runFrame();

    expect(reposition).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(listeners.size).toBe(0);
  });
});
