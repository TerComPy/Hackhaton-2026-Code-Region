/*
 * 3D-сцены: кольцо профессий на первом экране и привязанная к прокрутке
 * сцена «Как это работает». Только CSS 3D-трансформации — без WebGL,
 * чтобы текст и фотографии оставались чёткими, а страница — лёгкой.
 */
window.StarterScene = (() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  /* ---------------- Кольцо профессий ---------------- */
  function createRing({stage, ring, items, render, onPick}) {
    const n = items.length;
    const step = 360 / n;
    const cards = items.map((item, i) => {
      const el = render(item, i);
      el.dataset.index = i;
      ring.append(el);
      return el;
    });

    let radius = 0;
    let angle = 0;          // текущий поворот кольца, градусы
    let velocity = 0;       // инерция после перетаскивания
    let target = null;      // угол, к которому доводим при фокусе с клавиатуры
    let tilt = -11, tiltTarget = -11;
    let dragging = false, pointerId = null, lastX = 0, travel = 0, idleUntil = 0, hovering = false;
    let visible = true, last = performance.now();

    function layout() {
      const w = cards[0].offsetWidth;
      radius = Math.round((w * 1.14) / 2 / Math.tan(Math.PI / n));
      cards.forEach((card, i) => { card.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`; });
    }

    function paint() {
      ring.style.transform = `translateZ(${-radius}px) rotateX(${tilt}deg) rotateY(${angle}deg)`;
      let front = null, best = -2;
      for (let i = 0; i < n; i++) {
        const a = ((i * step + angle) % 360 + 360) % 360;
        const facing = Math.cos(a * Math.PI / 180);
        const card = cards[i];
        card.style.setProperty('--dim', (0.3 * (1 - facing)).toFixed(3));
        card.style.pointerEvents = facing > 0.35 ? '' : 'none';
        if (facing > best) { best = facing; front = card; }
      }
      cards.forEach(c => c.classList.toggle('is-front', c === front));
    }

    function frame(now) {
      const dt = Math.min(64, now - last); last = now;
      if (!dragging) {
        if (target !== null) {
          angle += (target - angle) * 0.14;
          if (Math.abs(target - angle) < 0.05) { angle = target; target = null; }
        } else if (Math.abs(velocity) > 0.02) {
          angle += velocity;
          velocity *= 0.94;
        } else if (!reduced.matches && !hovering && now > idleUntil) {
          angle -= dt * 0.006; // ≈ 6° в секунду
        }
      }
      tilt += (tiltTarget - tilt) * 0.08;
      paint();
      if (visible) requestAnimationFrame(frame);
    }

    function cardAt(x, y) {
      const el = document.elementFromPoint(x, y);
      return el && el.closest('.ring__card');
    }

    stage.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      dragging = true; pointerId = e.pointerId; lastX = e.clientX; travel = 0; velocity = 0; target = null;
    });
    window.addEventListener('pointermove', e => {
      if (dragging && e.pointerId === pointerId) {
        const dx = e.clientX - lastX; lastX = e.clientX; travel += Math.abs(dx);
        if (travel > 6 && !stage.classList.contains('is-dragging')) {
          stage.classList.add('is-dragging');
          try { stage.setPointerCapture(pointerId); } catch (_) {}
        }
        const delta = dx * 0.28;
        angle += delta; velocity = delta;
      }
      const r = stage.getBoundingClientRect();
      if (e.clientY > r.top - 200 && e.clientY < r.bottom + 200) {
        const ny = clamp((e.clientY - (r.top + r.height / 2)) / r.height, -0.5, 0.5);
        tiltTarget = -11 + ny * 8;
      }
    }, {passive: true});
    const release = e => {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      stage.classList.remove('is-dragging');
      idleUntil = performance.now() + 2600;
      if (travel <= 6 && e.type === 'pointerup') {
        const card = cardAt(e.clientX, e.clientY);
        if (card) onPick(items[+card.dataset.index], card);
      }
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    stage.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hovering = true; });
    stage.addEventListener('pointerleave', () => { hovering = false; idleUntil = performance.now() + 800; });

    // Клавиатура: Enter/пробел открывают вакансию, фокус доворачивает карточку к зрителю.
    cards.forEach((card, i) => {
      card.addEventListener('click', e => { if (e.detail === 0) onPick(items[i], card); });
      card.addEventListener('focus', () => {
        const desired = -i * step;
        const k = Math.round((angle - desired) / 360);
        target = desired + k * 360;
        idleUntil = performance.now() + 4000;
      });
      card.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        cards[(i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n].focus();
      });
    });

    // Не крутим кольцо, когда его не видно.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        const was = visible; visible = entry.isIntersecting;
        if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); }
      }).observe(stage);
    }

    layout();
    addEventListener('resize', layout);
    requestAnimationFrame(frame);
  }

  /* ---------------- Сцена «Как это работает» ---------------- */
  function createHowScene({track, scene, steps, bar, onStep}) {
    const sources = [...scene.querySelectorAll('.src-card')];
    const doc = scene.querySelector('.doc');
    const note = scene.querySelector('.fit-note');
    const host = scene.parentElement;
    // Откуда прилетают объявления с разных площадок
    const from = [
      {x: -190, y: -150, z: -120, ry: 26, rz: -7},
      {x: 200, y: -40, z: -260, ry: -32, rz: 6},
      {x: -120, y: 170, z: 40, ry: 18, rz: 3}
    ];
    let pointerX = 0, pointerY = 0, current = -1, pending = false;

    function fit() {
      const avail = host.clientWidth;
      const availH = innerHeight * (innerWidth <= 960 ? 0.5 : 0.8);
      const s = Math.min(1, avail / 460, availH / 560);
      scene.style.setProperty('--scene-scale', s.toFixed(3));
    }

    function progress() {
      const r = track.getBoundingClientRect();
      const total = r.height - innerHeight;
      return total > 0 ? clamp(-r.top / total) : 0;
    }

    function update() {
      pending = false;
      const p = progress();
      let t1 = smooth(0.04, 0.30, p);
      let t2 = smooth(0.40, 0.60, p);
      let t3 = smooth(0.72, 0.88, p);
      if (reduced.matches) { t1 = p > 0.17 ? 1 : 0; t2 = p > 0.5 ? 1 : 0; t3 = p > 0.8 ? 1 : 0; }

      sources.forEach((card, i) => {
        const f = from[i];
        const k = t1;
        const x = mix(f.x, 0, k), y = mix(f.y, 0, k), z = mix(f.z, -30 - i * 14, k);
        card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateY(${mix(f.ry, 0, k)}deg) rotateZ(${mix(f.rz, 0, k)}deg)`;
        card.style.opacity = String(1 - smooth(0.75, 1, k));
      });

      const appear = smooth(0.7, 1, t1);
      const ry = 180 * t2 + pointerX * 8;
      const rx = 6 * t3 - pointerY * 6;
      doc.style.opacity = String(appear);
      doc.style.transform = `translate3d(0, ${mix(30, 0, appear) - 34 * t3}px, ${mix(-120, 0, appear)}px) rotateX(${rx}deg) rotateY(${ry}deg)`;

      note.style.opacity = String(t3);
      note.style.transform = `translate3d(0, ${mix(60, 0, t3) - 34 * t3}px, ${mix(0, 70, t3)}px) rotateX(${rx}deg) rotateY(${pointerX * 8}deg)`;

      bar.parentElement.style.setProperty('--p', p.toFixed(4));
      const idx = p < 0.36 ? 0 : p < 0.68 ? 1 : 2;
      if (idx !== current) {
        current = idx;
        steps.forEach((s, i) => s.classList.toggle('is-active', i === idx));
        onStep && onStep(idx);
      }
    }
    const request = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };

    addEventListener('scroll', request, {passive: true});
    addEventListener('resize', () => { fit(); request(); });
    host.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || reduced.matches) return;
      const r = host.getBoundingClientRect();
      pointerX = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
      pointerY = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
      request();
    });
    host.addEventListener('pointerleave', () => { pointerX = pointerY = 0; request(); });

    // Клик по шагу — прокрутка к нужной фазе сцены.
    const anchors = [0.2, 0.52, 0.9];
    steps.forEach((s, i) => s.querySelector('button').addEventListener('click', () => {
      const r = track.getBoundingClientRect();
      const top = scrollY + r.top + (r.height - innerHeight) * anchors[i];
      scrollTo({top, behavior: reduced.matches ? 'auto' : 'smooth'});
    }));

    fit();
    update();
  }

  /* ---------------- Параллакс фотографии ---------------- */
  function createParallax(figure) {
    const img = figure.querySelector('img');
    let pending = false;
    const update = () => {
      pending = false;
      if (reduced.matches) { img.style.setProperty('--py', '-8%'); return; }
      const r = figure.getBoundingClientRect();
      const t = clamp((innerHeight - r.top) / (innerHeight + r.height));
      img.style.setProperty('--py', `${(-t * 15).toFixed(2)}%`);
    };
    addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(update); } }, {passive: true});
    update();
  }

  return {createRing, createHowScene, createParallax};
})();
