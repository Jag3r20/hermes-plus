# SOCIYA neural vault &nbsp;`v1.0`

Lokální **„druhý mozek"** — vault Markdown poznámek s JARVIS/sci-fi rozhraním a hlubokým napojením na **Clauda** přes MCP. Alternativa Obsidianu šitá přímo na práci s AI.

> Web běží jen u tebe na počítači, data jsou obyčejné `.md` soubory ve složce. Žádný cloud.

---

## ✨ Hlavní funkce

- **Editor vaultu** v prohlížeči — seznam poznámek po složkách, Markdown náhled, editor, `[[wiki-odkazy]]`, backlinky, fulltext hledání.
- **Vizualizace vaultu** ve dvou filozofiích, každá **2D i 3D**:
  - 🪐 **Soustava** — Slunce = jádro (`Jádro`), planety = složky, měsíce = poznámky.
  - 🧠 **Síť** — uzly = poznámky, hrany = `[[odkazy]]` (force-directed graf).
  - Bloom záře, hvězdné pozadí, mlhoviny, auto-rotace.
- **Živé změny** — co se ve vaultu změní (i přes Clauda/MCP), se hned projeví a **uzel se rozsvítí** jako „právě používaný".
- **MCP server (17 nástrojů)** — Claude umí vault číst, hledat, psát i organizovat; dostává i popis struktury.
- **Login** — admin účet (vytvoří se při prvním spuštění), chráněné API.
- **JARVIS UI** v SOCIYA modré, animované pozadí, boot sekvence, **plně responzivní** (mobil).

Dokumentace navíc: [`docs/MCP.md`](docs/MCP.md) (referenční seznam nástrojů) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (jak to funguje).

---

## 🚀 Rychlý start

### Požadavky
- **Node.js 18+** (vyvíjeno na Node 24)

### 1) Naklonuj a nainstaluj
```bash
git clone https://gitlab.sociya.cz/filip-marecek/sociya-neural-vault.git
cd sociya-neural-vault
npm install
```

### 2) Spusť web
```bash
npm run web
```
Otevři **http://localhost:3333**.

Při **prvním spuštění** se automaticky vytvoří ukázkový vault (z `vault-starter/`) a appka tě vyzve k **vytvoření admin účtu**. Po vytvoření se rovnou přihlásíš.

> Tip: na telefonu otevři `http://<IP-tvého-počítače>:3333` (musí být ve stejné Wi-Fi).

---

## ⚙️ Konfigurace — `config.json`

```json
{
  "vaultPath": "./vault",
  "port": 3333,
  "companyName": "SOCIYA",
  "coreFolder": "Jádro"
}
```

| Klíč | Význam |
|------|--------|
| `vaultPath` | Cesta ke složce vaultu (relativní k projektu, nebo absolutní). |
| `port` | Port webové appky. |
| `companyName` | Název ve středu soustavy (Slunce). |
| `coreFolder` | Která složka je „Slunce" (jádro). |

Cestu k vaultu lze přepsat i proměnnou prostředí `VAULT_PATH` (má přednost).

---

## 🔐 Přihlášení

- **První spuštění:** appka nemá žádný účet → ukáže obrazovku **„vytvoř admin účet"** (jméno + heslo, min. 6 znaků).
- **Další spuštění:** přihlašovací obrazovka.
- Heslo se ukládá **hashované** (scrypt + salt) do `auth.json` (mimo git). Session drží cookie (30 dní).
- Odhlášení: tlačítko `⏻` v patičce levého panelu.
- **Reset účtu:** smaž soubor `auth.json` a restartuj — při dalším spuštění se zase nabídne setup.

---

## 🤖 Napojení Clauda (MCP)

MCP server čte vault **přímo ze souborů**, takže funguje nezávisle na webovém loginu.

### Claude Desktop / Cowork
`%APPDATA%\Claude\claude_desktop_config.json` (Windows) / `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):
```json
{
  "mcpServers": {
    "sociya-neural-vault": {
      "command": "node",
      "args": ["ABSOLUTNÍ/CESTA/sociya-neural-vault/src/mcp/server.js"],
      "env": { "VAULT_PATH": "ABSOLUTNÍ/CESTA/sociya-neural-vault/vault" }
    }
  }
}
```
Restartuj Claude Desktop / Cowork.

### Claude Code (CLI)
```bash
claude mcp add sociya-neural-vault -- node ABSOLUTNÍ/CESTA/sociya-neural-vault/src/mcp/server.js
```

Plný seznam 17 nástrojů: **[`docs/MCP.md`](docs/MCP.md)**.

---

## 🪐 Filozofie struktury

Vault = složka `.md` souborů. Organizuje se jako **sluneční soustava**:

- ☀️ **Slunce** = složka `Jádro` (nastavitelné přes `coreFolder`) — klíčové info o tobě/firmě.
- 🪐 **Planety** = složky nejvyšší úrovně (projekty, klienti, oblasti, `Poznámky`, `Todo`…).
- 🌙 **Měsíce** = poznámky uvnitř planety.

Poznámky se propojují `[[wiki-odkazy]]` a značkují `#tagy`.

---

## 📁 Struktura projektu

```
sociya-neural-vault/
├─ src/
│  ├─ core/vault.js          jádro: čtení/zápis, hledání, odkazy, graf, soustava, tagy
│  ├─ server/
│  │  ├─ app.js              web server: REST API + auth + SSE watcher
│  │  └─ public/             frontend
│  │     ├─ index.html
│  │     ├─ style.css
│  │     ├─ app.js           UI logika, login, live-reload, dispatcher vizualizací
│  │     ├─ bg.js            animované pozadí
│  │     ├─ system3d.js      3D soustava (three.js)
│  │     ├─ system2d.js      2D soustava (canvas)
│  │     ├─ network3d.js     3D síť (3d-force-graph)
│  │     └─ network2d.js     2D síť (canvas)
│  └─ mcp/server.js          MCP server (stdio, 17 nástrojů)
├─ vault-starter/            ukázkový vault (rozbalí se při prvním spuštění)
├─ vault/                    tvůj vault (mimo git)
├─ config.json
├─ auth.json                 admin účet (mimo git, vznikne při setupu)
└─ docs/                     MCP.md, ARCHITECTURE.md
```

---

## 🛠️ Příkazy

| Příkaz | Co dělá |
|--------|---------|
| `npm run web` | Spustí webovou appku (port z `config.json`). |
| `npm run mcp` | Spustí MCP server na stdio (běžně ho spouští Claude sám). |

---

## ❓ Řešení potíží

- **3D vizualizace se nenačte** → potřebuje WebGL a stažení knihoven z CDN (internet). Bez nich appka automaticky spadne na 2D.
- **Zapomenuté heslo** → smaž `auth.json`, restartuj, vytvoř účet znovu.
- **Claude nevidí vault** → zkontroluj absolutní cestu v MCP configu a že běží `node` (v PATH).
- **Port obsazený** → změň `port` v `config.json`.

---

## 📄 Licence

Interní nástroj SOCIYA. © SOCIYA.
