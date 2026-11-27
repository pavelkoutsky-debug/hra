// Obsluha žádostí serveru: příjem deníku hraní a zpětné vazby od hry a správa pro zadavatele.
// Pracuje se standardními objekty Request a Response a s úložištěm za rozhraním
// `SkladZaznamu`, takže stejný kód běží ve funkcích Netlify i v testech v Node.
//
// Veřejné adresy (posílá na ně hra):
//   POST /api/denik   dávka událostí deníku            → 204
//   POST /api/vazba   zpětná vazba hráče               → 201 { id }
// Správa (hlavička Authorization: Bearer <heslo správce>); co se chce, říká parametr `co`:
//   GET  /api/sprava?co=overeni               jen ověří heslo
//   GET  /api/sprava?co=vazby[&pred=číslo]    seznam zpětných vazeb od nejnovější, po stránkách
//   GET  /api/sprava?co=vazba&id=…            jedna zpětná vazba celá
//   POST /api/sprava?co=vazba                 { id, stav?, poznamka? } změní stav řešení
//   GET  /api/sprava?co=dny                   dny, ze kterých je deník
//   GET  /api/sprava?co=den&den=RRRR-MM-DD    sezení toho dne
//   GET  /api/sprava?co=sezeni&den=…&hrac=…&slozka=…   události jednoho sezení (slozka = začátek-číslo)
//   GET  /api/sprava?co=souhrn&den=…          souhrn dne po úrovních
//   GET  /api/sprava?co=souhrn&od=…&do=…      souhrn za období (dny včetně krajních)
//   GET  /api/sprava?co=export&den=…&preskocit=N   dávky dne tak, jak přišly, po částech
//   POST /api/sprava?co=smazat                { vazba: id } smaže zpětnou vazbu,
//                                             { den } smaže deník toho dne
// (smazání všeho od jednoho hráče a úklid starých dat jsou v `uklid.ts`)
//
// Stropy: deník přijme od jedné skupiny adres nejvýš `NEJVIC_DAVEK_NA_ADRESU` dávek za den a
// zpětná vazba nejvýš `NEJVIC_VAZEB_NA_ADRESU` zpráv (počítadla pod otiskem adresy, `adresa.ts`);
// zpráv dohromady nejvýš `NEJVIC_VAZEB_DENNE`.
//
// Dávky deníku leží pod klíči `denik/<den>/<čas příjmu>-<hráč>-<začátek sezení>-<sezení>-
// <pořadí>-<náhoda>.json`. Čas příjmu je vpředu schválně: nové dávky tak přibývají vždy na
// konec abecedního pořadí klíčů a co už je spočítané, se nemusí číst znovu.
//
// Souhrn se počítá z „výtahů“ dnů (viz `denik/souhrn.ts`). Výtah dne je uložený pod klíčem
// `vytah/<den>.json` i s klíčem poslední započtené dávky; další žádost přečte jen dávky za
// ním. Platí to i pro dnešek. Po půlnoci server ověří, že před poslední započtenou dávkou
// žádná nepřibyla (dávka, která se při ukládání opozdila, mohla zapadnout před už započtené):
// když počty sedí, jen dočte zbytek dne, jinak den spočítá znovu od začátku. Pak se už jen čte.
// Dávky se čtou po částech a po každé se postup uloží; žádost jich přečte tolik, kolik stihne
// za `CAS_NA_SOUHRN`, a co nestihne, dočte další žádost.

import { ChybaDat } from "../data/kontrola";
import {
  jeVytah,
  prazdnyVytah,
  slucVytahy,
  souhrnZVytahu,
  vytahDeniku,
  type SouhrnDeniku,
  type VytahDeniku,
} from "../denik/souhrn";
import {
  nactiDavku,
  nactiVazbu,
  STAVY_VAZBY,
  type DavkaDeniku,
  type EvidovanaVazba,
  type StavVazby,
  type UdalostDeniku,
} from "../denik/udalosti";
import { adresaZadosti, zapocitejAdresu, type PametSoli } from "./adresa";
import type { SkladZaznamu } from "./sklad";

/** Největší tělo žádosti v bajtech: dávka deníku a zpětná vazba s přiloženým mostem. */
export const NEJVETSI_DAVKA = 96 * 1024;
export const NEJVETSI_VAZBA = 400 * 1024;
/**
 * Po kolika dávkách deníku správa pracuje: tolik jich na jednu žádost smaže nebo přečte pro
 * seznam sezení a po tolika si souhrn ukládá, kam došel. Každá dávka je jedno čtení z úložiště
 * a funkce má na odpověď omezený čas; den s víc dávkami se dopočítá po částech.
 */
export const NEJVIC_DAVEK_NAJEDNOU = 400;
/**
 * Jak dlouho smí jedna žádost dopočítávat souhrn, ms. Po uplynutí se už nezačne další část
 * (`NEJVIC_DAVEK_NAJEDNOU` dávek); tolik dávek ale žádost přečte vždycky, i kdyby úložiště
 * odpovídalo pomalu, aby opakování někam vedlo. Brána Netlify čeká na odpověď 30 s: čas na
 * souhrn a jedna rozečtená část se do nich musí vejít i s tím, co žádost dělá okolo (úklid,
 * zprávy hráčů, žebříčky).
 */
