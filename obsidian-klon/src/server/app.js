// Lokalni webovy server pro editor vaultu.
// Servíruje frontend a poskytuje REST API nad jadrem vault.js.

import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { watch } from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  listNotes,
  readNote,
  writeNote,
  deleteNote,
  searchNotes,
  getBacklinks,
  buildGraph,
  buildSystem,
  getVaultRoot,
  ensureVault,
} from "../core/vault.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Maly helper, aby se async chyby poslaly jako JSON misto pádu serveru.
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });

// --- Autentizace (lokalni admin ucet) ---------------------------------------

const AUTH_FILE = path.join(projectRoot, "auth.json");
const sessions = new Map(); // token -> { user, expires }
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni

async function loadAuth() {
  try { return JSON.parse(await fs.readFile(AUTH_FILE, "utf8")); } catch { return null; }
}
function hashPw(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((c) => {
    const i = c.indexOf("=");
    if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function currentUser(req) {
  const token = parseCookies(req).sociya_session;
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expires < Date.now()) { sessions.delete(token); return null; }
  return s.user;
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `sociya_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`);
}

// Brana: vse pod /api krome /api/auth/* vyzaduje prihlaseni (kdyz uz admin existuje).
app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api/") || req.path.startsWith("/api/auth/")) return next();
  const auth = await loadAuth();
  if (!auth) return res.status(401).json({ error: "needs-setup" }); // jeste neni admin
  if (!currentUser(req)) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/api/auth/status", wrap(async (req, res) => {
  const auth = await loadAuth();
  res.json({ needsSetup: !auth, authenticated: !!currentUser(req), user: currentUser(req) });
}));

app.post("/api/auth/setup", wrap(async (req, res) => {
  if (await loadAuth()) return res.status(400).json({ error: "Admin uz existuje" });
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6)
    return res.status(400).json({ error: "Vyplň jméno a heslo (min. 6 znaků)" });
  const salt = crypto.randomBytes(16).toString("hex");
  await fs.writeFile(AUTH_FILE, JSON.stringify({ username, salt, hash: hashPw(password, salt) }, null, 2));
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { user: username, expires: Date.now() + SESSION_MS });
  setSessionCookie(res, token);
  res.json({ ok: true, user: username });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const auth = await loadAuth();
  if (!auth) return res.status(400).json({ error: "needs-setup" });
  const { username, password } = req.body || {};
  const a = Buffer.from(auth.hash, "hex");
  const b = Buffer.from(hashPw(password || "", auth.salt), "hex");
  const ok = username === auth.username && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: "Špatné jméno nebo heslo" });
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { user: username, expires: Date.now() + SESSION_MS });
  setSessionCookie(res, token);
  res.json({ ok: true, user: username });
}));

app.post("/api/auth/logout", (req, res) => {
  const token = parseCookies(req).sociya_session;
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "sociya_session=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/notes", wrap(async (req, res) => {
  res.json(await listNotes());
}));

app.get("/api/note", wrap(async (req, res) => {
  const { path: p } = req.query;
  if (!p) return res.status(400).json({ error: "Chybi parametr path" });
  const content = await readNote(p);
  res.json({ path: p, content });
}));

app.put("/api/note", wrap(async (req, res) => {
  const { path: p, content } = req.body;
  if (!p) return res.status(400).json({ error: "Chybi path" });
  const result = await writeNote(p, content ?? "");
  res.json(result);
}));

app.delete("/api/note", wrap(async (req, res) => {
  const { path: p } = req.query;
  if (!p) return res.status(400).json({ error: "Chybi parametr path" });
  res.json(await deleteNote(p));
}));

app.get("/api/search", wrap(async (req, res) => {
  res.json(await searchNotes(req.query.q || ""));
}));

app.get("/api/backlinks", wrap(async (req, res) => {
  const { path: p } = req.query;
  if (!p) return res.status(400).json({ error: "Chybi parametr path" });
  res.json(await getBacklinks(p));
}));

app.get("/api/graph", wrap(async (req, res) => {
  res.json(await buildGraph());
}));

app.get("/api/system", wrap(async (req, res) => {
  res.json(await buildSystem());
}));

app.get("/api/info", wrap(async (req, res) => {
  res.json({ vaultRoot: await getVaultRoot() });
}));

// --- Zive zmeny: SSE stream + sledovani vaultu -------------------------------

const sseClients = new Set();

app.get("/api/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders?.();
  res.write(": connected\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

function broadcast(evt) {
  const data = `data: ${JSON.stringify(evt)}\n\n`;
  for (const c of sseClients) { try { c.write(data); } catch {} }
}

// heartbeat (drzi spojeni nazivu)
setInterval(() => { for (const c of sseClients) { try { c.write(": ping\n\n"); } catch {} } }, 25000);

async function watchVault() {
  const root = await getVaultRoot();
  const pending = new Map(); // rel -> { timer, ev }
  try {
    watch(root, { recursive: true }, (ev, filename) => {
      if (!filename) return;
      const rel = filename.split(path.sep).join("/");
      if (!rel.toLowerCase().endsWith(".md")) return;
      if (rel.split("/").some((seg) => seg.startsWith("."))) return; // .obsidian, .git…
      const prev = pending.get(rel);
      if (prev) clearTimeout(prev.timer);
      const timer = setTimeout(async () => {
        pending.delete(rel);
        let exists = true;
        try { await fs.access(path.join(root, rel)); } catch { exists = false; }
        const kind = !exists ? "deleted" : ev === "rename" ? "created" : "modified";
        broadcast({ kind, path: rel, name: rel.replace(/\.md$/i, "").split("/").pop() });
      }, 250);
      pending.set(rel, { timer, ev });
    });
    console.log("  Sledovani zmen vaultu: aktivni (SSE /api/events)\n");
  } catch (e) {
    console.error("  Watcher se nepodarilo spustit:", e.message);
  }
}

async function loadPort() {
  try {
    const cfg = JSON.parse(await fs.readFile(path.join(projectRoot, "config.json"), "utf8"));
    return cfg.port || 3333;
  } catch {
    return 3333;
  }
}

await ensureVault(); // prvni spusteni: rozbal ukazkovy vault
const PORT = await loadPort();
app.listen(PORT, async () => {
  const root = await getVaultRoot();
  console.log(`\n  SOCIYA neural vault bezi na  http://localhost:${PORT}`);
  console.log(`  Vault:                       ${root}`);
  watchVault();
});
