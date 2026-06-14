// Jadro pro praci s Obsidian vaultem.
// Vault je obycejna slozka s .md soubory. Tenhle modul je sdileny webem i MCP serverem.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

// --- Nacteni konfigurace -----------------------------------------------------

async function loadConfig() {
  const raw = await fs.readFile(path.join(projectRoot, "config.json"), "utf8");
  return JSON.parse(raw);
}

let _vaultRoot = null;

// Cesta ke koreni vaultu. Bere se z env VAULT_PATH, jinak z config.json.
export async function getVaultRoot() {
  if (_vaultRoot) return _vaultRoot;
  const envPath = process.env.VAULT_PATH;
  let vaultPath = envPath;
  if (!vaultPath) {
    const cfg = await loadConfig();
    vaultPath = cfg.vaultPath || "./vault";
  }
  _vaultRoot = path.isAbsolute(vaultPath)
    ? vaultPath
    : path.resolve(projectRoot, vaultPath);
  return _vaultRoot;
}

// Pri prvnim spusteni (prazdny/chybejici vault) rozbali ukazkovy vault-starter.
let _seedChecked = false;
export async function ensureVault() {
  if (_seedChecked) return;
  _seedChecked = true;
  const root = await getVaultRoot();
  try { if ((await listNotes()).length) return; } catch {}
  const starter = path.join(projectRoot, "vault-starter");
  try {
    await fs.access(starter);
    await fs.cp(starter, root, { recursive: true });
  } catch {
    await fs.mkdir(root, { recursive: true });
  }
}

// --- Bezpecnost cest ---------------------------------------------------------

// Zajisti, ze relativni cesta nevyleze z vaultu (zadne ../../ uniky).
function resolveInVault(root, relPath) {
  const normalized = path.normalize(relPath).replace(/^(\.\.[/\\])+/, "");
  const full = path.resolve(root, normalized);
  if (!full.startsWith(path.resolve(root))) {
    throw new Error(`Cesta mimo vault: ${relPath}`);
  }
  return full;
}

// --- Vypis poznamek ----------------------------------------------------------

const IGNORED_DIRS = new Set([".git", ".obsidian", "node_modules", ".trash"]);

// Rekurzivne projde vault a vrati vsechny .md soubory jako relativni cesty.
export async function listNotes() {
  const root = await getVaultRoot();
  const results = [];

  async function walk(dir, rel) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) continue;
      const relChild = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name), relChild);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        results.push({
          path: relChild,
          name: entry.name.replace(/\.md$/i, ""),
        });
      }
    }
  }

  await walk(root, "");
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

// --- Cteni a zapis -----------------------------------------------------------

export async function readNote(relPath) {
  const root = await getVaultRoot();
  const full = resolveInVault(root, ensureMd(relPath));
  return fs.readFile(full, "utf8");
}

export async function writeNote(relPath, content) {
  const root = await getVaultRoot();
  const full = resolveInVault(root, ensureMd(relPath));
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return { path: ensureMd(relPath) };
}

export async function appendToNote(relPath, content) {
  let existing = "";
  try {
    existing = await readNote(relPath);
  } catch {
    existing = "";
  }
  const sep = existing && !existing.endsWith("\n") ? "\n" : "";
  return writeNote(relPath, existing + sep + content);
}

export async function deleteNote(relPath) {
  const root = await getVaultRoot();
  const full = resolveInVault(root, ensureMd(relPath));
  await fs.unlink(full);
  return { deleted: ensureMd(relPath) };
}

function ensureMd(relPath) {
  return /\.md$/i.test(relPath) ? relPath : `${relPath}.md`;
}

// --- Vyhledavani -------------------------------------------------------------

// Fulltext napric poznamkami. Volitelne omezeni na slozku (planetu). Vraci kontext.
export async function searchNotes(query, { limit = 50, folder = null } = {}) {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase();
  let notes = await listNotes();
  if (folder) notes = notes.filter((n) => (n.path.split("/")[0] === folder) || (folder === "(root)" && !n.path.includes("/")));
  const hits = [];

  for (const note of notes) {
    let content;
    try {
      content = await readNote(note.path);
    } catch {
      continue;
    }
    const lower = content.toLowerCase();
    const idx = lower.indexOf(q);
    const nameMatch = note.name.toLowerCase().includes(q);
    if (idx === -1 && !nameMatch) continue;

    let snippet = "";
    if (idx !== -1) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + query.length + 60);
      snippet = (start > 0 ? "…" : "") + content.slice(start, end).replace(/\n/g, " ") +
        (end < content.length ? "…" : "");
    }
    hits.push({ path: note.path, name: note.name, snippet });
    if (hits.length >= limit) break;
  }
  return hits;
}

