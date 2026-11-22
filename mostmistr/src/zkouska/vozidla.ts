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
  /** Výška těžiště vozidla nad vozovkou, m; podle ní se při brzdění přitíží přední náprava. */
  teziste?: number;
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

/** Kadence, od které se krok útvaru počítá jako běh, Hz. */
export const KADENCE_BEHU = 2.4;
const VYCHOZI_KADENCE_BEHU = 2.8;
const HMOTA_BEZCE = 75;
/** Šířka, kterou na mostovce zabere jeden člověk v útvaru, m. */
export const SIRKA_NA_OSOBU = 0.75;

/**
 * Běžec: 75 kg, 3 m/s. Noha se mostovky dotýká zhruba polovinu kroku a mezi doskoky běžec
 * letí; síla jednoho doskoku má tvar půlvlny sinusu. Její rozvoj do řady dává první
 * harmonickou π/2 váhy a druhou −2/3 váhy (v kosinu); třetí je nulová. Řada zkrácená po druhé
 * harmonické klesne během letu nejvýš o osminu váhy pod nulu; vyšší členy, které by to
 * srovnaly, leží nad pásmem, na kterém u lávek záleží. Tělo jako u chodce: hmota na pružině
 * s tlumičem, při běhu tužší (3 Hz).
 */
function bezec(kadence: number): ModelUcastnika {
  const vaha = HMOTA_BEZCE * g;
  return {
    rychlost: 3,
    delka: 0.6,
    rozestup: 2.5,
    napravy: [
      { odstup: 0, odpruzena: HMOTA_BEZCE, neodpruzena: 0, kontakt: { ...pruzina(HMOTA_BEZCE, 3, 0.3), vyska: 1 } },
    ],
    buzeni: { frekvence: kadence, amplitudy: [(Math.PI / 2) * vaha, 0, 0, (-2 / 3) * vaha, 0, 0] },
  };
}

/**
 * Člen pochodujícího útvaru. Do kadence běhu pochoduje (kroková síla chodce, řady dva kroky
 * za sebou), nad ní běží. Všichni jdou ve stejné fázi; to zařizuje plán provozu.
 */
function clenUtvaru(kadence: number): ModelUcastnika {
  if (kadence >= KADENCE_BEHU) return bezec(kadence);
  return { ...chodec(kadence), rozestup: 2 * DELKA_KROKU };
}

/**
 * Skákající člověk: tentýž chodec (80 kg, tělo na pružině), jen místo kroků skáče. Síla
 * doskoků má tvar půlvln sinusu jako při běhu, ale skupina se do rytmu hudby netrefí přesně,
 * takže její společná síla je menší než součet jednotlivců: první harmonická 1,2 váhy,
 * druhá 0,4, třetí 0,12 (řádově podle měření skupin desítek lidí; jednotlivec má kolem
 * 1,6, 0,7 a 0,1 až 0,4). Kadence je rytmus hudby v Hz. Rychlost je rychlost chůze, kterou
 * dav na místo přijde a zase odejde.
 */
export function skokan(kadence: number): ModelUcastnika {
  const vaha = HMOTA_CHODCE * g;
  return {
    ...chodec(KADENCE_DAVU),
    rychlost: RYCHLOST_DAVU,
    rozestup: 1,
    buzeni: { frekvence: kadence, amplitudy: [1.2 * vaha, 0, 0, -0.4 * vaha, -0.12 * vaha, 0] },
  };
}

/** Rychlost hustého davu, m/s: lidé si překážejí a jdou pomaleji, než by šli sami. */
export const RYCHLOST_DAVU = 1.1;
/** Rychlost průvodu s kapelou, m/s. */
export const RYCHLOST_PRUVODU = 1.2;
/** Střední kadence volně jdoucího davu a její směrodatná odchylka mezi lidmi, Hz. */
export const KADENCE_DAVU = 1.7;
export const ROZPTYL_DAVU = 0.15;
/** Střední kadence běžeckého závodu a její směrodatná odchylka, Hz: pásmo je úzké. */
export const KADENCE_ZAVODU = 2.8;
export const ROZPTYL_ZAVODU = 0.07;
/** Kadence pochodující kapely a rytmus skákajícího davu, když je úroveň neurčí, Hz. */
export const KADENCE_KAPELY = 2;
export const KADENCE_SKAKANI = 2.2;

