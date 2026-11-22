// Obsluha žádostí serveru: příjem deníku hraní a zpětné vazby od hry a správa pro zadavatele.
// Pracuje se standardními objekty Request a Response a s úložištěm za rozhraním
// `SkladZaznamu`, takže stejný kód běží ve funkcích Netlify i v testech v Node.
//
// Veřejné adresy (posílá na ně hra):
//   POST /api/denik   dávka událostí deníku            → 204
//   POST /api/vazba   zpětná vazba hráče               → 201 { id }
// Správa (hlavička Authorization: Bearer <heslo správce>); co se chce, říká parametr `co`:
//   GET  /api/sprava?co=vazby                 seznam zpětných vazeb, nejnovější první
//   GET  /api/sprava?co=vazba&id=…            jedna zpětná vazba celá
//   POST /api/sprava?co=vazba                 { id, stav?, poznamka? } změní stav řešení
//   GET  /api/sprava?co=dny                   dny, ze kterých je deník
//   GET  /api/sprava?co=den&den=RRRR-MM-DD    sezení toho dne
//   GET  /api/sprava?co=sezeni&den=…&hrac=…&sezeni=…   události jednoho sezení
//   GET  /api/sprava?co=souhrn&den=…          souhrn dne po úrovních
//   GET  /api/sprava?co=export&den=…          všechny dávky dne tak, jak přišly

import { ChybaDat } from "../data/kontrola";
import { souhrnDeniku } from "../denik/souhrn";
import {
  nactiDavku,
  nactiVazbu,
  STAVY_VAZBY,
  type DavkaDeniku,
  type EvidovanaVazba,
  type StavVazby,
  type UdalostDeniku,
} from "../denik/udalosti";
import type { SkladZaznamu } from "./sklad";

/** Největší tělo žádosti v bajtech: dávka deníku a zpětná vazba s přiloženým mostem. */
export const NEJVETSI_DAVKA = 96 * 1024;
export const NEJVETSI_VAZBA = 400 * 1024;
/** Nejvíc dávek deníku, které správa přečte na jednu žádost (souhrn, export). */
export const NEJVIC_DAVEK_NAJEDNOU = 1500;
/** Nejvíc zpětných vazeb v seznamu. */
export const NEJVIC_VAZEB_V_SEZNAMU = 500;
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
}

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
  hra: string;
}

export interface SezeniDne {
  hrac: string;
  sezeni: string;
  davek: number;
}

