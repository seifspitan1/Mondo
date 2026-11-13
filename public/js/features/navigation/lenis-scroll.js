/**
 * MONDO — Pinned Lenis 1.3.8 Smooth Scroll Controller (Refinement 01-R5)
 * Matches ShatormFX reference configuration with Owner-requested 0.75 wheelMultiplier:
 * - lerp: 0.12
 * - duration: 1.0
 * - direction: 'vertical'
 * - gestureDirection: 'vertical'
 * - smoothTouch: false
 * - wheelMultiplier: 0.75
 * - requestAnimationFrame loop
 */
import Lenis from '../../../vendor/lenis/lenis.mjs';

let lenisInstance = null;
let rafId = null;
let isInit = false;

export function getLenis() {
  return lenisInstance;
}

export function stopLenis() {
  if (lenisInstance) {
    lenisInstance.stop();
    lenisInstance.start();
  }
}

export function initLenis(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  if (!win || isInit) return () => {};

  // Respect prefers-reduced-motion: leave 100% native
  if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => {};
  }

  // Preserve native scrolling on touch / mobile devices
  if (
    'ontouchstart' in win ||
    (win.navigator && win.navigator.maxTouchPoints > 0) ||
    (win.matchMedia && win.matchMedia('(pointer: coarse)').matches)
  ) {
    return () => {};
  }

  isInit = true;

  // Initialize Lenis with ShatormFX configuration and R5 0.75 wheelMultiplier
  lenisInstance = new Lenis({
    smooth: true,
    lerp: 0.12,
    duration: 1.0,
    direction: 'vertical',
    gestureDirection: 'vertical',
    gestureOrientation: 'vertical',
    smoothTouch: false,
    wheelMultiplier: 0.75,
    ...options
  });

  function raf(time) {
    if (!lenisInstance) return;
    lenisInstance.raf(time);
    rafId = requestAnimationFrame(raf);
  }
  rafId = requestAnimationFrame(raf);

  win.__MONDO_LENIS__ = lenisInstance;
  win.__MONDO_STOP_INERTIA__ = stopLenis;
  win.__MONDO_STOP_DIRECT_WHEEL__ = stopLenis;

  return () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (lenisInstance) {
      lenisInstance.destroy();
      lenisInstance = null;
    }
    isInit = false;
    delete win.__MONDO_LENIS__;
    delete win.__MONDO_STOP_INERTIA__;
    delete win.__MONDO_STOP_DIRECT_WHEEL__;
  };
}

// Backwards-compatible aliases for existing navigation / test callers
export const initSmoothScroll = initLenis;
export const stopSmoothScroll = stopLenis;
export const initSmoothInertia = initLenis;
export const stopSmoothInertia = stopLenis;
export const initDirectWheel = initLenis;
export const stopDirectWheel = stopLenis;
export default initLenis;