/**
 * Kolik lidí daného druhu provozu jde vedle sebe na mostovce dané šířky. Útvar, dav a průvod
 * zaplní celou šířku, běžci potřebují víc místa, ostatní jdou po jednom.
 */
export function lidiVRade(druh: IdProvozu, sirkaMostovky: number): number {
  if (druh === "utvar" || druh === "dav" || druh === "pruvod" || druh === "skakajici-dav") {
    return Math.max(1, Math.floor(sirkaMostovky / SIRKA_NA_OSOBU));
  }
  if (druh === "bezecky-zavod") return Math.max(1, Math.min(3, Math.floor(sirkaMostovky)));
  return 1;
}

/** Chodec v davu nebo průvodu: krok podle své kadence, rychlost podle skupiny. */
export function chodecVeSkupine(kadence: number, rychlost: number, rozestup: number): ModelUcastnika {
  return { ...chodec(kadence), rychlost, rozestup };
}

/** Běžec v závodě: kadence podle běžce, rozestup řad podle závodu. */
export function bezecVZavode(kadence: number, rozestup: number): ModelUcastnika {
  return { ...bezec(kadence), rozestup };
}

/**
 * Sloučí `lidi` stejných lidí jdoucích vedle sebe do jednoho účastníka: hmota, tuhost
 * a tlumení se násobí. V bokorysu jsou na stejném místě a mostovku zatěžují společně.
 * Když jdou `vTaktu` (útvar, kapela), sčítají se i jejich krokové síly. Když jde každý
 * po svém, sčítají se jen energie a společná síla roste s odmocninou počtu.
 */
export function vedleSebe(model: ModelUcastnika, lidi: number, vTaktu = true): ModelUcastnika {
  if (lidi === 1) return model;
  const vysledek: ModelUcastnika = {
    ...model,
    napravy: model.napravy.map((n) => {
      const naprava: Naprava = {
        ...n,
        odpruzena: n.odpruzena * lidi,
        neodpruzena: n.neodpruzena * lidi,
        kontakt: { ...n.kontakt, tuhost: n.kontakt.tuhost * lidi, tlumeni: n.kontakt.tlumeni * lidi },
      };
      if (n.perovani) {
        naprava.perovani = { ...n.perovani, tuhost: n.perovani.tuhost * lidi, tlumeni: n.perovani.tlumeni * lidi };
      }
      return naprava;
    }),
  };
  if (model.buzeni) {
    const nasobek = vTaktu ? lidi : Math.sqrt(lidi);
    vysledek.buzeni = { ...model.buzeni, amplitudy: model.buzeni.amplitudy.map((a) => a * nasobek) };
  }
  return vysledek;
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
    teziste: 0.55,
    napravy: [naprava(0.9, 0.55), naprava(3.6, 0.45)],
  };
}

/** Náprava užitkového vozidla: co nese, jak je odpružená a na kolika pneumatikách stojí. */
interface NapravaVozu {
  /** Vzdálenost za čelem vozidla, m. */
  odstup: number;
  /** Hmota, kterou náprava přenáší do vozovky (včetně sebe), kg. */
  zatizeni: number;
  /** Hmota kol a nápravy pod pérováním, kg. */
  neodpruzena: number;
  /** Vlastní frekvence karoserie na pérování nápravy (Hz) a poměrný útlum. */
  frekvence: number;
  utlum: number;
  pneumatik: number;
}

/** Pneumatika: radiální tuhost N/m, tlumení N·s/m a poloměr zatíženého kola, m. */
interface Pneumatika {
  tuhost: number;
  tlumeni: number;
  polomer: number;
}

/** Pneumatika dodávky a pneumatika nákladního vozu a autobusu (kolem 1 MN/m při huštění 8 bar). */
const PNEU_DODAVKY: Pneumatika = { tuhost: 300_000, tlumeni: 400, polomer: 0.34 };
const PNEU_NAKLADNI: Pneumatika = { tuhost: 1_000_000, tlumeni: 2_000, polomer: 0.5 };

