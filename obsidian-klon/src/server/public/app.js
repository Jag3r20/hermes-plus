// Frontend editoru vaultu. Komunikuje s backendem pres /api/*.

const els = {
  noteList: document.getElementById("note-list"),
  search: document.getElementById("search"),
  searchResults: document.getElementById("search-results"),
  title: document.getElementById("note-title"),
  rendered: document.getElementById("rendered"),
  editor: document.getElementById("editor"),
  graphPane: document.getElementById("graph-pane"),
  graphLegend: document.getElementById("graph-legend"),
  viewBtn: document.getElementById("view-btn"),
  editBtn: document.getElementById("edit-btn"),
  graphBtn: document.getElementById("graph-btn"),
  saveBtn: document.getElementById("save-btn"),
  newBtn: document.getElementById("new-note-btn"),
  backlinks: document.getElementById("backlinks"),
  vaultInfo: document.getElementById("vault-info"),
  noteCount: document.getElementById("note-count"),
};

let notes = [];
let current = null; // { path, content }
let dirty = false;
let mode = "view"; // view | edit | graph

// --- API helpers -------------------------------------------------------------

const api = {
  notes: () => fetch("/api/notes").then((r) => r.json()),
  note: (p) => fetch(`/api/note?path=${encodeURIComponent(p)}`).then((r) => r.json()),
  save: (p, content) =>
    fetch("/api/note", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: p, content }),
    }).then((r) => r.json()),
  search: (q) => fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()),
  backlinks: (p) => fetch(`/api/backlinks?path=${encodeURIComponent(p)}`).then((r) => r.json()),
  graph: () => fetch("/api/graph").then((r) => r.json()),
  system: () => fetch("/api/system").then((r) => r.json()),
  info: () => fetch("/api/info").then((r) => r.json()),
};

// --- Barvy slozek (sdileno seznamem i grafem) --------------------------------

// Modra rodina barev (SOCIYA) pro odliseni slozek v grafu
const PALETTE = ["#5b9dff", "#4f6bff", "#38e0ff", "#7c5cff", "#2dd4ff", "#6ea8ff", "#818cf8", "#22b8ff"];
let folderColors = new Map();

function computeFolderColors() {
  const folders = [...new Set(notes.map((n) => (n.path.includes("/") ? n.path.split("/")[0] : "")))].sort();
  folderColors = new Map();
  let i = 0;
  for (const f of folders) folderColors.set(f, PALETTE[i++ % PALETTE.length]);
}
const colorOf = (folder) => folderColors.get(folder) || "#94a3b8";
const folderOf = (p) => (p.includes("/") ? p.split("/")[0] : "");

// --- Nacteni seznamu poznamek ------------------------------------------------

async function loadNotes() {
  notes = await api.notes();
  computeFolderColors();
  renderNoteList();
  els.noteCount.textContent = `${notes.length} poznámek`;
}

const ICON_DOC = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
const ICON_FOLDER = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

function renderNoteList() {
  els.noteList.innerHTML = "";
  let lastFolder = null;
  for (const note of notes) {
    const folder = folderOf(note.path);
    if (folder !== lastFolder) {
      const lbl = document.createElement("div");
      lbl.className = "folder-label";
      lbl.innerHTML = `${ICON_FOLDER}<span>${escapeHtml(folder || "root")}</span>`;
      els.noteList.appendChild(lbl);
      lastFolder = folder;
    }
    const li = document.createElement("li");
    li.innerHTML = `${ICON_DOC}<span>${escapeHtml(note.name)}</span>`;
    li.title = note.path;
    if (current && current.path === note.path) li.classList.add("active");
    li.onclick = () => openNote(note.path);
    els.noteList.appendChild(li);
  }
}

// --- Otevreni poznamky -------------------------------------------------------

async function openNote(p) {
  if (dirty && !confirm("Máš neuložené změny. Zahodit?")) return;
  const data = await api.note(p);
  current = data;
  dirty = false;
  els.title.textContent = current.path;
  els.editor.value = current.content;
  setMode("view");
  renderNoteList();
  await loadBacklinks(p);
  // na mobilu po vyberu zavri vysouvaci sidebar
  if (window.innerWidth <= 768) {
    document.getElementById("sidebar")?.classList.remove("open");
    document.getElementById("sidebar-backdrop")?.classList.remove("show");
  }
}

// --- Render markdownu s wiki-odkazy ------------------------------------------

