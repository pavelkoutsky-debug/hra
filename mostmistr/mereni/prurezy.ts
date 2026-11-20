// Předběžné průřezy prvků katalogu pro měření v milníku M1a.
// Hodnoty vycházejí z běžných tabulek profilů a materiálů; do katalogu hry přejdou
// až v M1b po ověření proti normám. Pro měření kroku a výkonu na přesných hodnotách
// nezáleží: rozhoduje rychlost podélné vlny √(E/ρ), která je u oceli i dřeva kolem 5 200 m/s.

import { LANO, NOSNIK, type PopisPrvku } from "../src/jadro/soustava";

export type Prurez = Omit<PopisPrvku, "a" | "b">;

interface Material {
  E: number;
  G: number;
  hustota: number;
}

const OCEL: Material = { E: 210e9, G: 81e9, hustota: 7850 };
const DREVO: Material = { E: 11.5e9, G: 0.65e9, hustota: 420 };
const BETON: Material = { E: 33e9, G: 13.75e9, hustota: 2500 };

/** Průřez zadaný plochou A, momentem setrvačnosti I a smykovou plochou A_s (vše v metrech). */
function prurez(m: Material, A: number, I: number, As: number, hmotaNavic = 0): Prurez {
  return {
    druh: NOSNIK,
    EA: m.E * A,
    EI: m.E * I,
    GAs: m.G * As,
    hmotnostNaMetr: m.hustota * A + hmotaNavic,
    polomerSetrvacnosti: Math.sqrt(I / A),
  };
}

const obdelnik = (m: Material, sirka: number, vyska: number, hmotaNavic = 0): Prurez =>
  prurez(m, sirka * vyska, (sirka * vyska ** 3) / 12, (5 / 6) * sirka * vyska, hmotaNavic);

export const PRUREZY = {
  /** Lepené dřevo 140 × 280 mm. */
  "drevo-lehke": obdelnik(DREVO, 0.14, 0.28),
  /** Lepené dřevo 200 × 480 mm. */
  "drevo-tezke": obdelnik(DREVO, 0.2, 0.48),
  /** HEB 200. */
  "ocel-lehka": prurez(OCEL, 78.1e-4, 5696e-8, 24.83e-4),
  /** HEB 400. */
  "ocel-tezka": prurez(OCEL, 197.8e-4, 57680e-8, 69.98e-4),
  /** Dřevěná deska 3 × 0,16 m se zábradlím (100 kg/m). */
  "mostovka-drevo": obdelnik(DREVO, 3, 0.16, 100),
  /** Betonová deska 8 × 0,25 m s vozovkou a svodidly (1 500 kg/m); ocelové trámy zanedbány. */
  "mostovka-ocelobeton": obdelnik(BETON, 8, 0.25, 1500),
  /** Dvě kolejnice 60E1 s mostnicemi (250 kg/m). */
  kolejiste: prurez(OCEL, 2 * 76.7e-4, 2 * 3038e-8, 2 * 30e-4, 250),
  /** Betonový pilíř 1 × 1 m. */
  pilir: obdelnik(BETON, 1, 1),
  /** Spirálové lano průměru 40 mm: kovový průřez 942 mm², E 150 GPa. */
  lano: {
    druh: LANO,
    EA: 150e9 * 942e-6,
    EI: 0,
    GAs: Infinity,
    hmotnostNaMetr: 7.5,
    polomerSetrvacnosti: 0.01,
  } satisfies Prurez,
} as const;

export type IdPrurezu = keyof typeof PRUREZY;

/** Rychlost podélné vlny v prutu, m/s. Určuje nejdelší stabilní krok: dt < L/c. */
export const rychlostVlny = (p: Prurez): number => Math.sqrt(p.EA / p.hmotnostNaMetr);
