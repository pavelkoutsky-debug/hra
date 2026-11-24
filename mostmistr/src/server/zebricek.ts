// Žebříčky na serveru: příjem zápisu, čtení žebříčku úrovně a správa pro zadavatele.
//
//   GET  /api/zebricek?uroven=1-01     žebříček úrovně (tři měřítka, nejlepší řádky)
//   POST /api/zebricek                 zápis mostu (`ZadostOZapis`) → 200 `OdpovedNaZapis`,
//                                      nebo 4xx { chyba, kod } (`KodOdmitnuti`)
//
// Hře se nevěří nic: most z kódu server sám postaví, zkontroluje proti pravidlům úrovně a pustí
// na něj zkoušku (`Overovac`). Zapíše se jen most, který na serveru prošel bez porušení, a jeho
// hodnoty spočítané serverem; otisk výsledku od hráče musí sedět s otiskem serveru, jinak je
// zápis podvržený (nebo hra v prohlížeči počítá jinou verzí) a server ho odmítne.
//
// Úložiště:
//   zebricek/v<verze fyziky>/<úroveň>-<otisk zadání>.json   zápisy tří měřítek (`UlozenyZebricek`)
//   overeno/v<verze>/<úroveň>-<otisk>/<otisk kódu>.json     výsledek ověření mostu i s kódem
//   zebricek-den/<den>.json                                 počty dne (ověření, zápisy, odmítnutí)
// Žebříček se zapisuje s podmínkou (`zapisPokud`): dva zápisy ve stejnou chvíli se nepřepíšou.
// Po změně fyziky nebo zadání úrovně začíná žebříček té úrovně od nuly (jiný klíč); staré
// zápisy zůstávají v úložišti a nikde se neukazují.

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
  znackaHrace,
  type KodOdmitnuti,
  type MiraZebricku,
  type MistoHrace,
  type OdpovedNaZapis,
  type ZadostOZapis,
  type ZebricekUrovne,
} from "../data/zebricek";
import { chyba, denZ, odpoved, teloJson, zCizihoWebu, type ProstrediServeru } from "./obsluha";
import type { OvereniZlomu, Overovac } from "./overeni";
import type { SkladZaznamu } from "./sklad";

/** Největší tělo žádosti o zápis: kód mostu a pár krátkých polí. */
export const NEJVETSI_ZAPIS = 16 * 1024;
/** Kolik mostů server za den nejvýš přepočítá; další zápisy odmítne (zkouška stojí čas funkce). */
export const NEJVIC_OVERENI_DENNE = 3000;
/** Kolikrát se zkusí zápis žebříčku, když ho mezitím změnil někdo jiný. */
const POKUSU_O_ZAPIS = 5;

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
}

export type UlozenyZebricek = Record<MiraZebricku, ZapisZebricku[]>;

