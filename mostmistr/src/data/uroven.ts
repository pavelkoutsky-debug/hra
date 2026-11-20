import type { Bod, Obdelnik } from "./geometrie";
import { jeUvnitr } from "./geometrie";
import { ID_PROVOZU, ID_PRVKU, type IdProvozu, type IdPrvku } from "./katalog";
import {
  ChybaDat,
  cislo,
  jedenZ,
  jenZnameKlice,
  logicka,
  neboNull,
  objekt,
  polozky,
  text,
  volitelne,
} from "./kontrola";
import { prevedNaAktualni, type Prevod } from "./prevody";

export const VERZE_UROVNE = 1;

/** Převody ze starších verzí formátu úrovně; viz `prevedNaAktualni`. */
const PREVODY_UROVNE: readonly Prevod[] = [];

export const TYPY_KOTEV = ["pevna", "posuvna", "vetknuti"] as const;
export type TypKotvy = (typeof TYPY_KOTEV)[number];

/** Podpora daná úrovní. Styčník návrhu na stejném místě je v ní uložen. */
export interface Kotva extends Bod {
  typ: TypKotvy;
}

export const DRUHY_TRAS = ["lavka", "silnice", "kolej"] as const;
export type DruhTrasy = (typeof DRUHY_TRAS)[number];

/** Trasa provozu: od konce jednoho předmostí ke druhému. Mezi nimi hráč staví mostovku. */
export interface Trasa {
  id: string;
  druh: DruhTrasy;
  zacatek: Bod;
  konec: Bod;
}

export const TRIDY_NEROVNOSTI = ["A", "B", "C"] as const;
/** Třída nerovnosti vozovky podle normového profilu: A nová, C rozbitá. */
export type TridaNerovnosti = (typeof TRIDY_NEROVNOSTI)[number];

export const DRUHY_BONUSU = ["rezerva", "komfort-chodcu", "komfort-cestujicich"] as const;
/** Podmínka mistrovské medaile: největší využití, nebo největší zrychlení v m/s². */
export interface BonusUrovne {
  druh: (typeof DRUHY_BONUSU)[number];
  limit: number;
}

export interface PolozkaJizdnihoRadu {
  /** Čas vstupu na trasu v sekundách od začátku zkoušky. */
  cas: number;
  trasa: string;
  /** 1 = od začátku trasy ke konci, −1 = protisměr. */
  smer: 1 | -1;
  druh: IdProvozu;
  /** Počet lidí nebo vozidel ve skupině. */
  pocet?: number;
  /** Kroková frekvence v Hz u lidí. */
  kadence?: number;
}

export interface Uroven {
  verze: typeof VERZE_UROVNE;
  /** Kapitola a pořadí, například "2-03". */
  id: string;
  nazev: string;
  /** Rozsah výkresu; mimo něj nelze stavět ani odjet kamerou. */
  vyrez: Obdelnik;
  /** Povrch terénu zleva doprava, x ostře roste. Za krajními body pokračuje vodorovně. */
  teren: Bod[];
  /** Výška hladiny, nebo null, když v úrovni voda není. */
  hladina: number | null;
  kotvy: Kotva[];
  /** Místa, kde smí stát pilíř. */
  zaklady: Bod[];
  /** Oblasti, kam se nesmí stavět (průjezdný profil, plavební dráha). */
  zakazaneZony: Obdelnik[];
  trasy: Trasa[];
  /** Šířka mostovky v metrech; určuje hmotnost na metr a počet lidí vedle sebe. */
  sirkaMostovky: number;
  /** Hmotnost zábradlí a vozovkových vrstev v kg na metr délky mostovky. */
  hmotnostVybaveni: number;
  nerovnost: TridaNerovnosti;
  /** Povolený rozpočet v Kč, nebo null bez omezení. */
  rozpocet: number | null;
  /** Přísnější rozpočet pro medaili; null, když úroveň medaili za rozpočet nemá. */
  inzenyrskyRozpocet: number | null;
  mistrovska: BonusUrovne | null;
  povolenePrvky: IdPrvku[];
  povoleneSvary: boolean;
  jizdniRad: PolozkaJizdnihoRadu[];
}

const KLICE_UROVNE = [
  "verze",
  "id",
  "nazev",
  "vyrez",
  "teren",
  "hladina",
  "kotvy",
  "zaklady",
  "zakazaneZony",
  "trasy",
  "sirkaMostovky",
  "hmotnostVybaveni",
  "nerovnost",
  "rozpocet",
  "inzenyrskyRozpocet",
  "mistrovska",
  "povolenePrvky",
  "povoleneSvary",
  "jizdniRad",
] as const;

