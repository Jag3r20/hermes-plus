# Hermes Plus

Tři nástroje pro práci s AI — spuštěné jedním příkazem přes Docker.  
Žádná instalace Pythonu, Node.js ani jiných závislostí. Stačí Docker.

---

## Co je uvnitř

| Nástroj | Popis | URL |
|---|---|---|
| **Hermes Dashboard** | Správa AI agenta — profily, paměť, nastavení | http://localhost:9119 |
| **Hermes WebUI** | Webové rozhraní pro chat s AI agentem | http://localhost:8787 |
| **Vault Editor** | Lokální editor poznámek propojený s AI (Obsidian-like) | http://localhost:3333 |

---

## Požadavky

- **Docker Desktop** — [stáhnout zde](https://www.docker.com/products/docker-desktop/)  
  *(Windows, macOS i Linux — funguje všude kde běží Docker)*

---

## Rychlý start

### 1. Stáhni repo

**Možnost A — bez gitu** (jednodušší):  
Na této stránce klikni **Code → Download ZIP** a složku rozbal.

**Možnost B — přes git**:
```bash
git clone https://github.com/Jag3r20/hermes-plus.git
```

### 2. Spusť Docker Desktop

Otevři aplikaci Docker Desktop a počkej, než naběhne (ikonka v liště přestane animovat).

### 3. Otevři terminál ve složce projektu

Ve Windows: klikni pravým tlačítkem do složky → **Otevřít v Terminálu**  
*(nebo PowerShell / příkazový řádek)*

### 4. Spusť všechno najednou

```bash
docker compose up -d
```

> **První spuštění trvá déle** (5–15 minut) — Docker stahuje a builduje obrazy.  
> Další spuštění jsou okamžitá.

### 5. Otevři v prohlížeči

| Co chceš otevřít | Adresa |
|---|---|
| Hermes Dashboard | http://localhost:9119 |
| Hermes WebUI | http://localhost:8787 |
| Vault Editor | http://localhost:3333 |

---

## Správa

### Zastavit (data zůstanou)
```bash
docker compose down
```

### Znovu spustit
```bash
docker compose up -d
```

### Zobrazit logy (co se děje uvnitř)
```bash
docker compose logs -f
```
*(ukončí se přes `Ctrl + C`)*

### Smazat vše a začít od nuly
```bash
docker compose down -v
```
> ⚠️ Toto smaže všechna uložená data (nastavení, poznámky, sessions).

---

## Jak funguje ukládání dat

Všechna data jsou uložená v izolovaných Docker volumes — **nesahají na tvé osobní soubory**.

| Volume | Co obsahuje |
|---|---|
| `hermes-data` | Nastavení a stav Hermes Agenta |
| `hermes-webui-data` | Sessions a konfigurace WebUI |
| `obsidian-vault` | Poznámky ve Vault Editoru |

Data přežijí `docker compose down` — smažou se pouze přes `docker compose down -v`.

---

## Řešení problémů

**`docker compose up` hlásí chybu s porty**  
Některý z portů (9119, 8787, 3333) je obsazený jiným programem. Zkontroluj co na něm běží nebo port v `docker-compose.yml` změň.

**Stránka se nenačte hned po spuštění**  
Kontejnery potřebují chvíli na start. Počkej 30–60 sekund a znovu obnov stránku.

**Docker Desktop není nainstalovaný / nespuštěný**  
Příkaz `docker compose up` vypíše chybu. Ujisti se, že Docker Desktop běží (ikonka v liště).

---

## Struktura projektu

```
hermes-plus/
├── docker-compose.yml      ← hlavní soubor, který spouští vše
├── hermes-webui/           ← zdrojový kód Hermes WebUI
└── obsidian-klon/          ← zdrojový kód Vault Editoru
```

Hermes Agent se nestahuje ze zdrojového kódu — používá oficiální Docker image  
[`nousresearch/hermes-agent`](https://hub.docker.com/r/nousresearch/hermes-agent).
