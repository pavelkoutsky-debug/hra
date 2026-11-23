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
// - IPE 600 (plocha, moment setrvačnosti, průřezové moduly, hmotnost; 22. 11. 2026): potvrzeno.
//   Hmotnost kolejnice 60E1 a mostnic: z paměti.

export const ID_MATERIALU = ["ocel", "drevo", "zelezobeton", "ocelobeton", "lano"] as const;
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
  // Spřažený ocelobetonový průřez přepočtený na ocel (poměr modulů 210 : 33): železobetonová
  // deska na ocelových nosnících. Napětí jsou náhradní hodnoty vztažené k přepočtenému
  // průřezu mostovky, zvolené tak, aby únosnosti vyšly jako u skutečného průřezu (modelový
  // předpoklad, ne hodnoty z normy): v tahu nese jen ocel (nosníky a výztuž desky, dohromady
  // 46 cm² na metr šířky při 400 MPa), v tlaku hlavně beton (0,2 m² při 38 MPa), v ohybu táhne
  // nosník a tlačí deska. Poruší se tvárně, ale vydrží menší natočení než samotná ocel.
  ocelobeton: {
    E: 210e9,
    G: 81e9,
    hustota: 7850,
    mez: { tah: 54e6, tlak: 250e6, ohyb: 400e6, smyk: 400e6 / Math.sqrt(3) },
    tvarny: true,
    pevnostVTahu: 68e6,
    mezniNatoceni: 0.04,
    mezniProtazeni: 0.02,
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
  "mostovka-ocel",
  "kolejiste",
  "drevo-lehke",
  "drevo-tezke",
  "ocel-lehka",
  "ocel-tezka",
  "lano",
  "lano-nosne",
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
   * Jen tlumič: rozsah, ve kterém hráč nastavuje součinitel tlumení (N·s/m), a hodnota,
   * se kterou se tlumič položí. Rozsah je úmyslně omezený (koncepce, kap. 5).
   */
  tlumeni?: { nejmensi: number; nejvetsi: number; vychozi: number };

  /**
   * Cena v korunách: nosné prvky se platí za metr délky, tlumič, pružina a píst za kus.
   * Ceny jsou herní, ne tržní; ladí se tak, aby rozhodování o materiálu dávalo smysl.
   */
  cena: { zaMetr: number } | { zaKus: number };
}

