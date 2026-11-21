// Katalog materiálů, stavebních prvků a druhů provozu.
// Jediné místo, kde žijí vlastnosti prvků. Uložené mosty a rekordy je neobsahují.
//
// Hodnoty vstupují do simulace, která má dát ve všech prohlížečích bitově stejný výsledek.
// Proto se tu počítá jen sčítáním, násobením, dělením a odmocninou; operátor mocniny
// a ostatní funkce Math takovou záruku nemají.
//
// Jak číst hodnoty:
// - Jednotky SI: Pa, m², m⁴, m³, kg/m³, kg/m.
// - Pevnosti jsou odhad středních hodnot skutečného materiálu, ne normové hodnoty
//   s rezervou; most má padat tam, kde by skutečně selhal (koncepce, kap. 5).
// - Každý nakreslený prut představuje dvojici stejných profilů: levou a pravou stranu
//   mostu promítnutou do roviny výkresu. Průřezy níže už dvojici zahrnují.
//
// Průřezy dřeva jsou od M2 zvolené pro hru (koncepce, kap. 5: průřezy se ladí při kalibraci
// úrovní): s původními masivními trámy využil provoz první kapitoly jen pár procent
// únosnosti a nic se nikdy nezlomilo. Materiál a jeho pevnosti zůstaly.
//
// Stav ověření (20. 11. 2026). Zdrojové normy se z vývojového prostředí otevřít
// nepodařilo; „potvrzeno“ znamená shodu s veřejně dostupnými tabulkami nalezenými
// vyhledáváním, „z paměti“ znamená bez nezávislého potvrzení.
// - HEB 200 a HEB 400 (plocha, moment setrvačnosti, hmotnost): potvrzeno.
//   Smyková plocha je dopočtena podle EN 1993-1-1; průřezové moduly z paměti.
// - Lepené dřevo GL24h podle EN 14080:2013 (ohyb 24, tah 19,2 MPa, E 11 500 MPa,
//   charakteristická hustota 385 kg/m³): potvrzeno. Tlak, smyk, smykový modul
//   a střední hustota: z paměti.
// - Beton C30/37 podle EN 1992-1-1 (f_cm 38 MPa, f_ctm 2,9 MPa, E_cm 33 GPa): potvrzeno.
// - Spirálové lano (E 150 GPa, pevnost drátů 1 570 MPa, výplň průřezu 0,75): z paměti.
// - Ocel S355 (E 210 GPa, G 81 GPa, jmenovitá mez kluzu 355 MPa): z paměti, běžně známé hodnoty.

export const ID_MATERIALU = ["ocel", "drevo", "zelezobeton", "lano"] as const;
export type IdMaterialu = (typeof ID_MATERIALU)[number];

export interface Material {
  /** Modul pružnosti v tahu a tlaku. */
  E: number;
  /** Modul pružnosti ve smyku. */
  G: number;
  hustota: number;
  /**
   * Napětí, při kterém materiál selže. U tvárného materiálu je tah, tlak a ohyb
   * mezí kluzu; přetrhne se až při `pevnostVTahu`.
   */
  mez: { tah: number; tlak: number; ohyb: number; smyk: number };
  /** Tvárný materiál se před porušením plasticky deformuje; křehký praskne naráz. */
  tvarny: boolean;
  /** Jen tvárný: napětí, při kterém se přetrhne. */
  pevnostVTahu?: number;
  /** Jen tvárný: natočení plastického kloubu, po kterém se zlomí, v radiánech. */
  mezniNatoceni?: number;
  /** Jen tvárný: poměrné plastické protažení, po kterém se přetrhne. */
  mezniProtazeni?: number;
  /** Poměrný útlum kmitání konstrukce z tohoto materiálu. */
  utlum: number;
}

/**
 * Přepočet normové (5% kvantil) pevnosti dřeva na střední hodnotu při variačním
 * koeficientu 15 % a normálním rozdělení: 1 / (1 − 1,645 · 0,15).
 */
const STREDNI_Z_CHARAKTERISTICKE = 1 / (1 - 1.645 * 0.15);

