// Referenční mosty pro měření výkonu: příhradový most s dolní mostovkou.

import type { PopisSoustavy } from "../src/jadro/soustava";
import { PRUREZY, type IdPrurezu, type Prurez } from "./prurezy";

export interface ZadaniMostu {
  /** Počet polí příhrady. */
  poli: number;
  /** Délka pole a výška příhrady v metrech. */
  delkaPole: number;
  vyska: number;
  /** Podpora pod každým n-tým dolním styčníkem (pilíře); krajní jsou podepřené vždy. */
  podporaPo: number;
  /** Všechny styčníky svařené; jinak kloubová příhrada. */
  svarene: boolean;
  /** Průřez prutů příhrady; výchozí je lehký ocelový nosník. */
  prut?: IdPrurezu;
}

export interface ReferencniMost {
  popis: PopisSoustavy;
  /** Indexy styčníků mostovky zleva doprava. */
  mostovka: number[];
}

/**
 * Prattova příhrada: dolní pás tvoří mostovku, k němu horní pás, svislice a diagonály
 * klesající ke středu. Má 2·(poli + 1) styčníků a 4·poli + 1 prutů.
 */
export function prihradovyMost(z: ZadaniMostu): ReferencniMost {
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  const dolni = (i: number): number => i;
  const horni = (i: number): number => z.poli + 1 + i;

  for (let i = 0; i <= z.poli; i++) popis.stycniky.push({ x: i * z.delkaPole, y: 0 });
  for (let i = 0; i <= z.poli; i++) popis.stycniky.push({ x: i * z.delkaPole, y: z.vyska });
  for (let i = 0; i <= z.poli; i += z.podporaPo) popis.stycniky[dolni(i)]!.pevneY = true;
  popis.stycniky[dolni(z.poli)]!.pevneY = true;
  popis.stycniky[dolni(0)]!.pevneX = true;

  const pridej = (prurez: Prurez, a: number, b: number): void => {
    popis.prvky.push({ ...prurez, a, b, kloubA: !z.svarene, kloubB: !z.svarene });
  };
  const prut = PRUREZY[z.prut ?? "ocel-lehka"];
  for (let i = 0; i < z.poli; i++) {
    pridej(PRUREZY["mostovka-drevo"], dolni(i), dolni(i + 1));
    pridej(prut, horni(i), horni(i + 1));
    const kStredu = i < z.poli / 2;
    pridej(prut, kStredu ? horni(i) : dolni(i), kStredu ? dolni(i + 1) : horni(i + 1));
  }
  for (let i = 0; i <= z.poli; i++) pridej(prut, dolni(i), horni(i));

  return { popis, mostovka: Array.from({ length: z.poli + 1 }, (_, i) => dolni(i)) };
}

export interface ReferencniZadani extends ZadaniMostu {
  nazev: string;
  /** Počet kol, která po mostě jedou. */
  kol: number;
}

/** Tři velikosti mostů, na kterých se měří výkon. */
export const REFERENCNI_MOSTY: readonly Omit<ReferencniZadani, "svarene">[] = [
  { nazev: "běžná úroveň", poli: 12, delkaPole: 2, vyska: 3, podporaPo: 12, kol: 12 },
  { nazev: "velká úroveň", poli: 30, delkaPole: 2, vyska: 3, podporaPo: 15, kol: 30 },
  { nazev: "největší most", poli: 149, delkaPole: 1, vyska: 2, podporaPo: 25, kol: 60 },
];
