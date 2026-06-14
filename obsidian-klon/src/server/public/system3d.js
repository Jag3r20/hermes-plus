// 3D slunecni soustava vaultu (ESM modul, ciste three.js).
// Slunce = jadro firmy (SOCIYA), planety = slozky, mesice = poznamky.
// Vystavuje window.System3D pro app.js.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const PALETTE = ["#5b9dff", "#38e0ff", "#7c5cff", "#2dd4ff", "#6ea8ff", "#9b8cff", "#22b8ff", "#4f6bff"];

let renderer, scene, camera, controls, composer, bloom;
let mountEl = null, tooltipEl = null, clickHandler = null;
let systemGroup = null, sun = null, cosmos = null;
let planetObjs = [], clickable = [];
let running = false, raf = null;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
let lastClient = { x: 0, y: 0 };
let hovered = null;
let planetsTimeScale = 1, targetPlanetsTimeScale = 1;
let focusTarget = null;
const ACTIVE_MS = 6000;
const WHITE3 = new THREE.Color(0xffffff);
let activeUntil = new Map();  // path -> expiry (ms)
let moonByPath = new Map();   // path -> { mesh, planet }

// --- pomocne textury / popisky ----------------------------------------------

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

function makeLabel(text, color = "#dfe9ff", worldH = 8) {
  const font = 44, pad = 10;
  const cv = document.createElement("canvas");
  let ctx = cv.getContext("2d");
  ctx.font = `600 ${font}px 'JetBrains Mono', monospace`;
  const w = Math.ceil(ctx.measureText(text).width);
  cv.width = w + pad * 2; cv.height = font + pad * 2;
  ctx = cv.getContext("2d");
  ctx.font = `600 ${font}px 'JetBrains Mono', monospace`;
  ctx.textBaseline = "top";
  ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.fillStyle = color; ctx.fillText(text, pad, pad);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(worldH * (cv.width / cv.height), worldH, 1);
  spr.userData.noPick = true;
  return spr;
}

function makeOrbitRing(R, color) {
  const seg = 160, pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.16 }));
}

// --- "vesmir" v pozadi ------------------------------------------------------

function addCosmos(scn) {
  const group = new THREE.Group();
  const N = 1900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 700 + Math.random() * 1600;
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
    size: 3, sizeAttenuation: true, vertexColors: true, transparent: true,
    opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture(),
  })));
  const neb = [{ c: "#1c46b8", p: [-900, 500, -1000] }, { c: "#3a1f8c", p: [1000, -600, -1200] }, { c: "#0e6fae", p: [-400, -800, -1300] }];
  for (const n of neb) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: n.c, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(900); sp.position.set(...n.p); group.add(sp);
  }
  group.add(new THREE.Mesh(
    new THREE.IcosahedronGeometry(820, 1),
    new THREE.MeshBasicMaterial({ color: 0x3b6fff, wireframe: true, transparent: true, opacity: 0.04, depthWrite: false })
  ));
  scn.add(group);
  return group;
}

// --- inicializace scény -----------------------------------------------------

function ensure(el) {
  if (renderer) return;
  mountEl = el;
  const w = el.clientWidth || 800, h = el.clientHeight || 600;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);

  camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 12000);
  camera.position.set(0, 130, 430);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.32;
  controls.minDistance = 40;
  controls.maxDistance = 1600;

  scene.add(new THREE.AmbientLight(0x3a5a88, 0.7));
  const pl = new THREE.PointLight(0x9ec8ff, 2.4, 0, 0);
  scene.add(pl);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 1.15, 0.6, 0.2);
  composer.addPass(bloom);

  cosmos = addCosmos(scene);

  tooltipEl = document.createElement("div");
  tooltipEl.className = "sys-tooltip";
  tooltipEl.style.display = "none";
  el.appendChild(tooltipEl);

  setupPointer();
}

// --- sestaveni soustavy z dat -----------------------------------------------

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

