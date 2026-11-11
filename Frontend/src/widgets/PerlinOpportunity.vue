<script setup>
import { onMounted, onBeforeUnmount, onActivated, onDeactivated, ref } from 'vue';

// Adapted from the supplied starter-perlin-v4.html. No third-party rendering library.
// All browser resources belong to this component and are released on unmount.
const panel = ref(null);
const canvas = ref(null);
let ctx = null;
let width = 0;
let height = 0;
let frameId = 0;
let previousTime = 0;
let lastDrawTime = 0;
let phase = 0;
let visible = true;
let reduceMotion = false;
let observer = null;
let resizeObserver = null;
let themeObserver = null;
let motionQuery = null;
let colorQuery = null;

const GAP = 16;
const RADIUS = 145;
const FORCE = 36;
const SPEED = 1; // 100% in the provided demo; set to 2 for 200%.
const pulses = [];
const mouse = {
  x: 0, y: 0, targetX: 0, targetY: 0,
  active: false, mix: 0, ready: false,
  sampleX: 0, sampleY: 0, sampleAt: 0,
  prevVX: 0, prevVY: 0, lastBurstAt: -10000,
};

// Deterministic permutation used by the original Perlin implementation.
let seed = 2026;
const p = Array.from({ length: 256 }, (_, i) => i);
for (let i = 255; i > 0; i--) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const j = seed % (i + 1);
  [p[i], p[j]] = [p[j], p[i]];
}
const perm = [...p, ...p];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
function grad(i, x, y) {
  switch (i & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}
function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  x -= xi;
  y -= yi;
  const X = xi & 255;
  const Y = yi & 255;
  const u = fade(x);
  const v = fade(y);
  const a = perm[X] + Y;
  const b = perm[X + 1] + Y;
  return lerp(
    lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
    lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u),
    v,
  );
}

function isDark() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return colorQuery?.matches ?? false;
}

function draw() {
  if (!ctx || width <= 0 || height <= 0) return;
  ctx.clearRect(0, 0, width, height);
  const dark = isDark();
  const base = dark ? [139, 142, 142] : [100, 102, 101];
  const accent = dark ? [255, 99, 63] : [217, 67, 31];
  const tx = phase * 0.30;
  const ty = phase * 0.12;
  const active = mouse.mix > 0.001;
  const scale = 1 / 110;

  for (let y = GAP / 2; y < height; y += GAP) {
    for (let x = GAP / 2; x < width; x += GAP) {
      const nx = x * scale + tx;
      const ny = y * scale + ty;
      const n = 0.70 * noise(nx, ny)
        + 0.23 * noise(nx * 2.05 + 8, ny * 2.05)
        + 0.07 * noise(nx * 4.1, ny * 4.1 + 17);
      const warm = smooth((n + 0.25 - 0.16) / 0.37);
      let dx = 0;
      let dy = 0;
      let hover = 0;
      let ring = 0;

      if (active) {
        const rx = x - mouse.x;
        const ry = y - mouse.y;
        const dist = Math.hypot(rx, ry);
        if (dist < RADIUS) {
          const influence = smooth(1 - dist / RADIUS) * mouse.mix;
          const force = FORCE * 0.38 * influence;
          const inv = 1 / Math.max(dist, 0.001);
          dx += rx * inv * force;
          dy += ry * inv * force;
          hover = influence;
        }
      }

      for (const pulse of pulses) {
        const rx = x - pulse.x;
        const ry = y - pulse.y;
        const d = Math.hypot(rx, ry);
        const z = (d - pulse.radius) / 33;
        const wave = Math.exp(-z * z) * Math.max(0, 1 - pulse.age / 1.85);
        const amp = 32 * wave * pulse.power;
        const inv = 1 / Math.max(d, 0.001);
        dx += rx * inv * amp;
        dy += ry * inv * amp;
        ring = Math.max(ring, Math.min(1, wave * pulse.power * 0.9));
      }

      const lowerVisibility = 0.31 + 0.69 * smooth((y / height - 0.05) / 0.57);
      const alpha = Math.min(0.97, (0.25 + warm * 0.58 + hover * 0.13 + ring * 0.46) * lowerVisibility);
      const dotRadius = 1.08 + warm * 0.46 + hover * 0.31 + ring * 0.53;
      const r = Math.round(base[0] + (accent[0] - base[0]) * warm);
      const g = Math.round(base[1] + (accent[1] - base[1]) * warm);
      const b = Math.round(base[2] + (accent[2] - base[2]) * warm);
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, dotRadius, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    }
  }
}

function addPulse(x, y, power = 1) {
  if (reduceMotion) return;
  pulses.push({ x, y, radius: 0, age: 0, power: Math.max(0.7, Math.min(2.2, power)) });
  if (pulses.length > 5) pulses.shift();
}

