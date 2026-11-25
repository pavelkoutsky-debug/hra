// Žebříčky: tři měřítka na úroveň kampaně (nejlevnější most, nejlehčí most, únosnost na
// korunu), společné všem hráčům. Tady jsou tvary dat, meze a řazení, které sdílí hra i server;
// bez prohlížeče. Výsledek do žebříčku nezapisuje hra, ale server: most si sám přepočítá
// (`src/server/zebricek.ts`) a zapíše jen to, co mu vyšlo.

import type { NavrhMostu } from "./navrh";
import { DRUHY_VYZEV, zobrazenaHodnota, type DruhVyzvy } from "./vyzvy";

/**
 * Verze pravidel žebříčků. Zvyš ji, kdykoli se změní něco, co mění hodnoty nebo platnost už
 * zapsaných mostů a verze fyziky to nepozná: ceny a hmotnosti v katalogu, pravidla návrhu
 * (`zkontrolujNavrh`), co se počítá za „prošel bez porušení“, vzorec únosnosti na korunu.
 * Žebříčky i paměť ověřených mostů pak začnou od nuly. Na katalog pamatuje test
 * (`test/zebricek.test.ts` drží jeho otisk vedle téhle verze).
 */
export const VERZE_ZEBRICKU = 1;

/** Měřítka žebříčku jsou tatáž jako u výzev o efektivitu. */
export const MIRY_ZEBRICKU = DRUHY_VYZEV;
export type MiraZebricku = DruhVyzvy;

/** Nejdelší přezdívka ve znacích. */
export const NEJDELSI_PREZDIVKA = 16;
/** Kolik zápisů jednoho měřítka si server na úroveň pamatuje a kolik jich posílá hře. */
export const NEJVIC_ZAPISU = 200;
export const NEJVIC_RADKU = 20;

/** Co hra posílá, když chce most zapsat do žebříčku. */
export interface ZadostOZapis {
  uroven: string;
  /** Most v kódu ze sdílení (`zakodujMost`). */
  kod: string;
  /** Která zkouška se hlásí: běžná (cena a hmotnost), nebo do zlomu (únosnost na korunu). */
  zkouska: "bezna" | "zlom";
  /** Otisk výsledku té zkoušky u hráče a verze fyziky, kterou byl spočítán. */
  otisk: string;
  verze: number;
  /** Náhodné číslo hráče (32 šestnáctkových znaků): podle něj server pozná jeho starší zápis. */
  hrac: string;
  jmeno: string;
}

/** Řádek žebříčku, jak ho vidí všichni. */
export interface RadekZebricku {
  jmeno: string;
  /** Kč, kg nebo N/Kč (jako rekordy výzev). */
  hodnota: number;
  /** Den zápisu, RRRR-MM-DD. */
  kdy: string;
  /** Veřejná značka hráče: hra podle ní pozná vlastní řádek, číslo hráče z ní zjistit nejde. */
  znacka: string;
}

export interface MiraUrovne {
  radky: RadekZebricku[];
  /** Kolik hráčů v žebříčku je (i těch pod posledním poslaným řádkem). */
  hracu: number;
}

/** Žebříček jedné úrovně, jak ho server posílá hře. */
export interface ZebricekUrovne {
  uroven: string;
  verze: number;
  miry: Record<MiraZebricku, MiraUrovne>;
}

/** Kde hráč v měřítku stojí po zápisu. */
export interface MistoHrace {
  /** Pořadí od jedné; null, když v žebříčku řádek nemá (nevešel se, nebo jeho most už zapsal jiný). */
  poradi: number | null;
  /** Hodnota mostu, který hráč právě poslal, a jeho nejlepší zapsaná. */
  hodnota: number;
  nejlepsi: number;
  /** Tenhle most je jeho nový nejlepší zápis. */
  zlepseni: boolean;
  /** Úplně stejný most už v žebříčku zapsal dřív někdo jiný: řádek má jen ten první. */
  obsazeno?: boolean;
}

export interface OdpovedNaZapis {
  zebricek: ZebricekUrovne;
  moje: Partial<Record<MiraZebricku, MistoHrace>>;
}