function buildSystem(sys) {
  if (systemGroup) { scene.remove(systemGroup); disposeGroup(systemGroup); }
  systemGroup = new THREE.Group();
  scene.add(systemGroup);
  planetObjs = []; clickable = []; moonByPath = new Map();

  // SLUNCE
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(18, 40, 40),
    new THREE.MeshBasicMaterial({ color: 0xcfe6ff })
  );
  sunMesh.userData = { type: "sun", name: sys.sun.name };
  systemGroup.add(sunMesh);
  clickable.push(sunMesh);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x4f8bff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  corona.scale.setScalar(110); corona.userData.noPick = true; sunMesh.add(corona);
  const sunLabel = makeLabel(sys.sun.name, "#eaf3ff", 16); sunLabel.position.set(0, 30, 0); sunMesh.add(sunLabel);
  sun = sunMesh;

  // PLANETY
  sys.planets.forEach((p, i) => {
    const R = 90 + i * 48;
    const pr = 4 + Math.sqrt(p.moons.length) * 1.9;
    const color = PALETTE[i % PALETTE.length];

    const orbitGroup = new THREE.Group();
    orbitGroup.rotation.x = (Math.random() - 0.5) * 0.5;
    orbitGroup.rotation.z = (Math.random() - 0.5) * 0.3;
    systemGroup.add(orbitGroup);
    orbitGroup.add(makeOrbitRing(R, color));

    const pivot = new THREE.Group();
    orbitGroup.add(pivot);

    const planetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(pr, 28, 28),
      new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.22), roughness: 0.6, metalness: 0.25 })
    );
    planetMesh.position.set(R, 0, 0);
    planetMesh.userData = { type: "planet", name: p.name, folder: p.folder, baseScale: 1 };
    pivot.add(planetMesh);
    clickable.push(planetMesh);

    const plabel = makeLabel(p.name, color, 7.5);
    plabel.position.set(R, pr + 9, 0);
    pivot.add(plabel);

    const moons = [];
    p.moons.forEach((m, j) => {
      const r = pr + 6 + (j % 6) * 1.9 + Math.floor(j / 6) * 2.6;
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.35, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xc3d6ff, emissive: 0x16314f, roughness: 0.8 })
      );
      moonMesh.userData = { type: "moon", name: m.name, path: m.path, baseScale: 1 };
      planetMesh.add(moonMesh);
      clickable.push(moonMesh);
      if (m.path) moonByPath.set(m.path, { mesh: moonMesh, planet: planetMesh });
      moons.push({ mesh: moonMesh, r, incl: Math.random() * Math.PI, phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 0.8 });
    });

    planetObjs.push({ pivot, mesh: planetMesh, angle: Math.random() * Math.PI * 2, speed: 0.16 / Math.sqrt(R / 90), moons });
  });
}

// --- interakce --------------------------------------------------------------

function setHoverScale(mesh, f) {
  const b = mesh.userData.baseScale || 1;
  mesh.scale.setScalar(b * f);
}

function showTooltip(text) { tooltipEl.textContent = text; tooltipEl.style.display = "block"; }
function hideTooltip() { tooltipEl.style.display = "none"; }
function moveTooltip() {
  tooltipEl.style.left = lastClient.x + 14 + "px";
  tooltipEl.style.top = lastClient.y + 14 + "px";
}

function raycast() {
  if (!mountEl) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickable, false);
  const obj = hits.length ? hits[0].object : null;
  if (obj !== hovered) {
    if (hovered) setHoverScale(hovered, 1);
    hovered = obj;
    if (hovered) { setHoverScale(hovered, 1.45); mountEl.style.cursor = "pointer"; showTooltip(hovered.userData.name); }
    else { mountEl.style.cursor = "grab"; hideTooltip(); }
  }
  if (hovered) moveTooltip();
}

function focusOn(mesh) {
  const wp = new THREE.Vector3(); mesh.getWorldPosition(wp);
  const dir = wp.clone().sub(camera.position).normalize();
  const dist = (mesh.geometry.parameters.radius || 6) * 6 + 46;
  focusTarget = { pos: wp.clone().sub(dir.multiplyScalar(dist)), look: wp.clone() };
  targetPlanetsTimeScale = 0;
  controls.autoRotate = false;
}

