# MCP nástroje — referenční seznam

MCP server `sociya-neural-vault` (`src/mcp/server.js`) komunikuje přes **stdio** a dává Claudovi 17 nástrojů nad vaultem. Při připojení posílá i **popis struktury** (`instructions`) — Claude tak rovnou ví, že Slunce = `Jádro`, planety = složky, měsíce = poznámky.

Všechny cesty jsou **relativní k vaultu**, přípona `.md` je volitelná.

## Orientace

| Nástroj | Parametry | Vrací |
|---------|-----------|-------|
| `get_structure` | — | Mapa soustavy: `{ sun, planets[] }` (Slunce + planety + jejich měsíce). Ideální první krok. |
| `list_folders` | — | Složky (planety) s počtem poznámek; označí jádrovou (Slunce). |
| `list_notes` | — | Všechny poznámky (`path`, `name`). |
| `recent_notes` | `limit?` | Nedávno upravené poznámky (na čem se naposled dělalo). |

## Čtení

| Nástroj | Parametry | Vrací |
|---------|-----------|-------|
| `read_note` | `path` | Obsah poznámky. |
| `get_note_meta` | `path` | Metadata: nadpisy, `#tagy`, odchozí `[[odkazy]]` (rozřešené), backlinky, počet slov, datum úpravy. |
| `get_backlinks` | `path` | Poznámky odkazující na danou. |
| `get_links` | `path` | Odchozí odkazy (s označením rozbitých). |

## Hledání

| Nástroj | Parametry | Vrací |
|---------|-----------|-------|
| `search_notes` | `query`, `folder?` | Fulltext (volitelně omezený na složku) + úryvky. |
| `find_by_tag` | `tag` | Poznámky s daným `#tagem`. |
| `list_tags` | — | Všechny tagy s počtem výskytů. |

## Psaní

| Nástroj | Parametry | Co dělá |
|---------|-----------|---------|
| `create_note` | `path`, `content` | Vytvoří (nebo přepíše) poznámku. Nová planeta = cesta `Planeta/Název.md`. |
| `update_note` | `path`, `content` | Přepíše celý obsah. |
| `append_to_note` | `path`, `content` | Připojí text na konec (vytvoří, pokud chybí). |
| `insert_under_heading` | `path`, `heading`, `text` | Vloží text na konec sekce daného nadpisu (cílené doplnění). |

## Organizace

| Nástroj | Parametry | Co dělá |
|---------|-----------|---------|
| `move_note` | `from`, `to` | Přesune/přejmenuje poznámku (změna složky = přesun mezi planetami). |
| `delete_note` | `path` | Smaže poznámku. |

## Doporučený postup pro AI

1. `get_structure` nebo `list_folders` — orientace.
2. `read_note` / `get_note_meta` před úpravou.
3. Psaní cíleně: `insert_under_heading` > `append_to_note` > `update_note`.
4. Organizace přes `move_note`.

Konvence: propojuj `[[odkazy]]`, znač `#tagy`, úkoly jako `- [ ]`. Píše se česky.

> Vše, co Claude uloží, vidí uživatel **živě** ve webové aplikaci — graf/soustava se aktualizuje a upravený uzel se rozsvítí.
