// Žebříčky na serveru: příjem zápisu, čtení žebříčku úrovně a správa pro zadavatele.
//
//   GET  /api/zebricek?uroven=1-01     žebříček úrovně (tři měřítka, nejlepší řádky)
//   POST /api/zebricek                 zápis mostu (`ZadostOZapis`) → 200 `OdpovedNaZapis`,
//                                      nebo 4xx/5xx { chyba, kod } (`KodOdmitnuti`)
//
// Hře se nevěří nic: most z kódu server sám postaví, zkontroluje proti pravidlům úrovně a pustí
// na něj zkoušku (`Overovac`). Zapíše se jen most, který na serveru prošel bez porušení, a jeho
// hodnoty spočítané serverem; otisk výsledku od hráče musí sedět s otiskem serveru, jinak je
// zápis podvržený (nebo hra v prohlížeči počítá jinou verzí) a server ho odmítne.
//
// Proti zahlcení: jedna žádost pustí nejvýš jednu zkoušku (zápis ze zkoušky do zlomu smí přijít
// až po zápisu z běžné zkoušky téhož mostu); zkouška se započítá do denního stropu a do stropu
// skupiny adres dřív, než se pustí; žádost, u které se adresa nepozná, server odmítne (kód
// `bez-adresy`), jinak by všichni bez adresy sdíleli jeden strop nebo si ho obcházeli podvrženou
// hlavičkou; most, který server už přepočítal, se nepočítá znovu; a v jednom
// měřítku má jeden most (nezávisle na id a pořadí kreslení) jediný řádek, toho, kdo ho zapsal
// první. Opsaný most poslaný pod stovkou čísel hráče tak žebříček nezaplní.
//
// Úložiště (v je verze fyziky a verze pravidel žebříčků, např. `v9.1`):
//   zebricek/<v>/<úroveň>-<otisk zadání>.json            zápisy tří měřítek (`UlozenyZebricek`)
//   overeno/<v>/<úroveň>-<otisk>/<otisk kódu>.json       výsledek ověření mostu (`OverenyMost`)
//   zebricek-den/<den>.json                              počty dne (ověření, zápisy, odmítnutí)
//   adresa/zebricek/<den>/<otisk adresy>.json           kolik zkoušek si ten den vyžádala skupina adres (`adresa.ts`)
// Žebříček se zapisuje s podmínkou (`zapisPokud`): dva zápisy ve stejnou chvíli se nepřepíšou.
// Po změně fyziky, pravidel žebříčků nebo zadání úrovně začíná žebříček od nuly (jiný klíč);
// staré zápisy zůstávají v úložišti a nikde se neukazují.

import { NEJDELSI_KOD_MOSTU } from "../data/sdileni";
import { zobrazenaHodnota } from "../data/vyzvy";
import {
  jeIdHraceZebricku,
  jeLepsi,
  jeOtiskZkousky,
  MIRY_ZEBRICKU,
  NEJVIC_RADKU,
  NEJVIC_ZAPISU,
  seradZapisy,
  upravPrezdivku,
  VERZE_ZEBRICKU,
  znackaHrace,
  type KodOdmitnuti,
  type MiraZebricku,
  type MistoHrace,
  type OdpovedNaZapis,
  type ZadostOZapis,
  type ZebricekUrovne,
} from "../data/zebricek";
import { adresaZadosti, zapocitejAdresu } from "./adresa";
import { chyba, denZ, odpoved, teloJson, zCizihoWebu, type ProstrediServeru } from "./obsluha";
import type { OvereniZlomu, Overovac } from "./overeni";
import { jeNevhodnaPrezdivka } from "./prezdivky";
import { SoubehZapisu, upravSPodminkou as uprav, type SkladZaznamu } from "./sklad";