function odpoved(stav: number, telo?: unknown): Response {
  if (telo === undefined) return new Response(null, { status: stav });
  return new Response(JSON.stringify(telo), {
    status: stav,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const chyba = (stav: number, zprava: string): Response => odpoved(stav, { chyba: zprava });

/**
 * Přišla žádost ze stránky téhož webu? Prohlížeč k žádosti z cizí stránky přidá hlavičku
 * Origin s cizí adresou; žádost bez ní (příkazová řádka, test) se neposuzuje.
 */
function zCizihoWebu(zadost: Request): boolean {
  const puvod = zadost.headers.get("origin");
  if (puvod === null) return false;
  try {
    return new URL(puvod).host !== new URL(zadost.url).host;
  } catch {
    return true;
  }
}

/** Přečte tělo žádosti jako JSON; vrací odpověď s chybou, když je moc velké nebo to JSON není. */
async function teloJson(zadost: Request, nejvic: number): Promise<{ data: unknown } | Response> {
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

function denZ(cas: Date): string {
  return cas.toISOString().slice(0, 10);
}

const DEN = /^\d{4}-\d{2}-\d{2}$/;
const ID_HRACE = /^[0-9a-f]{8,32}$/;
const ID_VAZBY = /^\d{8}T\d{6}-[0-9a-f]{4,12}$/;

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
  const { hrac, sezeni } = davka.hlavicka;
  const klic = `denik/${denZ(cas)}/${hrac}/${sezeni}/${String(davka.poradi).padStart(5, "0")}.json`;
  await p.sklad.zapis(klic, { prijato: cas.toISOString(), prostredi: p.prostredi, ...davka });
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
  await p.sklad.zapis(`vazba/${id}.json`, zaznam);
  return odpoved(201, { id });
}

/** Porovná dva texty tak, aby doba porovnání neprozradila, kolik znaků sedí. */
async function stejne(a: string, b: string): Promise<boolean> {
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
async function overSpravce(zadost: Request, p: ProstrediServeru): Promise<Response | null> {
  if (p.hesloSpravce === null || p.hesloSpravce.length < 8) {
    return chyba(503, "heslo správce není nastavené (proměnná prostředí MM_SPRAVCE_HESLO, aspoň 8 znaků)");
  }
  const hlavicka = zadost.headers.get("authorization") ?? "";
  const heslo = hlavicka.startsWith("Bearer ") ? hlavicka.slice(7) : "";
  if (!(await stejne(heslo, p.hesloSpravce))) return chyba(401, "nesprávné heslo správce");
  return null;
}

/** Přečte záznamy pod danými klíči, několik souběžně, v pořadí klíčů. */
async function prectiVse(sklad: SkladZaznamu, klice: readonly string[]): Promise<unknown[]> {
  const vysledky: unknown[] = new Array<unknown>(klice.length).fill(null);
  let dalsi = 0;
  const pracuj = async (): Promise<void> => {
    while (dalsi < klice.length) {
      const i = dalsi++;
      vysledky[i] = await sklad.cti(klice[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SOUBEZNE, klice.length) }, pracuj));
  return vysledky;
}

/** Záznam, který vypadá jako evidovaná zpětná vazba; poškozený nebo cizí se přeskočí. */
function jeVazba(h: unknown): h is EvidovanaVazba {
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

/** Dávky deníku jednoho dne (nejvýš `NEJVIC_DAVEK_NAJEDNOU`) a údaj, zda jich bylo víc. */
async function davkyDne(sklad: SkladZaznamu, den: string, predpona = ""): Promise<{ davky: DavkaDeniku[]; neuplne: boolean }> {
  const klice = await sklad.klice(`denik/${den}/${predpona}`);
  const vybrane = klice.slice(0, NEJVIC_DAVEK_NAJEDNOU);
  const davky = (await prectiVse(sklad, vybrane)).filter(jeDavka);
  return { davky, neuplne: klice.length > vybrane.length };
}

/** Správa: čtení zpětné vazby a deníku a změna stavu řešení. Vše jen s heslem správce. */
export async function spravuj(zadost: Request, p: ProstrediServeru): Promise<Response> {
  const odmitnuti = await overSpravce(zadost, p);
  if (odmitnuti) return odmitnuti;
  const dotaz = new URL(zadost.url).searchParams;
  const cesta = dotaz.get("co") ?? "";
  const { sklad } = p;

  if (cesta === "vazby" && zadost.method === "GET") {
    // Čísla zpětných vazeb začínají časem, takže abecední pořadí je časové.
    const klice = (await sklad.klice("vazba/")).reverse().slice(0, NEJVIC_VAZEB_V_SEZNAMU);
    const vazby = (await prectiVse(sklad, klice)).filter(jeVazba);
    const seznam: PolozkaSeznamuVazeb[] = vazby.map((v) => ({
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
      hra: v.hlavicka.hra,
    }));
    return odpoved(200, { vazby: seznam });
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
    return odpoved(200, { vazba });
  }

  if (zadost.method !== "GET") return chyba(405, "tuto adresu lze jen číst");

  if (cesta === "dny") {
    const dny = (await sklad.slozky("denik/")).filter((d) => DEN.test(d)).reverse();
    return odpoved(200, { dny });
  }

  const den = dotaz.get("den") ?? "";
  if (!DEN.test(den)) return chyba(cesta === "" ? 404 : 400, cesta === "" ? "neznámá adresa správy" : "chybí den ve tvaru RRRR-MM-DD");

  if (cesta === "den") {
    const pocty = new Map<string, SezeniDne>();
    for (const klic of await sklad.klice(`denik/${den}/`)) {
      const [, , hrac, sezeni] = klic.split("/");
      if (!hrac || !sezeni) continue;
      const zaznam = pocty.get(`${hrac}/${sezeni}`) ?? { hrac, sezeni, davek: 0 };
      zaznam.davek += 1;
      pocty.set(`${hrac}/${sezeni}`, zaznam);
    }
    return odpoved(200, { den, sezeni: [...pocty.values()] });
  }

  if (cesta === "sezeni") {
    const hrac = dotaz.get("hrac") ?? "";
    const sezeni = dotaz.get("sezeni") ?? "";
    if (!ID_HRACE.test(hrac) || !ID_HRACE.test(sezeni)) return chyba(400, "chybí číslo hráče nebo sezení");
    const { davky, neuplne } = await davkyDne(sklad, den, `${hrac}/${sezeni}/`);
    if (davky.length === 0) return chyba(404, "takové sezení ten den není");
    const udalosti: UdalostDeniku[] = davky.sort((a, b) => a.poradi - b.poradi).flatMap((d) => d.udalosti);
    return odpoved(200, { den, hlavicka: davky[0]!.hlavicka, udalosti, neuplne });
  }

  if (cesta === "souhrn") {
    const { davky, neuplne } = await davkyDne(sklad, den);
    return odpoved(200, { den, souhrn: souhrnDeniku(davky), davek: davky.length, neuplne });
  }

  if (cesta === "export") {
    const { davky, neuplne } = await davkyDne(sklad, den);
    return odpoved(200, { den, davky, neuplne });
  }

  return chyba(404, "neznámá adresa správy");
}