function onPointerMove(event) {
  if (reduceMotion || !panel.value) return;
  const bounds = panel.value.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const now = performance.now();
  if (!mouse.ready) {
    Object.assign(mouse, { x, y, targetX: x, targetY: y, ready: true,
      sampleX: x, sampleY: y, sampleAt: now });
    mouse.active = true;
    return;
  }
  if (mouse.sampleAt && now - mouse.sampleAt <= 150 && now - mouse.sampleAt >= 14) {
    const dt = (now - mouse.sampleAt) / 1000;
    const vx = (x - mouse.sampleX) / dt;
    const vy = (y - mouse.sampleY) / dt;
    const speed = Math.hypot(vx, vy);
    const deltaV = Math.hypot(vx - mouse.prevVX, vy - mouse.prevVY);
    const accel = deltaV / dt;
    if (speed > 520 && deltaV > 170 && accel > 3600 && now - mouse.lastBurstAt > 180) {
      addPulse(x, y, Math.min(1.85, 0.85 + accel / 11000));
      mouse.lastBurstAt = now;
    }
    Object.assign(mouse, { prevVX: vx, prevVY: vy, sampleX: x, sampleY: y, sampleAt: now });
  } else if (now - mouse.sampleAt > 150) {
    Object.assign(mouse, { sampleX: x, sampleY: y, sampleAt: now, prevVX: 0, prevVY: 0 });
  }
  mouse.targetX = x;
  mouse.targetY = y;
  mouse.active = true;
}
function onPointerEnter(event) {
  mouse.sampleAt = 0;
  onPointerMove(event);
}
function onPointerLeave() {
  mouse.active = false;
  mouse.sampleAt = 0;
  mouse.prevVX = 0;
  mouse.prevVY = 0;
}
function onClick(event) {
  if (!panel.value) return;
  const bounds = panel.value.getBoundingClientRect();
  addPulse(event.clientX - bounds.left, event.clientY - bounds.top, 1.2);
}
function resize() {
  if (!panel.value || !canvas.value || !ctx) return;
  width = panel.value.clientWidth;
  height = panel.value.clientHeight;
  if (!width || !height) { stop(); return; }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.value.width = Math.ceil(width * dpr);
  canvas.value.height = Math.ceil(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
  updateAnimation();
}
function canAnimate() {
  return !reduceMotion && visible && !document.hidden && width > 0 && height > 0;
}
function stop() {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
}
function frame(now) {
  frameId = 0;
  if (!canAnimate()) return;
  frameId = requestAnimationFrame(frame);
  if (now - lastDrawTime < 1000 / 30) return;
  const dt = Math.min((now - (previousTime || now)) / 1000, 0.065);
  previousTime = now;
  lastDrawTime = now;
  phase += dt * SPEED;
  for (let i = pulses.length - 1; i >= 0; i--) {
    pulses[i].radius += dt * 360 * SPEED;
    pulses[i].age += dt * SPEED;
    if (pulses[i].age > 1.85) pulses.splice(i, 1);
  }
  mouse.mix += (Number(mouse.active) - mouse.mix) * (1 - Math.exp(-dt * 9));
  if (mouse.ready) {
    const k = 1 - Math.exp(-dt * 19);
    mouse.x += (mouse.targetX - mouse.x) * k;
    mouse.y += (mouse.targetY - mouse.y) * k;
  }
  draw();
}
function updateAnimation() {
  if (!canAnimate()) {
    stop();
    if (reduceMotion) draw();
    return;
  }
  if (!frameId) {
    previousTime = 0;
    lastDrawTime = 0;
    frameId = requestAnimationFrame(frame);
  }
}
function onMotionChange(event) {
  reduceMotion = event.matches;
  if (reduceMotion) {
    pulses.length = 0;
    mouse.active = false;
    mouse.mix = 0;
  }
  updateAnimation();
}
function onVisibilityChange() { updateAnimation(); }

function start() {
  if (ctx) return;
  ctx = canvas.value?.getContext('2d', { alpha: true }) ?? null;
  if (!ctx || !panel.value) return;
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduceMotion = motionQuery.matches;
  motionQuery.addEventListener('change', onMotionChange);
  colorQuery = window.matchMedia('(prefers-color-scheme: dark)');
  colorQuery.addEventListener('change', draw);
  panel.value.addEventListener('pointerenter', onPointerEnter);
  panel.value.addEventListener('pointermove', onPointerMove);
  panel.value.addEventListener('pointerleave', onPointerLeave);
  panel.value.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', onVisibilityChange);
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(panel.value);
  } else {
    window.addEventListener('resize', resize);
  }
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      updateAnimation();
    });
    observer.observe(panel.value);
  }
  themeObserver = new MutationObserver(() => { if (reduceMotion) draw(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resize();
  updateAnimation();
}
function dispose() {
  stop();
  resizeObserver?.disconnect();
  observer?.disconnect();
  themeObserver?.disconnect();
  motionQuery?.removeEventListener('change', onMotionChange);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('resize', resize);
  colorQuery?.removeEventListener('change', draw);
  panel.value?.removeEventListener('pointerenter', onPointerEnter);
  panel.value?.removeEventListener('pointermove', onPointerMove);
  panel.value?.removeEventListener('pointerleave', onPointerLeave);
  panel.value?.removeEventListener('click', onClick);
  ctx = null;
  observer = resizeObserver = themeObserver = motionQuery = colorQuery = null;
  pulses.length = 0;
  mouse.active = mouse.ready = false;
  mouse.mix = 0;
  visible = true;
}
onMounted(start);
onActivated(start);
onDeactivated(dispose);
onBeforeUnmount(dispose);
</script>

<template>
  <aside
    ref="panel"
    class="opportunity perlin-opportunity"
    aria-label="Интерактивная карта возможностей"
  >
    <canvas ref="canvas" class="perlin-opportunity__canvas" aria-hidden="true" />
    <div class="perlin-opportunity__shade" aria-hidden="true" />
    <div class="perlin-opportunity__copy">
      <div class="perlin-opportunity__index">
        <span>СТАРТЕР / КАРТА ВОЗМОЖНОСТЕЙ</span>
        <span>01 — 03</span>
      </div>
      <div class="perlin-opportunity__headline">
        <p class="perlin-opportunity__eyebrow">От навыка к профессии</p>
        <h2>Ваш опыт.<br />Новые направления.</h2>
        <p class="perlin-opportunity__desc">
          Свяжите то, что умеете,<br />с тем, чем хочется заниматься.
        </p>
      </div>
    </div>
    <div class="perlin-opportunity__footer" aria-hidden="true">
      <span>СЕРЫЙ → <b>ОРАНЖЕВЫЙ</b></span>
      <span>ДВИЖЕНИЕ = ВОЛНА ↗</span>
    </div>
  </aside>
</template>

<style scoped>
.opportunity.perlin-opportunity {
  position: relative;
  isolation: isolate;
  display: block;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 0;
  border-radius: 0 var(--r-md) var(--r-md) 0;
  background: var(--bg-raise);
  border-left: 1px solid var(--line);
  cursor: crosshair;
  touch-action: pan-y;
}
.perlin-opportunity__canvas,
.perlin-opportunity__shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.perlin-opportunity__canvas { display: block; border-radius: inherit; }
.perlin-opportunity__shade {
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg-raise) 92%, transparent) 0%,
    color-mix(in srgb, var(--bg-raise) 55%, transparent) 42%,
    transparent 90%
  );
}
.perlin-opportunity__copy {
  position: relative;
  z-index: 1;
  height: 100%;
  padding: clamp(18px, 2vw, 32px);
  pointer-events: none;
}
.perlin-opportunity__index,
.perlin-opportunity__footer {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  color: var(--ink-3);
  font: 500 10px/1.4 var(--mono, ui-monospace, monospace);
  letter-spacing: 0.065em;
}
.perlin-opportunity__headline {
  margin-top: clamp(30px, 6vh, 70px);
  max-width: 470px;
}
.perlin-opportunity__eyebrow {
  color: var(--accent-ink);
  font: 500 11px/1.5 var(--mono, ui-monospace, monospace);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.perlin-opportunity__headline h2 {
  margin: 12px 0 14px;
  font-size: clamp(27px, 2.8vw, 42px);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1.12;
  color: var(--ink);
}
.perlin-opportunity__desc {
  color: var(--ink-2);
  font-size: clamp(12px, 1vw, 14px);
  line-height: 1.55;
}
.perlin-opportunity__footer {
  position: absolute;
  z-index: 1;
  left: clamp(18px, 2vw, 32px);
  right: clamp(18px, 2vw, 32px);
  bottom: clamp(16px, 2vw, 28px);
  padding-top: 14px;
  border-top: 1px solid var(--line-strong);
  pointer-events: none;
}
.perlin-opportunity__footer b { color: var(--accent-ink); font-weight: 500; }
@media (max-height: 790px) and (min-width: 721px) {
  .perlin-opportunity__headline { margin-top: 20px; }
  .perlin-opportunity__headline h2 { font-size: clamp(25px, 2.5vw, 33px); }
}
@media (max-width: 720px) {
  .opportunity.perlin-opportunity { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .opportunity.perlin-opportunity { cursor: default; }
}
</style>
