// Režie přehrávání zkoušky: zpomalený záběr na první porušení.
//
// Zkouška je spočítaná dřív, než ji hráč vidí, takže přehrávání předem ví, kdy a kde most
// poprvé povolí. Kousek před tím okamžikem se čas plynule zpomalí a pohled najede na to místo;
// po zlomu se čas i pohled vrátí a hráč vidí, jak se zřícení šíří dál. Tady je jen průběh
// záběru v čase a výběr místa; co se kdy nakreslí a přehraje, řídí obrazovka úrovně.
// Bez prohlížeče, ať se dá zkoušet v testech.

import type { Bod } from "../data/geometrie";
import { NASLEDEK_KLOUB } from "../jadro/poruseni";
import type { Udalost } from "../zkouska/protokol";
import { OKAMZIK_SLOZENI } from "../zkouska/slozeni";
import { mistoPrutu, prazdnySnimek, STYCNIK_SKRYTY, type Snimek, type Zaznam } from "../zkouska/zaznam";
import { MERITKO_MAX, type Kamera, type Rozmer } from "../vykres/kamera";

/** Co záběr sleduje, když se místo během pádu hýbe: styčník, prut, nebo nic (místo stojí). */
export type CilZaberu = { druh: "stycnik"; stycnik: number } | { druh: "prut"; prut: number } | { druh: "bod" };

/** Záběr: okamžik děje (s), místo ve světě (m) a jak velký kus mostu má být vidět (m). */
export interface Zaber {
  okamzik: number;
  misto: Bod;
  rozsah: number;
  /** Co se má během záběru sledovat; bez údaje místo stojí. */
  cil?: CilZaberu;
}

/** Časy záběru v sekundách děje a rychlost, na kterou se přehrávání zpomalí. */
export const ZABER = {
  /** Jak dlouho před okamžikem začíná zpomalování a nájezd pohledu. */
  najezd: 0.3,
  /** Jak dlouho před okamžikem už platí plné zpomalení. */
  pred: 0.04,
  /** Jak dlouho po okamžiku plné zpomalení trvá. */
  drzeni: 0.16,
  /** Za jak dlouho se pak čas vrátí k původní rychlosti. */
  odjezd: 0.4,
  /** Za jak dlouho se po zpomalení vrátí pohled: zřícení je nejdřív vidět zblízka, pak vcelku. */
  navrat: 0.9,
  /** Rychlost přehrávání v záběru jako podíl skutečného času. */
  rychlost: 0.1,
  /** Rychlost v krátkém záběru (stejné porušení podruhé za sebou): jen připomenutí. */
  rychlostKratkeho: 0.25,
  /** Most bez klidové polohy se skládá hned: záběr patří na okamžik, kdy je pohyb už vidět. */
  okamzikSlozeni: OKAMZIK_SLOZENI,
  /** Záběr, který začal pozdě (záznam se teprve dopočítal), se do obrazu vmísí za tuhle dobu děje. */
  vmiseni: 0.06,
  /** O kolik nejvýš záběr následuje místo, které padá, v metrech: do rokle za ním nejede. */
  nejdalSledovani: 5,
} as const;