export const MATERIALY: Readonly<Record<IdMaterialu, Material>> = {
  // Ocel S355. Skutečná mez kluzu bývá o desetinu až pětinu nad jmenovitou.
  ocel: {
    E: 210e9,
    G: 81e9,
    hustota: 7850,
    mez: { tah: 400e6, tlak: 400e6, ohyb: 400e6, smyk: 400e6 / Math.sqrt(3) },
    tvarny: true,
    pevnostVTahu: 510e6,
    mezniNatoceni: 0.08,
    mezniProtazeni: 0.05,
    utlum: 0.005,
  },
  // Lepené lamelové dřevo GL24h.
  drevo: {
    E: 11.5e9,
    G: 0.65e9,
    hustota: 420,
    mez: {
      tah: 19.2e6 * STREDNI_Z_CHARAKTERISTICKE,
      tlak: 24e6 * STREDNI_Z_CHARAKTERISTICKE,
      ohyb: 24e6 * STREDNI_Z_CHARAKTERISTICKE,
      smyk: 3.5e6 * STREDNI_Z_CHARAKTERISTICKE,
    },
    tvarny: false,
    utlum: 0.015,
  },
  // Železobeton C30/37 s přibližně 1 % podélné výztuže. Tlak je střední pevnost betonu;
  // tah, ohyb a smyk jsou náhradní hodnoty, které zastupují únosnost výztuže
  // (modelový předpoklad, ne hodnota z normy).
  zelezobeton: {
    E: 33e9,
    G: 33e9 / (2 * (1 + 0.2)),
    hustota: 2500,
    mez: { tah: 5.5e6, tlak: 38e6, ohyb: 28e6, smyk: 3e6 },
    tvarny: false,
    utlum: 0.01,
  },
  // Spirálové ocelové lano; hodnoty vztažené ke kovovému průřezu.
  lano: {
    E: 150e9,
    G: 0,
    hustota: 7850,
    mez: { tah: 1400e6, tlak: 0, ohyb: 0, smyk: 0 },
    tvarny: false,
    utlum: 0.005,
  },
};

export const ID_PRVKU = [
  "mostovka-drevo",
  "mostovka-ocelobeton",
  "kolejiste",
  "drevo-lehke",
  "drevo-tezke",
  "ocel-lehka",
  "ocel-tezka",
  "lano",
  "pilir",
  "tlumic",
  "pruzina",
  "pist",
] as const;

export type IdPrvku = (typeof ID_PRVKU)[number];

export type DruhPrvku = "mostovka" | "prut" | "lano" | "pilir" | "tlumic" | "pruzina" | "pist";

/** Průřez prutu. U mostovky jsou hodnoty na jeden metr její šířky. */
export interface Prurez {
  /** Plocha. */
  A: number;
  /** Moment setrvačnosti k ose ohybu v rovině výkresu. */
  I: number;
  /** Smyková plocha pro výpočet průhybu od smyku. */
  As: number;
  /**
   * Smyková plocha pro únosnost; když chybí, bere se `As`. U obdélníku je to ⅔ plochy,
   * protože smykové napětí je uprostřed výšky jedenapůlkrát větší než průměrné.
   */
  Av?: number;
  /** Pružný průřezový modul. */
  W: number;
  /** Plastický průřezový modul; u křehkých materiálů se nepoužije. */
  Wpl: number;
  /** Hmotnost na metr, pokud ji neurčuje plocha a hustota (válcované profily). */
  hmotnostNaMetr?: number;
}

export interface PolozkaKatalogu {
  druh: DruhPrvku;
  /** Největší délka jednoho prutu v metrech. */
  nejvetsiDelka: number;
  /** Zda fyzikální jádro prvek už umí. Dokud ne, kontrola návrhu ho odmítne. */
  hotovo: boolean;
  /** Materiál a průřez; prvky bez nich (tlumič, pružina, píst) mají parametry v návrhu. */
  material?: IdMaterialu;
  prurez?: Prurez;
  /** Průřez je zadán na metr šířky mostovky a násobí se šířkou z úrovně. */
  naMetrSirky?: boolean;
  /** Hodnoty jsou jen předběžné a upřesní se v milníku, kdy prvek přijde do hry. */
  predbezne?: boolean;
  /**
   * Cena v korunách: nosné prvky se platí za metr délky, tlumič, pružina a píst za kus.
   * Ceny jsou herní, ne tržní; ladí se tak, aby rozhodování o materiálu dávalo smysl.
   */
  cena: { zaMetr: number } | { zaKus: number };
}

/** Dvojice obdélníkových průřezů šířky b a výšky h. */
function dvaObdelniky(b: number, h: number): Prurez {
  return {
    A: 2 * b * h,
    I: (2 * b * h * h * h) / 12,
    As: (2 * 5 * b * h) / 6,
    Av: (2 * 2 * b * h) / 3,
    W: (2 * b * h * h) / 6,
    Wpl: (2 * b * h * h) / 4,
  };
}