/** Co si server pamatuje o mostě, který už přepočítal. */
interface OverenyMost {
  kod: string;
  stav: "most" | "pravidla" | "zkouseno";
  plati: boolean;
  otisk: string;
  cena: number;
  hmotnost: number;
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
    typeof z.most === "string"
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

const klicZebricku = (over: Overovac, klicUrovne: string): string => `zebricek/v${over.verze}/${klicUrovne}.json`;
const klicOvereni = (over: Overovac, klicUrovne: string, most: string): string => `overeno/v${over.verze}/${klicUrovne}/${most}.json`;
const klicPoctu = (den: string): string => `zebricek-den/${den}.json`;

/** Zápis s podmínkou a s opakováním: přečte, upraví, zapíše; když mezitím zapsal někdo jiný, znovu. */
async function uprav<T>(sklad: SkladZaznamu, klic: string, zmena: (dnes: unknown) => { zapsat: unknown; vysledek: T }): Promise<T> {
  let posledni: T | undefined;
  for (let pokus = 0; pokus < POKUSU_O_ZAPIS; pokus++) {
    const { hodnota, znacka } = await sklad.ctiSeZnackou(klic);
    const { zapsat, vysledek } = zmena(hodnota);
    posledni = vysledek;
    if (zapsat === undefined || (await sklad.zapisPokud(klic, zapsat, znacka))) return vysledek;
  }
  // Úložiště pořád hlásí cizí zápis: poslední pokus se zapíše bez podmínky, ať zápis hráče nezmizí.
  const { zapsat } = zmena(await sklad.cti(klic));
  if (zapsat !== undefined) await sklad.zapis(klic, zapsat);
  return posledni as T;
}

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

async function otiskKodu(kod: string): Promise<string> {
  const bajty = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kod)));
  return Array.from(bajty.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

function jeOvereny(h: unknown): h is OverenyMost {
  if (typeof h !== "object" || h === null) return false;
  const o = h as Partial<OverenyMost>;
  return typeof o.kod === "string" && typeof o.stav === "string" && typeof o.plati === "boolean" && typeof o.otisk === "string";
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
        znacka: znackaHrace(z.hrac),
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
 * nahradí, horší nezmění (jen přezdívka se srovná s tou nynější). Vrací nové zápisy a místo hráče.
 */
export function zaradZapis(
  mira: MiraZebricku,
  zapisy: readonly ZapisZebricku[],
  novy: ZapisZebricku,
): { zapisy: ZapisZebricku[]; misto: MistoHrace } {
  const stary = zapisy.find((z) => z.hrac === novy.hrac);
  const zlepseni = !stary || jeLepsi(mira, novy.hodnota, stary.hodnota);
  const muj: ZapisZebricku = zlepseni ? novy : { ...stary, jmeno: novy.jmeno };
  const serazene = seradZapisy(mira, [...zapisy.filter((z) => z.hrac !== novy.hrac), muj]).slice(0, NEJVIC_ZAPISU);
  const index = serazene.findIndex((z) => z.hrac === novy.hrac);
  return {
    zapisy: serazene,
    misto: { poradi: index < 0 ? null : index + 1, hodnota: novy.hodnota, nejlepsi: muj.hodnota, zlepseni: zlepseni && index >= 0 },
  };
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
  if (!z) return odmitnuto(400, "tvar", "zápis do žebříčku nemá očekávaný tvar");
  const uroven = over.uroven(z.uroven);
  if (!uroven) return odmitnuto(404, "uroven", "taková úroveň v kampani není");
  if (z.verze !== over.verze) return odmitnuto(409, "verze", "hra v prohlížeči počítá jinou verzí fyziky než server; načti stránku znovu");

  const klicUrovne = over.klicUrovne(uroven);
  const most = await otiskKodu(z.kod);
  const klicMostu = klicOvereni(over, klicUrovne, most);
  const ulozene = await p.sklad.cti(klicMostu);
  let overeny: OverenyMost | null = jeOvereny(ulozene) && ulozene.kod === z.kod ? ulozene : null;
  const potrebaZkousek = (overeny ? 0 : 1) + (z.zkouska === "zlom" && (!overeny || overeny.zlom === null) ? 1 : 0);
  if (potrebaZkousek > 0) {
    // Strop na den chrání čas funkce: most, který už server zná, se nepřepočítává a strop se ho netýká.
    const dnes = nactiPocty(await p.sklad.cti(klicPoctu(denZ(p.ted()))));
    if (dnes.overeni + potrebaZkousek > NEJVIC_OVERENI_DENNE) {
      return odmitnuto(429, "plno", "server dnes už ověřil tolik mostů, kolik smí; zkus to prosím zítra");
    }
  }
  let pocitano = 0;
  if (!overeny) {
    const bezna = over.bezna(uroven, z.kod);
    pocitano += bezna.stav === "zkouseno" ? 1 : 0;
    overeny =
      bezna.stav === "zkouseno"
        ? { kod: z.kod, stav: "zkouseno", plati: bezna.plati, otisk: bezna.otisk, cena: bezna.cena, hmotnost: bezna.hmotnost, zlom: null }
        : { kod: z.kod, stav: bezna.stav, plati: false, otisk: "", cena: 0, hmotnost: 0, zlom: null };
    await p.sklad.zapis(klicMostu, overeny);
  }
  if (z.zkouska === "zlom" && overeny.plati && overeny.zlom === null) {
    overeny = { ...overeny, zlom: over.zlom(uroven, z.kod) ?? false };
    pocitano += 1;
    await p.sklad.zapis(klicMostu, overeny);
  }
  if (pocitano > 0) await zapocitej(p, (pocty) => void (pocty.overeni += pocitano));

  if (overeny.stav === "most") return odmitnuto(422, "most", "kód mostu nejde přečíst");
  if (overeny.stav === "pravidla") return odmitnuto(422, "pravidla", "most porušuje pravidla úrovně");
  // Otisk běžné zkoušky musí sedět u zápisu z běžné zkoušky, otisk zlomu u zápisu ze zlomu.
  if (z.zkouska === "bezna" && z.otisk !== overeny.otisk) {
    return odmitnuto(422, "otisk", "zkouška na serveru dopadla jinak než ve hře; výsledek se nezapsal");
  }
  if (!overeny.plati) return odmitnuto(422, "neprosel", "most na serveru zkouškou neprošel bez porušení");
  if (z.zkouska === "zlom") {
    if (!overeny.zlom) return odmitnuto(422, "neprosel", "zkouška do zlomu na serveru neproběhla");
    if (z.otisk !== overeny.zlom.otisk) {
      return odmitnuto(422, "otisk", "zkouška do zlomu na serveru dopadla jinak než ve hře; výsledek se nezapsal");
    }
  }

  const cas = p.ted().getTime();
  const hodnoty: Partial<Record<MiraZebricku, number>> =
    z.zkouska === "bezna" ? { cena: overeny.cena, hmotnost: overeny.hmotnost } : { zlom: (overeny.zlom as OvereniZlomu).naKorunu };
  const vysledek = await uprav(p.sklad, klicZebricku(over, klicUrovne), (dnes) => {
    const zebricek = nactiUlozeny(dnes);
    const moje: Partial<Record<MiraZebricku, MistoHrace>> = {};
    for (const mira of MIRY_ZEBRICKU) {
      const hodnota = hodnoty[mira];
      if (hodnota === undefined || !(hodnota > 0)) continue;
      const zarazeno = zaradZapis(mira, zebricek[mira], { hrac: z.hrac, jmeno: z.jmeno, hodnota, cas, most });
      zebricek[mira] = zarazeno.zapisy;
      moje[mira] = zarazeno.misto;
    }
    return { zapsat: zebricek, vysledek: { zebricek, moje } };
  });
  const zlepseni = Object.values(vysledek.moje).filter((m) => m.zlepseni).length;
  await zapocitej(p, (pocty) => {
    pocty.prijato += 1;
    pocty.zlepseni += zlepseni;
  });
  const telOdpovedi: OdpovedNaZapis = { zebricek: verejnyZebricek(uroven.id, over.verze, vysledek.zebricek), moje: vysledek.moje };
  return odpoved(200, telOdpovedi);
}

// ---------- správa ----------

/** Řádek žebříčku pro správce: i s veřejnou značkou hráče a s kódem mostu k prohlédnutí. */
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

/** Klíče žebříčků nynější verze fyziky; z klíče se pozná úroveň. */
async function kliceZebricku(sklad: SkladZaznamu, verze: number): Promise<{ klic: string; uroven: string }[]> {
  const predpona = `zebricek/v${verze}/`;
  return (await sklad.klice(predpona)).map((klic) => ({ klic, uroven: klic.slice(predpona.length, predpona.length + 4) }));
}

/** Správa: všechny žebříčky nynější verze fyziky (řádky každého měřítka, nejvýš `nejvic` na měřítko). */
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
            znacka: znackaHrace(z.hrac),
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
  // Klíč žebříčku `zebricek/v9/1-01-abcd.json` a klíč ověřeného mostu `overeno/v9/1-01-abcd/<most>.json`.
  const shoda = /^zebricek\/(v\d+\/[1-8]-\d{2}-[0-9a-f]+)\.json$/.exec(klicZebrickuUrovne);
  if (!shoda || !/^[0-9a-f]{32}$/.test(most)) return null;
  const overeny = await sklad.cti(`overeno/${shoda[1]}/${most}.json`);
  return jeOvereny(overeny) ? overeny.kod : null;
}

/**
 * Správa: smaže zápisy hráče se značkou `znacka` (nevhodná přezdívka, podvod, který prošel).
 * S `uroven` jen v té úrovni, jinak ve všech žebříčcích nynější verze. Vrací počet smazaných zápisů.
 */
export async function smazZeZebricku(sklad: SkladZaznamu, verze: number, znacka: string, uroven: string | null): Promise<number> {
  let smazano = 0;
  for (const { klic, uroven: id } of await kliceZebricku(sklad, verze)) {
    if (uroven !== null && id !== uroven) continue;
    smazano += await uprav(sklad, klic, (dnes) => {
      const zebricek = nactiUlozeny(dnes);
      let pryc = 0;
      for (const mira of MIRY_ZEBRICKU) {
        const zbyle = zebricek[mira].filter((z) => znackaHrace(z.hrac) !== znacka);
        pryc += zebricek[mira].length - zbyle.length;
        zebricek[mira] = zbyle;
      }
      return { zapsat: pryc > 0 ? zebricek : undefined, vysledek: pryc };
    });
  }
  return smazano;
}

/** Správa: počty žebříčků za den (kolik mostů se přepočítalo, kolik zápisů prošlo, kolik bylo odmítnuto a proč). */
export async function poctyZebricku(sklad: SkladZaznamu, den: string): Promise<PoctyZebricku> {
  return nactiPocty(await sklad.cti(klicPoctu(den)));
}