/** Největší tělo žádosti o zápis: kód mostu a pár krátkých polí. */
export const NEJVETSI_ZAPIS = 16 * 1024;
/**
 * Kolik mostů server za den nejvýš přepočítá; další zápisy odmítne. Zkouška stojí čas funkce
 * (až desítky sekund na nejtěžších úrovních) a doba běhu funkcí je v tarifu Netlify omezená;
 * po nasazení změřit a podle tarifu upravit.
 */
export const NEJVIC_OVERENI_DENNE = 1000;
/** Kolik zkoušek za den smí vyžádat jedna skupina adres: hráč jich za večer udělá pár desítek. */
export const NEJVIC_OVERENI_NA_ADRESU = 60;

const ID_UROVNE = /^[1-8]-\d{2}$/;

/** Jeden zápis v uloženém žebříčku. */
export interface ZapisZebricku {
  /** Číslo hráče (neveřejné). */
  hrac: string;
  jmeno: string;
  hodnota: number;
  /** Kdy byl zápis přijat, ms. */
  cas: number;
  /** Otisk kódu mostu: pod ním leží most v paměti ověřených. */
  most: string;
  /** Otisk tvaru mostu (nezávislý na id a pořadí kreslení): v měřítku má jeden tvar jeden řádek. */
  tvar: string;
}

export type UlozenyZebricek = Record<MiraZebricku, ZapisZebricku[]>;

/**
 * Co si server pamatuje o mostě, který už přepočítal. Kód mostu se ukládá jen u mostu, který
 * platí (správce si ho může otevřít); u mostu, který neprošel, stačí výsledek.
 */
interface OverenyMost {
  plati: boolean;
  otisk: string;
  cena: number;
  hmotnost: number;
  tvar: string;
  kod?: string;
  /** Zkouška do zlomu: null, dokud ji nikdo nechtěl; `false`, když ji most nedostal. */
  zlom: OvereniZlomu | false | null;
}

/** Počty jednoho dne: kolik mostů se přepočítalo, kolik zápisů přišlo a jak dopadly. */
export interface PoctyZebricku {
  overeni: number;
  prijato: number;
  zlepseni: number;
  odmitnuto: Partial<Record<KodOdmitnuti, number>>;
}

const prazdnyZebricek = (): UlozenyZebricek => ({ cena: [], hmotnost: [], zlom: [] });
const prazdnePocty = (): PoctyZebricku => ({ overeni: 0, prijato: 0, zlepseni: 0, odmitnuto: {} });

function jeZapis(h: unknown): h is ZapisZebricku {
  if (typeof h !== "object" || h === null) return false;
  const z = h as Partial<ZapisZebricku>;
  return (
    jeIdHraceZebricku(z.hrac) &&
    typeof z.jmeno === "string" &&
    typeof z.hodnota === "number" &&
    Number.isFinite(z.hodnota) &&
    z.hodnota > 0 &&
    typeof z.cas === "number" &&
    typeof z.most === "string" &&
    typeof z.tvar === "string"
  );
}

function nactiUlozeny(h: unknown): UlozenyZebricek {
  const z = prazdnyZebricek();
  if (typeof h !== "object" || h === null) return z;
  for (const mira of MIRY_ZEBRICKU) {
    const zapisy = (h as Record<string, unknown>)[mira];
    if (Array.isArray(zapisy)) z[mira] = zapisy.filter(jeZapis);
  }
  return z;
}

function nactiPocty(h: unknown): PoctyZebricku {
  const p = prazdnePocty();
  if (typeof h !== "object" || h === null) return p;
  const u = h as Partial<PoctyZebricku>;
  const cislo = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  p.overeni = cislo(u.overeni);
  p.prijato = cislo(u.prijato);
  p.zlepseni = cislo(u.zlepseni);
  if (typeof u.odmitnuto === "object" && u.odmitnuto !== null) {
    for (const [kod, n] of Object.entries(u.odmitnuto)) if (cislo(n) > 0) p.odmitnuto[kod as KodOdmitnuti] = cislo(n);
  }
  return p;
}