/** Deska tloušťky t na jeden metr šířky. */
function deskaNaMetr(t: number): Prurez {
  return { A: t, I: (t * t * t) / 12, As: (5 * t) / 6, Av: (2 * t) / 3, W: (t * t) / 6, Wpl: (t * t) / 4 };
}

// Délky nosných prvků jsou z koncepce (kap. 5); u tlumiče, pružiny a pístu jsou předběžné.
export const KATALOG: Readonly<Record<IdPrvku, PolozkaKatalogu>> = {
  // Dřevěná mostovka z fošen tloušťky 80 mm. Osobní auto unese s rezervou, těžký náklad ne.
  "mostovka-drevo": {
    druh: "mostovka",
    nejvetsiDelka: 4,
    hotovo: true,
    cena: { zaMetr: 2500 },
    material: "drevo",
    prurez: deskaNaMetr(0.08),
    naMetrSirky: true,
  },
  // Železobetonová deska tloušťky 250 mm; spřažení s ocelovými trámy zatím zanedbáno.
  "mostovka-ocelobeton": {
    druh: "mostovka",
    nejvetsiDelka: 6,
    hotovo: false,
    cena: { zaMetr: 9000 },
    material: "zelezobeton",
    prurez: deskaNaMetr(0.25),
    naMetrSirky: true,
    predbezne: true,
  },
  // Dvě kolejnice 60E1; podélníky a mostnice zatím zanedbány.
  kolejiste: {
    druh: "mostovka",
    nejvetsiDelka: 6,
    hotovo: false,
    cena: { zaMetr: 12000 },
    material: "ocel",
    prurez: { A: 2 * 76.7e-4, I: 2 * 3038e-8, As: 2 * 30e-4, W: 2 * 333.6e-6, Wpl: 2 * 400e-6, hmotnostNaMetr: 370 },
    predbezne: true,
  },
  // 2× lepené dřevo 60 × 120 mm: lehký trám, který se v tlaku brzy vzpírá.
  "drevo-lehke": {
    druh: "prut",
    nejvetsiDelka: 6,
    hotovo: true,
    cena: { zaMetr: 1200 },
    material: "drevo",
    prurez: dvaObdelniky(0.06, 0.12),
  },
  // 2× lepené dřevo 120 × 240 mm: čtyřikrát víc dřeva, šestnáctkrát větší odolnost ve vzpěru.
  "drevo-tezke": {
    druh: "prut",
    nejvetsiDelka: 6,
    hotovo: true,
    cena: { zaMetr: 2800 },
    material: "drevo",
    prurez: dvaObdelniky(0.12, 0.24),
  },
  // 2× HEB 200.
  "ocel-lehka": {
    druh: "prut",
    nejvetsiDelka: 12,
    hotovo: true,
    cena: { zaMetr: 4500 },
    material: "ocel",
    prurez: {
      A: 2 * 78.1e-4,
      I: 2 * 5696e-8,
      As: 2 * 24.83e-4,
      W: 2 * 569.6e-6,
      Wpl: 2 * 642.5e-6,
      hmotnostNaMetr: 2 * 61.3,
    },
  },
  // 2× HEB 400.
  "ocel-tezka": {
    druh: "prut",
    nejvetsiDelka: 12,
    hotovo: true,
    cena: { zaMetr: 9500 },
    material: "ocel",
    prurez: {
      A: 2 * 197.8e-4,
      I: 2 * 57680e-8,
      As: 2 * 69.98e-4,
      W: 2 * 2884e-6,
      Wpl: 2 * 3232e-6,
      hmotnostNaMetr: 2 * 155,
    },
  },
  // 2× spirálové lano průměru 40 mm; kovový průřez je asi 0,75 plochy kruhu.
  lano: {
    druh: "lano",
    nejvetsiDelka: 60,
    hotovo: false,
    cena: { zaMetr: 1800 },
    material: "lano",
    prurez: { A: 2 * 942e-6, I: 0, As: 0, W: 0, Wpl: 0 },
    predbezne: true,
  },
  // Železobetonový pilíř 1,0 × 2,0 m (v rovině výkresu 1,0 m).
  pilir: {
    druh: "pilir",
    nejvetsiDelka: 12,
    hotovo: false,
    cena: { zaMetr: 15000 },
    material: "zelezobeton",
    prurez: { A: 2, I: 2 / 12, As: (5 * 2) / 6, Av: (2 * 2) / 3, W: 2 / 6, Wpl: 2 / 4 },
    predbezne: true,
  },
  tlumic: { druh: "tlumic", nejvetsiDelka: 6, hotovo: true, cena: { zaKus: 20000 } },
  pruzina: { druh: "pruzina", nejvetsiDelka: 6, hotovo: true, cena: { zaKus: 8000 } },
  pist: { druh: "pist", nejvetsiDelka: 8, hotovo: false, cena: { zaKus: 60000 } },
};