// --- Wiki-odkazy a backlinky -------------------------------------------------

// Vytahne vsechny [[odkazy]] z textu (vcetne [[odkaz|alias]] a [[odkaz#sekce]]).
export function extractLinks(content) {
  const links = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    let target = m[1].split("|")[0].split("#")[0].trim();
    if (target) links.push(target);
  }
  return links;
}

// Najde poznamky, ktere odkazuji na danou poznamku.
export async function getBacklinks(relPath) {
  const targetName = path.basename(ensureMd(relPath)).replace(/\.md$/i, "").toLowerCase();
  const notes = await listNotes();
  const backlinks = [];

  for (const note of notes) {
    if (note.path === ensureMd(relPath)) continue;
    let content;
    try {
      content = await readNote(note.path);
    } catch {
      continue;
    }
    const links = extractLinks(content).map((l) =>
      path.basename(l).toLowerCase()
    );
    if (links.includes(targetName)) {
      backlinks.push({ path: note.path, name: note.name });
    }
  }
  return backlinks;
}

// Sestavi graf vaultu: uzly (poznamky) a hrany (odkazy mezi nimi).
// Hrany se deduplikuji jako neorientovane dvojice s vahou (pocet odkazu),
// uzly dostanou stupen (degree) a slozku pro obarveni.
export async function buildGraph() {
  const notes = await listNotes();
  const byName = new Map();
  for (const n of notes) byName.set(n.name.toLowerCase(), n.path);

  const folderOf = (p) => (p.includes("/") ? p.split("/")[0] : "");
  const nodes = notes.map((n) => ({
    id: n.path,
    label: n.name,
    folder: folderOf(n.path),
    degree: 0,
  }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const edgeMap = new Map(); // klic "a||b" (serazeno) -> { source, target, weight }

  for (const note of notes) {
    let content;
    try {
      content = await readNote(note.path);
    } catch {
      continue;
    }
    for (const link of extractLinks(content)) {
      const targetPath = byName.get(path.basename(link).toLowerCase());
      if (!targetPath || targetPath === note.path) continue;
      const [a, b] = [note.path, targetPath].sort();
      const key = `${a}||${b}`;
      const existing = edgeMap.get(key);
      if (existing) existing.weight += 1;
      else edgeMap.set(key, { source: a, target: b, weight: 1 });
    }
  }

  const edges = [...edgeMap.values()];
  for (const e of edges) {
    if (nodeById.has(e.source)) nodeById.get(e.source).degree += 1;
    if (nodeById.has(e.target)) nodeById.get(e.target).degree += 1;
  }

  return { nodes, edges };
}

// Sestavi "slunecni soustavu": Slunce = jadrova slozka (info o firme),
// planety = ostatni slozky nejvyssi urovne, mesice = poznamky v nich.
export async function buildSystem() {
  const cfg = await loadConfig();
  const coreFolder = process.env.CORE_FOLDER || cfg.coreFolder || "Jádro";
  const companyName = cfg.companyName || "SOCIYA";
  const notes = await listNotes();

  const sun = { name: companyName, folder: coreFolder, moons: [] };
  const planetMap = new Map(); // folder -> { folder, name, moons: [] }

  for (const n of notes) {
    const top = n.path.includes("/") ? n.path.split("/")[0] : "";
    if (top === coreFolder) { sun.moons.push({ path: n.path, name: n.name }); continue; }
    const key = top || "Ostatní";
    if (!planetMap.has(key)) planetMap.set(key, { folder: key, name: key, moons: [] });
    planetMap.get(key).moons.push({ path: n.path, name: n.name });
  }

  // planety serazene podle poctu mesicu (nejvetsi nejblize? necham podle abecedy)
  const planets = [...planetMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { sun, planets };
}

// --- Dalsi nastroje pro praci (hlavne pro MCP / Clauda) ----------------------

// Slozky nejvyssi urovne (planety) s poctem poznamek; oznaci jadrovou slozku (Slunce).
export async function listFolders() {
  const cfg = await loadConfig();
  const core = process.env.CORE_FOLDER || cfg.coreFolder || "Jádro";
  const notes = await listNotes();
  const map = new Map();
  for (const n of notes) {
    const top = n.path.includes("/") ? n.path.split("/")[0] : "(root)";
    map.set(top, (map.get(top) || 0) + 1);
  }
  return [...map.entries()]
    .map(([folder, count]) => ({ folder, count, isCore: folder === core }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

// Presune / prejmenuje poznamku (zmena slozky = presun mezi planetami).
export async function moveNote(from, to) {
  const root = await getVaultRoot();
  const src = resolveInVault(root, ensureMd(from));
  const dst = resolveInVault(root, ensureMd(to));
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.rename(src, dst);
  return { from: ensureMd(from), to: ensureMd(to) };
}

// Vychozi (outgoing) [[odkazy]] z poznamky, rozresene na cesty existujicich poznamek.
export async function getOutgoingLinks(relPath) {
  const content = await readNote(relPath);
  const notes = await listNotes();
  const byName = new Map();
  for (const n of notes) byName.set(n.name.toLowerCase(), n.path);
  const out = [];
  const seen = new Set();
  for (const link of extractLinks(content)) {
    const base = path.basename(link).toLowerCase();
    if (seen.has(base)) continue;
    seen.add(base);
    const target = byName.get(base) || null;
    out.push({ text: link, path: target, exists: !!target });
  }
  return out;
}

// Vytahne #tagy z textu (ignoruje markdown nadpisy '# ').
export function extractTags(content) {
  const tags = new Set();
  const re = /(^|[\s(>])#([A-Za-z0-9_][A-Za-z0-9_/-]*)/g;
  let m;
  while ((m = re.exec(content)) !== null) tags.add(m[2]);
  return [...tags];
}

// Vsechny tagy ve vaultu s poctem vyskytu.
export async function listTags() {
  const notes = await listNotes();
  const counts = new Map();
  for (const n of notes) {
    let c;
    try { c = await readNote(n.path); } catch { continue; }
    for (const t of extractTags(c)) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}

// Poznamky obsahujici dany #tag.
export async function findByTag(tag) {
  const want = tag.replace(/^#/, "").toLowerCase();
  const notes = await listNotes();
  const hits = [];
  for (const n of notes) {
    let c;
    try { c = await readNote(n.path); } catch { continue; }
    if (extractTags(c).some((t) => t.toLowerCase() === want)) hits.push({ path: n.path, name: n.name });
  }
  return hits;
}

// Nedavno upravene poznamky (podle mtime).
export async function recentNotes(limit = 15) {
  const root = await getVaultRoot();
  const notes = await listNotes();
  const withTime = [];
  for (const n of notes) {
    try {
      const st = await fs.stat(path.join(root, n.path));
      withTime.push({ path: n.path, name: n.name, modified: st.mtime.toISOString(), _m: st.mtimeMs });
    } catch {}
  }
  withTime.sort((a, b) => b._m - a._m);
  return withTime.slice(0, limit).map(({ _m, ...r }) => r);
}

// Bohata metadata poznamky: nadpisy, tagy, odchozi odkazy, backlinky, pocet slov.
export async function getNoteMeta(relPath) {
  const content = await readNote(relPath);
  const root = await getVaultRoot();
  const full = resolveInVault(root, ensureMd(relPath));
  let modified = null;
  try { modified = (await fs.stat(full)).mtime.toISOString(); } catch {}
  const headings = [...content.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, text: m[2].trim() }));
  const links = await getOutgoingLinks(relPath);
  const backlinks = await getBacklinks(relPath);
  const tags = extractTags(content);
  const words = (content.match(/\S+/g) || []).length;
  const rel = ensureMd(relPath);
  return {
    path: rel,
    name: path.basename(rel).replace(/\.md$/i, ""),
    folder: rel.includes("/") ? rel.split("/")[0] : "",
    words, modified, headings, tags, links, backlinks,
  };
}

// Vlozi text na konec sekce daneho nadpisu (zachova zbytek poznamky).
export async function insertUnderHeading(relPath, heading, text) {
  const content = await readNote(relPath);
  const lines = content.split("\n");
  const hLower = heading.replace(/^#+\s*/, "").trim().toLowerCase();
  let idx = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (m && m[2].trim().toLowerCase() === hLower) { idx = i; level = m[1].length; break; }
  }
  if (idx === -1) throw new Error(`Nadpis nenalezen: ${heading}`);
  let end = lines.length;
  for (let j = idx + 1; j < lines.length; j++) {
    const m = lines[j].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) { end = j; break; }
  }
  lines.splice(end, 0, text);
  await writeNote(relPath, lines.join("\n"));
  return { path: ensureMd(relPath), insertedUnder: heading };
}
