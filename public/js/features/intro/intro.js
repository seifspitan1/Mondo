/**
 * MONDO — Loading Introduction
 * Phase 5A: Main Intro Integration — Concept 06 V2 (Silent Inversion Refined)
 *
 * Visual sequence:
 * - Deep, near-black atmospheric environment with subtle cosmic dust and volumetric illumination.
 * - Authentic MONDO logo geometry with dimensional depth and metallic sheen.
 * - Refined white-to-black diagonal inversion curtain passage.
 * - Controlled silver light streak and luminous rim.
 * - Return to official dark MONDO appearance.
 * - Dynamic subpixel docking into the site header brand mark.
 * - Seamless page reveal underneath the canvas as background fades.
 *
 * Specifications & Lifecyle:
 * - Nominal duration: 4200ms (approved reference pacing)
 * - Hard fail-safe timeout: 5200ms
 * - Storage guard: sessionStorage key 'mondo_intro_shown'
 * - Reduced motion: instant bypass
 * - Keyboard: Escape and Tab dismiss immediately
 * - Image decoding: bounded 1200ms async decode check with safe fallback
 */

const SESSION_KEY = 'mondo_intro_shown';
export const DUR_MS = 4200;
export const MAX_WAIT_MS = 5200;
const DPR_LIMIT = 1.5;

export const ASSET_PATHS = {
  white: '/assets/intro/mondo-white.png',
  black: '/assets/intro/mondo-black.png',
  metal: '/assets/intro/mondo-metal.png',
  rim: '/assets/intro/mondo-rim.png',
  depth: '/assets/intro/mondo-depth.png'
};

export function shouldShowIntro() {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname.startsWith('/admin')) return false;
  try {
    return !sessionStorage.getItem(SESSION_KEY);
  } catch {
    return false;
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

// Math & Motion Interpolation Helpers (identical to approved reference)
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const cubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
const s = (a, b, t) => {
  const q = clamp((t - a) / (b - a));
  return q * q * (3 - 2 * q);
};
const hash = (i) => {
  const v = Math.sin((i + 71) * 127.113) * 43758.5453;
  return v - Math.floor(v);
};

function rect(ctx, x, y, ww, hh, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, ww, hh);
}

function radial(ctx, x, y, r, c0, c1 = 'rgba(0,0,0,0)', ry = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, Math.max(1, r));
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function linear(ctx, x, y, x2, y2, stops) {
  const g = ctx.createLinearGradient(x, y, x2, y2);
  for (const v of stops) {
    g.addColorStop(v[0], v[1]);
  }
  return g;
}

function L(ctx, x, y, X, Y, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(X, Y);
  ctx.stroke();
}

function dust(ctx, w, h, t, quantity = 26, mult = 1) {
  ctx.save();
  for (let i = 0; i < quantity; i++) {
    const x = (hash(i * 11) * w + Math.sin(t * 3 + i) * 8 + w) % w;
    const y = (hash(i * 37) * h * 0.84 + t * i * 0.31 * 5) % h;
    const a = (0.1 + 0.20 * hash(i * 7 + 4)) * mult;
    rect(ctx, x, y, 0.4 + hash(i * 9) * 1, 0.4 + hash(i * 13) * 1, `rgba(204,227,245,${a})`);
  }
  ctx.restore();
}

function atmosphere(ctx, w, h, t, intensity = 1) {
  rect(ctx, 0, 0, w, h, '#000000');
  const size = Math.max(w, h);
  radial(ctx, w * 0.50, h * 0.41, size * 0.63, `rgba(20,20,20,${0.45 * intensity})`, 'rgba(0,0,0,0)', 0.78);
  radial(ctx, w * 0.48, h * 0.27, size * 0.38, `rgba(45,45,45,${0.10 * intensity})`, 'rgba(0,0,0,0)', 0.68);
  radial(ctx, w * 0.52, h * 0.78, size * 0.43, `rgba(40,40,40,${0.06 * intensity})`, 'rgba(0,0,0,0)', 0.19);
  for (let i = 0; i < 4; i++) {
    const xx = w * (0.2 + i * 0.19) + Math.sin(t * 2.3 + i) * w * 0.024;
    radial(ctx, xx, h * 0.83, w * 0.26, `rgba(60,60,60,${0.012 * intensity})`, 'rgba(0,0,0,0)', 0.17);
  }
  dust(ctx, w, h, t, 20, 0.6 * intensity);
}

