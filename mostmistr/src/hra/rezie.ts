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
import { mistoPrutu, prazdnySnimek, type Snimek, type Zaznam } from "../zkouska/zaznam";
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