/** Složí vozidlo z náprav; `vyskaKaroserie` je výška styčníku karoserie nad osou kola, m. */
function vozidlo(
  rychlost: number,
  delka: number,
  rozestup: number,
  pneu: Pneumatika,
  vyskaKaroserie: number,
  teziste: number,
  napravy: readonly NapravaVozu[],
): ModelUcastnika {
  return {
    rychlost,
    delka,
    rozestup,
    teziste,
    napravy: napravy.map((n): Naprava => {
      const odpruzena = n.zatizeni - n.neodpruzena;
      return {
        odstup: n.odstup,
        odpruzena,
        neodpruzena: n.neodpruzena,
        perovani: { ...pruzina(odpruzena, n.frekvence, n.utlum), vyska: vyskaKaroserie },
        kontakt: { tuhost: n.pneumatik * pneu.tuhost, tlumeni: n.pneumatik * pneu.tlumeni, vyska: pneu.polomer },
      };
    }),
  };
}

/**
 * Dodávka: 3 500 kg, 50 km/h, rozvor 3,7 m. Naložená nese 46 % na přední a 54 % na zadní
 * nápravě; karoserie se houpe kolem 1,5 Hz s útlumem 30 %.
 */
function dodavka(): ModelUcastnika {
  return vozidlo(50 / 3.6, 6, 18, PNEU_DODAVKY, 0.45, 0.9, [
    { odstup: 1, zatizeni: 1600, neodpruzena: 110, frekvence: 1.5, utlum: 0.3, pneumatik: 2 },
    { odstup: 4.7, zatizeni: 1900, neodpruzena: 160, frekvence: 1.5, utlum: 0.3, pneumatik: 2 },
  ]);
}

/**
 * Městský autobus s cestujícími: 18 t, 40 km/h, délka 12 m, rozvor 6 m. Přední náprava nese
 * 6,5 t na dvou pneumatikách, zadní 11,5 t na čtyřech. Vzduchové pérování je měkké: karoserie
 * se houpe kolem 1,2 Hz s útlumem 25 %.
 */
function autobus(): ModelUcastnika {
  return vozidlo(40 / 3.6, 12, 30, PNEU_NAKLADNI, 0.55, 1.2, [
    { odstup: 2.7, zatizeni: 6500, neodpruzena: 650, frekvence: 1.2, utlum: 0.25, pneumatik: 2 },
    { odstup: 8.7, zatizeni: 11500, neodpruzena: 1150, frekvence: 1.2, utlum: 0.25, pneumatik: 4 },
  ]);
}

/**
 * Třínápravové nákladní auto: 26 t, 40 km/h. Přední náprava 7 t, zadní dvojnáprava 2× 9,5 t
 * s osami 1,35 m od sebe. Listová pera jsou tvrdá a málo tlumí: naložený vůz se houpe kolem
 * 2,8 Hz s útlumem 12 %. To je pásmo, ve kterém kmitají silniční mosty středních rozpětí.
 */
function nakladni(): ModelUcastnika {
  return vozidlo(40 / 3.6, 9.2, 24, PNEU_NAKLADNI, 0.6, 1.5, [
    { odstup: 1.4, zatizeni: 7000, neodpruzena: 650, frekvence: 2.8, utlum: 0.12, pneumatik: 2 },
    { odstup: 5.9, zatizeni: 9500, neodpruzena: 1100, frekvence: 2.8, utlum: 0.12, pneumatik: 4 },
    { odstup: 7.25, zatizeni: 9500, neodpruzena: 1100, frekvence: 2.8, utlum: 0.12, pneumatik: 4 },
  ]);
}

/**
 * Tahač s návěsem: 40 t na pěti nápravách, 40 km/h, délka 16,5 m. Tahač nese 6,5 t vpředu
 * (listová pera) a 11,5 t na hnací nápravě; návěs má tři nápravy po 7,33 t na vzduchovém
 * pérování (1,6 Hz, útlum 20 %). Návěs leží na točnici nad hnací nápravou; v tomto modelu
 * nese každá náprava svůj díl nákladu samostatně.
 */