/** Hodnoty, mezi kterými hráč přepíná tlumení tlumiče, v N·s/m. */
export const STUPNE_TLUMENI: readonly number[] = [5e3, 10e3, 20e3, 30e3, 50e3, 75e3, 100e3, 150e3, 200e3];

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
  // Spřažená ocelobetonová mostovka: železobetonová deska 200 mm na ocelových nosnících
  // IPE 240 po 1,5 m (39,1 cm², 3 892 cm⁴, 30,7 kg/m). Hodnoty na metr šířky, přepočtené na ocel:
  // - plocha 0,2/6,36 + 26,1 cm² = 340 cm²; těžiště 117 mm pod horním povrchem desky,
  // - moment setrvačnosti 24 700 cm⁴ (deska 10 500 + 900, nosníky 2 600 + 10 800 Steinerem),
  // - plastický moment 317 kNm: nosníky v tahu 1,04 MN na rameni 0,304 m; při náhradní mezi
  //   400 MPa tomu odpovídá plastický modul 793 cm³,
  // - smyk nesou stojiny nosníků a deska (17 cm² při 231 MPa, tedy 393 kN),
  // - hmotnost 0,2 m × 2 500 kg/m³ + 30,7/1,5 = 520 kg na metr čtvereční.
  // Proti dřevěné mostovce je šestkrát těžší, devětkrát únosnější v ohybu a stokrát tužší.
  "mostovka-ocelobeton": {
    druh: "mostovka",
    nejvetsiDelka: 6,
    hotovo: true,
    cena: { zaMetr: 12000 },
    material: "ocelobeton",
    prurez: { A: 340e-4, I: 24700e-8, As: 283e-4, Av: 17e-4, W: 766e-6, Wpl: 793e-6, hmotnostNaMetr: 520 },
    naMetrSirky: true,
  },
  // Ortotropní ocelová mostovka pohyblivých mostů: plech 14 mm vyztužený podélnými žebry
  // lichoběžníkového průřezu (výška 300 mm, tloušťka 8 mm, po 600 mm). Na metr šířky:
  // - plocha: plech 140 cm² + stěny žeber 82,8 cm² + pásnice žeber 26,7 cm² = 250 cm², tedy 196 kg,
  // - těžiště 92 mm pod horním povrchem, moment setrvačnosti 33 600 cm⁴,
  // - průřezový modul ke spodním vláknům 33 600 / 22,6 = 1 487 cm³, plastický asi o čtvrtinu větší,
  // - smyk nesou stěny žeber.
  // Je skoro třikrát lehčí než ocelobetonová a tužší, ale o hodně dražší: proto se dává tam,
  // kde se každá tuna musí zvedat.
  "mostovka-ocel": {
    druh: "mostovka",
    nejvetsiDelka: 6,
    hotovo: true,
    cena: { zaMetr: 26000 },
    material: "ocel",
    prurez: { A: 250e-4, I: 33600e-8, As: 82.8e-4, W: 1487e-6, Wpl: 1860e-6, hmotnostNaMetr: 196 },
    naMetrSirky: true,
  },
  // Kolej na mostnicích: dvě kolejnice 60E1 na dřevěných mostnicích po 0,6 m a pod nimi dva
  // podélníky IPE 600 (156 cm², 92 080 cm⁴, W 3 069 cm³, Wpl 3 512 cm³, smyková plocha
  // 83,8 cm², 122 kg/m). Nesou jen podélníky; kolejnice a mostnice váží:
  // 2 × 122 + 2 × 60,2 (kolejnice) + 185 (dubové mostnice 240 × 240 × 2 400 mm) + 11 (upevnění)
  // = 560 kg na metr koleje. Podélník dlouhý 6 m se pod podvozkem loženého vozu prohne o 5 mm
  // (1/1 200 rozpětí), jak se u železničních mostů žádá. Je to jedna kolej: průřez se šířkou
  // mostovky nenásobí a hmotnost vybavení úrovně (zábradlí, vozovka) se k němu nepřidává.
  kolejiste: {
    druh: "mostovka",
    nejvetsiDelka: 6,
    hotovo: true,
    cena: { zaMetr: 16000 },
    material: "ocel",
    prurez: {
      A: 2 * 156e-4,
      I: 2 * 92080e-8,
      As: 2 * 83.78e-4,
      W: 2 * 3069e-6,
      Wpl: 2 * 3512e-6,
      hmotnostNaMetr: 560,
    },
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
    hotovo: true,
    cena: { zaMetr: 1800 },
    material: "lano",
    prurez: { A: 2 * 942e-6, I: 0, As: 0, W: 0, Wpl: 0 },
  },
  // Nosné lano visutých mostů: 2× spirálové lano průměru 80 mm, čtyřnásobek průřezu závěsného lana.
  "lano-nosne": {
    druh: "lano",
    nejvetsiDelka: 60,
    hotovo: true,
    cena: { zaMetr: 6000 },
    material: "lano",
    prurez: { A: 2 * 3770e-6, I: 0, As: 0, W: 0, Wpl: 0 },
  },
  // Železobetonový pilíř 1,0 × 2,0 m (v rovině výkresu 1,0 m).
  pilir: {
    druh: "pilir",
    nejvetsiDelka: 12,
    hotovo: true,
    cena: { zaMetr: 15000 },
    material: "zelezobeton",
    prurez: { A: 2, I: 2 / 12, As: (5 * 2) / 6, Av: (2 * 2) / 3, W: 2 / 6, Wpl: 2 / 4 },
  },
  // Viskózní tlumič lávek: jednotky až stovky kN·s/m.
  tlumic: {
    druh: "tlumic",
    nejvetsiDelka: 6,
    hotovo: true,
    cena: { zaKus: 20000 },
    tlumeni: { nejmensi: 5000, nejvetsi: 200000, vychozi: 50000 },
  },
  pruzina: { druh: "pruzina", nejvetsiDelka: 6, hotovo: true, cena: { zaKus: 8000 } },
  // Hydraulický válec pohyblivých mostů; vlastnosti má v `PIST`.
  pist: { druh: "pist", nejvetsiDelka: 8, hotovo: true, cena: { zaKus: 60000 } },
};

