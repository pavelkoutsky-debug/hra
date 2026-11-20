// Modely účastníků provozu: z čeho se chodec, cyklista a vozidlo skládají pro výpočet.
//
// Každý účastník je řada náprav za sebou. Náprava je hmota nesená kontaktem s mostovkou
// (pneumatika, tělo chodce); u vozidel je karoserie nad nápravou zvlášť a s nápravou ji
// spojuje pérování. Karoserie se dělí mezi nápravy podle polohy těžiště a každá část
// kmitá nad svou nápravou samostatně. Odpovídá to vozidlu, jehož houpání a kývání mají
// stejnou frekvenci, což osobní auta splňují dobře.
//
// Hodnoty jsou typické, ne změřené na konkrétním voze; u každé je uvedeno, z čeho vychází.

import type { IdProvozu } from "../data/katalog";

export interface Naprava {
  /** Vzdálenost za čelem účastníka, m. */
  odstup: number;
  /** Hmota nad pérováním připadající na nápravu, kg; u účastníka bez pérování celá jeho hmota. */
  odpruzena: number;
  /** Hmota kol a nápravy pod pérováním, kg. Nula znamená bez pérování: hmota sedí přímo na kontaktu. */
  neodpruzena: number;
  /** Pérování mezi nápravou a karoserií: tuhost N/m, tlumení N·s/m a výška karoserie nad osou kola, m. */
  perovani?: { tuhost: number; tlumeni: number; vyska: number };
  /** Kontakt s mostovkou: tuhost N/m, tlumení N·s/m a výška styčníku nad povrchem bez zatížení, m. */
  kontakt: { tuhost: number; tlumeni: number; vyska: number };
}

export interface ModelUcastnika {
  /** Rychlost v m/s. */
  rychlost: number;
  /** Délka pro kreslení a rozestupy, m. */
  delka: number;
  napravy: Naprava[];
  /** Rozestup členů skupiny, čelo od čela, m. */
  rozestup: number;
  /** Kroková síla chodce: frekvence v Hz a amplitudy harmonických (sin, cos) v newtonech. */
  buzeni?: { frekvence: number; amplitudy: number[] };
}

const g = 9.80665;

/** Tuhost a tlumení pružiny, na které hmota `m` kmitá frekvencí `f` (Hz) s poměrným útlumem `zeta`. */
function pruzina(m: number, f: number, zeta: number): { tuhost: number; tlumeni: number } {
  const omega = 2 * Math.PI * f;
  return { tuhost: m * omega * omega, tlumeni: 2 * zeta * m * omega };
}

/** Délka kroku, kterou se kadence přepočítává na rychlost chůze, m. */
export const DELKA_KROKU = 0.75;
const VYCHOZI_KADENCE = 1.9;
/** Váha chodce v newtonech (80 kg). */
const HMOTA_CHODCE = 80;

/**
 * Chodec: tělo jako hmota na pružině s tlumičem (vlastní frekvence 2,85 Hz, útlum 30 %,
 * hodnoty z měření chůze na lávkách) a k tomu kroková síla. První harmonická roste
 * s kadencí podle Kerra, α₁ = 0,37·(f − 0,95) nejvýš 0,5; druhá a třetí jsou desetina
 * váhy a proti první jsou posunuté o čtvrt periody (Bachmann).
 */
function chodec(kadence: number): ModelUcastnika {
  const vaha = HMOTA_CHODCE * g;
  let prvni = 0.37 * (kadence - 0.95);
  if (prvni < 0) prvni = 0;
  else if (prvni > 0.5) prvni = 0.5;
  return {
    rychlost: DELKA_KROKU * kadence,
    delka: 0.5,
    rozestup: 1.2,
    napravy: [
      { odstup: 0, odpruzena: HMOTA_CHODCE, neodpruzena: 0, kontakt: { ...pruzina(HMOTA_CHODCE, 2.85, 0.3), vyska: 1 } },
    ],
    buzeni: { frekvence: kadence, amplitudy: [prvni * vaha, 0, 0, -0.1 * vaha, 0, -0.1 * vaha] },
  };
}

/**
 * Cyklista: 95 kg s kolem, 20 km/h. Jezdec na sedle a pneumatikách kmitá kolem 4 Hz;
 * hmota se dělí na zadní a přední kolo 55 : 45, rozvor 1,05 m.
 */
function cyklista(): ModelUcastnika {
  const zadni = 0.55 * 95;
  const predni = 0.45 * 95;
  return {
    rychlost: 5.5,
    delka: 1.75,
    rozestup: 4,
    napravy: [
      { odstup: 0.35, odpruzena: predni, neodpruzena: 0, kontakt: { ...pruzina(predni, 4, 0.25), vyska: 0.34 } },
      { odstup: 1.4, odpruzena: zadni, neodpruzena: 0, kontakt: { ...pruzina(zadni, 4, 0.25), vyska: 0.34 } },
    ],
  };
}

/**
 * Osobní auto: 1 500 kg, 50 km/h, rozvor 2,7 m. Karoserie 1 340 kg, 55 % na přední nápravě;
 * houpe se na pérování 1,3 Hz s útlumem 30 %. Náprava s koly 80 kg na dvou pneumatikách
 * po 200 kN/m; z toho vychází poskakování kol kolem 12 Hz.
 */
function auto(): ModelUcastnika {
  const karoserie = 1340;
  const naprava = (odstup: number, podil: number): Naprava => {
    const odpruzena = podil * karoserie;
    return {
      odstup,
      odpruzena,
      neodpruzena: 80,
      perovani: { ...pruzina(odpruzena, 1.3, 0.3), vyska: 0.35 },
      kontakt: { tuhost: 400_000, tlumeni: 600, vyska: 0.31 },
    };
  };
  return {
    rychlost: 50 / 3.6,
    delka: 4.4,
    rozestup: 14,
    napravy: [naprava(0.9, 0.55), naprava(3.6, 0.45)],
  };
}

/**
 * Model účastníka daného druhu; null u druhů, které hra zatím neumí.
 * `kadence` je kroková frekvence chodce v Hz.
 */
export function modelUcastnika(druh: IdProvozu, kadence?: number): ModelUcastnika | null {
  if (druh === "chodec") return chodec(kadence ?? VYCHOZI_KADENCE);
  if (druh === "cyklista") return cyklista();
  if (druh === "auto") return auto();
  return null;
}

/** Celková hmotnost účastníka v kilogramech. */
export function hmotnostUcastnika(model: ModelUcastnika): number {
  let hmotnost = 0;
  for (const n of model.napravy) hmotnost += n.odpruzena + n.neodpruzena;
  return hmotnost;
}