function noteExists(name) {
  const base = name.split("/").pop().toLowerCase();
  return notes.some((n) => n.name.toLowerCase() === base);
}

function resolvePath(name) {
  const base = name.split("/").pop().toLowerCase();
  const found = notes.find((n) => n.name.toLowerCase() === base);
  return found ? found.path : null;
}

function renderMarkdown(content) {
  const withLinks = content.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const target = inner.split("|")[0].split("#")[0].trim();
    const label = inner.includes("|") ? inner.split("|")[1].trim() : target;
    const exists = noteExists(target);
    const cls = exists ? "wikilink" : "wikilink broken";
    return `<span class="${cls}" data-target="${encodeURIComponent(target)}">${label}</span>`;
  });
  els.rendered.innerHTML = marked.parse(withLinks);

  els.rendered.querySelectorAll(".wikilink:not(.broken)").forEach((el) => {
    el.onclick = () => {
      const p = resolvePath(decodeURIComponent(el.dataset.target));
      if (p) openNote(p);
    };
  });
}

// --- Backlinky ---------------------------------------------------------------

async function loadBacklinks(p) {
  const bl = await api.backlinks(p);
  if (!bl.length) { els.backlinks.innerHTML = ""; return; }
  els.backlinks.innerHTML = `<h4>↩ Odkazuje sem · ${bl.length}</h4>`;
  const grid = document.createElement("div");
  grid.className = "bl-grid";
  for (const b of bl) {
    const a = document.createElement("span");
    a.className = "bl";
    a.textContent = b.name;
    a.onclick = () => openNote(b.path);
    grid.appendChild(a);
  }
  els.backlinks.appendChild(grid);
}

// --- Prepinani rezimu --------------------------------------------------------

function setMode(m) {
  if (mode === "graph" && m !== "graph") stopGraph();
  mode = m;
  els.rendered.classList.toggle("hidden", m !== "view");
  els.editor.classList.toggle("hidden", m !== "edit");
  els.graphPane.classList.toggle("hidden", m !== "graph");
  els.viewBtn.classList.toggle("active", m === "view");
  els.editBtn.classList.toggle("active", m === "edit");
  els.graphBtn.classList.toggle("active", m === "graph");

  if (m === "view" && current) renderMarkdown(els.editor.value);
  if (m === "edit") els.editor.focus();
  if (m === "graph") renderGraph();
}

// --- Ukladani ----------------------------------------------------------------

async function save() {
  if (!current) return;
  await api.save(current.path, els.editor.value);
  current.content = els.editor.value;
  dirty = false;
  els.saveBtn.disabled = true;
  await loadNotes();
  await loadBacklinks(current.path);
}

async function newNote() {
  const name = prompt("Název nové poznámky (lze i 'Složka/Název'):");
  if (!name) return;
  const p = name.endsWith(".md") ? name : `${name}.md`;
  await api.save(p, `# ${name.split("/").pop().replace(/\.md$/, "")}\n\n`);
  await loadNotes();
  await openNote(p);
  setMode("edit");
}

// --- Vyhledavani -------------------------------------------------------------

let searchTimer;
els.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = els.search.value.trim();
  if (!q) { els.searchResults.innerHTML = ""; return; }
  searchTimer = setTimeout(async () => {
    const results = await api.search(q);
    els.searchResults.innerHTML = "";
    for (const r of results) {
      const div = document.createElement("div");
      div.className = "result";
      div.innerHTML = `<div class="r-name">${escapeHtml(r.name)}</div><div class="r-snippet">${
        r.snippet ? escapeHtml(r.snippet) : ""}</div>`;
      div.onclick = () => { openNote(r.path); els.search.value = ""; els.searchResults.innerHTML = ""; };
      els.searchResults.appendChild(div);
    }
  }, 180);
});

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// --- Vizualizace grafu: typ (soustava / sit) × dimenze (2D / 3D) -------------

let graphType = localStorage.getItem("sociya-graph-type") || "system"; // "system" | "network"
let viewDim = localStorage.getItem("sociya-view-dim") || "3d";          // "2d" | "3d"
const graphMounts = {}; // klic "typ|dim" -> mount div

// Registr 4 rendereru: lazy modul (window.*) + prislusna legenda.
const RENDERERS = {
  "system|3d": { mod: () => window.System3D, legend: buildSystemLegend },
  "system|2d": { mod: () => window.System2D, legend: buildSystemLegend },
  "network|3d": { mod: () => window.Network3D, legend: buildNetworkLegend },
  "network|2d": { mod: () => window.Network2D, legend: buildNetworkLegend },
};