/**
 * Píst: hydraulický válec, který zvedá a sklápí pohyblivý most. Hráč ho kreslí v poloze,
 * jakou má při sklopeném mostě, a nastaví zdvih: o kolik metrů se při zvedání prodlouží
 * (kladný zdvih) nebo zkrátí (záporný).
 *
 * Válec o vrtání 280 mm má plochu pístu 0,0616 m²; při tlaku oleje 25 MPa tlačí silou
 * 1 500 kN. Olej je stlačitelný (objemový modul asi 1,5 GPa), takže se válec chová jako
 * pružina o tuhosti modul × plocha / délka sloupce oleje.
 */
export const PIST = {
  /** Největší síla v tlaku i v tahu, N. Víc válec nevyvine a víc ani neudrží: přetlakový ventil povolí. */
  nejvetsiSila: 1_500_000,
  /** Tuhost válce krát jeho délka, N (objemový modul oleje × plocha pístu). */
  tuhostKratDelka: 92e6,
  /**
   * Tlumení válce, N·s/m: škrcení průtoku oleje brzdí každý pohyb, který se liší od řízeného.
   * Křídlu o hmotnosti desítek tun to dává poměrný útlum kolem třetiny.
   */
  tlumeni: 1.5e6,
  /** Hmotnost válce na metr délky, kg/m. */
  hmotnostNaMetr: 200,
  /** Rychlost vysouvání a zasouvání, m/s, a zrychlení při rozjezdu a dojezdu, m/s². */
  rychlost: 0.4,
  zrychleni: 0.4,
  /** Zdvih smí být nejvýš tento podíl nakreslené délky pístu. */
  nejvetsiPodilZdvihu: 0.5,
  /** Krok nastavení zdvihu a zdvih nově nakresleného pístu, m. */
  krokZdvihu: 0.25,
  vychoziZdvih: 1,
} as const;

/** Největší zdvih (v obou směrech) pístu nakresleného v délce `delka`, zaokrouhlený dolů na krok. */
export function nejvetsiZdvih(delka: number): number {
  return Math.floor((PIST.nejvetsiPodilZdvihu * delka) / PIST.krokZdvihu + 1e-9) * PIST.krokZdvihu;
}

/** Zdvih pístu nakresleného v délce `delka`: nastavený, jinak výchozí (nejvýš tolik, kolik píst dokáže). */
export function zdvihPistu(zdvih: number | undefined, delka: number): number {
  return zdvih ?? Math.min(PIST.vychoziZdvih, nejvetsiZdvih(delka));
}

/** Dělicí zámek pohyblivého mostu: cena za kus, tuhost dosedací plochy a čepu, poměrný útlum. */
export const ZAMEK = {
  cena: 25000,
  /** Tuhost dosedací plochy a čepu zámku, N/m. */
  tuhost: 200e6,
  /** Poměrný útlum dosednutí (pryžové nárazníky, tření čepu). */
  utlum: 0.3,
} as const;

/**
 * Nese prvek vybavení mostovky z úrovně (zábradlí, vozovkové vrstvy)? Silniční mostovka a
 * lávka ano; kolejiště má kolejnice a mostnice ve své hmotnosti.
 */
export function neseVybaveni(id: IdPrvku): boolean {
  return KATALOG[id].druh === "mostovka" && id !== "kolejiste";
}

/** Cena svaru za každý prut připojený do svařeného styčníku, v korunách. */
export const CENA_SVARU = 1500;
/** Cena závaží za kilogram, v korunách. */
export const CENA_ZAVAZI = 10;
/** Po kolika kilogramech se závaží ve styčníku přidává a ubírá. */
export const KROK_ZAVAZI = 100;

