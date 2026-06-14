// 2D sitovy graf "druheho mozku" (canvas): uzly = poznamky, hrany = [[odkazy]].
// Force-directed simulace, pan/zoom, hover-zvyrazneni. Vystavuje window.Network2D.
(function () {
  let canvas = null, ctx = null, mount = null, tooltipEl = null, clickHandler = null;
  let W = 0, H = 0, raf = null, running = false;
  let nodes = [], links = [], adj = new Map(), stars = [];
  let view = { x: 0, y: 0, k: 1 }, alpha = 1;
  let hovered = null;
  const ACTIVE_MS = 6000;
  let activeUntil = new Map(); // id (path) -> expiry
  const mouse = { x: -9999, y: -9999, down: false, moved: false, downX: 0, downY: 0, lastX: 0, lastY: 0, panning: false };

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const w2s = (wx, wy) => [W / 2 + view.x + wx * view.k, H / 2 + view.y + wy * view.k];
  const s2w = (sx, sy) => [(sx - W / 2 - view.x) / view.k, (sy - H / 2 - view.y) / view.k];
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function hexA(hex, a) {
    if (!hex || hex[0] !== "#") return `rgba(150,180,255,${a})`;
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
    for (let i = 0; i < 220; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3, a: Math.random() * 0.45 + 0.15 });
    setupPointer();
  }

  function resize(w, h) {
    if (!canvas) return;
    W = w; H = h; canvas.width = w * dpr(); canvas.height = h * dpr();
  }

  function data(gd) {
    ensure(mount);
    nodes = gd.nodes.map((n) => ({
      id: n.id, name: n.name, color: n.color || "#5b9dff",
      r: 4 + Math.sqrt(n.val || 1) * 2.4,
      x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400, vx: 0, vy: 0,
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    links = gd.links.map((l) => ({ s: byId.get(l.source), t: byId.get(l.target), w: l.w || 1 })).filter((l) => l.s && l.t);
    adj = new Map(nodes.map((n) => [n.id, new Set()]));
    for (const l of links) { adj.get(l.s.id).add(l.t.id); adj.get(l.t.id).add(l.s.id); }
    alpha = 1;
    view = { x: 0, y: 0, k: 1 };
    // par iteraci predpocitat, at to nezacne jako chuchvalec
    for (let i = 0; i < 60; i++) step(0.9);
    fitView();
  }

  function fitView() {
    if (!nodes.length) return;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const n of nodes) { minx = Math.min(minx, n.x); maxx = Math.max(maxx, n.x); miny = Math.min(miny, n.y); maxy = Math.max(maxy, n.y); }
    const w = maxx - minx || 1, h = maxy - miny || 1;
    view.k = Math.min(6, Math.max(0.2, Math.min(W / (w + 120), H / (h + 120))));
    view.x = -((minx + maxx) / 2) * view.k;
    view.y = -((miny + maxy) / 2) * view.k;
  }

  // jeden krok force simulace
  function step(a) {
    const REP = 2600, SPRING = 0.02, LINK = 70, GRAV = 0.02, DAMP = 0.85;
    for (let i = 0; i < nodes.length; i++) {
      const A = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const B = nodes[j];
        let dx = A.x - B.x, dy = A.y - B.y;
        let d2 = dx * dx + dy * dy || 1, d = Math.sqrt(d2);
        const f = (REP / d2) * a;
        A.vx += (dx / d) * f; A.vy += (dy / d) * f;
        B.vx -= (dx / d) * f; B.vy -= (dy / d) * f;
      }
    }
    for (const l of links) {
      let dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - LINK) * SPRING * a;
      l.s.vx += (dx / d) * f; l.s.vy += (dy / d) * f;
      l.t.vx -= (dx / d) * f; l.t.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx += -n.x * GRAV * a; n.vy += -n.y * GRAV * a;
      n.vx *= DAMP; n.vy *= DAMP; n.x += n.vx; n.y += n.vy;
    }
  }

  function setHover(o) {
    if (o === hovered) { if (hovered) moveTooltip(); return; }
    hovered = o;
    if (o) { canvas.style.cursor = "pointer"; tooltipEl.textContent = o.name; tooltipEl.style.display = "block"; moveTooltip(); }
    else { canvas.style.cursor = mouse.down ? "grabbing" : "grab"; tooltipEl.style.display = "none"; }
  }
  function moveTooltip() { tooltipEl.style.left = mouse.x + 14 + "px"; tooltipEl.style.top = mouse.y + 14 + "px"; }

  function hitTest() {
    if (mouse.x < -9000 || mouse.panning) { setHover(null); return; }
    let found = null, best = 1e9;
    for (const n of nodes) {
      const [sx, sy] = w2s(n.x, n.y);
      const d = dist(mouse.x, mouse.y, sx, sy);
      if (d < Math.max(8, n.r * view.k + 5) && d < best) { best = d; found = n; }
    }
    setHover(found);
  }

  function draw() {
    ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    ctx.fillStyle = "#070b16"; ctx.fillRect(0, 0, W, H);
    for (const st of stars) { ctx.globalAlpha = st.a; ctx.fillStyle = "#9fc4ff"; ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;

    // hrany
    for (const l of links) {
      const on = !hovered || l.s === hovered || l.t === hovered;
      ctx.strokeStyle = hexA("#78b4ff", on ? 0.4 : 0.05);
      ctx.lineWidth = Math.min(1 + l.w * 0.5, 3) * (on ? 1 : 0.6);
      const [x1, y1] = w2s(l.s.x, l.s.y), [x2, y2] = w2s(l.t.x, l.t.y);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // uzly
    const now = performance.now();
    for (const n of nodes) {
      const [x, y] = w2s(n.x, n.y);
      const dim = hovered && hovered !== n && !adj.get(hovered.id).has(n.id);
      const act = activeUntil.has(n.id) ? Math.max(0, (activeUntil.get(n.id) - now) / ACTIVE_MS) : 0;
      const r = Math.max(2, n.r * view.k) * (hovered === n ? 1.4 : 1) * (1 + 0.5 * act);
      ctx.globalAlpha = dim ? 0.18 : 1;
      // glow
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
      g.addColorStop(0, hexA(n.color, 0.5)); g.addColorStop(1, hexA(n.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = act > 0 ? "#ffffff" : n.color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      // prave pouzivany node = pulzujici prstenec
      if (act > 0) {
        ctx.globalAlpha = act; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 4 + (1 - act) * 14, 0, 7); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (activeUntil.has(n.id)) activeUntil.delete(n.id);
      // popisek jen kdyz dost priblizeno nebo hover/soused
      if (!dim && (view.k > 1.2 || hovered === n || (hovered && adj.get(hovered.id).has(n.id)))) {
        ctx.globalAlpha = 1; ctx.font = "600 11px 'JetBrains Mono', monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.shadowColor = "#05070f"; ctx.shadowBlur = 4; ctx.fillStyle = "#cdddff";
        ctx.fillText(n.name, x, y - r - 4); ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }
  }

  function setupPointer() {
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      if (mouse.down) {
        if (Math.abs(e.clientX - mouse.downX) + Math.abs(e.clientY - mouse.downY) > 4) { mouse.moved = true; mouse.panning = true; }
        if (mouse.panning) { view.x += e.clientX - mouse.lastX; view.y += e.clientY - mouse.lastY; }
      }
      mouse.lastX = e.clientX; mouse.lastY = e.clientY;
    });
    canvas.addEventListener("pointerdown", (e) => { mouse.down = true; mouse.moved = false; mouse.panning = false; mouse.downX = e.clientX; mouse.downY = e.clientY; mouse.lastX = e.clientX; mouse.lastY = e.clientY; canvas.style.cursor = "grabbing"; });
    window.addEventListener("pointerup", () => {
      if (mouse.down && !mouse.moved && hovered && clickHandler) clickHandler(hovered.id);
      mouse.down = false; mouse.panning = false; if (canvas) canvas.style.cursor = hovered ? "pointer" : "grab";
    });
    canvas.addEventListener("pointerleave", () => { mouse.x = -9999; mouse.y = -9999; });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const nk = Math.min(6, Math.max(0.12, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
      const [wx, wy] = s2w(mouse.x, mouse.y);
      view.k = nk;
      const [sx, sy] = w2s(wx, wy);
      view.x += mouse.x - sx; view.y += mouse.y - sy;
    }, { passive: false });
  }

  function animate() {
    if (!running) { raf = null; return; }
    if (alpha > 0.03) { step(alpha); alpha *= 0.97; }
    draw();
    hitTest();
    raf = requestAnimationFrame(animate);
  }

  window.Network2D = {
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
