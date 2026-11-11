/*
 * 3D-сцены: кольцо профессий на первом экране и привязанная к прокрутке
 * сцена «Как это работает». Только CSS 3D-трансформации — без WebGL,
 * чтобы текст и фотографии оставались чёткими, а страница — лёгкой.
 */
export const Scene = (() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, t) => a + (b - a) * t;

  /* ---------------- Кольцо профессий ---------------- */
  function createRing({ stage, ring, items, render, onPick }) {
    const controller = new AbortController();
    let active = true;
    let frameId = 0;
    const n = items.length;
    const step = 360 / n;
    const cards = items.map((item, i) => {
      const el = ring.children[i];
      el.dataset.index = i;

      return el;
    });

    let radius = 0;
    let angle = 0; // текущий поворот кольца, градусы
    let velocity = 0; // инерция после перетаскивания
    let target = null; // угол, к которому доводим при фокусе с клавиатуры
    let tilt = -11,
      tiltTarget = -11;
    let dragging = false,
      pointerId = null,
      lastX = 0,
      travel = 0,
      idleUntil = 0,
      hovering = false;
    let visible = true,
      last = performance.now();

    function layout() {
      const w = cards[0].offsetWidth;
      radius = Math.round((w * 1.14) / 2 / Math.tan(Math.PI / n));
      cards.forEach((card, i) => {
        card.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
      });
    }

    function paint() {
      ring.style.transform = `translateZ(${-radius}px) rotateX(${tilt}deg) rotateY(${angle}deg)`;
      let front = null,
        best = -2;
      for (let i = 0; i < n; i++) {
        const a = (((i * step + angle) % 360) + 360) % 360;
        const facing = Math.cos((a * Math.PI) / 180);
        const card = cards[i];
        card.style.setProperty("--dim", (0.3 * (1 - facing)).toFixed(3));
        card.style.pointerEvents = facing > 0.35 ? "" : "none";
        if (facing > best) {
          best = facing;
          front = card;
        }
      }
      cards.forEach((c) => c.classList.toggle("is-front", c === front));
    }

    function frame(now) {
      frameId = 0;
      if (!active || !visible) return;
      const dt = Math.min(64, now - last);
      last = now;
      if (!dragging) {
        if (target !== null) {
          angle += (target - angle) * 0.14;
          if (Math.abs(target - angle) < 0.05) {
            angle = target;
            target = null;
          }
        } else if (Math.abs(velocity) > 0.02) {
          angle += velocity;
          velocity *= 0.94;
        } else if (!reduced.matches && !hovering && now > idleUntil) {
          angle -= dt * 0.006; // ≈ 6° в секунду
        }
      }
      tilt += (tiltTarget - tilt) * 0.08;
      paint();
      frameId = requestAnimationFrame(frame);
    }

    function schedule() {
      if (active && visible && !frameId) {
        last = performance.now();
        frameId = requestAnimationFrame(frame);
      }
    }

    function cardAt(x, y) {
      const el = document.elementFromPoint(x, y);
      return el && el.closest(".ring__card");
    }

    stage.addEventListener("pointerdown", (e) => {
      if (!active || e.button !== 0) return;
      dragging = true;
      pointerId = e.pointerId;
      lastX = e.clientX;
      travel = 0;
      velocity = 0;
      target = null;
    }, { signal: controller.signal });
    window.addEventListener(
      "pointermove",
      (e) => {
        if (!active) return;
        if (dragging && e.pointerId === pointerId) {
          const dx = e.clientX - lastX;
          lastX = e.clientX;
          travel += Math.abs(dx);
          if (travel > 6 && !stage.classList.contains("is-dragging")) {
            stage.classList.add("is-dragging");
            try {
              stage.setPointerCapture(pointerId);
            } catch (_) {}
          }
          const delta = dx * 0.28;
          angle += delta;
          velocity = delta;
        }
        const r = stage.getBoundingClientRect();
        if (e.clientY > r.top - 200 && e.clientY < r.bottom + 200) {
          const ny = clamp(
            (e.clientY - (r.top + r.height / 2)) / r.height,
            -0.5,
            0.5,
          );
          tiltTarget = -11 + ny * 8;
        }
      },
      { passive: true, signal: controller.signal },
    );
    const release = (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      stage.classList.remove("is-dragging");
      idleUntil = performance.now() + 2600;
      if (travel <= 6 && e.type === "pointerup") {
        const card = cardAt(e.clientX, e.clientY);
        if (card) onPick(items[+card.dataset.index], card);
      }
    };
    window.addEventListener("pointerup", release, { signal: controller.signal });
    window.addEventListener("pointercancel", release, { signal: controller.signal });
    stage.addEventListener("pointerenter", (e) => {
      if (active && e.pointerType === "mouse") hovering = true;
    }, { signal: controller.signal });
    stage.addEventListener("pointerleave", () => {
      hovering = false;
      idleUntil = performance.now() + 800;
    }, { signal: controller.signal });

    // Клавиатура: Enter/пробел открывают вакансию, фокус доворачивает карточку к зрителю.
    cards.forEach((card, i) => {
      card.addEventListener("click", (e) => {
        if (active && e.detail === 0) onPick(items[i], card);
      }, { signal: controller.signal });
      card.addEventListener("focus", () => {
        if (!active) return;
        const desired = -i * step;
        const k = Math.round((angle - desired) / 360);
        target = desired + k * 360;
        idleUntil = performance.now() + 4000;
      }, { signal: controller.signal });
      card.addEventListener("keydown", (e) => {
        if (!active || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
        e.preventDefault();
        cards[(i + (e.key === "ArrowRight" ? 1 : -1) + n) % n].focus();
      }, { signal: controller.signal });
    });

    // Останавливаем рендер вне экрана и при деактивации KeepAlive.
    let observer = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) schedule();
        else if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = 0;
        }
      });
      observer.observe(stage);
    }

    const pause = () => {
      active = false;
      dragging = false;
      pointerId = null;
      hovering = false;
      velocity = 0;
      stage.classList.remove("is-dragging");
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    };
    const resume = () => {
      if (active) return;
      active = true;
      layout();
      schedule();
    };
    const destroy = () => {
      pause();
      controller.abort();
      observer?.disconnect();
    };

    layout();
    addEventListener("resize", () => { if (active) layout(); }, { signal: controller.signal });
    schedule();
    return { pause, resume, destroy };
  }

  /* ---------------- Сцена «Как это работает» ---------------- */
  function createHowScene({ track, scene, steps, bar, onStep }) {
    const controller = new AbortController();
    let active = true;
    let frameId = 0;
    const sources = [...scene.querySelectorAll(".src-card")];
    const doc = scene.querySelector(".doc");
    const note = scene.querySelector(".fit-note");
    const host = scene.parentElement;
    // Более мягкая кривая, чем smoothstep: без рывка в начале и в конце фазы.
    const soft = (a, b, v) => {
      const t = clamp((v - a) / (b - a));
      return t * t * t * (t * (t * 6 - 15) + 10);
    };
    // Откуда прилетают объявления с разных площадок
    const from = [
      { x: -190, y: -150, z: -120, ry: 26, rz: -7 },
      { x: 200, y: -40, z: -260, ry: -32, rz: 6 },
      { x: -120, y: 170, z: 40, ry: 18, rz: 3 },
    ];
    // Наклон карточек под курсором: цель (tx, ty, th) и сглаженное значение (x, y, h).
    // Последние два элемента — документ и плашка «Подходит вам».
    const hover = [...sources, doc, note].map(() => ({
      tx: 0,
      ty: 0,
      th: 0,
      x: 0,
      y: 0,
      h: 0,
    }));
    const docHover = hover[sources.length],
      noteHover = hover[sources.length + 1];
    // Наклон под курсором — чуть мягче, чем у карточек площадок (у них 18° и 16°).
    const tiltOf = (h, amount) =>
      `translate3d(0, ${-h.h * 5 * amount}px, ${h.h * 26 * amount}px) rotateX(${-h.y * 14 * amount}deg) rotateY(${h.x * 16 * amount}deg)`;
    let pointerX = 0,
      pointerY = 0,
      sx = 0,
      sy = 0,
      tp = 0,
      cp = 0,
      current = -1,
      running = false,
      lastT = 0;

    function fit() {
      const avail = host.clientWidth;
      const availH = innerHeight * (innerWidth <= 960 ? 0.5 : 0.8);
      const s = Math.min(1, avail / 460, availH / 560);
      scene.style.setProperty("--scene-scale", s.toFixed(3));
    }

    function progress() {
      const r = track.getBoundingClientRect();
      const total = r.height - innerHeight;
      return total > 0 ? clamp(-r.top / total) : 0;
    }

    function render() {
      const p = cp,
        pointerX = sx,
        pointerY = sy;
      let t1 = soft(0.0, 0.24, p);
      let t2 = soft(0.27, 0.47, p);
      let t3 = soft(0.52, 0.7, p);
      if (reduced.matches) {
        t1 = p > 0.11 ? 1 : 0;
        t2 = p > 0.35 ? 1 : 0;
        t3 = p > 0.6 ? 1 : 0;
      }

      sources.forEach((card, i) => {
        const f = from[i];
        // Карточки сходятся по очереди, а не все разом
        const k = reduced.matches ? t1 : soft(i * 0.08, 0.76 + i * 0.08, t1);
        const hv = hover[i];
        const lift = hv.h * (1 - k);
        const x = mix(f.x, 0, k),
          y = mix(f.y, 0, k) - lift * 6,
          z = mix(f.z, -30 - i * 14, k) + lift * 30;
        card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateX(${-hv.y * 16 * (1 - k)}deg) rotateY(${mix(f.ry, 0, k) + hv.x * 18 * (1 - k)}deg) rotateZ(${mix(f.rz, 0, k)}deg)`;
        card.style.opacity = String(1 - soft(0.7, 1, k));
        card.style.pointerEvents = k < 0.6 ? "" : "none";
      });

      // Документ: появляется, затем переворачивается с подъёмом, как лист, который берут в руки
      const appear = soft(0.62, 1, t1);
      const arc = Math.sin(Math.PI * t2);
      const ry = 180 * t2 + pointerX * 8;
      const rx = 6 * t3 - pointerY * 6 - arc * 8;
      const rz = arc * -3;
      const z = mix(-120, 0, appear) + arc * 110;
      doc.style.setProperty("--doc-o", appear.toFixed(3));
      doc.style.setProperty("--shine", (arc * 0.8).toFixed(3));
      doc.style.transform = `${tiltOf(docHover, appear * (1 - t3 * 0.5))} translate3d(0, ${mix(30, 0, appear) - 34 * t3 - arc * 14}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;

      note.style.opacity = String(t3);
      note.style.transform = `${tiltOf(noteHover, t3)} translate3d(0, ${mix(60, 0, t3) - 34 * t3}px, ${mix(0, 70, t3)}px) rotateX(${rx}deg) rotateY(${pointerX * 8}deg)`;

      bar.parentElement.style.setProperty("--p", p.toFixed(4));
      const idx = p < 0.25 ? 0 : p < 0.5 ? 1 : 2;
      if (idx !== current) {
        current = idx;
        steps.forEach((s, i) => s.classList.toggle("is-active", i === idx));
        onStep && onStep(idx);
      }
    }
    // Плавное догоняние: колесо мыши даёт рывки, а сцена тянется за целевым значением с инерцией.
    function tick(now) {
      frameId = 0;
      if (!active) {
        running = false;
        return;
      }
      const dt = Math.min(48, now - lastT);
      lastT = now;
      const k = reduced.matches ? 1 : 1 - Math.exp(-dt / 340);
      const kh = reduced.matches ? 1 : 1 - Math.exp(-dt / 140);
      cp += (tp - cp) * k;
      sx += (pointerX - sx) * k;
      sy += (pointerY - sy) * k;
      let done =
        Math.abs(tp - cp) < 0.0003 &&
        Math.abs(pointerX - sx) < 0.001 &&
        Math.abs(pointerY - sy) < 0.001;
      for (const h of hover) {
        h.x += (h.tx - h.x) * kh;
        h.y += (h.ty - h.y) * kh;
        h.h += (h.th - h.h) * kh;
        if (
          Math.abs(h.tx - h.x) > 0.002 ||
          Math.abs(h.ty - h.y) > 0.002 ||
          Math.abs(h.th - h.h) > 0.002
        )
          done = false;
      }
      if (done) {
        cp = tp;
        sx = pointerX;
        sy = pointerY;
        for (const h of hover) {
          h.x = h.tx;
          h.y = h.ty;
          h.h = h.th;
        }
      }
      render();
      if (done) running = false;
      else frameId = requestAnimationFrame(tick);
    }
    const request = () => {
      if (!active) return;
      tp = progress();
      if (!running) {
        running = true;
        lastT = performance.now();
        frameId = requestAnimationFrame(tick);
      }
    };

    addEventListener("scroll", request, { passive: true, signal: controller.signal });
    addEventListener("resize", () => {
      if (!active) return;
      fit();
      request();
    }, { signal: controller.signal });
    host.addEventListener("pointermove", (e) => {
      if (!active || e.pointerType !== "mouse" || reduced.matches) return;
      const r = host.getBoundingClientRect();
      pointerX = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
      pointerY = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
      // Документ и плашка не ловят события сами (лежат поверх карточек), поэтому проверяем попадание по рамке.
      const overNote =
        Number(note.style.opacity) > 0.3 && hoverFrom(noteHover, note, e);
      if (overNote) docHover.tx = docHover.ty = docHover.th = 0;
      else if (!(
        Number(doc.style.getPropertyValue("--doc-o")) > 0.3 &&
        hoverFrom(docHover, doc, e)
      ))
        docHover.tx = docHover.ty = docHover.th = 0;
      if (!overNote) noteHover.tx = noteHover.ty = noteHover.th = 0;
      request();
    }, { signal: controller.signal });
    host.addEventListener("pointerleave", () => {
      if (!active) return;
      pointerX = pointerY = 0;
      for (const h of [docHover, noteHover]) h.tx = h.ty = h.th = 0;
      request();
    }, { signal: controller.signal });
    function hoverFrom(h, node, e) {
      const r = node.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5,
        y = (e.clientY - r.top) / r.height - 0.5;
      if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) return false;
      h.tx = x * 2;
      h.ty = y * 2;
      h.th = 1;
      return true;
    }

    // Карточки площадок покачиваются под курсором
    sources.forEach((card, i) => {
      card.addEventListener("pointermove", (e) => {
        if (!active || e.pointerType !== "mouse" || reduced.matches) return;
        const r = card.getBoundingClientRect();
        const h = hover[i];
        h.tx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5) * 2;
        h.ty = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5) * 2;
        h.th = 1;
        request();
      }, { signal: controller.signal });
      card.addEventListener("pointerleave", () => {
        const h = hover[i];
        h.tx = h.ty = h.th = 0;
        request();
      }, { signal: controller.signal });
    });

    // Клик по шагу — прокрутка к нужной фазе сцены.
    const anchors = [0.11, 0.39, 0.8];
    steps.forEach((s, i) =>
      s.querySelector("button").addEventListener("click", () => {
        if (!active) return;
        const r = track.getBoundingClientRect();
        const top = scrollY + r.top + (r.height - innerHeight) * anchors[i];
        scrollTo({ top, behavior: reduced.matches ? "auto" : "smooth" });
      }, { signal: controller.signal }),
    );

    const pause = () => {
      active = false;
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      running = false;
      pointerX = pointerY = 0;
      for (const h of hover) h.tx = h.ty = h.th = 0;
    };
    const resume = () => {
      if (active) return;
      active = true;
      fit();
      request();
    };
    const destroy = () => {
      pause();
      controller.abort();
    };

    fit();
    tp = cp = progress();
    render();
    return { pause, resume, destroy };
  }

  /* ---------------- Параллакс фотографии ---------------- */
  function createParallax(figure) {
    const controller = new AbortController();
    const img = figure.querySelector("img");
    let active = true;
    let frameId = 0;

    const update = () => {
      frameId = 0;
      if (!active) return;
      if (reduced.matches) {
        img.style.setProperty("--py", "-8%");
        return;
      }
      const r = figure.getBoundingClientRect();
      const t = clamp((innerHeight - r.top) / (innerHeight + r.height));
      img.style.setProperty("--py", `${(-t * 15).toFixed(2)}%`);
    };
    const request = () => {
      if (active && !frameId) frameId = requestAnimationFrame(update);
    };
    addEventListener("scroll", request, { passive: true, signal: controller.signal });
    addEventListener("resize", request, { passive: true, signal: controller.signal });

    const pause = () => {
      active = false;
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    };
    const resume = () => {
      if (active) return;
      active = true;
      request();
    };
    const destroy = () => {
      pause();
      controller.abort();
    };
    update();
    return { pause, resume, destroy };
  }

  return { createRing, createHowScene, createParallax };
})();