export const CAS_NA_SOUHRN = 15_000;
/** Nejvíc dávek v jedné části vývozu: odpověď funkce smí mít jen pár megabajtů. */
export const NEJVIC_DAVEK_VE_VYVOZU = 200;
/** Nejvíc zpětných vazeb přijatých za jeden den; další server odmítne (pojistka úložiště). */
export const NEJVIC_VAZEB_DENNE = 300;
/**
 * Nejvíc zpětných vazeb za den z jedné skupiny adres: jeden člověk tak nezavře zpětnou vazbu
 * všem ostatním. Žádosti, u kterých se adresa nepozná, hlídá jen společný strop.
 */
export const NEJVIC_VAZEB_NA_ADRESU = 20;
/**
 * Nejvíc dávek deníku za den z jedné skupiny adres. Hráč pošle dávku nejvýš jednou za dvacet
 * sekund (celý den hraní je přes 4 000 dávek) a za jednou adresou může hrát celá školní třída.
 * Žádosti bez poznané adresy sdílejí jedno počitadlo se stejným stropem: deník musí běžet dál,
 * i kdyby hlavička s adresou nechodila.
 */
export const NEJVIC_DAVEK_NA_ADRESU = 5000;
/** Nejkratší heslo správce: je to jediná ochrana zpráv hráčů a jejich e-mailů. */
export const NEJKRATSI_HESLO_SPRAVCE = 16;
/** Jak dlouho po půlnoci (UTC) se den ještě nepokládá za uzavřený, ms: dávka z 23:59 se může opozdit. */
const ODKLAD_UZAVERKY = 10 * 60 * 1000;
/**
 * Jak stará musí dnešní dávka být, aby se započetla do uloženého výtahu dne, ms. Úložiště
 * zápis při potížích opakuje i několik sekund, takže mladší dávka se ještě může zařadit před jinou.
 */
const USAZENI = 60 * 1000;
/** Nejvíc zpětných vazeb na jedné stránce seznamu. */
export const NEJVIC_VAZEB_V_SEZNAMU = 200;
/** Kolik záznamů se z úložiště čte souběžně. */
const SOUBEZNE = 16;

export interface ProstrediServeru {
  sklad: SkladZaznamu;
  /** Aktuální čas. */
  ted: () => Date;
  /** Náhodný šestnáctkový dovětek do čísla zpětné vazby. */
  nahoda: () => string;
  /** Odkud žádosti přicházejí: „production“, „deploy-preview“, „dev“… */
  prostredi: string;
  /** Heslo správce; null, dokud ho zadavatel v Netlify nenastavil. */
  hesloSpravce: string | null;
  /**
   * Heslo jen pro denní rozbor (viz `sprava.ts`): smí číst podklady a rozbory a rozbor uložit,
   * nic jiného. Null nebo nenastavené: rozbor jde ukládat jen s heslem správce.
   */
  hesloRozboru?: string | null;
  /**
   * Adresa, ze které žádost přišla (místní server, testy). Bez ní se adresa bere jen z hlavičky
   * `x-nf-client-connection-ip`, kterou přidává Netlify (viz `adresa.ts`).
   */
  adresa?: (zadost: Request) => string | null;
  /** Soli dnů v paměti instance funkce (viz `adresa.ts`); bez ní se drží u objektu úložiště. */
  pametSoli?: PametSoli;
  /** Kolik času smí žádost dopočítávat souhrn, ms; bez něj `CAS_NA_SOUHRN` (testy si ho zkracují). */
  casNaSouhrn?: number;
  /** Hodiny, kterými se ten čas měří, ms; bez nich skutečné (`ted` v testech stojí). */
  hodiny?: () => number;
}

/**
 * Kolik práce na souhrnu žádost ještě smí udělat. Jeden rozpočet smí sdílet víc souhrnů téže
 * žádosti (podklady rozboru počítají den a týden).
 */
export interface RozpocetSouhrnu {
  /** Čas hodin, po kterém se nezačíná další část. */
  konec: number;
  /** Kolik dávek žádost ještě přečte, i když čas vypršel. */
  jiste: number;
  hodiny: () => number;
}

export function rozpocetSouhrnu(p: ProstrediServeru): RozpocetSouhrnu {
  const hodiny = p.hodiny ?? (() => Date.now());
  return { konec: hodiny() + (p.casNaSouhrn ?? CAS_NA_SOUHRN), jiste: NEJVIC_DAVEK_NAJEDNOU, hodiny };
}

/** Kolik dávek smí žádost přečíst v další části; nula, když už žádnou. */
const dalsiCast = (r: RozpocetSouhrnu): number => (r.hodiny() < r.konec ? NEJVIC_DAVEK_NAJEDNOU : r.jiste);

/** Zpětná vazba v seznamu: bez přiloženého mostu a událostí, s textem zkráceným na ukázku. */
export interface PolozkaSeznamuVazeb {
  id: string;
  prijato: string;
  prostredi: string;
  stav: StavVazby;
  druh: string;
  uroven: string | null;
  hodnoceni: number | null;
  ukazka: string;
  maNavrh: boolean;
  maKontakt: boolean;
}