function resetView() {
  focusTarget = { pos: new THREE.Vector3(0, 130, 430), look: new THREE.Vector3(0, 0, 0) };
  targetPlanetsTimeScale = 1;
  controls.autoRotate = true;
}

function updateCamTween() {
  if (!focusTarget) return;
  controls.enabled = false;
  camera.position.lerp(focusTarget.pos, 0.06);
  controls.target.lerp(focusTarget.look, 0.06);
  if (camera.position.distanceTo(focusTarget.pos) < 2) { focusTarget = null; controls.enabled = true; }
}

function onClick() {
  if (!hovered) { resetView(); return; }
  const u = hovered.userData;
  if (u.type === "moon") { if (clickHandler) clickHandler(u.path); }
  else if (u.type === "planet") { focusOn(hovered); }
  else if (u.type === "sun") { resetView(); }
}

function setupPointer() {
  const dom = renderer.domElement;
  let downX = 0, downY = 0, downT = 0, moved = false;
  dom.addEventListener("pointermove", (e) => {
    const r = dom.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    lastClient = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 5) moved = true;
  });
  dom.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = false; });
  dom.addEventListener("pointerup", () => { if (!moved && performance.now() - downT < 350) onClick(); });
}

// --- smycka -----------------------------------------------------------------

function animate() {
  if (!running) { raf = null; return; }
  const t = performance.now() * 0.001;
  planetsTimeScale += (targetPlanetsTimeScale - planetsTimeScale) * 0.06;

  for (const p of planetObjs) {
    p.angle += p.speed * (1 / 60) * planetsTimeScale;
    p.pivot.rotation.y = p.angle;
    for (const mo of p.moons) {
      const a = t * mo.speed + mo.phase;
      mo.mesh.position.set(
        Math.cos(a) * mo.r,
        Math.sin(a * 0.7) * mo.r * 0.32 * Math.cos(mo.incl),
        Math.sin(a) * mo.r
      );
    }
  }
  if (sun) sun.rotation.y += 0.0016;
  if (cosmos) cosmos.rotation.y += 0.0003;

  // prave pouzivane mesice (a jejich planety) zbeli a zvetsi se
  const nowMs = performance.now();
  for (const [pth, info] of moonByPath) {
    const exp = activeUntil.get(pth);
    const act = exp ? Math.max(0, (exp - nowMs) / ACTIVE_MS) : 0;
    if (act > 0) {
      info.mesh.scale.setScalar(1 + 1.4 * act);
      info.mesh.material.color.set(0xc3d6ff).lerp(WHITE3, 0.85 * act);
      info.planet.scale.setScalar(1 + 0.25 * act);
      info.mesh.__act = true;
    } else if (info.mesh.__act) {
      info.mesh.scale.setScalar(1);
      info.mesh.material.color.set(0xc3d6ff);
      info.planet.scale.setScalar(1);
      info.mesh.__act = false;
      activeUntil.delete(pth);
    }
  }

  updateCamTween();
  controls.update();
  raycast();
  composer.render();
  raf = requestAnimationFrame(animate);
}

// --- verejne API ------------------------------------------------------------

window.System3D = {
  ready: true,
  setClickHandler(fn) { clickHandler = fn; },
  setActive(paths) { const now = performance.now(); for (const p of paths || []) activeUntil.set(p, now + ACTIVE_MS); },
  ensure,
  data(sys) { ensure(mountEl); buildSystem(sys); },
  resize(w, h) {
    if (!renderer) return;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.setSize(w, h);
    if (bloom) bloom.setSize(w, h);
  },
  resume() { if (!renderer) return; running = true; if (!raf) animate(); },
  pause() { running = false; if (raf) { cancelAnimationFrame(raf); raf = null; } },
};

window.dispatchEvent(new Event("system3d-ready"));