function stopGraph() {
  window.System3D?.pause(); window.System2D?.pause();
  window.Network3D?.pause(); window.Network2D?.pause();
}

// Data podle typu: soustava z /api/system, sit z /api/graph (s barvami slozek).
async function dataForType(type) {
  if (type === "system") return await api.system();
  const g = await api.graph();
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, name: n.label, val: (n.degree || 0) + 1, color: colorOf(n.folder) })),
    links: g.edges.map((e) => ({ source: e.source, target: e.target, w: e.weight || 1 })),
  };
}

// Mount pro dany renderer (jeden na kombinaci); zobrazi tento, skryje ostatni.
function ensureMount(key) {
  if (!graphMounts[key]) {
    const el = document.createElement("div");
    el.className = "graph-mount";
    el.dataset.key = key;
    els.graphPane.insertBefore(el, els.graphPane.firstChild);
    graphMounts[key] = el;
  }
  for (const k in graphMounts) graphMounts[k].style.display = k === key ? "" : "none";
  return graphMounts[key];
}

// Dispatcher: vykresli zvoleny typ ve zvolene dimenzi. 3D vyzaduje WebGL modul;
// dokud se nenacte, docasne padne na 2D stejneho typu (a po donacteni se prepne).
async function renderGraph() {
  stopGraph();
  updateToggles();
  let key = `${graphType}|${viewDim}`;
  if (viewDim === "3d") {
    const m = RENDERERS[key].mod();
    if (!(m && m.ready)) key = `${graphType}|2d`;
  }
  const r = RENDERERS[key];
  const M = r.mod();
  const data = await dataForType(graphType);
  const mount = ensureMount(key);
  r.legend(data);
  M.setClickHandler((path) => { openNote(path); setMode("view"); });
  M.ensure(mount);
  M.resize(els.graphPane.clientWidth, els.graphPane.clientHeight);
  M.data(data);
  M.resume();
}