export interface SezeniDne {
  hrac: string;
  sezeni: string;
  /** Označení sezení v dotazu na jeho události: začátek sezení a jeho číslo. */
  slozka: string;
  /** Kdy sezení začalo podle hodin hráče, ms. */
  zacatek: number;
  davek: number;
  /** Kdy ten den přišla první a poslední dávka sezení podle hodin serveru, ms. */
  prvni: number;
  posledni: number;
}

/** Odpověď na souhrn dne nebo období. */
export interface OdpovedSouhrnu {
  od: string;
  do: string;
  /** Dny období, ze kterých nějaký deník je. */
  dny: string[];
  souhrn: SouhrnDeniku;
  /** Kolik dávek deníku je v souhrnu započteno. */
  davek: number;
  /**
   * Souhrn není celý: dny v `nedokonceno` mají víc dávek, než se stihlo přečíst na jednu
   * žádost. Server si pamatuje, kam došel, takže opakováním žádosti se dopočítají.
   */
  neuplne: boolean;
  nedokonceno: string[];
}

/** Výtah dne uložený na serveru. */
interface UlozenyVytah {
  vytah: VytahDeniku;
  /** Kolik dávek dne je ve výtahu započteno a klíč poslední z nich (null = žádná). */
  zpracovano: number;
  posledni: string | null;
  /** Jsou započtené všechny dávky, které den měl, když se výtah naposledy počítal? */
  hotovo: boolean;
  /**
   * Výtah vznikal, dokud do dne ještě přibývaly dávky. Po uzávěrce dne se na něj naváže, jen
   * když před jeho poslední dávkou žádná nepřibyla ani neubyla; jinak se den spočítá znovu.
   */
  otevreny: boolean;
}

function jeUlozenyVytah(h: unknown): h is UlozenyVytah {
  if (typeof h !== "object" || h === null) return false;
  const u = h as Partial<UlozenyVytah>;
  return (
    typeof u.zpracovano === "number" &&
    u.zpracovano >= 0 &&
    (u.posledni === null || typeof u.posledni === "string") &&
    typeof u.hotovo === "boolean" &&
    typeof u.otevreny === "boolean" &&
    jeVytah(u.vytah)
  );
}

