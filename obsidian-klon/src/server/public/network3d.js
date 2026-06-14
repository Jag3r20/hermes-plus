// 3D sitovy graf "druheho mozku" (ESM): uzly = poznamky, hrany = [[odkazy]].
// three.js + 3d-force-graph + bloom. Vystavuje window.Network3D.

import * as THREE from "three";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import ForceGraph3D from "https://esm.sh/3d-force-graph@1.80.0?external=three";

let graph = null, mountEl = null, bloom = null, clickHandler = null;
let running = false, pulseRaf = null, cosmos = null, fitted = false;
let hoverId = null, neighborIds = new Set();
const ACTIVE_MS = 6000;
const WHITE = new THREE.Color(0xffffff);
let activeUntil = new Map(); // path -> expiry (ms)

const endId = (e) => (e && e.id != null ? e.id : e);
const touches = (l) => endId(l.source) === hoverId || endId(l.target) === hoverId;

let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const s = 128, cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  _glowTex = new THREE.CanvasTexture(cv);
  return _glowTex;
}

function addCosmos(scn) {
  const group = new THREE.Group();
  const N = 1500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 600 + Math.random() * 1400;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
    const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.08, 0.8, 0.55 + Math.random() * 0.4);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  sg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(sg, new THREE.PointsMaterial({
    size: 2.6, sizeAttenuation: true, vertexColors: true, transparent: true,
    opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture(),
  })));
  scn.add(group);
  return group;
}

function setHover(node) {
  hoverId = node ? node.id : null;
  neighborIds = new Set();
  if (node) {
    neighborIds.add(node.id);
    for (const l of graph.graphData().links) {
      const s = endId(l.source), t = endId(l.target);
      if (s === node.id) neighborIds.add(t);
      if (t === node.id) neighborIds.add(s);
    }
  }
  if (mountEl) mountEl.style.cursor = node ? "pointer" : "grab";
  graph.linkColor(graph.linkColor());
  graph.linkWidth(graph.linkWidth());
  graph.linkDirectionalParticles(graph.linkDirectionalParticles());
}

function pulse() {
  if (!running || !graph) { pulseRaf = null; return; }
  const t = performance.now() * 0.0022;
  if (cosmos) cosmos.rotation.y += 0.0003;
  const now = performance.now();
  for (const n of graph.graphData().nodes) {
    const m = n.__mesh; if (!m) continue;
    const amp = 0.05 + Math.min(n.val || 1, 14) * 0.012;
    let s = (n.__r || 3) * (1 + Math.sin(t + (n.__phase || 0)) * amp);
    const dim = hoverId && !neighborIds.has(n.id);
    m.material.opacity = dim ? 0.1 : 0.96;
    if (dim) s *= 0.78;
    // prave pouzivany node = zbeli a zvetsi se (bloom ho rozzari)
    const act = activeUntil.has(n.id) ? Math.max(0, (activeUntil.get(n.id) - now) / ACTIVE_MS) : 0;
    if (act > 0) {
      s *= 1 + 0.9 * act;
      m.material.color.set(n.color || "#5b9dff").lerp(WHITE, 0.85 * act);
      m.__wasActive = true;
    } else if (m.__wasActive) {
      m.material.color.set(n.color || "#5b9dff");
      m.__wasActive = false;
      activeUntil.delete(n.id);
    }
    m.scale.setScalar(s);
  }
  pulseRaf = requestAnimationFrame(pulse);
}

function ensure(el) {
  if (graph) return;
  mountEl = el;
  graph = ForceGraph3D({ controlType: "orbit" })(el)
    .backgroundColor("#070b16")
    .showNavInfo(false)
    .nodeLabel((n) => n.name)
    .nodeThreeObject((node) => {
      const r = 2.2 + Math.cbrt(node.val || 1) * 2.5;
      const mat = new THREE.MeshBasicMaterial({ color: node.color || "#5b9dff", transparent: true, opacity: 0.96 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 20), mat);
      mesh.scale.setScalar(r);
      node.__r = r; node.__mesh = mesh; node.__phase = Math.random() * Math.PI * 2;
      return mesh;
    })
    .linkColor((l) => (hoverId && !touches(l) ? "rgba(110,168,255,0.05)" : "rgba(120,180,255,0.42)"))
    .linkWidth((l) => (hoverId && touches(l) ? 1.6 : 0.5))
    .linkDirectionalParticles((l) => (hoverId ? (touches(l) ? 5 : 0) : 2))
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleWidth(1.4)
    .linkDirectionalParticleColor(() => "#8fc4ff")
    .onNodeHover((node) => setHover(node))
    .onNodeClick((node) => { if (clickHandler) clickHandler(node.id); });

  const c = graph.controls();
  c.autoRotate = true; c.autoRotateSpeed = 0.6;
  graph.d3Force("charge").strength(-180);
  graph.d3Force("link").distance(55);
  graph.d3VelocityDecay(0.32);
  graph.onEngineStop(() => { if (!fitted) { fitted = true; graph.zoomToFit(700, 70); } });

  graph.camera().far = 12000;
  graph.camera().updateProjectionMatrix();
  cosmos = addCosmos(graph.scene());

  const w = el.clientWidth || 1, h = el.clientHeight || 1;
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 1.25, 0.5, 0.16);
  graph.postProcessingComposer().addPass(bloom);
}

window.Network3D = {
  ready: true,
  setClickHandler(fn) { clickHandler = fn; },
  ensure,
  setActive(paths) { const now = performance.now(); for (const p of paths || []) activeUntil.set(p, now + ACTIVE_MS); },
  data(gd) { if (graph) { fitted = false; graph.graphData(gd); } },
  resize(w, h) { if (!graph) return; graph.width(w).height(h); if (bloom) bloom.setSize(w, h); },
  resume() { if (!graph) return; running = true; graph.resumeAnimation(); if (!pulseRaf) pulse(); },
  pause() { running = false; if (pulseRaf) { cancelAnimationFrame(pulseRaf); pulseRaf = null; } if (graph) graph.pauseAnimation(); },
};

window.dispatchEvent(new Event("network3d-ready"));