/** Cena svaru za každý prut připojený do svařeného styčníku, v korunách. */
export const CENA_SVARU = 1500;
/** Cena závaží za kilogram, v korunách. */
export const CENA_ZAVAZI = 10;

/** Nejkratší prut, který lze postavit (rastr 1 m). */
export const NEJMENSI_DELKA = 1;

/** Mechanické vlastnosti prutu, jak je potřebuje fyzikální jádro a kontrola porušení. */
export interface VlastnostiPrutu {
  material: IdMaterialu;
  /** Osová, ohybová a smyková tuhost: E·A [N], E·I [N·m²], G·A_s [N]. */
  EA: number;
  EI: number;
  GAs: number;
  /** Vlastní hmotnost na metr délky, kg/m. */
  hmotnostNaMetr: number;
  /** Poloměr setrvačnosti průřezu, m. */
  polomerSetrvacnosti: number;
  /** Únosnost průřezu: osová síla v tahu a tlaku [N], moment [N·m], posouvající síla [N]. */
  unosnost: { tah: number; tlak: number; moment: number; smyk: number };
  /** Jen tvárný materiál: síla, při které se prut přetrhne, a mezní deformace. */
  pretrzeni?: { sila: number; mezniNatoceni: number; mezniProtazeni: number };
  tvarny: boolean;
  utlum: number;
}

/**
 * Vlastnosti prutu daného prvku katalogu. `sirkaMostovky` (m) se použije u prvků
 * zadaných na metr šířky. Vrací null u prvků bez průřezu (tlumič, pružina, píst).
 */
export function vlastnostiPrutu(id: IdPrvku, sirkaMostovky: number): VlastnostiPrutu | null {
  const polozka = KATALOG[id];
  if (!polozka.material || !polozka.prurez) return null;
  const m = MATERIALY[polozka.material];
  const nasobek = polozka.naMetrSirky ? sirkaMostovky : 1;
  const p = polozka.prurez;
  const A = p.A * nasobek;
  const I = p.I * nasobek;

  const vlastnosti: VlastnostiPrutu = {
    material: polozka.material,
    EA: m.E * A,
    EI: m.E * I,
    // Lano smyk nepřenáší; nekonečná smyková tuhost znamená „bez smykové poddajnosti“.
    GAs: m.G > 0 && p.As > 0 ? m.G * p.As * nasobek : Infinity,
    hmotnostNaMetr: (p.hmotnostNaMetr ?? m.hustota * p.A) * nasobek,
    polomerSetrvacnosti: I > 0 ? Math.sqrt(I / A) : 0,
    unosnost: {
      tah: m.mez.tah * A,
      tlak: m.mez.tlak * A,
      // Tvárný průřez využije plastickou rezervu, křehký selže při dosažení meze v krajním vlákně.
      moment: m.mez.ohyb * (m.tvarny ? p.Wpl : p.W) * nasobek,
      smyk: m.mez.smyk * (p.Av ?? p.As) * nasobek,
    },
    tvarny: m.tvarny,
    utlum: m.utlum,
  };
  if (m.tvarny && m.pevnostVTahu && m.mezniNatoceni && m.mezniProtazeni) {
    vlastnosti.pretrzeni = {
      sila: m.pevnostVTahu * A,
      mezniNatoceni: m.mezniNatoceni,
      mezniProtazeni: m.mezniProtazeni,
    };
  }
  return vlastnosti;
}

export const ID_PROVOZU = [
  "chodec",
  "bezec",
  "dav",
  "utvar",
  "bezecky-zavod",
  "pruvod",
  "skakajici-dav",
  "cyklista",
  "motocykl",
  "auto",
  "dodavka",
  "autobus",
  "nakladni",
  "souprava",
  "traktor",
  "nadmerny",
  "lokomotiva",
  "vuz-nakladni",
  "vuz-osobni",
  "lod",
] as const;

export type IdProvozu = (typeof ID_PROVOZU)[number];