/**
 * Proč server zápis odmítl. `verze`: hra v prohlížeči je starší než server (pomůže načíst
 * stránku). `otisk`: zkouška na serveru dopadla jinak než u hráče. `neprosel`: most na serveru
 * neprošel nebo se na něm něco porušilo. `pravidla`: most porušuje pravidla úrovně. `most`: kód
 * mostu nejde přečíst. `plno`: server dnes už ověřil tolik mostů, kolik smí; `adresa`: tolik,
 * kolik smí z jedné adresy. `nejdriv`: zápis ze zkoušky do zlomu přišel dřív než zápis z běžné
 * zkoušky téhož mostu. `soubeh`: žebříček se zrovna měnil a zápis se nepovedl (zkusit znovu).
 * `bez-adresy`: server nepozná, odkud zápis přichází, a bez toho stropy nehlídá. `prezdivka`:
 * přezdívka je na seznamu nevhodných výrazů (`src/server/prezdivky.ts`). `pocita` (odpověď 202)
 * není odmítnutí: server týž most právě ověřuje jinou žádostí a hra to má za chvíli zkusit znovu.
 */
export const KODY_ODMITNUTI = [
  "tvar",
  "uroven",
  "verze",
  "most",
  "pravidla",
  "otisk",
  "neprosel",
  "plno",
  "adresa",
  "nejdriv",
  "soubeh",
  "bez-adresy",
  "prezdivka",
  "pocita",
] as const;
export type KodOdmitnuti = (typeof KODY_ODMITNUTI)[number];

const ID_HRACE = /^[0-9a-f]{32}$/;
const OTISK = /^[0-9a-f]{16}$/;

export function jeIdHraceZebricku(text: unknown): text is string {
  return typeof text === "string" && ID_HRACE.test(text);
}

export function jeOtiskZkousky(text: unknown): text is string {
  return typeof text === "string" && OTISK.test(text);
}

/**
 * Přezdívka, jak se smí zapsat: písmena latinky (i s diakritikou), číslice, mezera, tečka,
 * pomlčka a podtržítko. Nejdřív se převede na základní tvar znaků (plné šířky, „matematická“
 * písmena a podobné ozdoby jsou pak obyčejná písmena), takže zmizí řídicí, neviditelné a výplňové
 * znaky i všechno, z čeho by šla složit značka nebo odkaz; písmena jiných abeced taky, jinak by
 * šlo vydávat se za jiného hráče znaky, které vypadají stejně. Mezery na krajích pryč, víc mezer
 * za sebou je jedna, nejvýš `NEJDELSI_PREZDIVKA` znaků. Null, když z textu nic nezbude.
 */
export function upravPrezdivku(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const cista = Array.from(text.normalize("NFKC"))
    .filter((znak) => /[\p{Script=Latin}0-9 ._-]/u.test(znak) && !/[\p{M}\p{Default_Ignorable_Code_Point}]/u.test(znak))
    .join("")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  const zkracena = Array.from(cista).slice(0, NEJDELSI_PREZDIVKA).join("").trim();
  return zkracena.length > 0 ? zkracena : null;
}

function fnv(text: string, zaklad: number, nasobitel: number): number {
  let h = zaklad;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), nasobitel);
  return h >>> 0;
}

/**
 * Veřejná značka hráče v žebříčku jedné úrovně: 16 šestnáctkových znaků z jeho čísla a id
 * úrovně. Číslo hráče má 128 bitů a značka 64, takže z ní číslo zjistit nejde; a kdo by trefil
 * jiné číslo se stejnou značkou, nic nezíská, protože server zápisy páruje podle celého čísla.
 * Úroveň je ve značce proto, aby podle ní nešlo spojit téhož hráče napříč úrovněmi.
 */
export function znackaHrace(hrac: string, uroven: string): string {
  const hex = (n: number): string => n.toString(16).padStart(8, "0");
  return hex(fnv(`a:${uroven}:${hrac}`, 0x811c9dc5, 0x01000193)) + hex(fnv(`b:${uroven}:${hrac}`, 0x9747b28c, 0x85ebca6b));
}

/**
 * Most zapsaný tak, aby dva zápisy téhož mostu vyšly stejně: styčníky podle místa, pruty podle
 * míst svých konců, všechno seřazené. Id ani pořadí kreslení v něm nejsou. Server podle toho
 * pozná, že most v žebříčku už je (jeden řádek na most, ne na jeho zápis).
 */
export function kanonMostu(navrh: NavrhMostu): string {
  const misto = new Map(navrh.stycniky.map((s) => [s.id, `${s.x};${s.y}`]));
  const stycniky = navrh.stycniky
    .map((s) => [`${s.x};${s.y}`, s.svar ? 1 : 0, s.zamek ? 1 : 0, s.zavazi ?? 0, s.tlumic ? `${s.tlumic.hmota}:${s.tlumic.frekvence}` : ""].join(","))
    .sort();
  const pruty = navrh.pruty
    .map((p) => {
      const a = misto.get(p.a) ?? "?";
      const b = misto.get(p.b) ?? "?";
      return [a < b ? a : b, a < b ? b : a, p.prvek, p.predpeti ?? "", p.tuhost ?? "", p.tlumeni ?? "", p.zdvih ?? ""].join(",");
    })
    .sort();
  return `${stycniky.join("|")}#${pruty.join("|")}`;
}