function bod(h: unknown, cesta: string): Bod {
  const o = objekt(h, cesta);
  return { x: cislo(o.x, `${cesta}.x`), y: cislo(o.y, `${cesta}.y`) };
}

/** Bod na rastru 1 m: stavět lze jen na celých metrech. */
function bodNaRastru(h: unknown, cesta: string): Bod {
  const o = objekt(h, cesta);
  return {
    x: cislo(o.x, `${cesta}.x`, { cele: true }),
    y: cislo(o.y, `${cesta}.y`, { cele: true }),
  };
}

function obdelnik(h: unknown, cesta: string): Obdelnik {
  const o = objekt(h, cesta);
  const r: Obdelnik = {
    xMin: cislo(o.xMin, `${cesta}.xMin`),
    yMin: cislo(o.yMin, `${cesta}.yMin`),
    xMax: cislo(o.xMax, `${cesta}.xMax`),
    yMax: cislo(o.yMax, `${cesta}.yMax`),
  };
  if (r.xMax <= r.xMin || r.yMax <= r.yMin) throw new ChybaDat(cesta, "obdélník má nulovou nebo zápornou plochu");
  return r;
}

function kotva(h: unknown, cesta: string): Kotva {
  const o = objekt(h, cesta);
  return { ...bodNaRastru(h, cesta), typ: jedenZ(o.typ, `${cesta}.typ`, TYPY_KOTEV) };
}

function trasa(h: unknown, cesta: string): Trasa {
  const o = objekt(h, cesta);
  const t: Trasa = {
    id: text(o.id, `${cesta}.id`),
    druh: jedenZ(o.druh, `${cesta}.druh`, DRUHY_TRAS),
    zacatek: bodNaRastru(o.zacatek, `${cesta}.zacatek`),
    konec: bodNaRastru(o.konec, `${cesta}.konec`),
  };
  if (t.konec.x <= t.zacatek.x) throw new ChybaDat(cesta, "konec trasy musí ležet vpravo od začátku");
  return t;
}

function polozkaJizdnihoRadu(h: unknown, cesta: string): PolozkaJizdnihoRadu {
  const o = objekt(h, cesta);
  const smer = cislo(o.smer, `${cesta}.smer`, { cele: true });
  if (smer !== 1 && smer !== -1) throw new ChybaDat(`${cesta}.smer`, "směr je 1 nebo −1");
  const p: PolozkaJizdnihoRadu = {
    cas: cislo(o.cas, `${cesta}.cas`, { min: 0 }),
    trasa: text(o.trasa, `${cesta}.trasa`),
    smer,
    druh: jedenZ(o.druh, `${cesta}.druh`, ID_PROVOZU),
  };
  const pocet = volitelne(o.pocet, (v) => cislo(v, `${cesta}.pocet`, { min: 1, cele: true }));
  if (pocet !== undefined) p.pocet = pocet;
  const kadence = volitelne(o.kadence, (v) => cislo(v, `${cesta}.kadence`, { min: 0.5, max: 5 }));
  if (kadence !== undefined) p.kadence = kadence;
  return p;
}

function stejnyBod(a: Bod, b: Bod): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Přečte úroveň z dat neznámého tvaru: převede starší verzi formátu, zkontroluje
 * typy i vnitřní souvislosti. Při chybě vyhodí `ChybaDat` s cestou k místu chyby.
 */