/** Plynulý náběh z 0 do 1 (na krajích s nulovou rychlostí). */
function hladce(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Tempo záběru: kolikrát jsou jeho časy v ději kratší. Časy záběru jsou vyladěné pro přehrávání
 * skutečnou rychlostí; kdo přehrává pomaleji, tomu by záběr trval úměrně déle (při ⅒× čtvrt
 * minuty), a tak se úměrně zkrátí. Krátký záběr (stejné porušení podruhé) je ještě o polovinu kratší.
 */
export function tempoZaberu(zvolenaRychlost: number, kratky: boolean): number {
  const pomalost = zvolenaRychlost > 0 && zvolenaRychlost < 1 ? 1 / zvolenaRychlost : 1;
  return pomalost * (kratky ? 2 : 1);
}

/** Čas děje, kdy záběr začíná (zpomalování i nájezd pohledu). */
export function zacatekZaberu(okamzik: number, tempo = 1): number {
  return okamzik - ZABER.najezd / tempo;
}

/** Míra zpomalení v čase děje `cas`: 0 mimo záběr, 1 kolem okamžiku porušení. */
export function miraZpomaleni(cas: number, okamzik: number, tempo = 1): number {
  const t = (cas - okamzik) * tempo;
  const zacatek = -ZABER.najezd;
  const plne = -ZABER.pred;
  const konecPlneho = ZABER.drzeni;
  if (t <= zacatek || t >= konecPlneho + ZABER.odjezd) return 0;
  if (t < plne) return hladce((t - zacatek) / (plne - zacatek));
  if (t <= konecPlneho) return 1;
  return 1 - hladce((t - konecPlneho) / ZABER.odjezd);
}

/** Míra přiblížení pohledu: nabíhá se zpomalením, vrací se až po něm. */
export function miraPohledu(cas: number, okamzik: number, tempo = 1): number {
  const t = (cas - okamzik) * tempo;
  const zacatek = -ZABER.najezd;
  const plne = -ZABER.pred;
  const konecPlneho = ZABER.drzeni + ZABER.odjezd / 2;
  if (t <= zacatek || t >= konecPlneho + ZABER.navrat) return 0;
  if (t < plne) return hladce((t - zacatek) / (plne - zacatek));
  if (t <= konecPlneho) return 1;
  return 1 - hladce((t - konecPlneho) / ZABER.navrat);
}

/**
 * Míra záběru v obrazu (pohled, ztmavení, značka). Běžně je to míra pohledu; když ale záběr
 * začal až v čase `od`, kdy už měl míru `nabeh` (záznam se dopočítal na poslední chvíli),
 * vmísí se plynule, ať pohled neskočí.
 */
export function miraObrazu(cas: number, okamzik: number, od: number, nabeh: number, tempo = 1): number {
  const mira = miraPohledu(cas, okamzik, tempo);
  if (nabeh <= 0) return mira;
  const zbyva = 1 - hladce(((cas - od) * tempo) / ZABER.vmiseni);
  return Math.max(0, mira - nabeh * zbyva);
}

/** Čas děje, kdy je po záběru: čas běží normálně a pohled je zpátky. */
export function konecZaberu(okamzik: number, tempo = 1): number {
  return okamzik + (ZABER.drzeni + ZABER.odjezd / 2 + ZABER.navrat) / tempo;
}

/**
 * Rychlost přehrávání v záběru. Mezi zvolenou rychlostí a rychlostí záběru se přechází
 * v poměru (z 1× přes 0,3× na 0,1×), ne po stejných dílech: tak zpomalení působí plynule.
 * Kdo už přehrává pomaleji než záběr, toho záběr nezrychlí.
 */
export function rychlostVZaberu(zvolena: number, mira: number, nejpomaleji: number = ZABER.rychlost): number {
  if (!(zvolena > nejpomaleji)) return zvolena;
  return zvolena * Math.pow(nejpomaleji / zvolena, mira);
}

/**
 * Pohled záběru: střed na místě porušení a měřítko takové, aby kus mostu kolem něj zabral
 * necelou polovinu menšího rozměru plátna. Nikdy neoddaluje a přiblíží nejvýš čtyřikrát.
 * Dlouhý prut (pilíř, lano) se nepřibližuje natěsno: kolem něj musí zůstat vidět mostovka
 * a to, co po ní jede.
 */
export function pohledZaberu(domov: Kamera, zaber: Zaber, rozmer: Rozmer, misto: Bod = zaber.misto): Kamera {
  const mensi = Math.min(rozmer.sirka, rozmer.vyska);
  const rozsah = Math.max(zaber.rozsah, 2);
  const chtene = (0.45 * mensi) / rozsah;
  const meritko = Math.min(MERITKO_MAX, domov.meritko * 4, chtene);
  return { x: misto.x, y: misto.y, meritko: Math.max(domov.meritko, meritko) };
}

/** Pohled mezi dvěma pohledy: střed po přímce, měřítko v poměru (zoom působí rovnoměrně). */
export function smichejPohledy(a: Kamera, b: Kamera, mira: number): Kamera {
  const m = mira <= 0 ? 0 : mira >= 1 ? 1 : mira;
  return {
    x: a.x + (b.x - a.x) * m,
    y: a.y + (b.y - a.y) * m,
    meritko: a.meritko * Math.pow(b.meritko / a.meritko, m),
  };
}

/**
 * Kde je v čase `cas` to, co záběr sleduje: padající styčník nebo prut (střed jeho kusů).
 * Od původního místa se vzdálí nejvýš o `ZABER.nejdalSledovani`, ať pohled nesjede za troskami
 * na dno údolí. Když sledovat není co (nebo to ze záznamu zmizelo), místo stojí.
 */
export function sledovaneMisto(zaznam: Zaznam, zaber: Zaber, cas: number, snimek: Snimek = prazdnySnimek()): Bod {
  const cil = zaber.cil;
  if (!cil || cil.druh === "bod") return zaber.misto;
  const stavba = zaznam.stavV(cas, snimek);
  if (!stavba) return zaber.misto;
  let kde: Bod | null = null;
  if (cil.druh === "stycnik") {
    const x = snimek.polohy[2 * cil.stycnik];
    const y = snimek.polohy[2 * cil.stycnik + 1];
    if (x !== undefined && y !== undefined && cil.stycnik < stavba.stycniku) kde = { x, y };
  } else kde = mistoPrutu(stavba, snimek, cil.prut)?.misto ?? null;
  if (!kde) return zaber.misto;
  const dx = kde.x - zaber.misto.x;
  const dy = kde.y - zaber.misto.y;
  const dalka = Math.sqrt(dx * dx + dy * dy);
  if (dalka <= ZABER.nejdalSledovani) return kde;
  const k = ZABER.nejdalSledovani / dalka;
  return { x: zaber.misto.x + dx * k, y: zaber.misto.y + dy * k };
}

/** Událost, na kterou má záběr smysl: první, co se na mostě pokazilo. */
export type UdalostZaberu = Extract<Udalost, { druh: "poruseni" | "sjeti" | "lod" | "pad" }>;

/**
 * První porucha mostu v událostech zkoušky: porušení prutu, sjetí z podpory, náraz lodi do prutu
 * nebo pád někoho z mostu (most může být celý, a přesto z něj někdo sjede: chybí kus mostovky
 * nebo je moc prověšená). Události chodí v pořadí děje; při shodě času vyhrává dřívější.
 * Plastický kloub (prut se trvale ohnul nebo vybočil, ale drží) se počítá taky: je to okamžik,
 * kdy prut povolil.
 */
export function prvniPorucha(udalosti: readonly Udalost[]): UdalostZaberu | null {
  let prvni: UdalostZaberu | null = null;
  for (const u of udalosti) {
    const porucha =
      u.druh === "poruseni" || u.druh === "sjeti" || u.druh === "pad" || (u.druh === "lod" && u.stav === "narazila" && u.prut !== undefined);
    if (porucha && (prvni === null || u.cas < prvni.cas)) prvni = u as UdalostZaberu;
  }
  return prvni;
}

/** Je porucha jen plastický kloub (prut povolil, ale neutrhl se)? */
export function jenKloub(u: UdalostZaberu): boolean {
  return u.druh === "poruseni" && u.nasledek === NASLEDEK_KLOUB;
}

/**
 * Záběr na poruchu `u`: místo se bere ze snímku těsně před ní (po porušení se prut rozpadne
 * na kusy a stavba se změní). U pádu je místem ten, kdo spadl (`ucastnici` říkají, které
 * styčníky mu patří). Null, když záznam k okamžiku ještě nedošel nebo místo nejde určit.
 */
export function zaberNaPoruchu(
  zaznam: Zaznam,
  u: UdalostZaberu,
  ucastnici: readonly { polozka: number; clen: number; kola: readonly number[] }[] = [],
): Zaber | null {
  if (zaznam.konec < u.cas) return null;
  const snimek = prazdnySnimek();
  const stavba = zaznam.stavV(Math.max(0, u.cas - 1e-3), snimek);
  if (!stavba) return null;
  const naStycnik = (stycnik: number | undefined): Zaber | null => {
    if (stycnik === undefined) return null;
    const x = snimek.polohy[2 * stycnik];
    const y = snimek.polohy[2 * stycnik + 1];
    return x === undefined || y === undefined ? null : { okamzik: u.cas, misto: { x, y }, rozsah: 4, cil: { druh: "stycnik", stycnik } };
  };
  if (u.druh === "sjeti") return naStycnik(u.stycnik);
  if (u.druh === "pad") return naStycnik(ucastnici.find((p) => p.polozka === u.polozka && p.clen === u.clen)?.kola[0]);
  const kde = mistoPrutu(stavba, snimek, u.prut!);
  return kde ? { okamzik: u.cas, misto: kde.misto, rozsah: kde.rozsah, cil: { druh: "prut", prut: u.prut! } } : null;
}

// ——— Klidné úseky zkoušky ———

/**
 * Dlouhá zkouška (dav jde mostem přes minutu, tři útvary za sebou, budič přelaďuje přes celý
 * rozsah) je z velké části klidná: most je daleko od meze kmitání i únosnosti a není na co se
 * dívat. Přehrávání takové úseky samo zrychlí a k tomu, co stojí za vidění, se vrátí zvolenou
 * rychlostí. Dva stupně: **prázdno** (přes most nikdo nejde, nic se nehýbe, neproplouvá loď)
 * a **klid** (někdo jde, ale most se sotva hýbe a žádný prut není blízko meze).
 */
export const HLUCHO = {
  /** Jak dlouhý úsek stojí za zrychlení, s. */
  nejkratsi: 3,
  /** Jak dlouho po začátku úseku zrychlení začne a jak dlouho před jeho koncem skončí, s. */
  odstup: 0.75,
  predstih: 1.5,
  /** Rychlost přehrávání, když je most prázdný, a když je na něm klid (násobek skutečného času). */
  rychlost: 8,
  rychlostKlidu: 3,
  /** Od jakého okamžitého kmitání mostovky (m/s²) a rychlosti styčníku (m/s) se prázdný most ještě hýbe. */
  kmitani: 0.05,
  pohyb: 0.02,
  /** Kolikrát smí prázdný most oba prahy překročit, než prázdným být přestane (hystereze). */
  drzeniPrazdna: 3,
  /** Od jakého využití prutu a rychlosti styčníku mostu (m/s) už klid není. */
  vyuziti: 0.7,
  pohybKlidu: 0.3,
  /**
   * Jak dlouhá zkouška (s) je dlouhá: kratší se zrychluje, jen když je most prázdný. Půlminutová
   * zkouška, po které jdou lidé celou dobu, by se jinak přehrála skoro celá zrychleně (1-02,
   * 2-01) a hráč by svůj most pod provozem neviděl; zkracovat stojí za to minutové průvody.
   */
  dlouha: 45,
  /** Jak dlouhý úsek stupně „klid“ stojí za zrychlení, s: kratší by rychlost jen přepínaly. */
  nejkratsiKlid: 6,
  /**
   * Kmitání pod lidmi: klid je pod tímhle podílem meze úrovně, nebo pod podílem špičky téže
   * zkoušky (most s lidmi kmitá skoro pořád a vidět stojí za to chvíle, kdy kmitá nejvíc),
   * nikdy ale nad stropem (podíl meze): chvíle, kdy most mez překročí, se nezrychluje.
   */
  podilMeze: 0.5,
  podilSpicky: 0.6,
  stropMeze: 0.8,
  /** Budič: klid je pod tímhle podílem největšího kmitání, které našel. */
  podilSpickyBudice: 0.3,
  /** Kolik sekund kolem okamžiku největšího využití prutu se přehrává zvolenou rychlostí. */
  okoliSpicky: 2,
  /** O kolik sekund dřív a později než brzdění vozidla (nebo průjezd lodi) klid končí a začíná. */
  okoliDeje: 1,
} as const;

/** Stav účastníka provozu „jede“ (viz `src/zkouska/provoz.ts`); tady jen číslo, ať režie nezná zkoušku. */
const UCASTNIK_JEDE = 1;

/** Úsek děje, který se přehrává zrychleně: od, do (s) a kolikrát rychleji. */
export interface KlidnyUsek {
  od: number;
  po: number;
  rychlost: number;
}

/** Co klidné úseky potřebují vědět o zkoušce navíc k záznamu. */
export interface VolbyKlidu {
  /** Úseky, kdy se něco děje, i když to ze záznamu není poznat (průjezd lodi). */
  rusno?: readonly (readonly [number, number])[];
  /**
   * Od jakého okamžitého kmitání mostovky (m/s²) už klid není: zlomek meze úrovně, u budiče
   * zlomek největšího kmitání, které našel. Bez údaje se ke kmitání nepřihlíží.
   */
  kmitani?: number;
  /**
   * Zrychlit jen úseky, kdy na mostě nikdo není. Krátká zkouška se má vidět celá: stupeň
   * „klid“ (někdo jde, ale most je daleko od mezí) je pro zkoušky dlouhé aspoň `HLUCHO.dlouha`.
   */
  jenPrazdno?: boolean;
}

/**
 * Od jakého okamžitého kmitání mostovky už most pod lidmi v klidu není: `mez` je mez kmitání
 * úrovně, `spicka` největší započítané kmitání téže zkoušky (m/s²).
 */
export function prahKmitaniKlidu(mez: number, spicka: number): number {
  return Math.min(HLUCHO.stropMeze * mez, Math.max(HLUCHO.podilMeze * mez, HLUCHO.podilSpicky * spicka));
}

/** Událost, po které už most není, co byl: od ní dál se nic nezrychluje. Průjezd ani zvedání mostu to nejsou. */
function jeNehoda(u: Udalost): boolean {
  return (
    u.druh === "poruseni" ||
    u.druh === "sjeti" ||
    u.druh === "pad" ||
    (u.druh === "pohyb" && u.faze === "preklopeno") ||
    (u.druh === "lod" && u.stav === "narazila")
  );
}

/** Co o zkoušce vědí ti, kdo ji přehrávají, a klidné úseky to potřebují. */
export interface PodkladyKlidu {
  /** Mez kmitání úrovně, m/s². */
  mez: number;
  /** Zkouška s budičem: kmitání se měří proti špičce, kterou budič našel, ne proti mezi. */
  budic: boolean;
  /** Lodě úrovně: kdy vyplouvají a jak dlouho plují pod mostem, s. */
  lode: readonly { cas: number; trvani: number }[];
  /** Účastníci provozu; zajímá nás jen brzdění (odkdy brzdí a kdy se zase rozjíždí). */
  ucastnici: readonly { brzdeni?: { od: number; rozjezd: number } }[];
  /** Události zkoušky; klid končí první nehodou (porušení, sjetí z podpory, pád, překlopení, náraz lodi). */
  udalosti: readonly Udalost[];
  /** Počítá se kmitání v tomhle snímku do hodnocení (jdou po mostě lidé)? */
  pocitaSe: (snimek: Snimek) => boolean;
  /** Od jak dlouhé zkoušky (s) se zrychluje i stupeň „klid“; bez údaje `HLUCHO.dlouha`. */
  dlouha?: number;
}

/**
 * Klidné úseky zkoušky tak, jak je hra přehrává: k záznamu přidá, co ze samotných snímků
 * poznat není. Zvolenou rychlostí zůstává průjezd lodi, brzdění vozidla na mostě, všechno od
 * první události dál (padající lidi a trosky si hráč prohlédne) a kmitání u meze úrovně.
 */
export function klidneUsekyZkousky(zaznam: Zaznam, podklady: PodkladyKlidu): KlidnyUsek[] {
  const { snimky } = zaznam;
  const konec = snimky[snimky.length - 1]?.cas ?? 0;
  // Špička se bere jen z kmitání, které se počítá: prázdnou mostovku rozhoupe i dodávka.
  let spicka = 0;
  let casSpicky = -Infinity;
  for (const s of snimky) {
    if (s.kmitani > spicka && (podklady.budic || podklady.pocitaSe(s))) {
      spicka = s.kmitani;
      casSpicky = s.cas;
    }
  }
  const kmitani = podklady.budic ? HLUCHO.podilSpickyBudice * spicka : prahKmitaniKlidu(podklady.mez, spicka);
  const rusno: (readonly [number, number])[] = podklady.lode.map((lod) => [lod.cas - HLUCHO.okoliDeje, lod.cas + lod.trvani + HLUCHO.okoliDeje]);
  // Chvíle, kdy most pod lidmi kmital nejvíc, je ta, o které mluví výsledek: i když je daleko
  // od meze, přehraje se zvolenou rychlostí.
  if (spicka >= HLUCHO.kmitani) rusno.push([casSpicky - HLUCHO.okoliSpicky, casSpicky + HLUCHO.okoliSpicky]);
  for (const u of podklady.ucastnici) {
    // Brzdění, stání a první chvíle rozjezdu; těžký vlak se pak rozjíždí dlouho a už se nic neděje.
    if (u.brzdeni) rusno.push([u.brzdeni.od - HLUCHO.okoliDeje, u.brzdeni.rozjezd + HLUCHO.okoliDeje]);
  }
  let prvni = Infinity;
  for (const u of podklady.udalosti) if (jeNehoda(u) && u.cas < prvni) prvni = u.cas;
  if (prvni < Infinity) rusno.push([prvni - HLUCHO.predstih, Infinity]);
  return klidneUseky(zaznam, {
    rusno,
    ...(kmitani > 0 ? { kmitani } : {}),
    // Krátká zkouška se má vidět celá: zrychlí se v ní jen čekání na prázdném mostě.
    jenPrazdno: konec < (podklady.dlouha ?? HLUCHO.dlouha) && !podklady.budic,
  });
}

/**
 * Klidné úseky záznamu zkoušky, zkrácené o odstup na začátku a předstih na konci. Úsek, který
 * sahá až na konec záznamu, je klidný až do konce. Okolí okamžiku, kdy byl některý prut
 * využitý nejvíc za celou zkoušku, se stupněm „klid“ nezrychluje: je to chvíle, o které mluví
 * výsledek, i když je most daleko od meze.
 */
export function klidneUseky(zaznam: Zaznam, volby: VolbyKlidu = {}): KlidnyUsek[] {
  const { snimky } = zaznam;
  const rusno = volby.rusno ?? [];
  const useky: KlidnyUsek[] = [];
  let casSpicky = -Infinity;
  let nejvetsiVyuziti = 0;
  for (const s of snimky) {
    for (let e = 0; e < s.vyuziti.length; e++) {
      const v = Math.abs(s.vyuziti[e]!);
      if (v > nejvetsiVyuziti) {
        nejvetsiVyuziti = v;
        casSpicky = s.cas;
      }
    }
  }
  let zacatek = 0;
  let stupen = 0;
  const uzavri = (konec: number, doKonce: boolean): void => {
    if (stupen > 0) {
      const od = zacatek + HLUCHO.odstup;
      const po = doKonce ? konec : konec - HLUCHO.predstih;
      const nejkratsi = stupen === 2 ? HLUCHO.nejkratsi : HLUCHO.nejkratsiKlid;
      if (po - od >= nejkratsi) useky.push({ od, po, rychlost: stupen === 2 ? HLUCHO.rychlost : HLUCHO.rychlostKlidu });
    }
    stupen = 0;
  };
  for (let i = 0; i < snimky.length; i++) {
    const s = snimky[i]!;
    const minuly = snimky[i - 1];
    // 2 prázdno, 1 klid, 0 něco se děje.
    let ted = rusno.some(([od, po]) => s.cas >= od && s.cas <= po) || (minuly !== undefined && minuly.topologie !== s.topologie) ? 0 : 2;
    // Prázdný most, který doznívá (křídlo po dosednutí), se kolem prahu „hýbe / nehýbe“ přepíná
    // snímek od snímku a žádný úsek by nevydržel tři sekundy. Kdo už prázdný je, zůstává jím do
    // trojnásobku prahu.
    const drzi = stupen === 2 ? HLUCHO.drzeniPrazdna : 1;
    if (ted === 2 && s.kmitani >= HLUCHO.kmitani * drzi) ted = 1;
    if (ted === 2) for (let k = 0; k < s.provoz.length; k++) if (s.provoz[k] === UCASTNIK_JEDE) ted = 1;
    if (ted > 0 && volby.kmitani !== undefined && s.kmitani >= volby.kmitani) ted = 0;
    if (ted > 0) {
      for (let e = 0; e < s.vyuziti.length; e++) {
        const v = s.vyuziti[e]!;
        if (v >= HLUCHO.vyuziti || v <= -HLUCHO.vyuziti) {
          ted = 0;
          break;
        }
      }
    }
    if (ted > 0 && minuly && minuly.polohy.length === s.polohy.length && s.cas > minuly.cas) {
      // Jak rychle se most hýbe (zvedá se, dosedá, doznívá). Styčníky břemen se nepočítají:
      // kdo most přejel, jede dál a nikoho už nezajímá.
      const znacky = zaznam.topologie[s.topologie]?.znacky;
      const mezPrazdna = HLUCHO.pohyb * drzi * (s.cas - minuly.cas);
      const mezKlidu = HLUCHO.pohybKlidu * (s.cas - minuly.cas);
      for (let k = 0; k < s.polohy.length && ted > 0; k++) {
        if (znacky?.[k >> 1] === STYCNIK_SKRYTY) continue;
        const posun = Math.abs(s.polohy[k]! - minuly.polohy[k]!);
        if (posun > mezKlidu) ted = 0;
        else if (posun > mezPrazdna) ted = 1;
      }
    }
    if (ted === 1 && (volby.jenPrazdno || Math.abs(s.cas - casSpicky) <= HLUCHO.okoliSpicky)) ted = 0;
    if (ted !== stupen) {
      uzavri(s.cas, false);
      stupen = ted;
      zacatek = s.cas;
    }
  }
  const posledni = snimky[snimky.length - 1];
  if (posledni) uzavri(posledni.cas, true);
  return useky;
}

/** Klidný úsek, ve kterém leží čas `cas`; null, když v žádném. */
export function klidnyUsek(useky: readonly KlidnyUsek[], cas: number): KlidnyUsek | null {
  for (const usek of useky) if (cas >= usek.od && cas < usek.po) return usek;
  return null;
}