/** Je menší hodnota lepší? Cena a hmotnost ano, únosnost na korunu naopak. */
export function mensiVede(mira: MiraZebricku): boolean {
  return mira !== "zlom";
}

/**
 * Je hodnota `a` v žebříčku před hodnotou `b`? Porovnává se číslo, které hráč vidí
 * (`zobrazenaHodnota`): dva mosty se stejnou zobrazenou hodnotou jsou shoda a dřív zapsaný
 * zůstává vpředu.
 */
export function jeLepsi(mira: MiraZebricku, a: number, b: number): boolean {
  const za = zobrazenaHodnota(mira, a);
  const zb = zobrazenaHodnota(mira, b);
  return mensiVede(mira) ? za < zb : za > zb;
}

/** Seřadí zápisy měřítka: lepší hodnota vpředu, při shodě ten dřívější. Vrací nové pole. */
export function seradZapisy<T extends { hodnota: number; cas: number }>(mira: MiraZebricku, zapisy: readonly T[]): T[] {
  return [...zapisy].sort((x, y) => {
    if (jeLepsi(mira, x.hodnota, y.hodnota)) return -1;
    if (jeLepsi(mira, y.hodnota, x.hodnota)) return 1;
    return x.cas - y.cas;
  });
}

function jeRadek(h: unknown): h is RadekZebricku {
  if (typeof h !== "object" || h === null) return false;
  const r = h as Partial<RadekZebricku>;
  return (
    typeof r.jmeno === "string" &&
    r.jmeno.length <= NEJDELSI_PREZDIVKA * 2 &&
    typeof r.hodnota === "number" &&
    Number.isFinite(r.hodnota) &&
    r.hodnota > 0 &&
    typeof r.kdy === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.kdy) &&
    typeof r.znacka === "string" &&
    OTISK.test(r.znacka)
  );
}

/**
 * Přečte žebříček z odpovědi serveru; null, když nemá očekávaný tvar. Odpověď je cizí vstup:
 * řádky, které tvar nemají, se vynechají a jména se berou jen jako text.
 */
export function nactiZebricek(data: unknown): ZebricekUrovne | null {
  if (typeof data !== "object" || data === null) return null;
  const z = data as { uroven?: unknown; verze?: unknown; miry?: unknown };
  if (typeof z.uroven !== "string" || typeof z.verze !== "number" || typeof z.miry !== "object" || z.miry === null) return null;
  const miry = {} as Record<MiraZebricku, MiraUrovne>;
  for (const mira of MIRY_ZEBRICKU) {
    const m = (z.miry as Record<string, unknown>)[mira] as { radky?: unknown; hracu?: unknown } | undefined;
    const radky = Array.isArray(m?.radky) ? m.radky.filter(jeRadek).slice(0, NEJVIC_RADKU) : [];
    const hracu = typeof m?.hracu === "number" && Number.isFinite(m.hracu) && m.hracu >= radky.length ? Math.floor(m.hracu) : radky.length;
    miry[mira] = { radky, hracu };
  }
  return { uroven: z.uroven, verze: z.verze, miry };
}

function jeMisto(h: unknown): h is MistoHrace {
  if (typeof h !== "object" || h === null) return false;
  const m = h as Partial<MistoHrace>;
  return (
    (m.poradi === null || (typeof m.poradi === "number" && m.poradi >= 1)) &&
    typeof m.hodnota === "number" &&
    typeof m.nejlepsi === "number" &&
    typeof m.zlepseni === "boolean" &&
    (m.obsazeno === undefined || typeof m.obsazeno === "boolean")
  );
}

/** Přečte odpověď serveru na zápis; null, když nemá očekávaný tvar. */
export function nactiOdpovedNaZapis(data: unknown): OdpovedNaZapis | null {
  if (typeof data !== "object" || data === null) return null;
  const o = data as { zebricek?: unknown; moje?: unknown };
  const zebricek = nactiZebricek(o.zebricek);
  if (!zebricek || typeof o.moje !== "object" || o.moje === null) return null;
  const moje: Partial<Record<MiraZebricku, MistoHrace>> = {};
  for (const mira of MIRY_ZEBRICKU) {
    const m = (o.moje as Record<string, unknown>)[mira];
    if (jeMisto(m)) moje[mira] = m;
  }
  return { zebricek, moje };
}
