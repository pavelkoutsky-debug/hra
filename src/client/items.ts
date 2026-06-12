/** Katalog ikon inventáře: mapuje volné názvy předmětů od GM na pixel art ikony. */

export interface ItemDef {
  id: string;
  /** Klíčová slova (bez diakritiky, lowercase) — stačí shoda jednoho. */
  keywords: string[];
}

const CATALOG: ItemDef[] = [
  { id: "modlitebni-kniha", keywords: ["modlitebni kniha", "modlitebni knizka", "siddur"] },
  { id: "rabinuv-dopis", keywords: ["doporucujici dopis", "rabinuv dopis", "dopis od rabina", "rabinovo doporuceni"] },
  { id: "svice", keywords: ["svice", "svicka", "kresadlo", "lucerna", "lampa"] },
  { id: "paklice", keywords: ["paklic", "vlasenka", "sperhak"] },
  { id: "nuz", keywords: ["nuz", "dyka", "cepel"] },
  { id: "lano", keywords: ["lano", "provaz"] },
  { id: "mesec", keywords: ["mesec", "grose", "grosu", "penize", "kop gros", "mince", "dukat", "tolar"] },
  { id: "prsten", keywords: ["prsten"] },
  { id: "seznam", keywords: ["seznam dluzniku", "seznam"] },
  { id: "sem", keywords: ["sem", "schrana se semem", "svaty svitek", "boz jmeno", "bozi jmeno"] },
  { id: "knoflik", keywords: ["knoflik"] },
  { id: "upis", keywords: ["upis", "dluzni"] },
  { id: "lahev", keywords: ["lahev", "vino", "flaska"] },
  { id: "dopis-pecet", keywords: ["dopis s pecet", "lobkowicz", "dopis s lobkowicz", "pecet hrabete"] },
  { id: "propustka", keywords: ["propustka", "dvorska pecet"] },
  { id: "klic-velky", keywords: ["klic od synagogy", "velky klic", "klice od synagogy"] },
  { id: "klic-maly", keywords: ["klic od skrinky", "maly klic", "klicek"] },
  { id: "spona", keywords: ["spona", "brose"] },
  { id: "glejt", keywords: ["glejt", "posel mistra"] },
  { id: "opisy", keywords: ["opis", "rukopis", "poznamky", "pergamen"] },
  { id: "ritual", keywords: ["hlina", "vltavska voda", "hrbitovni"] },
  // obecné záchytné kategorie (pořadí: specifické výše mají přednost)
  { id: "dopis-pecet", keywords: ["dopis", "list", "psani"] },
  { id: "klic-velky", keywords: ["klic"] },
];

const FALLBACK_ID = "ranec";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Vrátí cestu k ikoně pro daný (volný) název předmětu. */
export function itemIcon(name: string): string {
  const n = normalize(name);
  for (const item of CATALOG) {
    if (item.keywords.some((k) => n.includes(k))) return `/img/items/item-${item.id}.png`;
  }
  return `/img/items/item-${FALLBACK_ID}.png`;
}