export function nactiUroven(data: unknown): Uroven {
  const c = "uroven";
  const o = prevedNaAktualni(data, VERZE_UROVNE, PREVODY_UROVNE, c);
  jenZnameKlice(o, c, KLICE_UROVNE);

  const id = text(o.id, `${c}.id`);
  if (!/^\d-\d\d$/.test(id)) throw new ChybaDat(`${c}.id`, 'očekáván tvar "kapitola-pořadí", např. "2-03"');

  const uroven: Uroven = {
    verze: VERZE_UROVNE,
    id,
    nazev: text(o.nazev, `${c}.nazev`),
    vyrez: obdelnik(o.vyrez, `${c}.vyrez`),
    teren: polozky(o.teren, `${c}.teren`, bod),
    hladina: neboNull(o.hladina, (v) => cislo(v, `${c}.hladina`)),
    kotvy: polozky(o.kotvy, `${c}.kotvy`, kotva),
    zaklady: polozky(o.zaklady, `${c}.zaklady`, bodNaRastru),
    zakazaneZony: polozky(o.zakazaneZony, `${c}.zakazaneZony`, obdelnik),
    trasy: polozky(o.trasy, `${c}.trasy`, trasa),
    sirkaMostovky: cislo(o.sirkaMostovky, `${c}.sirkaMostovky`, { min: 1, max: 30 }),
    hmotnostVybaveni: cislo(o.hmotnostVybaveni, `${c}.hmotnostVybaveni`, { min: 0 }),
    nerovnost: jedenZ(o.nerovnost, `${c}.nerovnost`, TRIDY_NEROVNOSTI),
    rozpocet: neboNull(o.rozpocet, (v) => cislo(v, `${c}.rozpocet`, { min: 0 })),
    inzenyrskyRozpocet: neboNull(o.inzenyrskyRozpocet, (v) => cislo(v, `${c}.inzenyrskyRozpocet`, { min: 0 })),
    mistrovska: neboNull(o.mistrovska, (v) => {
      const b = objekt(v, `${c}.mistrovska`);
      return {
        druh: jedenZ(b.druh, `${c}.mistrovska.druh`, DRUHY_BONUSU),
        limit: cislo(b.limit, `${c}.mistrovska.limit`, { min: 0 }),
      };
    }),
    povolenePrvky: polozky(o.povolenePrvky, `${c}.povolenePrvky`, (v, cesta) => jedenZ(v, cesta, ID_PRVKU)),
    povoleneSvary: logicka(o.povoleneSvary, `${c}.povoleneSvary`),
    jizdniRad: polozky(o.jizdniRad, `${c}.jizdniRad`, polozkaJizdnihoRadu),
  };

  zkontrolujSouvislosti(uroven, c);
  return uroven;
}

function zkontrolujSouvislosti(u: Uroven, c: string): void {
  if (u.teren.length < 2) throw new ChybaDat(`${c}.teren`, "terén potřebuje aspoň dva body");
  for (let i = 1; i < u.teren.length; i++) {
    const predchozi = u.teren[i - 1]!;
    const tento = u.teren[i]!;
    if (tento.x <= predchozi.x) throw new ChybaDat(`${c}.teren[${i}]`, "x musí zleva doprava ostře růst");
  }

  u.kotvy.forEach((k, i) => {
    if (!jeUvnitr(u.vyrez, k)) throw new ChybaDat(`${c}.kotvy[${i}]`, "kotva leží mimo výřez");
    if (u.kotvy.findIndex((j) => stejnyBod(j, k)) !== i) {
      throw new ChybaDat(`${c}.kotvy[${i}]`, "dvě kotvy na stejném místě");
    }
  });
  u.zaklady.forEach((z, i) => {
    if (!jeUvnitr(u.vyrez, z)) throw new ChybaDat(`${c}.zaklady[${i}]`, "základ leží mimo výřez");
  });

  if (u.trasy.length === 0) throw new ChybaDat(`${c}.trasy`, "úroveň potřebuje aspoň jednu trasu");
  u.trasy.forEach((t, i) => {
    if (u.trasy.findIndex((j) => j.id === t.id) !== i) throw new ChybaDat(`${c}.trasy[${i}].id`, "id trasy se opakuje");
    for (const [jmeno, b] of [["zacatek", t.zacatek], ["konec", t.konec]] as const) {
      if (!u.kotvy.some((k) => stejnyBod(k, b))) {
        throw new ChybaDat(`${c}.trasy[${i}].${jmeno}`, "konec trasy musí ležet na kotvě");
      }
    }
  });

  u.jizdniRad.forEach((p, i) => {
    if (!u.trasy.some((t) => t.id === p.trasa)) {
      throw new ChybaDat(`${c}.jizdniRad[${i}].trasa`, `trasa "${p.trasa}" v úrovni není`);
    }
  });

  if (u.rozpocet !== null && u.inzenyrskyRozpocet !== null && u.inzenyrskyRozpocet > u.rozpocet) {
    throw new ChybaDat(`${c}.inzenyrskyRozpocet`, "inženýrský rozpočet nesmí být vyšší než povolený");
  }
  if (new Set(u.povolenePrvky).size !== u.povolenePrvky.length) {
    throw new ChybaDat(`${c}.povolenePrvky`, "prvek je uveden dvakrát");
  }
}

/** Výška terénu v místě x; mimo zadané body pokračuje terén vodorovně. */
export function vyskaTerenu(u: Uroven, x: number): number {
  const body = u.teren;
  const prvni = body[0]!;
  const posledni = body[body.length - 1]!;
  if (x <= prvni.x) return prvni.y;
  if (x >= posledni.x) return posledni.y;
  for (let i = 1; i < body.length; i++) {
    const a = body[i - 1]!;
    const b = body[i]!;
    if (x <= b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return posledni.y;
}