function souprava(): ModelUcastnika {
  const naves = 22000 / 3;
  return vozidlo(40 / 3.6, 16.5, 34, PNEU_NAKLADNI, 0.6, 1.6, [
    { odstup: 1.4, zatizeni: 6500, neodpruzena: 650, frekvence: 2.6, utlum: 0.12, pneumatik: 2 },
    { odstup: 5, zatizeni: 11500, neodpruzena: 1150, frekvence: 1.6, utlum: 0.2, pneumatik: 4 },
    { odstup: 10.6, zatizeni: naves, neodpruzena: 700, frekvence: 1.6, utlum: 0.2, pneumatik: 2 },
    { odstup: 11.9, zatizeni: naves, neodpruzena: 700, frekvence: 1.6, utlum: 0.2, pneumatik: 2 },
    { odstup: 13.2, zatizeni: naves, neodpruzena: 700, frekvence: 1.6, utlum: 0.2, pneumatik: 2 },
  ]);
}

/** Druhy provozu, které jsou silniční vozidla s karoserií na pérování. */
const VOZIDLA: ReadonlySet<IdProvozu> = new Set<IdProvozu>(["auto", "dodavka", "autobus", "nakladni", "souprava"]);

/** Je daný druh provozu silniční vozidlo s karoserií (ne chodec ani cyklista)? */
export function jeVozidlo(druh: IdProvozu): boolean {
  return VOZIDLA.has(druh);
}

/**
 * Model účastníka daného druhu; null u druhů, které hra zatím neumí.
 * `kadence` je kroková frekvence chodce v Hz.
 */
export function modelUcastnika(druh: IdProvozu, kadence?: number): ModelUcastnika | null {
  if (druh === "chodec") return chodec(kadence ?? VYCHOZI_KADENCE);
  if (druh === "bezec") return bezec(kadence ?? VYCHOZI_KADENCE_BEHU);
  if (druh === "utvar") return clenUtvaru(kadence ?? VYCHOZI_KADENCE);
  if (druh === "dav") return chodecVeSkupine(kadence ?? KADENCE_DAVU, RYCHLOST_DAVU, 1.3);
  if (druh === "bezecky-zavod") return bezecVZavode(kadence ?? KADENCE_ZAVODU, 2.2);
  if (druh === "pruvod") return chodecVeSkupine(kadence ?? KADENCE_KAPELY, RYCHLOST_PRUVODU, 1.5);
  if (druh === "skakajici-dav") return chodecVeSkupine(KADENCE_DAVU, RYCHLOST_DAVU, 1);
  if (druh === "cyklista") return cyklista();
  if (druh === "auto") return auto();
  if (druh === "dodavka") return dodavka();
  if (druh === "autobus") return autobus();
  if (druh === "nakladni") return nakladni();
  if (druh === "souprava") return souprava();
  return null;
}

/**
 * V jakém rytmu skupina lidí most budí: hlavní frekvence v Hz a její rozptyl mezi lidmi
 * (směrodatná odchylka; nula, když všichni drží jeden rytmus). U průvodu je to takt kapely,
 * u skákajícího davu rytmus skákání. Null u provozu, který nejsou lidé.
 */
export function rytmusLidi(druh: IdProvozu, kadence?: number): { f: number; rozptyl: number } | null {
  if (druh === "dav") return { f: kadence ?? KADENCE_DAVU, rozptyl: ROZPTYL_DAVU };
  if (druh === "bezecky-zavod") return { f: kadence ?? KADENCE_ZAVODU, rozptyl: ROZPTYL_ZAVODU };
  if (druh === "pruvod") return { f: kadence ?? KADENCE_KAPELY, rozptyl: 0 };
  if (druh === "skakajici-dav") return { f: kadence ?? KADENCE_SKAKANI, rozptyl: 0 };
  const f = modelUcastnika(druh, kadence)?.buzeni?.frekvence;
  return f === undefined ? null : { f, rozptyl: 0 };
}

/** Celková hmotnost účastníka v kilogramech. */
export function hmotnostUcastnika(model: ModelUcastnika): number {
  let hmotnost = 0;
  for (const n of model.napravy) hmotnost += n.odpruzena + n.neodpruzena;
  return hmotnost;
}
