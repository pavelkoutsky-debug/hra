// Havarijní komise: případy, ve kterých hráč dostane cizí most, který spadl, a má ho opravit
// nejvýš několika změnami. Tady je tvar případu a pravidla, která nepotřebují zkoušku; samotné
// případy jsou v `urovne/havarie/` a jejich řešitelnost hlídá `test/havarie.test.ts`.
// Bez prohlížeče.

import type { NavrhMostu } from "./navrh";
import type { Uroven } from "./uroven";
import { zmenyMostu, type ZmenaMostu } from "./zmeny";

/** Kolika změnami smí hráč spadlý most opravit. */
export const NEJVIC_ZMEN_OPRAVY = 3;
/** Kapitola, pod kterou mají případy svá id úrovní (9-01, 9-02, …); do kampaně nepatří. */
export const KAPITOLA_HAVARII = "9";

export interface PripadHavarie {
  /**
   * Údolí, provoz a paleta případu jako úroveň s id `9-xx`. Rozpočet ani medaile nemá: jde
   * o to, aby most po opravě prošel.
   */
  uroven: Uroven;
  /** Ke které kapitole kampaně případ patří: odemyká se s ní a říká, co má hráč umět. */
  kapitola: string;
  /** Most, který spadl, tak jak ho komise dostala. Zkouškou neprojde. */
  most: NavrhMostu;
  /** Oprava komise: původní most po nejvýš `NEJVIC_ZMEN_OPRAVY` změnách, který zkouškou projde. */
  oprava: NavrhMostu;
  /** Opravy, které se nabízejí, ale nestačí; zkouškou neprojdou (pro testy a autory). */
  slepe?: { nazev: string; navrh: NavrhMostu }[];
}

/** Je `id` id úrovně případu Havarijní komise? */
export function jeIdPripadu(id: string): boolean {
  return id.startsWith(`${KAPITOLA_HAVARII}-`);
}

/** Pořadové číslo případu z id jeho úrovně (9-03 → 3). */
export function cisloPripadu(id: string): number {
  return Number(id.slice(KAPITOLA_HAVARII.length + 1));
}

/** Stav opravy: čím se most na výkresu liší od spadlého a jestli se to vejde do dovolených změn. */
export interface StavOpravy {
  zmeny: ZmenaMostu[];
  /** Kolik změn ještě zbývá; záporné, když jich je moc. */
  zbyva: number;
  /** Smí se s tímhle mostem ke zkoušce? (Aspoň jedna změna a nejvýš dovolený počet.) */
  platna: boolean;
}

export function stavOpravy(pripad: PripadHavarie, navrh: NavrhMostu): StavOpravy {
  const zmeny = zmenyMostu(pripad.most, navrh);
  return { zmeny, zbyva: NEJVIC_ZMEN_OPRAVY - zmeny.length, platna: zmeny.length <= NEJVIC_ZMEN_OPRAVY };
}

/** Postup hráče v Havarijní komisi: id případu → nejmenší počet změn, kterým ho uzavřel. */
export type PostupHavarii = Record<string, number>;

/**
 * Přečte postup z textu v paměti prohlížeče. Nečitelný zápis je prázdný postup; položka, která
 * nedává smysl (jiné id, počet mimo 1 až `NEJVIC_ZMEN_OPRAVY`), se zahodí.
 */
export function postupHavariiZTextu(zapis: string | null): PostupHavarii {
  if (zapis === null) return {};
  let data: unknown;
  try {
    data = JSON.parse(zapis);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  const postup: PostupHavarii = {};
  for (const [id, zmen] of Object.entries(data)) {
    if (/^\d-\d\d$/.test(id) && jeIdPripadu(id) && typeof zmen === "number" && Number.isInteger(zmen) && zmen >= 1 && zmen <= NEJVIC_ZMEN_OPRAVY) {
      postup[id] = zmen;
    }
  }
  return postup;
}

/** Zapíše uzavření případu `zmen` změnami; lepší dřívější výsledek nechá. Vrací nový postup. */
export function zapisUzavreni(postup: PostupHavarii, id: string, zmen: number): PostupHavarii {
  const drive = postup[id];
  if (drive !== undefined && drive <= zmen) return postup;
  return { ...postup, [id]: zmen };
}

/**
 * Které případy jsou otevřené: případ se otevírá, když je v kampani projitá aspoň jedna úroveň
 * jeho kapitoly (hráč zná nástroje, které k opravě potřebuje), nebo když ho už uzavřel.
 */
export function otevrenePripady(pripady: readonly PripadHavarie[], projiteUrovne: ReadonlySet<string>, postup: PostupHavarii): Set<string> {
  const kapitoly = new Set([...projiteUrovne].map((id) => id.split("-")[0]!));
  return new Set(pripady.filter((p) => kapitoly.has(p.kapitola) || postup[p.uroven.id] !== undefined).map((p) => p.uroven.id));
}
