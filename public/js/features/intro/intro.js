/**
 * MONDO — Loading Introduction
 * Refined Premium Logo Reveal, Seamless Header Handoff & Smooth Page Transition
 * Uses the authentic mondo-mark.webp asset.
 *
 * Sequence:
 * - Softer logo reveal: starts at opacity 0, scale 0.97, gentle settle to 1.0 (480ms)
 * - Calm recognition hold: 200ms
 * - Seamless header handoff: coordinate-accurate transform to actual header logo (360ms)
 * - Integrated page reveal: dark backdrop fades out (300ms, 60ms delay), homepage emerges naturally
 * - Zero ghosting: real header logo is hidden until handoff completes, then revealed instantly
 * - Hard fail-safe timeout at 1500ms
 * - Keyboard dismissal (Escape / Tab)
 * - Full reduced-motion bypass
 * - Robust image decode check with bounded fallback
 */

const SESSION_KEY = 'mondo_intro_shown';
const REVEAL_MS = 480;
const HOLD_MS = 200;
const HANDOFF_MS = 360;
const MAX_WAIT_MS = 1500;

export function shouldShowIntro() {
  if (typeof window === 'undefined') return false;
  // Never show on admin pages
  if (window.location.pathname.startsWith('/admin')) return false;
  try {
    return !sessionStorage.getItem(SESSION_KEY);
  } catch {
    return false; // sessionStorage failure — gracefully skip intro
  }
}

export function markShown() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Silently ignore
  }
}

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Ensures the intro mark image is decoded and ready to display
 * with a bounded fallback to prevent hangs on slow networks or failures.
 */
function whenImageReady(img, callback) {
  if (!img) return callback(true);
  let resolved = false;
  const done = (success) => {
    if (resolved) return;
    resolved = true;
    callback(success);
  };

  // Bounded fallback: do not wait longer than 120ms
  const timer = setTimeout(() => done(true), 120);

  if (img.complete && img.naturalWidth > 0) {
    if (typeof img.decode === 'function') {
      img
        .decode()
        .then(() => {
          clearTimeout(timer);
          done(true);
        })
        .catch(() => {
          clearTimeout(timer);
          done(true);
        });
      return;
    }
    clearTimeout(timer);
    done(true);
    return;
  }

  // If complete with zero width, image failed to load
  if (img.complete && img.naturalWidth === 0) {
    clearTimeout(timer);
    done(false);
    return;
  }

  img.addEventListener(
    'load',
    () => {
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(() => {
            clearTimeout(timer);
            done(true);
          })
          .catch(() => {
            clearTimeout(timer);
            done(true);
          });
      } else {
        clearTimeout(timer);
        done(true);
      }
    },
    { once: true }
  );

  img.addEventListener(
    'error',
    () => {
      clearTimeout(timer);
      done(false);
    },
    { once: true }
  );
}

let introInitialized = false;

export function initIntro() {
  if (typeof document === 'undefined') return;

  const overlay = document.getElementById('mondo-intro');
  if (!overlay) {
    document.documentElement.classList.remove('has-intro');
    return;
  }

  if (introInitialized) return;
  introInitialized = true;

  if (!shouldShowIntro() || prefersReducedMotion()) {
    markShown();
    document.documentElement.classList.remove('has-intro');
    overlay.remove();
    return;
  }

  markShown();

  const logo = overlay.querySelector('.mondo-intro__logo');
  const headerMark =
    document.querySelector('.site-header .brand-mark') ||
    document.querySelector('.brand-mark');
  const body = document.body;

  // Lock scroll and ensure clean scroll position at the top
  if (typeof window !== 'undefined') {
    window.scrollTo(0, 0);
  }
  if (body) {
    body.style.overflow = 'hidden';
  }

  overlay.classList.add('mondo-intro--active');

  let dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;

    clearTimeout(fallbackTimer);
    document.removeEventListener('keydown', onKey);

    // Unhide real header logo with precise handoff
    if (headerMark) {
      headerMark.classList.remove('brand-mark--intro-target');
      headerMark.style.opacity = '';
    }

    if (body) {
      body.style.overflow = '';
    }
    document.documentElement.classList.remove('has-intro');

    overlay.classList.add('mondo-intro--done');
    overlay.remove();
  }

  // Keyboard dismiss (Escape or Tab)
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      dismiss();
    }
  }
  document.addEventListener('keydown', onKey);

  // Hard safety fallback timeout (1.5s max)
  const fallbackTimer = setTimeout(dismiss, MAX_WAIT_MS);

  // Temporarily hide the real header mark to eliminate duplicate logo flicker during handoff
  if (headerMark) {
    headerMark.classList.add('brand-mark--intro-target');
  }

  whenImageReady(logo, (ready) => {
    if (dismissed) return;
    if (!ready) {
      // Asset loading failed — fail safely into normal homepage
      dismiss();
      return;
    }

    // Phase 1: Calm, gradual reveal with soft ease and subtle scale settle
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (dismissed) return;
        overlay.classList.add('mondo-intro--reveal');

        // Phase 2: After reveal and calm recognition hold, begin seamless handoff
        setTimeout(() => {
          if (dismissed) return;

          // Calculate dynamic handoff target coordinates to real header mark
          if (headerMark && logo) {
            const headerRect = headerMark.getBoundingClientRect();
            const logoRect = logo.getBoundingClientRect();

            const headerCenterX = headerRect.left + headerRect.width / 2;
            const headerCenterY = headerRect.top + headerRect.height / 2;
            const logoCenterX = logoRect.left + logoRect.width / 2;
            const logoCenterY = logoRect.top + logoRect.height / 2;

            const dx = headerCenterX - logoCenterX;
            const dy = headerCenterY - logoCenterY;

            // Scale to match the contained aspect ratio of the target header mark
            const scale = Math.min(
              headerRect.width / (logoRect.width || 140),
              headerRect.height / (logoRect.height || 190.44)
            );
            const safeScale = scale > 0.05 && scale < 2.0 ? scale : 0.3;

            logo.style.setProperty('--handoff-tx', `${dx.toFixed(2)}px`);
            logo.style.setProperty('--handoff-ty', `${dy.toFixed(2)}px`);
            logo.style.setProperty('--handoff-scale', safeScale.toFixed(5));
          }

          // Begin logo motion and backdrop fade
          overlay.classList.add('mondo-intro--handoff');

          let handoffCompleted = false;
          const finishHandoff = () => {
            if (handoffCompleted || dismissed) return;
            handoffCompleted = true;
            dismiss();
          };

          if (logo) {
            const onTransitionEnd = (e) => {
              if (e.target === logo && e.propertyName === 'transform') {
                logo.removeEventListener('transitionend', onTransitionEnd);
                finishHandoff();
              }
            };
            logo.addEventListener('transitionend', onTransitionEnd);
          }

          // Safety buffer fallback matching HANDOFF_MS
          setTimeout(finishHandoff, HANDOFF_MS + 40);
        }, REVEAL_MS + HOLD_MS);
      });
    });
  });
}
