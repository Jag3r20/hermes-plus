# Jak pracovat s tímto vaultem (pro AI)

Tohle je **SOCIYA neural vault** — znalostní báze. Pracuj s ní přes MCP server `sociya-neural-vault`.

## Struktura ("sluneční soustava")
- **Slunce = složka `Jádro`** — jádrové info (o projektu/firmě). Tady hledej kontext.
- **Planety = složky nejvyšší úrovně** — projekty, klienti, oblasti (`Poznámky`, `Todo`, ...).
- **Měsíce = poznámky** uvnitř planety.

## Doporučený postup
1. **Začni `get_structure`** (mapa soustavy) nebo `list_folders`.
2. **Před úpravou** poznámku přečti (`read_note`) nebo si zjisti metadata (`get_note_meta`).
3. **Piš cíleně:** `insert_under_heading`, `append_to_note`, `update_note`. Nová poznámka = `create_note` s cestou `Planeta/Název.md`.
4. **Organizuj:** `move_note` (přesun mezi planetami / přejmenování).

## Konvence
- **Propojuj** poznámky `[[wiki-odkazy]]` podle názvu.
- **Taguj** `#tag` (filtruj `find_by_tag`).
- **Úkoly** jako `- [ ] text`.
- Cesty relativní k vaultu, přípona `.md` volitelná.

Vše uložené uvidí uživatel živě ve webové aplikaci (graf/soustava se sám aktualizuje a zvýrazní právě upravený uzel).
