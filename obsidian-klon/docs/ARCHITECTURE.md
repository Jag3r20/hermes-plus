# Architektura

## Přehled

SOCIYA neural vault má tři části, které sdílejí jedno **jádro** nad jedním vaultem:

```
            ┌──────────────────────────┐
            │  vault/  (.md soubory)    │
            └────────────┬─────────────┘
                         │
              ┌──────────▼───────────┐
              │  src/core/vault.js    │  jádro (čtení/zápis, hledání,
              │                       │  odkazy, graf, soustava, tagy)
              └─────┬───────────┬─────┘
                    │           │
        ┌───────────▼──┐    ┌───▼──────────────┐
        │ web server   │    │ MCP server       │
        │ src/server/  │    │ src/mcp/server.js│
        │ app.js       │    │ (stdio, Claude)  │
        └──────┬───────┘    └──────────────────┘
               │
        ┌──────▼─────────┐
        │ frontend       │  prohlížeč (UI, vizualizace, login)
        │ server/public/ │
        └────────────────┘
```

## Jádro — `src/core/vault.js`

Čistý modul nad filesystémem. Klíčové funkce:

- **Čtení/zápis:** `listNotes`, `readNote`, `writeNote`, `appendToNote`, `insertUnderHeading`, `moveNote`, `deleteNote`.
- **Hledání & metadata:** `searchNotes`, `getNoteMeta`, `getBacklinks`, `getOutgoingLinks`, `listTags`, `findByTag`, `recentNotes`, `listFolders`.
- **Vizualizace:** `buildGraph` (síť: uzly + hrany dle `[[odkazů]]`, váhy, stupně) a `buildSystem` (soustava: Slunce + planety + měsíce dle složek).
- **Bezpečnost:** `resolveInVault` brání úniku z vaultu (`../`).
- **Seed:** `ensureVault` při prvním spuštění rozbalí `vault-starter/`.

## Web server — `src/server/app.js`

Express. Poskytuje:

- **REST API:** `/api/notes`, `/api/note` (GET/PUT/DELETE), `/api/search`, `/api/backlinks`, `/api/graph`, `/api/system`, `/api/info`.
- **Auth:** `/api/auth/{status,setup,login,logout}`. Hesla scrypt+salt v `auth.json`, session cookie (httpOnly, in-memory store). Middleware chrání všechna `/api/*` kromě `/api/auth/*`.
- **Živé změny (SSE):** `/api/events` — `fs.watch` (rekurzivně) sleduje vault a posílá události `{ kind, path, name }`. Debounce 250 ms, heartbeat 25 s.

## Frontend — `src/server/public/`

Vanilla JS, bez build kroku.

- `app.js` — UI logika: seznam, editor, náhled, login overlay, mobilní menu, **dispatcher vizualizací** (registr `typ|dimenze`), **live-reload** (EventSource → obnova + `setActive`).
- Vizualizace (každá modul s jednotným API `ensure/data/resize/resume/pause/setClickHandler/setActive`):
  - `system3d.js` — three.js (vlastní scéna, OrbitControls, bloom, hvězdy).
  - `system2d.js` — canvas (pohled shora, pan/zoom).
  - `network3d.js` — `3d-force-graph` + bloom.
  - `network2d.js` — canvas (force-directed).
- `bg.js` — animované pozadí (flow-field).
- **3D moduly** se načítají jako ESM přes import-mapu (three z `esm.sh`); pokud selžou, dispatcher použije 2D fallback.

## MCP server — `src/mcp/server.js`

`@modelcontextprotocol/sdk`, stdio. Mapuje 17 nástrojů na funkce jádra a posílá `instructions` s popisem struktury. Viz [`MCP.md`](MCP.md).

## Datové „čočky"

Stejná data, dva pohledy:

| Pohled | Zdroj | Co zobrazuje |
|--------|-------|--------------|
| **Soustava** | `/api/system` (`buildSystem`) | hierarchii složek (Slunce/planety/měsíce) |
| **Síť** | `/api/graph` (`buildGraph`) | propojení přes `[[odkazy]]` |

Volby uživatele (`typ`, `dimenze`) se ukládají do `localStorage`.

## Toky dat

- **Čtení v UI:** prohlížeč → REST API → jádro → soubory.
- **Zápis Claudem:** Claude → MCP → jádro → soubory → `fs.watch` → SSE → prohlížeč se aktualizuje a rozsvítí uzel.