function lightShaft(ctx, h, x, y, r, amount = 1) {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = linear(ctx, x, h * 0.04, x, h * 0.92, [
    [0, 'rgba(225,242,255,0)'],
    [0.34, `rgba(215,234,250,${0.038 * amount})`],
    [0.78, 'rgba(144,175,208,.01)'],
    [1, 'rgba(0,0,0,0)']
  ]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.12, -30);
  ctx.lineTo(x + r * 0.12, -30);
  ctx.lineTo(x + r * 0.81, y + r * 0.6);
  ctx.lineTo(x - r * 0.82, y + r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function mark(ctx, imgs, x, y, size, options = {}) {
  const o = { alpha: 1, metal: true, edge: 0.6, depth: 6, tilt: 0, dx: 0, black: false, ...options };
  const ww = (size * 610) / 870;
  if (o.alpha < 0.001) return;
  ctx.save();
  ctx.globalAlpha = clamp(o.alpha);
  ctx.translate(x + o.dx, y);
  ctx.rotate(o.tilt);
  if (o.black) {
    if (imgs.black) ctx.drawImage(imgs.black, -ww * 0.5, -size * 0.5, ww, size);
    ctx.restore();
    return;
  }
  if (o.depth > 0 && imgs.depth) {
    ctx.save();
    ctx.globalAlpha = o.alpha * 0.65;
    for (let i = o.depth; i > 0; i -= 1.5) {
      ctx.drawImage(imgs.depth, -ww * 0.5 + i * 0.14, -size * 0.5 + i * 0.52, ww, size);
    }
    ctx.restore();
  }
  if (o.edge > 0 && imgs.white) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = o.alpha * o.edge * 0.19;
    ctx.shadowBlur = 21;
    ctx.shadowColor = '#c6ecff';
    ctx.drawImage(imgs.white, -ww * 0.5, -size * 0.5, ww, size);
    ctx.restore();
  }
  const bodyImg = o.metal ? imgs.metal : imgs.white;
  if (bodyImg) ctx.drawImage(bodyImg, -ww * 0.5, -size * 0.5, ww, size);
  if (o.edge > 0 && imgs.rim) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = o.edge * 0.57 * o.alpha;
    ctx.drawImage(imgs.rim, -ww * 0.5, -size * 0.5, ww, size);
    ctx.restore();
  }
  ctx.restore();
}

function specialSweep(ctx, imgs, w, h, t, st) {
  const intro = s(0.015, 0.18, t);
  const pass = s(0.23, 0.54, t);
  const reverse = s(0.60, 0.74, t);
  const show = pass * (1 - reverse);
  atmosphere(ctx, w, h, t * 0.5, 0.9);
  radial(ctx, st.cx, st.cy, st.baseH * 0.68, `rgba(163,200,229,${0.066 * intro})`);
  lightShaft(ctx, h, st.cx, st.cy, st.baseH * 0.6, 0.22 * intro);
  mark(ctx, imgs, st.x, st.y, st.size, { alpha: intro, metal: true, depth: 4, edge: 0.25 + 0.21 * intro });
  if (show > 0.002) {
    ctx.save();
    ctx.beginPath();
    const border = -w * 0.7 + show * w * 2.5;
    const skew = h * 0.24;
    ctx.moveTo(-w, -h);
    ctx.lineTo(border + skew, -h);
    ctx.lineTo(border - skew, h * 2);
    ctx.lineTo(-w, h * 2);
    ctx.closePath();
    ctx.clip();
    rect(ctx, 0, 0, w, h, linear(ctx, 0, 0, w, h, [[0, '#f5f7f8'], [0.35, '#eaedf1'], [1, '#bac6d0']]));
    radial(ctx, st.cx, st.cy, st.baseH * 0.80, 'rgba(255,255,255,.54)');
    mark(ctx, imgs, st.x, st.y, st.size, { black: true, alpha: intro, depth: 0 });
    ctx.restore();
    const sx = border - skew * 0.12;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    radial(ctx, sx, h * 0.48, Math.max(w * 0.26, 110), `rgba(242,250,255,${0.14 * show})`, 'rgba(0,0,0,0)', 2.8);
    ctx.restore();
    L(ctx, sx - skew * 0.3, 0, sx + skew * 0.3, h, `rgba(242,250,255,${0.5 * show})`, 1.6);
  }
  const streak = s(0.18, 0.43, t) * (1 - s(0.58, 0.70, t));
  if (streak > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const zz = st.baseH;
    radial(ctx, st.cx + (s(0.19, 0.62, t) - 0.5) * zz * 0.69, st.cy - zz * 0.08, zz * 0.28, `rgba(232,247,255,${0.13 * streak})`, 'rgba(0,0,0,0)', 1.55);
    ctx.restore();
  }
  if (t > 0.72) {
    mark(ctx, imgs, st.x, st.y, st.size, { alpha: s(0.68, 0.79, t), edge: 0.50 * (1 - st.dock), depth: 4 * (1 - st.dock) });
  }
}

function stage(t, w, h, headerMark) {
  const k = cubic(s(0.76, 1, t));
  const baseH = Math.min(h * (w < 700 ? 0.42 : 0.54), w * (w < 700 ? 0.85 : 0.49), 500);
  let p = null;
  if (headerMark) {
    p = headerMark.getBoundingClientRect();
  }
  const targetX = p ? p.left + p.width / 2 : w * 0.5;
  const targetY = p ? p.top + p.height / 2 : h * 0.1;
  const targetSize = p ? Math.min(p.height, (p.width * 870) / 610) : 52;

  return {
    x: lerp(w * 0.5, targetX, k),
    y: lerp(h * (w < 700 ? 0.41 : 0.45), targetY, k),
    size: lerp(baseH, targetSize, k),
    cx: w * 0.5,
    cy: h * (w < 700 ? 0.41 : 0.45),
    baseH,
    dock: k
  };
}

