// 2D slunecni soustava vaultu (canvas, pohled shora).
// Stejna filozofie jako 3D: Slunce = jadro, planety = slozky, mesice = poznamky.
// Vystavuje window.System2D (stejne API jako System3D), aby slo prepinat.
(function () {
  const PALETTE = ["#5b9dff", "#38e0ff", "#7c5cff", "#2dd4ff", "#6ea8ff", "#9b8cff", "#22b8ff", "#4f6bff"];

  let canvas = null, ctx = null, mount = null, tooltipEl = null, clickHandler = null;
  let W = 0, H = 0, raf = null, running = false;
  let sun = null, planets = [], stars = [];
  let view = { x: 0, y: 0, k: 1 };       // pan (screen px) + zoom; svet. pocatek = Slunce
  let target = null;                      // cilovy view pro plynuly tween
  let focusedPlanet = null;
  let planetsTimeScale = 1, targetPlanetsTimeScale = 1;
  let hovered = null;
  const ACTIVE_MS = 6000;
  let activeUntil = new Map(); // path -> expiry
  const mouse = { x: -9999, y: -9999, down: false, moved: false, downX: 0, downY: 0, lastX: 0, lastY: 0, panning: false };

  // --- pomocne ---------------------------------------------------------------
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const w2s = (wx, wy) => [W / 2 + view.x + wx * view.k, H / 2 + view.y + wy * view.k];
  const s2w = (sx, sy) => [(sx - W / 2 - view.x) / view.k, (sy - H / 2 - view.y) / view.k];
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function ensure(el) {
    if (canvas) return;
    mount = el;
    canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;cursor:grab";
    mount.appendChild(canvas);
    ctx = canvas.getContext("2d");
    tooltipEl = document.createElement("div");
    tooltipEl.className = "sys-tooltip";
    tooltipEl.style.display = "none";
    mount.appendChild(tooltipEl);
    for (let i = 0; i < 240; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.5 + 0.2 });
    setupPointer();
  }

  function resize(w, h) {
    if (!canvas) return;
    W = w; H = h;
    canvas.width = w * dpr(); canvas.height = h * dpr();
  }

  function fitScale() {
    if (!planets.length) return 1;
    let maxR = 90;
    for (const p of planets) {
      const moonMax = p.moons.length ? p.moons[p.moons.length - 1].r : 0;
      maxR = Math.max(maxR, p.R + p.pr + moonMax);
    }
    return (Math.min(W, H) * 0.46) / maxR;
  }

  function data(s) {
    ensure(mount);
    sun = { name: s.sun.name, r: 26, sx: 0, sy: 0, screenR: 26 };
    planets = s.planets.map((p, i) => {
      const R = 120 + i * 88;
      const pr = 7 + Math.sqrt(p.moons.length) * 3.0;
      const moons = p.moons.map((m, j) => ({
        name: m.name, path: m.path,
        r: pr + 12 + (j % 6) * 5 + Math.floor(j / 6) * 7,
        angle: Math.random() * Math.PI * 2,
        speed: (0.3 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1),
        sx: 0, sy: 0, screenR: 2,
      }));
      return {
        name: p.name, folder: p.folder, color: PALETTE[i % PALETTE.length],
        R, pr, moons, angle: Math.random() * Math.PI * 2,
        speed: (0.12 / Math.sqrt(R / 120)) * (0.8 + Math.random() * 0.4),
        sx: 0, sy: 0, screenR: pr,
      };
    });
    focusedPlanet = null; targetPlanetsTimeScale = 1; planetsTimeScale = 1;
    view = { x: 0, y: 0, k: fitScale() };
    target = null;
  }

  // --- kresleni --------------------------------------------------------------
  function drawGlow(x, y, r, color, alpha) {
    if (r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, alpha));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function label(text, x, y, color, size) {
    ctx.font = `600 ${size}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }

  function draw() {
    ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    ctx.fillStyle = "#05070f"; ctx.fillRect(0, 0, W, H);

    // hvezdy
    for (const st of stars) {
      ctx.globalAlpha = st.a; ctx.fillStyle = "#9fc4ff";
      ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const [cx, cy] = w2s(0, 0);

    // obezne drahy
    for (const p of planets) {
      ctx.beginPath(); ctx.strokeStyle = hexA(p.color, 0.18); ctx.lineWidth = 1;
      ctx.arc(cx, cy, p.R * view.k, 0, Math.PI * 2); ctx.stroke();
    }

    // Slunce
    drawGlow(cx, cy, sun.r * view.k * 3.4, "#4f8bff", 0.45);
    drawGlow(cx, cy, sun.r * view.k * 1.6, "#cfe6ff", 0.9);
    ctx.fillStyle = "#eaf3ff";
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, sun.r * view.k), 0, Math.PI * 2); ctx.fill();
    sun.sx = cx; sun.sy = cy; sun.screenR = Math.max(3, sun.r * view.k);
    label(sun.name, cx, cy - sun.screenR - 9, "#eaf3ff", 13);

    // planety + mesice
    const now = performance.now();
    for (const p of planets) {
      const wx = Math.cos(p.angle) * p.R, wy = Math.sin(p.angle) * p.R;
      const [px, py] = w2s(wx, wy);
      p.sx = px; p.sy = py; p.screenR = Math.max(3, p.pr * view.k);

      let planetAct = 0;
      for (const m of p.moons) {
        const mwx = wx + Math.cos(m.angle) * m.r;
        const mwy = wy + Math.sin(m.angle) * m.r * 0.62; // elipsa = naznak naklonu
        const [mx, my] = w2s(mwx, mwy);
        m.sx = mx; m.sy = my; m.screenR = Math.max(1.8, 1.6 * view.k);
        const hot = hovered === m;
        const act = m.path && activeUntil.has(m.path) ? Math.max(0, (activeUntil.get(m.path) - now) / ACTIVE_MS) : 0;
        if (act > 0) planetAct = Math.max(planetAct, act);
        else if (m.path && activeUntil.has(m.path)) activeUntil.delete(m.path);
        const rr = m.screenR * (hot ? 1.7 : 1) * (1 + act);
        ctx.fillStyle = (hot || act > 0) ? "#ffffff" : "#c3d6ff";
        ctx.beginPath(); ctx.arc(mx, my, rr, 0, Math.PI * 2); ctx.fill();
        if (act > 0) {
          ctx.globalAlpha = act; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(mx, my, rr + 3 + (1 - act) * 9, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      drawGlow(px, py, p.screenR * 2.8 * (1 + planetAct * 0.4), planetAct > 0 ? "#cfe6ff" : p.color, 0.5);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(px, py, p.screenR * (hovered === p ? 1.3 : 1), 0, Math.PI * 2); ctx.fill();
      if (planetAct > 0) {
        ctx.globalAlpha = planetAct * 0.9; ctx.strokeStyle = "#9fd0ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, p.screenR + 6 + (1 - planetAct) * 10, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      label(p.name, px, py - p.screenR - 7, p.color, 11);
    }
  }

  // --- interakce -------------------------------------------------------------
  function setHover(o) {
    if (o === hovered) { if (hovered) moveTooltip(); return; }
    hovered = o;
    if (o) { canvas.style.cursor = "pointer"; tooltipEl.textContent = o.name; tooltipEl.style.display = "block"; moveTooltip(); }
    else { canvas.style.cursor = mouse.down ? "grabbing" : "grab"; tooltipEl.style.display = "none"; }
  }
  function moveTooltip() { tooltipEl.style.left = mouse.x + 14 + "px"; tooltipEl.style.top = mouse.y + 14 + "px"; }

  function hitTest() {
    if (mouse.x < -9000 || mouse.panning) { setHover(null); return; }
    let found = null;
    for (const p of planets) for (const m of p.moons) if (dist(mouse.x, mouse.y, m.sx, m.sy) < Math.max(7, m.screenR + 5)) found = m;
    if (!found) for (const p of planets) if (dist(mouse.x, mouse.y, p.sx, p.sy) < p.screenR + 6) { found = p; break; }
    if (!found && sun && dist(mouse.x, mouse.y, sun.sx, sun.sy) < sun.screenR + 6) found = sun;
    setHover(found);
  }

  function focusPlanet(p) {
    focusedPlanet = p; targetPlanetsTimeScale = 0;
    const moonMax = p.moons.length ? p.moons[p.moons.length - 1].r : 12;
    const k = Math.min(6, Math.max(view.k, (Math.min(W, H) * 0.34) / (p.pr + moonMax)));
    const wx = Math.cos(p.angle) * p.R, wy = Math.sin(p.angle) * p.R;
    target = { x: -wx * k, y: -wy * k, k };
  }
  function resetView() { focusedPlanet = null; targetPlanetsTimeScale = 1; target = { x: 0, y: 0, k: fitScale() }; }

  function onClick() {
    if (!hovered) { resetView(); return; }
    if (hovered.path) { if (clickHandler) clickHandler(hovered.path); }   // mesic
    else if (hovered === sun) { resetView(); }
    else { focusPlanet(hovered); }                                        // planeta
  }

  function setupPointer() {
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      if (mouse.down) {
        if (Math.abs(e.clientX - mouse.downX) + Math.abs(e.clientY - mouse.downY) > 4) { mouse.moved = true; mouse.panning = true; target = null; focusedPlanet = null; }
        if (mouse.panning) { view.x += e.clientX - mouse.lastX; view.y += e.clientY - mouse.lastY; }
      }
      mouse.lastX = e.clientX; mouse.lastY = e.clientY;
    });
    canvas.addEventListener("pointerdown", (e) => {
      mouse.down = true; mouse.moved = false; mouse.panning = false;
      mouse.downX = e.clientX; mouse.downY = e.clientY; mouse.lastX = e.clientX; mouse.lastY = e.clientY;
      canvas.style.cursor = "grabbing";
    });
    window.addEventListener("pointerup", () => {
      if (mouse.down && !mouse.moved) onClick();
      mouse.down = false; mouse.panning = false;
      if (canvas) canvas.style.cursor = hovered ? "pointer" : "grab";
    });
    canvas.addEventListener("pointerleave", () => { mouse.x = -9999; mouse.y = -9999; });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const nk = Math.min(6, Math.max(0.12, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
      const [wx, wy] = s2w(mouse.x, mouse.y);
      view.k = nk;
      const [sx, sy] = w2s(wx, wy);
      view.x += mouse.x - sx; view.y += mouse.y - sy;
      target = null; focusedPlanet = null;
    }, { passive: false });
  }

  // --- smycka ----------------------------------------------------------------
  function animate() {
    if (!running) { raf = null; return; }
    planetsTimeScale += (targetPlanetsTimeScale - planetsTimeScale) * 0.06;

    for (const p of planets) {
      p.angle += p.speed * (1 / 60) * planetsTimeScale;
      for (const m of p.moons) m.angle += m.speed * (1 / 60);
    }
    // sleduj planetu pri zaostrovani (aby zustala vycentrovana, nez zamrzne)
    if (focusedPlanet && target) {
      const wx = Math.cos(focusedPlanet.angle) * focusedPlanet.R, wy = Math.sin(focusedPlanet.angle) * focusedPlanet.R;
      target.x = -wx * target.k; target.y = -wy * target.k;
    }
    if (target) {
      view.x += (target.x - view.x) * 0.08;
      view.y += (target.y - view.y) * 0.08;
      view.k += (target.k - view.k) * 0.08;
      if (Math.abs(target.k - view.k) < 0.002 && Math.hypot(target.x - view.x, target.y - view.y) < 0.6) target = null;
    }

    draw();
    hitTest();
    raf = requestAnimationFrame(animate);
  }

  window.System2D = {
    ready: true,
    setClickHandler(fn) { clickHandler = fn; },
    setActive(paths) { const now = performance.now(); for (const p of paths || []) activeUntil.set(p, now + ACTIVE_MS); },
    ensure,
    data,
    resize,
    resume() { ensure(mount); running = true; if (!raf) animate(); },
    pause() { running = false; if (raf) { cancelAnimationFrame(raf); raf = null; } },
  };
})();