const koren = (over: Overovac): string => `v${over.verze}.${VERZE_ZEBRICKU}`;
const klicZebricku = (over: Overovac, klicUrovne: string): string => `zebricek/${koren(over)}/${klicUrovne}.json`;
const klicOvereni = (over: Overovac, klicUrovne: string, most: string): string => `overeno/${koren(over)}/${klicUrovne}/${most}.json`;
const klicPoctu = (den: string): string => `zebricek-den/${den}.json`;

async function zapocitej(p: ProstrediServeru, zmena: (pocty: PoctyZebricku) => void): Promise<void> {
  try {
    await uprav(p.sklad, klicPoctu(denZ(p.ted())), (dnes) => {
      const pocty = nactiPocty(dnes);
      zmena(pocty);
      return { zapsat: pocty, vysledek: null };
    });
  } catch {
    // Počty jsou jen pro správce; kvůli nim zápis hráče nesmí selhat.
  }
}

async function otiskTextu(text: string): Promise<string> {
  const bajty = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bajty.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Započítá jednu zkoušku do denního stropu a do stropu skupiny adres, ještě než se pustí:
 * zkouška, která spadne nebo se nestihne, se tak počítá taky. Vrací, proč zkoušku pustit nejde,
 * nebo null. Adresa se neukládá, jen její otisk se solí dne (`adresa.ts`).
 */
async function rezervujZkousku(p: ProstrediServeru, skupina: string): Promise<"plno" | "adresa" | null> {
  const den = denZ(p.ted());
  if (nactiPocty(await p.sklad.cti(klicPoctu(den))).overeni >= NEJVIC_OVERENI_DENNE) return "plno";
  // Počítadlo, které se zrovna pořád měnilo (`soubeh`), zkoušku nezastaví: denní strop platí dál.
  if ((await zapocitejAdresu(p, "zebricek", skupina, den, NEJVIC_OVERENI_NA_ADRESU)) === "plno") return "adresa";
  await zapocitej(p, (pocty) => void (pocty.overeni += 1));
  return null;
}

function jeOvereny(h: unknown): h is OverenyMost {
  if (typeof h !== "object" || h === null) return false;
  const o = h as Partial<OverenyMost>;
  return typeof o.plati === "boolean" && typeof o.otisk === "string" && typeof o.tvar === "string" && typeof o.cena === "number" && typeof o.hmotnost === "number";
}

/** Žebříček úrovně, jak ho vidí hráči: nejlepší řádky každého měřítka bez čísel hráčů a mostů. */
export function verejnyZebricek(uroven: string, verze: number, ulozeny: UlozenyZebricek): ZebricekUrovne {
  const miry = {} as ZebricekUrovne["miry"];
  for (const mira of MIRY_ZEBRICKU) {
    const serazene = seradZapisy(mira, ulozeny[mira]);
    miry[mira] = {
      radky: serazene.slice(0, NEJVIC_RADKU).map((z) => ({
        jmeno: z.jmeno,
        hodnota: z.hodnota,
        kdy: denZ(new Date(z.cas)),
        znacka: znackaHrace(z.hrac, uroven),
      })),
      hracu: serazene.length,
    };
  }
  return { uroven, verze, miry };
}

function odmitni(stav: number, kod: KodOdmitnuti, zprava: string): Response {
  return odpoved(stav, { chyba: zprava, kod });
}

function nactiZadost(data: unknown): ZadostOZapis | null {
  if (typeof data !== "object" || data === null) return null;
  const z = data as Partial<Record<keyof ZadostOZapis, unknown>>;
  const jmeno = upravPrezdivku(z.jmeno);
  if (
    typeof z.uroven !== "string" ||
    !ID_UROVNE.test(z.uroven) ||
    typeof z.kod !== "string" ||
    z.kod.length === 0 ||
    z.kod.length > NEJDELSI_KOD_MOSTU ||
    (z.zkouska !== "bezna" && z.zkouska !== "zlom") ||
    !jeOtiskZkousky(z.otisk) ||
    typeof z.verze !== "number" ||
    !Number.isInteger(z.verze) ||
    !jeIdHraceZebricku(z.hrac) ||
    jmeno === null
  ) {
    return null;
  }
  return { uroven: z.uroven, kod: z.kod, zkouska: z.zkouska, otisk: z.otisk, verze: z.verze, hrac: z.hrac, jmeno };
}

/**
 * Zařadí hodnotu hráče do měřítka. Hráč má v měřítku nejvýš jeden zápis: lepší hodnota ho
 * nahradí, horší nezmění (jen přezdívka se srovná s tou nynější). Most, který v měřítku už
 * zapsal někdo jiný (stejný tvar), druhý řádek nedostane: platí ten první. Vrací nové zápisy
 * a místo hráče.
 */
export function zaradZapis(
  mira: MiraZebricku,
  zapisy: readonly ZapisZebricku[],
  novy: ZapisZebricku,
): { zapisy: ZapisZebricku[]; misto: MistoHrace } {
  const stary = zapisy.find((z) => z.hrac === novy.hrac);
  const obsazeno = zapisy.some((z) => z.hrac !== novy.hrac && z.tvar === novy.tvar);
  const zlepseni = !obsazeno && (!stary || jeLepsi(mira, novy.hodnota, stary.hodnota));
  const muj: ZapisZebricku | null = zlepseni ? novy : stary ? { ...stary, jmeno: novy.jmeno } : null;
  const ostatni = zapisy.filter((z) => z.hrac !== novy.hrac);
  const serazene = seradZapisy(mira, muj ? [...ostatni, muj] : ostatni).slice(0, NEJVIC_ZAPISU);
  const index = serazene.findIndex((z) => z.hrac === novy.hrac);
  const misto: MistoHrace = { poradi: index < 0 ? null : index + 1, hodnota: novy.hodnota, nejlepsi: muj?.hodnota ?? novy.hodnota, zlepseni: zlepseni && index >= 0 };
  if (obsazeno) misto.obsazeno = true;
  return { zapisy: serazene, misto };
}

/** Čtení žebříčku úrovně a příjem zápisu. */
export async function obsluzZebricek(zadost: Request, p: ProstrediServeru, over: Overovac): Promise<Response> {
  if (zadost.method === "GET") {
    const id = new URL(zadost.url).searchParams.get("uroven") ?? "";
    const uroven = ID_UROVNE.test(id) ? over.uroven(id) : null;
    if (!uroven) return odmitni(404, "uroven", "taková úroveň v kampani není");
    const ulozeny = nactiUlozeny(await p.sklad.cti(klicZebricku(over, over.klicUrovne(uroven))));
    return odpoved(200, verejnyZebricek(uroven.id, over.verze, ulozeny));
  }
  if (zadost.method !== "POST") return chyba(405, "žebříček se čte metodou GET a zapisuje metodou POST");
  if (zCizihoWebu(zadost)) return chyba(403, "žádost z cizí stránky");
  const telo = await teloJson(zadost, NEJVETSI_ZAPIS);
  if (telo instanceof Response) return telo;
  const z = nactiZadost(telo.data);
  const odmitnuto = async (stav: number, kod: KodOdmitnuti, zprava: string): Promise<Response> => {
    await zapocitej(p, (pocty) => {
      pocty.odmitnuto[kod] = (pocty.odmitnuto[kod] ?? 0) + 1;
    });
    return odmitni(stav, kod, zprava);
  };
  const plno = (duvod: "plno" | "adresa"): Promise<Response> =>
    duvod === "plno"
      ? odmitnuto(429, "plno", "server dnes už ověřil tolik mostů, kolik smí; zkus to prosím zítra")
      : odmitnuto(429, "adresa", "z téhle adresy dnes server ověřil už tolik mostů, kolik smí; zkus to prosím zítra");
  if (!z) return odmitnuto(400, "tvar", "zápis do žebříčku nemá očekávaný tvar");
  // Bez adresy by strop na adresu nešel počítat: zápis se odmítne dřív, než cokoli stojí.
  const skupina = adresaZadosti(zadost, p);
  if (skupina === null) return odmitnuto(503, "bez-adresy", "server nepozná, odkud zápis přichází, a žebříček ho proto nepřijme; zkus to prosím později");
  if (jeNevhodnaPrezdivka(z.jmeno)) return odmitnuto(422, "prezdivka", "tuhle přezdívku žebříček nepřijme; zvol si jinou");
  const uroven = over.uroven(z.uroven);
  if (!uroven) return odmitnuto(404, "uroven", "taková úroveň v kampani není");
  if (z.verze !== over.verze) return odmitnuto(409, "verze", "hra v prohlížeči počítá jinou verzí fyziky než server; načti stránku znovu");

  const klicUrovne = over.klicUrovne(uroven);
  const most = await otiskTextu(z.kod);
  const klicMostu = klicOvereni(over, klicUrovne, most);
  const ulozene = await p.sklad.cti(klicMostu);
  let overeny: OverenyMost | null = jeOvereny(ulozene) ? ulozene : null;

  if (!overeny) {
    // Most, který server nezná. Čtení kódu a pravidla úrovně jsou levné a nic se po nich neukládá.
    const pripraveny = over.priprav(uroven, z.kod);
    if (pripraveny.stav === "most") return odmitnuto(422, "most", "kód mostu nejde přečíst");
    if (pripraveny.stav === "pravidla") return odmitnuto(422, "pravidla", "most porušuje pravidla úrovně");
    // Zkouška do zlomu se pouští jen mostu, kterému už server ověřil běžnou zkoušku: jedna žádost
    // tak stojí nejvýš jednu zkoušku a nejde jí vynutit dvě s vymyšleným otiskem.
    if (z.zkouska === "zlom") return odmitnuto(409, "nejdriv", "nejdřív zapiš most po běžné zkoušce, potom po zkoušce do zlomu");
    const strop = await rezervujZkousku(p, skupina);
    if (strop) return plno(strop);
    const bezna = over.bezna(uroven, z.kod);
    overeny = { ...bezna, tvar: await otiskTextu(pripraveny.kanon), zlom: null, ...(bezna.plati ? { kod: z.kod } : {}) };
    await p.sklad.zapis(klicMostu, overeny);
  }
  // Otisk běžné zkoušky musí sedět u zápisu z běžné zkoušky, otisk zlomu u zápisu ze zlomu.
  if (z.zkouska === "bezna" && z.otisk !== overeny.otisk) {
    return odmitnuto(422, "otisk", "zkouška na serveru dopadla jinak než ve hře; výsledek se nezapsal");
  }
  if (!overeny.plati) return odmitnuto(422, "neprosel", "most na serveru zkouškou neprošel bez porušení");
  if (z.zkouska === "zlom") {
    if (overeny.zlom === null) {
      const strop = await rezervujZkousku(p, skupina);
      if (strop) return plno(strop);
      overeny = { ...overeny, zlom: over.zlom(uroven, z.kod) ?? false };
      await p.sklad.zapis(klicMostu, overeny);
    }
    if (!overeny.zlom) return odmitnuto(422, "neprosel", "zkouška do zlomu na serveru neproběhla");
    if (z.otisk !== overeny.zlom.otisk) {
      return odmitnuto(422, "otisk", "zkouška do zlomu na serveru dopadla jinak než ve hře; výsledek se nezapsal");
    }
  }

  const cas = p.ted().getTime();
  const tvar = overeny.tvar;
  const hodnoty: Partial<Record<MiraZebricku, number>> =
    z.zkouska === "bezna" ? { cena: overeny.cena, hmotnost: overeny.hmotnost } : { zlom: (overeny.zlom as OvereniZlomu).naKorunu };
  let vysledek: { zebricek: UlozenyZebricek; moje: Partial<Record<MiraZebricku, MistoHrace>> };
  try {
    vysledek = await uprav(p.sklad, klicZebricku(over, klicUrovne), (dnes) => {
      const zebricek = nactiUlozeny(dnes);
      const moje: Partial<Record<MiraZebricku, MistoHrace>> = {};
      for (const mira of MIRY_ZEBRICKU) {
        const hodnota = hodnoty[mira];
        if (hodnota !== undefined && hodnota > 0) {
          const zarazeno = zaradZapis(mira, zebricek[mira], { hrac: z.hrac, jmeno: z.jmeno, hodnota, cas, most, tvar });
          zebricek[mira] = zarazeno.zapisy;
          moje[mira] = zarazeno.misto;
        } else {
          // Přezdívka platí pro celou úroveň: přejmenování se projeví i v měřítkách, kam se teď nezapisuje.
          zebricek[mira] = zebricek[mira].map((zapis) => (zapis.hrac === z.hrac && zapis.jmeno !== z.jmeno ? { ...zapis, jmeno: z.jmeno } : zapis));
        }
      }
      return { zapsat: zebricek, vysledek: { zebricek, moje } };
    });
  } catch (chybaZapisu) {
    if (chybaZapisu instanceof SoubehZapisu) return odmitnuto(503, "soubeh", "žebříček se zrovna měnil a zápis se nepovedl; zkus to prosím znovu");
    throw chybaZapisu;
  }
  const zlepseni = Object.values(vysledek.moje).filter((m) => m.zlepseni).length;
  await zapocitej(p, (pocty) => {
    pocty.prijato += 1;
    pocty.zlepseni += zlepseni;
  });
  const telOdpovedi: OdpovedNaZapis = { zebricek: verejnyZebricek(uroven.id, over.verze, vysledek.zebricek), moje: vysledek.moje };
  return odpoved(200, telOdpovedi);
}

// ---------- správa ----------

/** Řádek žebříčku pro správce: i s veřejnou značkou hráče a s otiskem mostu k otevření. */
export interface RadekSpravy {
  mira: MiraZebricku;
  poradi: number;
  jmeno: string;
  hodnota: number;
  /** Hodnota, jak ji vidí hráč (Kč, kg, t na 100 000 Kč). */
  zobrazeno: number;
  kdy: string;
  znacka: string;
  most: string;
}

export interface ZebricekProSpravu {
  uroven: string;
  klic: string;
  radky: RadekSpravy[];
}

/** Klíče žebříčků nynější verze; z klíče se pozná úroveň. */
async function kliceZebricku(sklad: SkladZaznamu, verze: number): Promise<{ klic: string; uroven: string }[]> {
  const predpona = `zebricek/v${verze}.${VERZE_ZEBRICKU}/`;
  return (await sklad.klice(predpona)).map((klic) => ({ klic, uroven: klic.slice(predpona.length, predpona.length + 4) }));
}

/** Správa: všechny žebříčky nynější verze (řádky každého měřítka, nejvýš `nejvic` na měřítko). */
export async function zebrickyProSpravu(sklad: SkladZaznamu, verze: number, nejvic = NEJVIC_RADKU): Promise<ZebricekProSpravu[]> {
  const vysledek: ZebricekProSpravu[] = [];
  for (const { klic, uroven } of await kliceZebricku(sklad, verze)) {
    const ulozeny = nactiUlozeny(await sklad.cti(klic));
    const radky: RadekSpravy[] = [];
    for (const mira of MIRY_ZEBRICKU) {
      seradZapisy(mira, ulozeny[mira])
        .slice(0, nejvic)
        .forEach((z, i) =>
          radky.push({
            mira,
            poradi: i + 1,
            jmeno: z.jmeno,
            hodnota: z.hodnota,
            zobrazeno: zobrazenaHodnota(mira, z.hodnota),
            kdy: new Date(z.cas).toISOString(),
            znacka: znackaHrace(z.hrac, uroven),
            most: z.most,
          }),
        );
    }
    if (radky.length > 0) vysledek.push({ uroven, klic, radky });
  }
  return vysledek;
}

/** Správa: kód mostu ze zápisu (k otevření ve hře); null, když ho server už nemá. */
export async function mostZeZebricku(sklad: SkladZaznamu, klicZebrickuUrovne: string, most: string): Promise<string | null> {
  // Klíč žebříčku `zebricek/v9.1/1-01-abcd.json` a klíč ověřeného mostu `overeno/v9.1/1-01-abcd/<most>.json`.
  const shoda = /^zebricek\/(v\d+\.\d+\/[1-8]-\d{2}-[0-9a-f]+)\.json$/.exec(klicZebrickuUrovne);
  if (!shoda || !/^[0-9a-f]{32}$/.test(most)) return null;
  const overeny = await sklad.cti(`overeno/${shoda[1]}/${most}.json`);
  return jeOvereny(overeny) && typeof overeny.kod === "string" ? overeny.kod : null;
}

/**
 * Správa: smaže v žebříčku úrovně zápisy hráče se značkou `znacka` (nevhodná přezdívka, podvod,
 * který prošel). Značka platí jen pro svou úroveň. Vrací počet smazaných zápisů.
 */
export async function smazZeZebricku(sklad: SkladZaznamu, verze: number, znacka: string, uroven: string): Promise<number> {
  let smazano = 0;
  for (const { klic, uroven: id } of await kliceZebricku(sklad, verze)) {
    if (id !== uroven) continue;
    smazano += await uprav(sklad, klic, (dnes) => {
      const zebricek = nactiUlozeny(dnes);
      let pryc = 0;
      for (const mira of MIRY_ZEBRICKU) {
        const zbyle = zebricek[mira].filter((z) => znackaHrace(z.hrac, uroven) !== znacka);
        pryc += zebricek[mira].length - zbyle.length;
        zebricek[mira] = zbyle;
      }
      return { zapsat: pryc > 0 ? zebricek : undefined, vysledek: pryc };
    });
  }
  return smazano;
}

/**
 * Správa: smaže řádky hráče s číslem `hrac` ze všech žebříčků (všech verzí). Číslo hráče je
 * neveřejné; řádek najde jen ten, kdo ho zná. Vrací počet smazaných zápisů a kolik žebříčků
 * prošel (jeden žebříček je jedno čtení a nejvýš jeden zápis). Začíná za klíčem `za` a skončí,
 * když prošel `nejvic` žebříčků; `posledni` je pak klíč, kde skončil (null = prošel všechny).
 */
export async function smazHraceZeZebricku(
  sklad: SkladZaznamu,
  hrac: string,
  za: string | null,
  nejvic: number,
): Promise<{ smazano: number; precteno: number; posledni: string | null }> {
  const klice = (await sklad.klice("zebricek/")).filter((k) => za === null || k > za);
  let smazano = 0;
  let precteno = 0;
  for (const klic of klice) {
    if (precteno >= nejvic) return { smazano, precteno, posledni: klice[precteno - 1] ?? za };
    precteno += 1;
    smazano += await uprav(sklad, klic, (dnes) => {
      const zebricek = nactiUlozeny(dnes);
      let pryc = 0;
      for (const mira of MIRY_ZEBRICKU) {
        const zbyle = zebricek[mira].filter((z) => z.hrac !== hrac);
        pryc += zebricek[mira].length - zbyle.length;
        zebricek[mira] = zbyle;
      }
      return { zapsat: pryc > 0 ? zebricek : undefined, vysledek: pryc };
    });
  }
  return { smazano, precteno, posledni: null };
}

/** Správa: počty žebříčků za den (kolik mostů se přepočítalo, kolik zápisů prošlo, kolik bylo odmítnuto a proč). */
export async function poctyZebricku(sklad: SkladZaznamu, den: string): Promise<PoctyZebricku> {
  return nactiPocty(await sklad.cti(klicPoctu(den)));
}