/**
 * Robust asset loader with decode check and bounded fail-safe
 */
function loadIntroAssets(callback) {
  if (typeof Image === 'undefined') {
    callback(null);
    return;
  }
  const imgs = {};
  const entries = Object.entries(ASSET_PATHS);
  let loadedCount = 0;
  let resolved = false;

  const done = (success) => {
    if (resolved) return;
    resolved = true;
    callback(success ? imgs : null);
  };

  const timer = setTimeout(() => done(false), 1200);

  entries.forEach(([key, src]) => {
    const img = new Image();
    img.src = src;

    const onLoad = () => {
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(() => {
            imgs[key] = img;
            loadedCount++;
            if (loadedCount === entries.length) {
              clearTimeout(timer);
              done(true);
            }
          })
          .catch(() => {
            imgs[key] = img;
            loadedCount++;
            if (loadedCount === entries.length) {
              clearTimeout(timer);
              done(true);
            }
          });
      } else {
        imgs[key] = img;
        loadedCount++;
        if (loadedCount === entries.length) {
          clearTimeout(timer);
          done(true);
        }
      }
    };

    const onError = () => {
      clearTimeout(timer);
      done(false);
    };

    if (img.complete && img.naturalWidth > 0) {
      onLoad();
    } else {
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
    }
  });
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

  const headerMark =
    document.querySelector('.site-header .brand-mark') ||
    document.querySelector('.brand-mark');
  const body = document.body;

  if (typeof window !== 'undefined') {
    window.scrollTo(0, 0);
  }
  if (body) {
    body.style.overflow = 'hidden';
  }

  // Find or create canvas
  let canvas = overlay.querySelector('#mondo-intro-stage');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'mondo-intro-stage';
    canvas.className = 'mondo-intro__stage';
    canvas.setAttribute('aria-hidden', 'true');
    overlay.appendChild(canvas);
  }

  const ctx = canvas.getContext('2d', { alpha: true });

  overlay.classList.add('mondo-intro--active');

  let dismissed = false;
  let animFrameId = null;
  let resizeHandler = null;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;

    clearTimeout(fallbackTimer);
    document.removeEventListener('keydown', onKey);
    if (resizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', resizeHandler);
    }
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
    }

    if (headerMark) {
      headerMark.classList.remove('brand-mark--intro-target');
      headerMark.style.opacity = '1';
    }

    if (body) {
      body.style.overflow = '';
    }
    document.documentElement.classList.remove('has-intro');

    overlay.classList.add('mondo-intro--done');
    overlay.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      dismiss();
    }
  }
  document.addEventListener('keydown', onKey);

  const fallbackTimer = setTimeout(dismiss, MAX_WAIT_MS);

  // Hide real header mark while intro is in flight
  if (headerMark) {
    headerMark.classList.add('brand-mark--intro-target');
  }

  loadIntroAssets((imgs) => {
    if (dismissed) return;
    if (!imgs) {
      // Fail safely to normal homepage on asset failure
      dismiss();
      return;
    }

    let w = 0;
    let h = 0;
    let dpr = 1;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }

    resizeHandler = resize;
    window.addEventListener('resize', resize, { passive: true });
    resize();

    // Canvas paints initial frame immediately, so overlay background can become transparent
    overlay.style.backgroundColor = 'transparent';

    function render(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      const st = stage(t, w, h, headerMark);

      // Fade underlying site in while logo stays sharp on its path to header
      ctx.save();
      ctx.globalAlpha = 1 - s(0.68, 0.98, t);
      specialSweep(ctx, imgs, w, h, t, st);
      ctx.restore();

      // At the end, draw only the traveling logo over the already visible site.
      if (t > 0.73 && t < 1) {
        mark(ctx, imgs, st.x, st.y, st.size, {
          alpha: s(0.73, 0.8, t) * (1 - s(0.992, 1, t)),
          edge: 0.2 * (1 - st.dock),
          metal: false,
          depth: 0
        });
      }
    }

    // Render frame 0
    render(0);

    let startTimestamp = null;
    let lastTime = 0;
    let elapsedMs = 0;

    function tick(timestamp) {
      if (dismissed) return;
      if (!startTimestamp) {
        startTimestamp = timestamp;
        lastTime = timestamp;
      }
      const delta = timestamp - lastTime;
      lastTime = timestamp;
      elapsedMs += delta;
      const t = clamp(elapsedMs / DUR_MS);
      render(t);

      if (t < 1) {
        animFrameId = requestAnimationFrame(tick);
      } else {
        dismiss();
      }
    }

    animFrameId = requestAnimationFrame(tick);
  });
}