/**
 * Napínák lana mění jeho délku: dotažené lano je kratší než nakreslené, povolené delší.
 * V návrhu se ukládá jako předpětí, tedy podíl pevnosti lana, kterým by lano táhlo, kdyby
 * jeho konce zůstaly přesně tam, kde jsou nakreslené (záporné u povoleného lana). Konce se
 * ale hýbou, takže skutečný tah vyjde až z výpočtu; u závěsů visutého mostu, které se
 * přizpůsobují tvaru nosného lana, může předpětí vyjít i mimo rozsah 0 až 1.
 * Nové lano je mírně dotažené, aby neviselo; ručně se napínák točí po milimetrech délky.
 */
export const PREDPETI_LANA = {
  vychozi: 0.05,
  /** Rozsah: lano smí být až o třetinu kratší a skoro dvakrát delší než nakreslené. */
  nejmensi: -50,
  nejvetsi: 50,
  /** Krok ručního nastavení, metry délky lana. */
  krokDelky: 0.001,
  /** Na kolik se zaokrouhluje výsledek automatického dopnutí. */
  presnost: 0.001,
} as const;

/**
 * Největší tah, který smí lano nést pod vlastní tíhou mostu, jako podíl pevnosti. Zbytek je
 * rezerva na provoz; referenční mosty kampaně mají v klidu nejvýš polovinu pevnosti.
 * Automatické dopnutí lana nad tuto mez nedotahuje.
 */
export const NEJVETSI_KLIDOVY_TAH = 0.7;

/** Poměrné protažení lana při plném využití pevnosti (pevnost / modul pružnosti materiálu). */
export function protazeniNaMezi(id: IdPrvku): number {
  const polozka = KATALOG[id];
  if (!polozka.material) return 0;
  const m = MATERIALY[polozka.material];
  return m.mez.tah / m.E;
}

/** O kolik metrů je lano nakreslené v délce `delka` napínákem zkrácené; záporné u povoleného. */
export function zkraceniLana(id: IdPrvku, delka: number, predpeti: number): number {
  return delka - delka / (1 + predpeti * protazeniNaMezi(id));
}

/** Předpětí, se kterým je lano nakreslené v délce `delka` o `zkraceni` metrů kratší (záporné: delší). */
export function predpetiZeZkraceni(id: IdPrvku, delka: number, zkraceni: number): number {
  const k = protazeniNaMezi(id);
  if (!(k > 0) || !(delka > zkraceni)) return 0;
  return (delka / (delka - zkraceni) - 1) / k;
}

/**
 * Laděný tlumič: závaží zavěšené pod styčníkem na pružině s tlumičem. Hráč volí hmotnost
 * závaží a frekvenci v hertzech, na které má závaží samo kmitat; tuhost pružiny a tlumič se
 * z nich dopočítají. Poměrný útlum 10 % je blízko optima pro závaží o několika procentech
 * hmoty kmitající lávky.
 */
export const LADENY_TLUMIC = {
  /** Nejmenší závaží a krok, po kterém se přidává, kg. */
  nejmensiHmota: 50,
  krokHmoty: 50,
  /** Rozsah a krok ladění, Hz. */
  nejmensiFrekvence: 0.8,
  nejvetsiFrekvence: 6,
  krokFrekvence: 0.05,
  /** Poměrný útlum tlumiče mezi závažím a mostem. */
  utlum: 0.1,
  /** Jak hluboko pod styčníkem závaží v klidu visí, m. */
  zaves: 1,
  /** Cena za kus a za kilogram závaží, Kč. */
  cenaZaKus: 30000,
  cenaZaKg: 30,
} as const;

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
  "vuz-prazdny",
  "vuz-osobni",
  "lod",
] as const;

export type IdProvozu = (typeof ID_PROVOZU)[number];

/** Vozy, které smí táhnout lokomotiva: ložený a prázdný nákladní vůz a osobní vůz. */
export const ID_VOZU = ["vuz-nakladni", "vuz-prazdny", "vuz-osobni"] as const satisfies readonly IdProvozu[];
export type IdVozu = (typeof ID_VOZU)[number];

/** Jezdí daný druh provozu po kolejích (lokomotiva a vozy)? */
export function jeKolejove(druh: IdProvozu): boolean {
  return druh === "lokomotiva" || (ID_VOZU as readonly IdProvozu[]).includes(druh);
}
