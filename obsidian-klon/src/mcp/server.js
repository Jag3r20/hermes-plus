// MCP server pro SOCIYA neural vault. Dava Claudovi (Claude Desktop / Cowork / Code)
// nastroje na cteni, hledani, organizaci a psani poznamek. Komunikuje pres stdio.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  listNotes,
  listFolders,
  readNote,
  writeNote,
  appendToNote,
  insertUnderHeading,
  moveNote,
  deleteNote,
  searchNotes,
  findByTag,
  listTags,
  recentNotes,
  getNoteMeta,
  getBacklinks,
  getOutgoingLinks,
  buildSystem,
  getVaultRoot,
  ensureVault,
} from "../core/vault.js";

const INSTRUCTIONS = `Tento server zpristupnuje "SOCIYA neural vault" — lokalni znalostni bazi firmy SOCIYA (Obsidian-styl, slozka .md souboru).

STRUKTURA (filozofie "slunecni soustavy"):
- Slunce = slozka "Jádro" = jadrove info o firme (o spolecnosti, sluzby, brand, tym...).
- Planety = slozky nejvyssi urovne: jednotlivi klienti (napr. "JaraS SERVIS", "Grantpneu", "Uliffe"), "Marketing", "Dokumenty", "Poznámky", "Todo".
- Mesice = poznamky uvnitr planety.
Poznamky se propojuji [[wiki-odkazy]] (podle nazvu poznamky) a znackuji #tagy.

JAK PRACOVAT:
1) Zacni nastrojem get_structure (mapa cele soustavy) nebo list_folders (planety).
2) Pred upravou poznamky si ji precti (read_note) nebo zjisti metadata (get_note_meta: nadpisy, odkazy, backlinky, tagy).
3) Pro psani: create_note (nova/prepis), update_note (cely obsah), append_to_note (na konec), insert_under_heading (pod konkretni nadpis — nejlepsi pro cilene doplneni).
4) Organizace: move_note (presun mezi planetami / prejmenovani). Novou planetu vytvoris zalozenim poznamky s cestou "Nazev planety/poznamka.md".
Cesty jsou relativni k vaultu, pripona .md je volitelna. Pis cesky, v tonu brandu SOCIYA.`;

const server = new Server(
  { name: "sociya-neural-vault", version: "1.0.0" },
  { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
);

const str = { type: "string" };
const tools = [
  {
    name: "get_structure",
    description: "Mapa cele 'slunecni soustavy' vaultu: Slunce (jadrova slozka) + planety (slozky) + jejich mesice (poznamky). Idealni prvni krok pro orientaci.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_folders",
    description: "Slozky nejvyssi urovne (planety) s poctem poznamek; oznaci jadrovou slozku (Slunce).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_notes",
    description: "Vsechny poznamky ve vaultu (relativni cesty + nazvy).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "read_note",
    description: "Precte obsah poznamky podle relativni cesty (napr. 'Dokumenty/Faktury.md').",
    inputSchema: { type: "object", properties: { path: str }, required: ["path"] },
  },
  {
    name: "get_note_meta",
    description: "Metadata poznamky: nadpisy, #tagy, odchozi [[odkazy]], backlinky, pocet slov, datum upravy. Pouzij pred cilenou upravou.",
    inputSchema: { type: "object", properties: { path: str }, required: ["path"] },
  },
  {
    name: "search_notes",
    description: "Fulltextove vyhledavani napric poznamkami. Volitelne omezeni na slozku (planetu) pres 'folder'. Vraci nazvy + uryvky.",
    inputSchema: {
      type: "object",
      properties: { query: str, folder: { type: "string", description: "Volitelne: omezit na tuto slozku/planetu" } },
      required: ["query"],
    },
  },
  {
    name: "find_by_tag",
    description: "Najde poznamky obsahujici dany #tag.",
    inputSchema: { type: "object", properties: { tag: str }, required: ["tag"] },
  },
  {
    name: "list_tags",
    description: "Vsechny #tagy ve vaultu s poctem vyskytu.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "recent_notes",
    description: "Nedavno upravene poznamky (co se naposledy delalo). Volitelne 'limit'.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "get_backlinks",
    description: "Poznamky, ktere odkazuji ([[...]]) na danou poznamku.",
    inputSchema: { type: "object", properties: { path: str }, required: ["path"] },
  },
  {
    name: "get_links",
    description: "Odchozi [[odkazy]] z poznamky, rozresene na cesty (a oznaceni rozbitych odkazu).",
    inputSchema: { type: "object", properties: { path: str }, required: ["path"] },
  },
  {
    name: "create_note",
    description: "Vytvori novou poznamku (nebo prepise existujici). Pro novou planetu pouzij cestu 'Nazev planety/Poznamka.md'.",
    inputSchema: { type: "object", properties: { path: str, content: str }, required: ["path", "content"] },
  },
  {
    name: "update_note",
    description: "Prepise cely obsah existujici poznamky.",
    inputSchema: { type: "object", properties: { path: str, content: str }, required: ["path", "content"] },
  },
  {
    name: "append_to_note",
    description: "Pripoji text na konec poznamky (vytvori ji, pokud neexistuje).",
    inputSchema: { type: "object", properties: { path: str, content: str }, required: ["path", "content"] },
  },
  {
    name: "insert_under_heading",
    description: "Vlozi text na konec sekce daneho nadpisu (zbytek poznamky zustane). Nejlepsi pro cilene doplneni (napr. novy ukol pod '## Tento tyden').",
    inputSchema: { type: "object", properties: { path: str, heading: str, text: str }, required: ["path", "heading", "text"] },
  },
  {
    name: "move_note",
    description: "Presune nebo prejmenuje poznamku. Zmena slozky = presun mezi planetami. Napr. from 'Poznámky/Napad.md' to 'Marketing/Napad.md'.",
    inputSchema: { type: "object", properties: { from: str, to: str }, required: ["from", "to"] },
  },
  {
    name: "delete_note",
    description: "Smaze poznamku podle relativni cesty.",
    inputSchema: { type: "object", properties: { path: str }, required: ["path"] },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

function result(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  try {
    switch (name) {
      case "get_structure": return result(await buildSystem());
      case "list_folders": return result(await listFolders());
      case "list_notes": return result(await listNotes());
      case "read_note": return result(await readNote(a.path));
      case "get_note_meta": return result(await getNoteMeta(a.path));
      case "search_notes": return result(await searchNotes(a.query, { folder: a.folder || null }));
      case "find_by_tag": return result(await findByTag(a.tag));
      case "list_tags": return result(await listTags());
      case "recent_notes": return result(await recentNotes(a.limit || 15));
      case "get_backlinks": return result(await getBacklinks(a.path));
      case "get_links": return result(await getOutgoingLinks(a.path));
      case "create_note": return result(await writeNote(a.path, a.content));
      case "update_note": return result(await writeNote(a.path, a.content));
      case "append_to_note": return result(await appendToNote(a.path, a.content));
      case "insert_under_heading": return result(await insertUnderHeading(a.path, a.heading, a.text));
      case "move_note": return result(await moveNote(a.from, a.to));
      case "delete_note": return result(await deleteNote(a.path));
      default: throw new Error(`Neznamy nastroj: ${name}`);
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Chyba: ${err.message}` }], isError: true };
  }
});

await ensureVault(); // prvni spusteni: rozbal ukazkovy vault
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`SOCIYA neural vault MCP server bezi. Vault: ${await getVaultRoot()}`);