function updateToggles() {
  document.querySelectorAll("#type-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.type === graphType));
  document.querySelectorAll("#view-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.dim === viewDim));
  const hint = document.getElementById("graph-hint");
  if (hint) {
    const move = viewDim === "3d" ? "rotace" : "posun";
    hint.textContent = graphType === "system"
      ? `táhni = ${move} · kolečko = zoom · klik planeta = přiblížit · klik měsíc = otevřít`
      : `táhni = ${move} · kolečko = zoom · klik uzel = otevřít poznámku`;
  }
}

function setGraphType(type) {
  if (type === graphType) return;
  graphType = type; localStorage.setItem("sociya-graph-type", type);
  updateToggles(); if (mode === "graph") renderGraph();
}
function setViewDim(dim) {
  if (dim === viewDim) return;
  viewDim = dim; localStorage.setItem("sociya-view-dim", dim);
  updateToggles(); if (mode === "graph") renderGraph();
}

// --- Zive zmeny: auto-reload + zvyrazneni prave pouzivanych nodu ------------

function activeRendererMod() {
  let key = `${graphType}|${viewDim}`;
  const m = RENDERERS[key].mod();
  if (viewDim === "3d" && !(m && m.ready)) key = `${graphType}|2d`;
  return RENDERERS[key].mod();
}

let _liveActive = new Set();
let _liveRebuild = false;
let _liveTimer = null;

function onLiveEvent(evt) {
  if (!evt || !evt.path) return;
  _liveActive.add(evt.path);
  if (evt.kind !== "modified") _liveRebuild = true; // vznik/zanik = zmena struktury
  clearTimeout(_liveTimer);
  _liveTimer = setTimeout(flushLive, 350);
}

async function flushLive() {
  const paths = [..._liveActive];
  const rebuild = _liveRebuild;
  _liveActive = new Set();
  _liveRebuild = false;

  await loadNotes();      // obnov seznam v sidebaru + barvy slozek
  flashSidebar(paths);

  if (mode === "graph") {
    if (rebuild) await renderGraph();           // nove/smazane nody → prestavit
    activeRendererMod()?.setActive?.(paths);    // rozsvitit prave zmenene
  }

  // pokud se zmenila prave otevrena poznamka zvenci (a needituji ji), nacti znovu
  if (current && paths.includes(current.path) && mode !== "edit") {
    try {
      const data = await api.note(current.path);
      current = data;
      els.editor.value = current.content;
      if (mode === "view") renderMarkdown(current.content);
    } catch {}
  }
}

function flashSidebar(paths) {
  const set = new Set(paths);
  els.noteList.querySelectorAll("li").forEach((li) => {
    if (set.has(li.title)) {
      li.classList.remove("flash");
      void li.offsetWidth; // restart animace
      li.classList.add("flash");
      setTimeout(() => li.classList.remove("flash"), 2200);
    }
  });
}

function setupLiveReload() {
  let es;
  try { es = new EventSource("/api/events"); } catch { return; }
  es.onmessage = (e) => { try { onLiveEvent(JSON.parse(e.data)); } catch {} };
  // EventSource se po vypadku spojeni reconnectuje sam
}

// Legenda site: slozky (barvy uzlu).
function buildNetworkLegend() {
  const folders = [...folderColors.keys()];
  els.graphLegend.innerHTML = "";
  for (const f of folders) {
    const c = colorOf(f);
    const item = document.createElement("div");
    item.className = "leg-item";
    item.innerHTML = `<span class="leg-dot" style="background:${c};color:${c}"></span>${escapeHtml(f || "root")}`;
    els.graphLegend.appendChild(item);
  }
}

// Legenda: Slunce (jadro) + planety s poctem mesicu. Barvy musi sedet s PALETTE v system3d.js.
function buildSystemLegend(sys) {
  const PAL = ["#5b9dff", "#38e0ff", "#7c5cff", "#2dd4ff", "#6ea8ff", "#9b8cff", "#22b8ff", "#4f6bff"];
  els.graphLegend.innerHTML = "";
  const sunItem = document.createElement("div");
  sunItem.className = "leg-item";
  sunItem.innerHTML = `<span class="leg-dot" style="background:#cfe6ff;color:#cfe6ff"></span>${escapeHtml(sys.sun.name)} <span style="opacity:.5">· jádro</span>`;
  els.graphLegend.appendChild(sunItem);
  sys.planets.forEach((p, i) => {
    const c = PAL[i % PAL.length];
    const item = document.createElement("div");
    item.className = "leg-item";
    item.innerHTML = `<span class="leg-dot" style="background:${c};color:${c}"></span>${escapeHtml(p.name)} <span style="opacity:.5">· ${p.moons.length}</span>`;
    els.graphLegend.appendChild(item);
  });
}

// --- Eventy ------------------------------------------------------------------

els.editor.addEventListener("input", () => { dirty = true; els.saveBtn.disabled = false; });
els.viewBtn.onclick = () => setMode("view");
els.editBtn.onclick = () => setMode("edit");
els.graphBtn.onclick = () => setMode("graph");
els.saveBtn.onclick = save;
els.newBtn.onclick = newNote;
document.querySelectorAll("#view-toggle button").forEach((b) => {
  b.onclick = () => setViewDim(b.dataset.dim);
});
document.querySelectorAll("#type-toggle button").forEach((b) => {
  b.onclick = () => setGraphType(b.dataset.type);
});

// odhlaseni
document.getElementById("logout-btn")?.addEventListener("click", async () => {
  try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
  location.reload();
});

// mobilni menu (vysouvaci sidebar)
const _sidebar = document.getElementById("sidebar");
const _backdrop = document.getElementById("sidebar-backdrop");
function toggleSidebar(open) {
  _sidebar?.classList.toggle("open", open);
  _backdrop?.classList.toggle("show", open);
}
document.getElementById("menu-btn")?.addEventListener("click", () => toggleSidebar(!_sidebar.classList.contains("open")));
_backdrop?.addEventListener("click", () => toggleSidebar(false));

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (!els.saveBtn.disabled) save(); }
  if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); newNote(); }
  if ((e.ctrlKey || e.metaKey) && e.key === "e") { e.preventDefault(); setMode(mode === "edit" ? "view" : "edit"); }
});

window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
window.addEventListener("resize", () => {
  if (mode !== "graph") return;
  const w = els.graphPane.clientWidth, h = els.graphPane.clientHeight;
  window.System3D?.resize?.(w, h);
  window.System2D?.resize?.(w, h);
  window.Network3D?.resize?.(w, h);
  window.Network2D?.resize?.(w, h);
});