export function odpoved(stav: number, telo?: unknown): Response {
  if (telo === undefined) return new Response(null, { status: stav });
  return new Response(JSON.stringify(telo), {
    status: stav,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const chyba = (stav: number, zprava: string): Response => odpoved(stav, { chyba: zprava });

/**
 * Přišla žádost ze stránky téhož webu? Prohlížeč posílá s každým POST hlavičku Origin; cizí
 * stránka v ní má cizí adresu a žádost bez ní prohlížeč hry neposlal. Není to ochrana před
 * někým, kdo si hlavičku napíše sám (tu žádná veřejná adresa nemá), jen před cizími weby a
 * nahodilými roboty. Adresa webu se bere z žádosti i z hlaviček, které přidává Netlify.
 */
export function zCizihoWebu(zadost: Request): boolean {
  const puvod = zadost.headers.get("origin");
  if (puvod === null) return true;
  let host: string;
  try {
    host = new URL(puvod).host;
  } catch {
    return true;
  }
  const nase = [zadost.headers.get("x-forwarded-host"), zadost.headers.get("host")];
  try {
    nase.push(new URL(zadost.url).host);
  } catch {
    // Adresa žádosti bez hostitele: zbývají hlavičky.
  }
  return !nase.some((h) => h !== null && h.split(",")[0]!.trim() === host);
}

/** Přečte tělo žádosti jako JSON; vrací odpověď s chybou, když je moc velké nebo to JSON není. */
export async function teloJson(zadost: Request, nejvic: number): Promise<{ data: unknown } | Response> {
  const delka = Number(zadost.headers.get("content-length") ?? "0");
  if (delka > nejvic) return chyba(413, "žádost je příliš velká");
  const zapis = await zadost.text();
  // Délka v bajtech: znak UTF-16 zabere v UTF-8 nejvýš tři bajty, přesně to spočítá kodér.
  if (zapis.length > nejvic || new TextEncoder().encode(zapis).length > nejvic) return chyba(413, "žádost je příliš velká");
  try {
    return { data: JSON.parse(zapis) as unknown };
  } catch {
    return chyba(400, "tělo žádosti není platný JSON");
  }
}

export function denZ(cas: Date): string {
  return cas.toISOString().slice(0, 10);
}

export const DEN = /^\d{4}-\d{2}-\d{2}$/;
export const ID_HRACE = /^[0-9a-f]{8,32}$/;
const ID_VAZBY = /^\d{8}T\d{6}-[0-9a-f]{4,12}$/;
const SLOZKA_SEZENI = /^\d{13,15}-[0-9a-f]{8,32}$/;
/** Jméno dávky deníku v úložišti: čas příjmu, hráč, začátek sezení, sezení, pořadí, náhoda. */
const JMENO_DAVKY = /^(\d{13})-([0-9a-f]{8,32})-(\d{13,15})-([0-9a-f]{8,32})-(\d{5,})-[0-9a-f]+\.json$/;

/** Co o dávce říká její klíč; null u klíče, který dávce deníku nepatří. */
export function zKliceDavky(klic: string): { prijato: number; hrac: string; slozka: string; zacatek: number; sezeni: string; poradi: number } | null {
  const shoda = JMENO_DAVKY.exec(klic.slice(klic.lastIndexOf("/") + 1));
  if (!shoda) return null;
  return {
    prijato: Number(shoda[1]),
    hrac: shoda[2]!,
    slozka: `${shoda[3]}-${shoda[4]}`,
    zacatek: Number(shoda[3]),
    sezeni: shoda[4]!,
    poradi: Number(shoda[5]),
  };
}

/** Zpětná vazba tak, jak je v seznamu (malý záznam vedle celé zprávy, ať se seznam čte rychle). */
function polozkaSeznamu(v: EvidovanaVazba): PolozkaSeznamuVazeb {
  return {
    id: v.id,
    prijato: v.prijato,
    prostredi: v.prostredi,
    stav: v.stav,
    druh: v.druh,
    uroven: v.uroven ?? null,
    hodnoceni: v.hodnoceni ?? null,
    ukazka: v.text.length > 240 ? `${v.text.slice(0, 240)}…` : v.text,
    maNavrh: v.navrh !== undefined,
    maKontakt: v.kontakt !== undefined,
  };
}

function jePolozkaSeznamu(h: unknown): h is PolozkaSeznamuVazeb {
  if (typeof h !== "object" || h === null) return false;
  const p = h as Partial<PolozkaSeznamuVazeb>;
  return typeof p.id === "string" && typeof p.prijato === "string" && typeof p.stav === "string" && typeof p.ukazka === "string";
}

/** Příjem dávky deníku hraní. */
export async function prijmiDenik(zadost: Request, p: ProstrediServeru): Promise<Response> {
  if (zadost.method !== "POST") return chyba(405, "sem se posílá jen metodou POST");
  if (zCizihoWebu(zadost)) return chyba(403, "žádost z cizí stránky");
  const telo = await teloJson(zadost, NEJVETSI_DAVKA);
  if (telo instanceof Response) return telo;
  let davka: DavkaDeniku;
  try {
    davka = nactiDavku(telo.data);
  } catch (e) {
    return chyba(400, e instanceof ChybaDat ? e.message : "dávka nemá očekávaný tvar");
  }
  const cas = p.ted();
  // Strop dávek na skupinu adres a den. Když se počítadlo pořád měnilo, dávka se přijme:
  // deník se kvůli počitadlu ztrácet nemá.
  if ((await zapocitejAdresu(p, "denik", adresaZadosti(zadost, p), denZ(cas), NEJVIC_DAVEK_NA_ADRESU)) === "plno") {
    return chyba(429, "z tohoto připojení dnes přišlo příliš mnoho záznamů hraní");
  }
  const { hrac, sezeni, zacatek } = davka.hlavicka;
  // Klíč začíná časem příjmu, takže dávky dne jdou v úložišti za sebou tak, jak přišly, a nové
  // přibývají na konec. Náhodný dovětek brání přepsání: dvě stránky téhož sezení (zdvojený
  // panel prohlížeče) můžou poslat dávku se stejným číslem ve stejné milisekundě.
  const jmeno = [
    String(cas.getTime()).padStart(13, "0"),
    hrac,
    String(zacatek).padStart(13, "0"),
    sezeni,
    String(davka.poradi).padStart(5, "0"),
    p.nahoda(),
  ].join("-");
  await p.sklad.zapis(`denik/${denZ(cas)}/${jmeno}.json`, { prijato: cas.toISOString(), prostredi: p.prostredi, ...davka });
  return odpoved(204);
}

/** Příjem zpětné vazby hráče. */
export async function prijmiVazbu(zadost: Request, p: ProstrediServeru): Promise<Response> {
  if (zadost.method !== "POST") return chyba(405, "sem se posílá jen metodou POST");
  if (zCizihoWebu(zadost)) return chyba(403, "žádost z cizí stránky");
  const telo = await teloJson(zadost, NEJVETSI_VAZBA);
  if (telo instanceof Response) return telo;
  // Past na roboty: pole, které ve formuláři není vidět a člověk ho nevyplní.
  if (typeof telo.data === "object" && telo.data !== null && "web" in telo.data) {
    const { web, ...zbytek } = telo.data as Record<string, unknown>;
    if (typeof web === "string" && web.length > 0) return odpoved(201, { id: "" });
    telo.data = zbytek;
  }
  let vazba;
  try {
    vazba = nactiVazbu(telo.data);
  } catch (e) {
    return chyba(400, e instanceof ChybaDat ? e.message : "zpětná vazba nemá očekávaný tvar");
  }
  const cas = p.ted();
  const razitko = cas.toISOString().slice(0, 19).replace(/[-:]/g, "");
  // Strop na den: bez něj by šlo správu zahltit tisíci zpráv.
  if ((await p.sklad.klice(`vazba-seznam/${razitko.slice(0, 8)}`)).length >= NEJVIC_VAZEB_DENNE) {
    return chyba(429, "dnes už přišlo příliš mnoho zpráv, zkus to prosím zítra");
  }
  // Strop na skupinu adres: jeden člověk nesmí vyčerpat společný strop všem. Bez poznané adresy
  // platí jen společný strop; počitadlo, které se pořád měnilo, zprávu nezastaví.
  const skupina = adresaZadosti(zadost, p);
  if (skupina !== null && (await zapocitejAdresu(p, "vazba", skupina, denZ(cas), NEJVIC_VAZEB_NA_ADRESU)) === "plno") {
    return chyba(429, "z tohoto připojení dnes přišlo příliš mnoho zpráv, zkus to prosím zítra");
  }
  const id = `${razitko}-${p.nahoda()}`;
  const zaznam: EvidovanaVazba = {
    ...vazba,
    id,
    prijato: cas.toISOString(),
    prostredi: p.prostredi,
    stav: "nova",
    poznamka: "",
    upraveno: null,
  };
  // Nejdřív položka seznamu, pak zpráva: když úložiště mezi zápisy vypadne, nezůstane zpráva,
  // kterou správa v seznamu neukáže (sirotek by se objevil jen v podkladech rozboru). Položka bez
  // zprávy se uklidí hned, a kdyby ani to nešlo, správa u ní řekne, že zpráva není.
  try {
    await p.sklad.zapis(`vazba-seznam/${id}.json`, polozkaSeznamu(zaznam));
    try {
      await p.sklad.zapis(`vazba/${id}.json`, zaznam);
    } catch (vypadek) {
      await p.sklad.smaz(`vazba-seznam/${id}.json`).catch(() => undefined);
      throw vypadek;
    }
  } catch {
    return chyba(503, "zprávu se teď nepodařilo uložit, zkus to prosím za chvíli");
  }
  return odpoved(201, { id });
}

/** Porovná dva texty tak, aby doba porovnání neprozradila, kolik znaků sedí. */
export async function stejne(a: string, b: string): Promise<boolean> {
  const koder = new TextEncoder();
  const [otiskA, otiskB] = await Promise.all([
    crypto.subtle.digest("SHA-256", koder.encode(a)),
    crypto.subtle.digest("SHA-256", koder.encode(b)),
  ]);
  const bajtyA = new Uint8Array(otiskA);
  const bajtyB = new Uint8Array(otiskB);
  let rozdil = 0;
  for (let i = 0; i < bajtyA.length; i++) rozdil |= bajtyA[i]! ^ bajtyB[i]!;
  return rozdil === 0;
}

/** Ověří heslo správce; vrací odpověď s chybou, když nesedí nebo není nastavené. */
export async function overSpravce(zadost: Request, p: ProstrediServeru): Promise<Response | null> {
  // Odpověď nejmenuje proměnnou prostředí: kdo ji nastavuje, to ví ze stránky správce a z dokumentace.
  if (p.hesloSpravce === null || p.hesloSpravce.length < NEJKRATSI_HESLO_SPRAVCE) {
    return chyba(503, "správa na serveru není nastavená");
  }
  const hlavicka = zadost.headers.get("authorization") ?? "";
  const heslo = hlavicka.startsWith("Bearer ") ? hlavicka.slice(7) : "";
  if (!(await stejne(heslo, p.hesloSpravce))) return chyba(401, "nesprávné heslo správce");
  return null;
}

/** Provede práci pro každý klíč, několik souběžně; výsledky vrací v pořadí klíčů. */
export async function provedVse<T>(klice: readonly string[], prace: (klic: string) => Promise<T>): Promise<T[]> {
  const vysledky = new Array<T>(klice.length);
  let dalsi = 0;
  const pracuj = async (): Promise<void> => {
    while (dalsi < klice.length) {
      const i = dalsi++;
      vysledky[i] = await prace(klice[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SOUBEZNE, klice.length) }, pracuj));
  return vysledky;
}

/** Přečte záznamy pod danými klíči, několik souběžně, v pořadí klíčů. */
export function prectiVse(sklad: SkladZaznamu, klice: readonly string[]): Promise<unknown[]> {
  return provedVse(klice, (klic) => sklad.cti(klic));
}

/** Záznam, který vypadá jako evidovaná zpětná vazba; poškozený nebo cizí se přeskočí. */
export function jeVazba(h: unknown): h is EvidovanaVazba {
  if (typeof h !== "object" || h === null) return false;
  const v = h as Partial<EvidovanaVazba>;
  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    typeof v.prijato === "string" &&
    typeof v.stav === "string" &&
    typeof v.hlavicka === "object" &&
    v.hlavicka !== null &&
    typeof v.hlavicka.hra === "string"
  );
}

function jeDavka(h: unknown): h is DavkaDeniku & { prijato: string; prostredi: string } {
  return typeof h === "object" && h !== null && Array.isArray((h as DavkaDeniku).udalosti) && typeof (h as DavkaDeniku).hlavicka === "object";
}

/**
 * Klíče dávek deníku jednoho dne v pořadí, v jakém dávky přišly. Cizí záznamy ve složce dne
 * (dávky uložené starším tvarem klíče) se vynechají; `vse` je vrátí také, kvůli mazání.
 */
export async function kliceDne(sklad: SkladZaznamu, den: string, vse = false): Promise<string[]> {
  const klice = (await sklad.klice(`denik/${den}/`)).sort();
  return vse ? klice : klice.filter((klic) => zKliceDavky(klic) !== null);
}

export const klicVytahu = (den: string): string => `vytah/${den}.json`;

/**
 * Výtah jednoho dne. Server si ho ukládá i s klíčem poslední započtené dávky a příště přečte
 * jen dávky za ním, po částech, dokud má žádost čas (`rozpocet`); po každé části postup uloží,
 * takže žádost, kterou brána nebo úložiště přeruší, o hotovou práci nepřijde. Do dneška dávky
 * ještě přibývají: do uloženého výtahu se počítají jen dávky starší než `USAZENI` a ty novější
 * se k odpovědi dopočítají pokaždé znovu. Po uzávěrce dne se na výtah z doby, kdy den běžel,
 * naváže, jen když před jeho poslední dávkou stojí přesně tolik dávek, kolik jich započetl
 * (opožděná dávka mohla zapadnout před už započtené; pak se den spočítá od začátku).
 * `ulozeny` je to, co o dni server ví.
 */
async function vytahDne(
  p: ProstrediServeru,
  den: string,
  ulozeny: UlozenyVytah | null,
  rozpocet: RozpocetSouhrnu,
): Promise<{ vytah: VytahDeniku; zpracovano: number; hotovo: boolean }> {
  const ted = p.ted().getTime();
  const uzavreny = den < denZ(new Date(ted - ODKLAD_UZAVERKY));
  if (uzavreny && ulozeny !== null && !ulozeny.otevreny && ulozeny.hotovo) return ulozeny;
  // Výtah uzavřeného dne u dne, který podle hodin ještě běží, není k ničemu (stává se jen v testech).
  const znamy = ulozeny !== null && (uzavreny || ulozeny.otevreny) ? ulozeny : null;
  // Čas žádosti vypršel: den se ani nevypisuje (i výpis klíčů stojí čas) a vrátí se to, co
  // o něm server už ví.
  if (dalsiCast(rozpocet) <= 0) return { vytah: znamy?.vytah ?? prazdnyVytah(), zpracovano: znamy?.zpracovano ?? 0, hotovo: false };

  const klice = await kliceDne(p.sklad, den);
  const za = (klic: string | null): number => {
    if (klic === null) return 0;
    const i = klice.findIndex((k) => k > klic);
    return i < 0 ? klice.length : i;
  };
  // Na výtah z doby, kdy den běžel, jde po uzávěrce navázat, jen když se před jeho poslední
  // dávkou nic nezměnilo: klíčů až po ni je přesně tolik, kolik jich započetl.
  const zaklad = znamy !== null && (znamy.otevreny === !uzavreny || za(znamy.posledni) === znamy.zpracovano) ? znamy : null;
  let vytah = zaklad?.vytah ?? prazdnyVytah();
  let zpracovano = zaklad?.zpracovano ?? 0;
  let posledni = zaklad?.posledni ?? null;
  let od = za(posledni);
  // Dnešní dávky mladší než `USAZENI` se do uloženého výtahu nepočítají: jiná, která přišla
  // ve stejnou chvíli, se mohla uložit o okamžik později a zařadit se před ně.
  const mez = uzavreny ? null : `denik/${den}/${String(ted - USAZENI).padStart(13, "0")}`;
  const uloz = (hotovo: boolean): Promise<void> => {
    const kUlozeni: UlozenyVytah = { vytah, zpracovano, posledni, hotovo, otevreny: !uzavreny };
    return p.sklad.zapis(klicVytahu(den), kUlozeni);
  };
  let cerstve: VytahDeniku[] = [];
  let cerstvych = 0;
  let ulozenoHotove = false;
  for (let kolik = 0; od < klice.length && (kolik = dalsiCast(rozpocet)) > 0; ) {
    const nove = klice.slice(od, od + kolik);
    rozpocet.jiste = Math.max(0, rozpocet.jiste - nove.length);
    let usazenych = nove.length;
    if (mez !== null) for (usazenych = 0; usazenych < nove.length && nove[usazenych]! < mez; ) usazenych += 1;
    const davky = await prectiVse(p.sklad, nove);
    od += nove.length;
    if (usazenych > 0) {
      vytah = slucVytahy([vytah, vytahDeniku(davky.slice(0, usazenych).filter(jeDavka))]);
      zpracovano += usazenych;
      posledni = nove[usazenych - 1]!;
      ulozenoHotove = uzavreny && od >= klice.length;
      await uloz(ulozenoHotove);
    }
    if (usazenych < nove.length) {
      cerstve = [...cerstve, vytahDeniku(davky.slice(usazenych).filter(jeDavka))];
      cerstvych += nove.length - usazenych;
    }
  }
  const hotovo = od >= klice.length;
  // Uzavřený den, ze kterého už nebylo co číst (výtah z doby, kdy běžel, ho měl celý), se
  // jednou zapíše jako konečný; příště se nevypisuje.
  if (uzavreny && hotovo && klice.length > 0 && !ulozenoHotove) await uloz(true);
  return { vytah: cerstve.length > 0 ? slucVytahy([vytah, ...cerstve]) : vytah, zpracovano: zpracovano + cerstvych, hotovo };
}

/**
 * Souhrn za dny od–do (včetně). Počítá se z výtahů dnů; co se nestihne, hlásí jako nedokončené.
 * `rozpocet` dostane ten, kdo v jedné žádosti počítá víc souhrnů a chce, aby se o čas dělily.
 */
export async function souhrnObdobi(p: ProstrediServeru, od: string, po: string, rozpocet: RozpocetSouhrnu = rozpocetSouhrnu(p)): Promise<OdpovedSouhrnu> {
  const dny = (await p.sklad.slozky("denik/")).filter((d) => DEN.test(d) && d >= od && d <= po).sort();
  const ulozene = (await prectiVse(p.sklad, dny.map(klicVytahu))).map((u) => (jeUlozenyVytah(u) ? u : null));
  const vytahy: VytahDeniku[] = [];
  const nedokonceno: string[] = [];
  let davek = 0;
  for (const [i, den] of dny.entries()) {
    const v = await vytahDne(p, den, ulozene[i] ?? null, rozpocet);
    vytahy.push(v.vytah);
    davek += v.zpracovano;
    if (!v.hotovo) nedokonceno.push(den);
  }
  return {
    od,
    do: po,
    dny,
    souhrn: souhrnZVytahu(slucVytahy(vytahy)),
    davek,
    neuplne: nedokonceno.length > 0,
    nedokonceno,
  };
}

/** Správa: čtení zpětné vazby a deníku a změna stavu řešení. Vše jen s heslem správce. */
export async function spravuj(zadost: Request, p: ProstrediServeru): Promise<Response> {
  const odmitnuti = await overSpravce(zadost, p);
  if (odmitnuti) return odmitnuti;
  const dotaz = new URL(zadost.url).searchParams;
  const cesta = dotaz.get("co") ?? "";
  const { sklad } = p;

  if (cesta === "overeni" && zadost.method === "GET") return odpoved(200, { ok: true, prostredi: p.prostredi });

  if (cesta === "vazby" && zadost.method === "GET") {
    // Čísla zpětných vazeb začínají časem, takže abecední pořadí je časové. Čtou se malé
    // záznamy seznamu, ne celé zprávy s přílohami; `pred` vrátí stránku starších zpráv.
    const pred = dotaz.get("pred") ?? "";
    if (pred !== "" && !ID_VAZBY.test(pred)) return chyba(400, "chybí platné číslo zpětné vazby");
    const vsechny = (await sklad.klice("vazba-seznam/")).reverse();
    const od = pred === "" ? 0 : vsechny.findIndex((k) => k < `vazba-seznam/${pred}.json`);
    const klice = od < 0 ? [] : vsechny.slice(od, od + NEJVIC_VAZEB_V_SEZNAMU);
    const seznam = (await prectiVse(sklad, klice)).filter(jePolozkaSeznamu);
    const zbyva = od < 0 ? 0 : vsechny.length - od - klice.length;
    return odpoved(200, { vazby: seznam, celkem: vsechny.length, dalsi: zbyva > 0 ? (seznam.at(-1)?.id ?? null) : null });
  }

  if (cesta === "vazba" && zadost.method === "GET") {
    const id = dotaz.get("id") ?? "";
    if (!ID_VAZBY.test(id)) return chyba(400, "chybí platné číslo zpětné vazby");
    const vazba = await sklad.cti(`vazba/${id}.json`);
    return jeVazba(vazba) ? odpoved(200, { vazba }) : chyba(404, "taková zpětná vazba není");
  }

  if (cesta === "vazba" && zadost.method === "POST") {
    const telo = await teloJson(zadost, 16 * 1024);
    if (telo instanceof Response) return telo;
    const zmena = telo.data as { id?: unknown; stav?: unknown; poznamka?: unknown };
    if (typeof zmena !== "object" || zmena === null || typeof zmena.id !== "string" || !ID_VAZBY.test(zmena.id)) {
      return chyba(400, "chybí platné číslo zpětné vazby");
    }
    const klic = `vazba/${zmena.id}.json`;
    const vazba = await sklad.cti(klic);
    if (!jeVazba(vazba)) return chyba(404, "taková zpětná vazba není");
    if (zmena.stav !== undefined) {
      if (typeof zmena.stav !== "string" || !(STAVY_VAZBY as readonly string[]).includes(zmena.stav)) {
        return chyba(400, "neznámý stav řešení");
      }
      vazba.stav = zmena.stav as StavVazby;
    }
    if (zmena.poznamka !== undefined) {
      if (typeof zmena.poznamka !== "string" || zmena.poznamka.length > 4000) return chyba(400, "poznámka musí být text do 4000 znaků");
      vazba.poznamka = zmena.poznamka;
    }
    vazba.upraveno = p.ted().toISOString();
    await sklad.zapis(klic, vazba);
    await sklad.zapis(`vazba-seznam/${vazba.id}.json`, polozkaSeznamu(vazba));
    return odpoved(200, { vazba });
  }

  if (cesta === "smazat" && zadost.method === "POST") {
    const telo = await teloJson(zadost, 16 * 1024);
    if (telo instanceof Response) return telo;
    const co = telo.data as { vazba?: unknown; den?: unknown } | null;
    if (typeof co !== "object" || co === null) return chyba(400, "chybí, co se má smazat");
    if (typeof co.vazba === "string" && ID_VAZBY.test(co.vazba)) {
      const klic = `vazba/${co.vazba}.json`;
      if ((await sklad.cti(klic)) === null) return chyba(404, "taková zpětná vazba není");
      await sklad.smaz(klic);
      await sklad.smaz(`vazba-seznam/${co.vazba}.json`);
      return odpoved(200, { smazano: 1, zbyva: 0 });
    }
    if (typeof co.den === "string" && DEN.test(co.den)) {
      const klice = await kliceDne(sklad, co.den, true);
      const ted = klice.slice(0, NEJVIC_DAVEK_NAJEDNOU);
      await provedVse(ted, (klic) => sklad.smaz(klic));
      // Výtah dne už neplatí; smaže se hned, ať se z něj nepočítá souhrn smazaného dne.
      await sklad.smaz(klicVytahu(co.den));
      return odpoved(200, { smazano: ted.length, zbyva: klice.length - ted.length });
    }
    return chyba(400, "chybí platné číslo zpětné vazby nebo den ve tvaru RRRR-MM-DD");
  }

  if (zadost.method !== "GET") return chyba(405, "tuto adresu lze jen číst");

  if (cesta === "dny") {
    const dny = (await sklad.slozky("denik/")).filter((d) => DEN.test(d)).reverse();
    return odpoved(200, { dny });
  }

  if (cesta === "souhrn") {
    const od = dotaz.get("od") ?? dotaz.get("den") ?? "";
    const po = dotaz.get("do") ?? dotaz.get("den") ?? "";
    if (!DEN.test(od) || !DEN.test(po) || od > po) return chyba(400, "chybí den nebo období (od, do) ve tvaru RRRR-MM-DD");
    return odpoved(200, await souhrnObdobi(p, od, po));
  }

  const den = dotaz.get("den") ?? "";
  if (!DEN.test(den)) return chyba(cesta === "" ? 404 : 400, cesta === "" ? "neznámá adresa správy" : "chybí den ve tvaru RRRR-MM-DD");

  if (cesta === "den") {
    const sezeni = new Map<string, SezeniDne>();
    for (const klic of await kliceDne(sklad, den)) {
      const d = zKliceDavky(klic);
      if (!d) continue;
      const zaznam = sezeni.get(`${d.hrac}/${d.slozka}`);
      if (zaznam) {
        zaznam.davek += 1;
        zaznam.posledni = d.prijato;
      } else {
        sezeni.set(`${d.hrac}/${d.slozka}`, { hrac: d.hrac, sezeni: d.sezeni, slozka: d.slozka, zacatek: d.zacatek, davek: 1, prvni: d.prijato, posledni: d.prijato });
      }
    }
    return odpoved(200, { den, sezeni: [...sezeni.values()] });
  }

  if (cesta === "sezeni") {
    const hrac = dotaz.get("hrac") ?? "";
    const slozka = dotaz.get("slozka") ?? "";
    if (!ID_HRACE.test(hrac) || !SLOZKA_SEZENI.test(slozka)) return chyba(400, "chybí číslo hráče nebo sezení");
    const klice = (await kliceDne(sklad, den)).filter((klic) => {
      const d = zKliceDavky(klic);
      return d !== null && d.hrac === hrac && d.slozka === slozka;
    });
    const davky = (await prectiVse(sklad, klice.slice(0, NEJVIC_DAVEK_NAJEDNOU))).filter(jeDavka);
    if (davky.length === 0) return chyba(404, "takové sezení ten den není");
    // Stabilní řazení: dávky se stejným číslem (zdvojený panel) zůstanou v pořadí, v jakém přišly.
    const udalosti: UdalostDeniku[] = davky.sort((a, b) => a.poradi - b.poradi).flatMap((d) => d.udalosti);
    return odpoved(200, { den, hlavicka: davky[0]!.hlavicka, udalosti, neuplne: klice.length > NEJVIC_DAVEK_NAJEDNOU });
  }

  if (cesta === "export") {
    const preskocit = Math.max(0, Math.floor(Number(dotaz.get("preskocit") ?? "0")) || 0);
    const klice = await kliceDne(sklad, den);
    const vybrane = klice.slice(preskocit, preskocit + NEJVIC_DAVEK_VE_VYVOZU);
    const davky = (await prectiVse(sklad, vybrane)).filter(jeDavka);
    const neuplne = klice.length > preskocit + vybrane.length;
    return odpoved(200, { den, davky, neuplne, celkem: klice.length, dalsi: neuplne ? preskocit + NEJVIC_DAVEK_VE_VYVOZU : null });
  }

  return chyba(404, "neznámá adresa správy");
}
