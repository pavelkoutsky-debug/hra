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
import { mistoPrutu, prazdnySnimek, type Zaznam } from "../zkouska/zaznam";
import { MERITKO_MAX, type Kamera, type Rozmer } from "../vykres/kamera";

/** Záběr: okamžik děje (s), místo ve světě (m) a jak velký kus mostu má být vidět (m). */
export interface Zaber {
  okamzik: number;
  misto: Bod;
  rozsah: number;
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
  /** Most bez klidové polohy se skládá hned: záběr patří na okamžik, kdy je pohyb už vidět. */
  okamzikSlozeni: OKAMZIK_SLOZENI,
  /** Záběr, který začal pozdě (záznam se teprve dopočítal), se do obrazu vmísí za tuhle dobu děje. */
  vmiseni: 0.06,
} as const;

/** Plynulý náběh z 0 do 1 (na krajích s nulovou rychlostí). */
function hladce(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Míra zpomalení v čase děje `cas`: 0 mimo záběr, 1 kolem okamžiku porušení. */
export function miraZpomaleni(cas: number, okamzik: number): number {
  const zacatek = okamzik - ZABER.najezd;
  const plne = okamzik - ZABER.pred;
  const konecPlneho = okamzik + ZABER.drzeni;
  if (cas <= zacatek || cas >= konecPlneho + ZABER.odjezd) return 0;
  if (cas < plne) return hladce((cas - zacatek) / (plne - zacatek));
  if (cas <= konecPlneho) return 1;
  return 1 - hladce((cas - konecPlneho) / ZABER.odjezd);
}

/** Míra přiblížení pohledu: nabíhá se zpomalením, vrací se až po něm. */
export function miraPohledu(cas: number, okamzik: number): number {
  const zacatek = okamzik - ZABER.najezd;
  const plne = okamzik - ZABER.pred;
  const konecPlneho = okamzik + ZABER.drzeni + ZABER.odjezd / 2;
  if (cas <= zacatek || cas >= konecPlneho + ZABER.navrat) return 0;
  if (cas < plne) return hladce((cas - zacatek) / (plne - zacatek));
  if (cas <= konecPlneho) return 1;
  return 1 - hladce((cas - konecPlneho) / ZABER.navrat);
}

/**
 * Míra záběru v obrazu (pohled, ztmavení, značka). Běžně je to míra pohledu; když ale záběr
 * začal až v čase `od`, kdy už měl míru `nabeh` (záznam se dopočítal na poslední chvíli),
 * vmísí se plynule, ať pohled neskočí.
 */
export function miraObrazu(cas: number, okamzik: number, od: number, nabeh: number): number {
  const mira = miraPohledu(cas, okamzik);
  if (nabeh <= 0) return mira;
  const zbyva = 1 - hladce((cas - od) / ZABER.vmiseni);
  return Math.max(0, mira - nabeh * zbyva);
}

/** Čas děje, kdy je po záběru: čas běží normálně a pohled je zpátky. */
export function konecZaberu(okamzik: number): number {
  return okamzik + ZABER.drzeni + ZABER.odjezd / 2 + ZABER.navrat;
}

/**
 * Rychlost přehrávání v záběru. Mezi zvolenou rychlostí a rychlostí záběru se přechází
 * v poměru (z 1× přes 0,3× na 0,1×), ne po stejných dílech: tak zpomalení působí plynule.
 * Kdo už přehrává pomaleji než záběr, toho záběr nezrychlí.
 */
export function rychlostVZaberu(zvolena: number, mira: number): number {
  if (!(zvolena > ZABER.rychlost)) return zvolena;
  return zvolena * Math.pow(ZABER.rychlost / zvolena, mira);
}

/**
 * Pohled záběru: střed na místě porušení a měřítko takové, aby kus mostu kolem něj zabral
 * necelou polovinu menšího rozměru plátna. Nikdy neoddaluje a přiblíží nejvýš čtyřikrát.
 */
export function pohledZaberu(domov: Kamera, zaber: Zaber, rozmer: Rozmer): Kamera {
  const mensi = Math.min(rozmer.sirka, rozmer.vyska);
  const rozsah = Math.max(zaber.rozsah, 2);
  const chtene = (0.45 * mensi) / rozsah;
  // Aspoň o třetinu blíž, ať je záběr znát i na malém mostě; prut se ale musí vejít celý.
  const meritko = Math.min(MERITKO_MAX, domov.meritko * 4, Math.max(chtene, domov.meritko * 1.35), (0.8 * mensi) / rozsah);
  return { x: zaber.misto.x, y: zaber.misto.y, meritko: Math.max(domov.meritko, meritko) };
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

/** Událost, na kterou má záběr smysl: první, co se na mostě pokazilo. */
export type UdalostZaberu = Extract<Udalost, { druh: "poruseni" | "sjeti" | "lod" }>;

/**
 * První porucha mostu v událostech zkoušky: porušení prutu, sjetí z podpory nebo náraz lodi.
 * Události chodí v pořadí děje, takže první nalezená je první i v čase. Plastický kloub
 * (prut se trvale ohnul nebo vybočil, ale drží) se počítá taky: je to okamžik, kdy prut povolil.
 */
export function prvniPorucha(udalosti: readonly Udalost[]): UdalostZaberu | null {
  let prvni: UdalostZaberu | null = null;
  for (const u of udalosti) {
    const porucha = u.druh === "poruseni" || u.druh === "sjeti" || (u.druh === "lod" && u.stav === "narazila" && u.prut !== undefined);
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
 * na kusy a stavba se změní). Null, když záznam k okamžiku ještě nedošel nebo místo nejde určit.
 */
export function zaberNaPoruchu(zaznam: Zaznam, u: UdalostZaberu): Zaber | null {
  if (zaznam.konec < u.cas) return null;
  const snimek = prazdnySnimek();
  const stavba = zaznam.stavV(Math.max(0, u.cas - 1e-3), snimek);
  if (!stavba) return null;
  if (u.druh === "sjeti") {
    const x = snimek.polohy[2 * u.stycnik];
    const y = snimek.polohy[2 * u.stycnik + 1];
    return x === undefined || y === undefined ? null : { okamzik: u.cas, misto: { x, y }, rozsah: 4 };
  }
  const kde = mistoPrutu(stavba, snimek, u.prut!);
  return kde ? { okamzik: u.cas, misto: kde.misto, rozsah: kde.rozsah } : null;
}