// Az se 3D modul donacte a uzivatel ma zvolene 3D, prepni z docasneho 2D fallbacku.
const onModuleReady = () => { if (mode === "graph" && viewDim === "3d") renderGraph(); };
window.addEventListener("system3d-ready", onModuleReady);
window.addEventListener("network3d-ready", onModuleReady);

// --- Boot animace ------------------------------------------------------------

function runBoot() {
  const boot = document.getElementById("boot");
  if (!boot) return;
  const titleEl = document.getElementById("boot-title");
  const logEl = document.getElementById("boot-log");
  const fill = document.getElementById("boot-bar-fill");
  const title = "INITIALIZING SOCIYA NEURAL VAULT";
  const logs = [
    "> booting kernel",
    "> mounting vault",
    "> indexing nodes",
    "> establishing neural link",
    "> ready",
  ];

  let i = 0;
  const typeTitle = () => {
    titleEl.textContent = title.slice(0, i) + (i < title.length ? "▋" : "");
    i++;
    if (i <= title.length) setTimeout(typeTitle, 32);
    else { titleEl.textContent = title; setTimeout(() => showLogs(0), 140); }
  };
  const showLogs = (k) => {
    if (k < logs.length) {
      const line = document.createElement("div");
      line.className = "boot-line";
      line.textContent = logs[k];
      logEl.appendChild(line);
      if (fill) fill.style.width = Math.round(((k + 1) / logs.length) * 100) + "%";
      setTimeout(() => showLogs(k + 1), 150);
    } else {
      setTimeout(() => { boot.classList.add("done"); setTimeout(() => boot.remove(), 700); }, 380);
    }
  };
  typeTitle();
}
// --- Start (spousti se az po prihlaseni) -------------------------------------

function bootAndStart() { runBoot(); startApp(); }

async function startApp() {
  await loadNotes();
  const info = await api.info();
  els.vaultInfo.textContent = info.vaultRoot;
  if (notes.length) {
    const home = notes.find((n) => n.name.startsWith("MOC")) || notes[0];
    await openNote(home.path); // nacti kontext (titulek, backlinky) potichu
  }
  setMode("graph"); // prvni okno po startu = graf
  setupLiveReload(); // zive sledovani zmen vaultu (auto-reload + aktivni nody)
}

// --- Autentizace (login / prvni setup admina) --------------------------------

const authEls = {
  overlay: document.getElementById("auth-overlay"),
  form: document.getElementById("auth-form"),
  user: document.getElementById("auth-user"),
  pass: document.getElementById("auth-pass"),
  pass2: document.getElementById("auth-pass2"),
  err: document.getElementById("auth-err"),
  submit: document.getElementById("auth-submit"),
  sub: document.getElementById("auth-sub"),
};
let authMode = "login";

function showAuth(mode) {
  authMode = mode;
  authEls.overlay.style.display = "grid";
  authEls.err.textContent = "";
  authEls.pass2.style.display = mode === "setup" ? "" : "none";
  authEls.submit.textContent = mode === "setup" ? "vytvořit admina" : "přihlásit";
  authEls.sub.textContent = mode === "setup" ? "// první spuštění — vytvoř admin účet" : "// neural vault — přihlášení";
  authEls.pass.setAttribute("autocomplete", mode === "setup" ? "new-password" : "current-password");
  authEls.user.focus();
}
function hideAuth() { authEls.overlay.style.display = "none"; }

authEls.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  authEls.err.textContent = "";
  const username = authEls.user.value.trim();
  const password = authEls.pass.value;
  if (!username || !password) { authEls.err.textContent = "Vyplň jméno i heslo."; return; }
  if (authMode === "setup" && password !== authEls.pass2.value) { authEls.err.textContent = "Hesla se neshodují."; return; }
  authEls.submit.disabled = true;
  try {
    const r = await fetch(`/api/auth/${authMode}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await r.json();
    if (!r.ok) { authEls.err.textContent = data.error || "Chyba."; authEls.submit.disabled = false; return; }
    authEls.pass.value = ""; authEls.pass2.value = "";
    hideAuth();
    bootAndStart();
  } catch {
    authEls.err.textContent = "Server neodpovídá."; authEls.submit.disabled = false;
  }
});

async function checkAuthAndInit() {
  let status;
  try { status = await fetch("/api/auth/status").then((r) => r.json()); }
  catch { status = { needsSetup: false, authenticated: false }; }
  if (status.authenticated) { hideAuth(); bootAndStart(); }
  else showAuth(status.needsSetup ? "setup" : "login");
}
checkAuthAndInit();
