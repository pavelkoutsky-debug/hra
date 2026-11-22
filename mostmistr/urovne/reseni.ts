// Referenční řešení úrovní kampaně: pro každou medaili most, který ji získá, a mosty,
// které spadnout mají. Podle nich se ladí rozpočty a test vyhratelnosti hlídá, že každá
// úroveň jde vyhrát a nejde vyhrát triviálně.

import type { IdPrvku } from "../src/data/katalog";
import { Kreslic } from "../src/data/kreslic";
import type { NavrhMostu } from "../src/data/navrh";

export interface ReseniUrovne {
  /** Most, který projde zkouškou; nemusí být levný ani úsporný. */
  pruchod: NavrhMostu;
  /** Most, který projde a vejde se do inženýrského rozpočtu. */
  rozpocet: NavrhMostu;
  /** Most, který projde a splní bonus úrovně. */
  mistrovska: NavrhMostu;
  /** Mosty, které zkouškou projít nesmějí. */
  pady: { nazev: string; navrh: NavrhMostu }[];
}

const L: IdPrvku = "drevo-lehke";
const T: IdPrvku = "drevo-tezke";
const O: IdPrvku = "ocel-lehka";

function navrh(uroven: string, stav: (k: Kreslic) => void): NavrhMostu {
  const k = new Kreslic(uroven);
  stav(k);
  return k.navrh();
}

/** Mostovka z polí dané délky od x = 0 do x = rozpětí. */
function mostovka(k: Kreslic, rozpeti: number, pole: number): void {
  for (let x = 0; x < rozpeti; x += pole) k.prut("mostovka-drevo", [x, 0], [x + pole, 0]);
}

/**
 * Příhrada s poli 4 m nad mostovkou (kladná výška) nebo pod ní (záporná): pás ve výšce
 * `h`, krajní šikminy, svislice a diagonály klesající ke středu.
 */
function prihrada(k: Kreslic, rozpeti: number, h: number, pas: IdPrvku, vypln: IdPrvku): void {
  const pole = 4;
  k.prut(pas, [0, 0], [pole, h]);
  k.prut(pas, [rozpeti - pole, h], [rozpeti, 0]);
  for (let x = pole; x < rozpeti - pole; x += pole) k.prut(pas, [x, h], [x + pole, h]);
  for (let x = pole; x <= rozpeti - pole; x += pole) k.prut(vypln, [x, 0], [x, h]);
  for (let x = pole; x < rozpeti - pole; x += pole) {
    const kStredu = x < rozpeti / 2;
    k.prut(vypln, kStredu ? [x, h] : [x, 0], kStredu ? [x + pole, 0] : [x + pole, h]);
  }
}

/**
 * Ocelová příhrada nad mostovkou s horním pásem proměnné výšky: `vysky[i]` je výška pásu
 * nad i-tým vnitřním styčníkem mostovky. Diagonály klesají ke středu rozpětí.
 */
function prihradaSVyskami(k: Kreslic, rozpeti: number, pole: number, vysky: readonly number[]): void {
  const horni = vysky.map((h, i) => [pole * (i + 1), h] as [number, number]);
  k.prut(O, [0, 0], horni[0]!);
  k.prut(O, horni.at(-1)!, [rozpeti, 0]);
  for (let i = 0; i + 1 < horni.length; i++) k.prut(O, horni[i]!, horni[i + 1]!);
  for (const [x, h] of horni) k.prut(O, [x, 0], [x, h]);
  for (let i = 0; i + 1 < horni.length; i++) {
    const kStredu = horni[i]![0] < rozpeti / 2;
    k.prut(O, kStredu ? horni[i]! : [horni[i]![0], 0], kStredu ? [horni[i + 1]![0], 0] : horni[i + 1]!);
  }
}

/** Ocelová lávka: dřevěná mostovka a ocelová příhrada nad ní. */
function lavka(uroven: string, rozpeti: number, pole: number, vysky: readonly number[], uprava?: (k: Kreslic) => void): NavrhMostu {
  return navrh(uroven, (k) => {
    mostovka(k, rozpeti, pole);
    prihradaSVyskami(k, rozpeti, pole, vysky);
    uprava?.(k);
  });
}

/** Stejná výška horního pásu nad všemi vnitřními styčníky. */
function rovne(rozpeti: number, pole: number, vyska: number): number[] {
  return Array.from({ length: rozpeti / pole - 1 }, () => vyska);
}

/** Zavěsí závaží do styčníků mostovky na daných místech. */
function zavazi(mista: readonly number[], kg: number): (k: Kreslic) => void {
  return (k) => {
    for (const x of mista) k.bod(x, 0, { zavazi: kg });
  };
}

/** Zavěsí pod styčníky mostovky na daných místech laděné tlumiče. */
function tlumice(mista: readonly number[], hmota: number, frekvence: number): (k: Kreslic) => void {
  return (k) => {
    for (const x of mista) k.bod(x, 0, { tlumic: { hmota, frekvence } });
  };
}

/** Věšadlo: dvě krokve do vrcholu nad (nebo pod) středem a sloupek ke styčníku mostovky. */
function vesadlo(k: Kreslic, rozpeti: number, h: number): void {
  const stred = rozpeti / 2;
  k.prut(L, [0, 0], [stred, h]);
  k.prut(L, [stred, h], [rozpeti, 0]);
  k.prut(L, [stred, 0], [stred, h]);
}

/** Vzpěradla z kotev ve svazích hlubokého údolí (úroveň 1-04). */
function vzperadla(k: Kreslic, prvek: IdPrvku): void {
  for (const [kotva, vnitrni] of [
    [4, 8],
    [20, 16],
  ] as const) {
    k.prut(prvek, [kotva, -6], [kotva, 0]);
    k.prut(prvek, [kotva, -6], [vnitrni, -3]);
    k.prut(prvek, [vnitrni, -3], [vnitrni, 0]);
    k.prut(prvek, [vnitrni, -3], [12, 0]);
    k.prut(prvek, [kotva, 0], [vnitrni, -3]);
  }
}

const TO: IdPrvku = "ocel-tezka";
const BETON: IdPrvku = "mostovka-ocelobeton";

/** Ocelobetonová mostovka z polí po šesti metrech od x = 0 do x = rozpětí. */
function vozovka(k: Kreslic, rozpeti: number): void {
  for (let x = 0; x < rozpeti; x += 6) k.prut(BETON, [x, 0], [x + 6, 0]);
}

/**
 * Silniční příhrada nad ocelobetonovou mostovkou s poli 6 m: krajní šikminy a horní pás
 * z prvku `pas` ve výšce `vyska`, svislice a diagonály klesající ke středu z prvku `vypln`.
 * S `krokPasu` 12 má horní pás dvanáctimetrové pruty; svislice jsou jen pod jeho styčníky
 * a mezilehlé styčníky mostovky nesou diagonály do V.
 */
function silnicni(
  uroven: string,
  rozpeti: number,
  vyska: number,
  pas: IdPrvku,
  vypln: IdPrvku,
  krokPasu: 6 | 12 = 6,
  uprava?: (k: Kreslic) => void,
): NavrhMostu {
  return navrh(uroven, (k) => {
    vozovka(k, rozpeti);
    k.prut(pas, [0, 0], [6, vyska]);
    k.prut(pas, [rozpeti - 6, vyska], [rozpeti, 0]);
    for (let x = 6; x < rozpeti - 6; x += krokPasu) k.prut(pas, [x, vyska], [Math.min(x + krokPasu, rozpeti - 6), vyska]);
    if (krokPasu === 6) {
      for (let x = 6; x <= rozpeti - 6; x += 6) k.prut(vypln, [x, 0], [x, vyska]);
      for (let x = 6; x < rozpeti - 6; x += 6) {
        const kStredu = x < rozpeti / 2;
        k.prut(vypln, kStredu ? [x, vyska] : [x, 0], kStredu ? [x + 6, 0] : [x + 6, vyska]);
      }
    } else {
      for (let x = 6; x <= rozpeti - 6; x += 12) k.prut(vypln, [x, 0], [x, vyska]);
      for (let x = 6; x < rozpeti - 6; x += 12) {
        k.prut(vypln, [x, vyska], [x + 6, 0]);
        k.prut(vypln, [x + 6, 0], [x + 12, vyska]);
      }
    }
    uprava?.(k);
  });
}

/**
 * Příhrada pod ocelobetonovou mostovkou: dolní pás v hloubce `hloubka`, krajní šikminy,
 * svislice a diagonály stoupající ke středu. Tlak tu nese mostovka, ocel dole jen táhne.
 */
function podMostovkou(uroven: string, rozpeti: number, hloubka: number, pas: IdPrvku, vypln: IdPrvku): NavrhMostu {
  return navrh(uroven, (k) => {
    vozovka(k, rozpeti);
    k.prut(pas, [0, 0], [6, -hloubka]);
    k.prut(pas, [rozpeti - 6, -hloubka], [rozpeti, 0]);
    for (let x = 6; x < rozpeti - 6; x += 6) k.prut(pas, [x, -hloubka], [x + 6, -hloubka]);
    for (let x = 6; x <= rozpeti - 6; x += 6) k.prut(vypln, [x, 0], [x, -hloubka]);
    for (let x = 6; x < rozpeti - 6; x += 6) {
      const kStredu = x < rozpeti / 2;
      k.prut(vypln, kStredu ? [x, 0] : [x, -hloubka], kStredu ? [x + 6, -hloubka] : [x + 6, 0]);
    }
  });
}

/** Změní prvek prutu, který most mezi dvěma místy už má. */
function zmenPrvek(k: Kreslic, a: [number, number], b: [number, number], prvek: IdPrvku): void {
  const ia = k.bod(a[0], a[1]);
  const ib = k.bod(b[0], b[1]);
  const prut = k.pruty.find((p) => (p.a === ia && p.b === ib) || (p.a === ib && p.b === ia));
  if (!prut) throw new Error(`Mezi ${a.join(",")} a ${b.join(",")} žádný prut není.`);
  prut.prvek = prvek;
}

/** Nohy pilíře ze skály uprostřed údolí (úroveň 3-04) do styčníků mostovky na daných místech. */
function nohy(prvek: IdPrvku, mista: readonly number[]): (k: Kreslic) => void {
  return (k) => {
    for (const x of mista) k.prut(prvek, [24, -10], [x, 0]);
  };
}

export const RESENI: Readonly<Record<string, ReseniUrovne>> = {
  "1-01": {
    pruchod: navrh("1-01", (k) => {
      mostovka(k, 8, 4);
      vesadlo(k, 8, 2);
    }),
    // Nízké věšadlo má nejkratší pruty.
    rozpocet: navrh("1-01", (k) => {
      mostovka(k, 8, 4);
      vesadlo(k, 8, 1);
    }),
    // Podvěšení: stejné pruty, ale tažené místo tlačených.
    mistrovska: navrh("1-01", (k) => {
      mostovka(k, 8, 4);
      vesadlo(k, 8, -1);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("1-01", (k) => mostovka(k, 8, 4)) },
      {
        nazev: "krokve bez sloupku",
        navrh: navrh("1-01", (k) => {
          mostovka(k, 8, 4);
          k.prut(L, [0, 0], [4, 2]);
          k.prut(L, [4, 2], [8, 0]);
        }),
      },
    ],
  },

  "1-02": {
    pruchod: navrh("1-02", (k) => {
      mostovka(k, 12, 4);
      prihrada(k, 12, 2, L, L);
    }),
    // Dvě vzpěry z kotev ve svazích podepřou oba styčníky mostovky.
    rozpocet: navrh("1-02", (k) => {
      mostovka(k, 12, 4);
      k.prut(L, [2, -3], [4, 0]);
      k.prut(L, [10, -3], [8, 0]);
    }),
    // Kratší pole mostovky: sloupky nad kotvami a malé věšadlo uprostřed.
    mistrovska: navrh("1-02", (k) => {
      mostovka(k, 12, 2);
      k.prut(L, [2, -3], [2, 0]);
      k.prut(L, [2, -3], [4, 0]);
      k.prut(L, [10, -3], [10, 0]);
      k.prut(L, [10, -3], [8, 0]);
      k.prut(L, [4, 0], [6, 1]);
      k.prut(L, [6, 1], [8, 0]);
      k.prut(L, [6, 0], [6, 1]);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("1-02", (k) => mostovka(k, 12, 4)) },
      {
        nazev: "jediná vzpěra",
        navrh: navrh("1-02", (k) => {
          mostovka(k, 12, 4);
          k.prut(L, [2, -3], [4, 0]);
        }),
      },
    ],
  },

  "1-03": {
    pruchod: navrh("1-03", (k) => {
      mostovka(k, 16, 4);
      prihrada(k, 16, 3, L, L);
    }),
    rozpocet: navrh("1-03", (k) => {
      mostovka(k, 16, 4);
      prihrada(k, 16, 2, L, L);
    }),
    // Těžký horní pás se pod autem nevzpírá.
    mistrovska: navrh("1-03", (k) => {
      mostovka(k, 16, 4);
      prihrada(k, 16, 2, T, L);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("1-03", (k) => mostovka(k, 16, 4)) },
      {
        nazev: "příliš plochá lehká příhrada",
        navrh: navrh("1-03", (k) => {
          mostovka(k, 16, 4);
          prihrada(k, 16, 1, L, L);
        }),
      },
    ],
  },

  "1-04": {
    // Vzpěradla a k nim zbytečné věšadlo nad středem: drží, ale je to drahé.
    pruchod: navrh("1-04", (k) => {
      mostovka(k, 24, 4);
      vzperadla(k, L);
      k.prut(L, [8, 0], [12, 2]);
      k.prut(L, [12, 2], [16, 0]);
      k.prut(L, [12, 0], [12, 2]);
    }),
    // Vzpěradla z kotev ve svazích zkrátí rozpětí na třetinu a vystačí si s lehkým dřevem.
    rozpocet: navrh("1-04", (k) => {
      mostovka(k, 24, 4);
      vzperadla(k, L);
    }),
    mistrovska: navrh("1-04", (k) => {
      mostovka(k, 24, 4);
      vzperadla(k, T);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("1-04", (k) => mostovka(k, 24, 4)) },
      {
        nazev: "lehká příhrada přes celé údolí",
        navrh: navrh("1-04", (k) => {
          mostovka(k, 24, 4);
          prihrada(k, 24, 3, L, L);
        }),
      },
    ],
  },

  // Kapitola 2: ocelové lávky. Únosnost tu nerozhoduje; jde o to, na jaké frekvenci most kmitá.

  "2-01": {
    pruchod: lavka("2-01", 24, 4, rovne(24, 4, 2)),
    // Nízká příhrada má nejméně oceli a chodcům stačí.
    rozpocet: lavka("2-01", 24, 4, rovne(24, 4, 1)),
    // Dvoumetrová pole mostovky se pod kroky skoro neprohýbají.
    mistrovska: lavka("2-01", 24, 2, rovne(24, 2, 1)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("2-01", (k) => mostovka(k, 24, 4)) },
      {
        nazev: "horní pás bez diagonál",
        navrh: navrh("2-01", (k) => {
          mostovka(k, 24, 4);
          k.prut(O, [0, 0], [4, 2]);
          k.prut(O, [4, 2], [12, 2]);
          k.prut(O, [12, 2], [20, 2]);
          k.prut(O, [20, 2], [24, 0]);
          for (const x of [4, 12, 20]) k.prut(O, [x, 0], [x, 2]);
        }),
      },
    ],
  },

  "2-02": {
    // Vyšší střed posune vlastní frekvenci mezi krok běžců (3 Hz) a jeho dvojnásobek.
    pruchod: lavka("2-02", 28, 4, [1, 2, 2, 2, 2, 1]),
    rozpocet: lavka("2-02", 28, 4, [1, 1, 2, 2, 1, 1]),
    // Vysoká příhrada s krátkými poli: tuhá jako celek i pod každým doskokem.
    mistrovska: lavka("2-02", 28, 2, rovne(28, 2, 3)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("2-02", (k) => mostovka(k, 28, 4)) },
      { nazev: "nízká příhrada kmitá v rytmu běhu", navrh: lavka("2-02", 28, 4, rovne(28, 4, 1)) },
      { nazev: "dvoumetrová příhrada kmitá na dvojnásobku kroku", navrh: lavka("2-02", 28, 4, rovne(28, 4, 2)) },
    ],
  },

  "2-03": {
    // Výš ani hlouběji než metr stavět nejde; závaží stáhne vlastní frekvenci pod krok útvaru.
    pruchod: lavka("2-03", 32, 4, rovne(32, 4, 1), zavazi([12, 16, 20], 2000)),
    rozpocet: lavka("2-03", 32, 4, rovne(32, 4, 1), zavazi([8, 12, 16, 20, 24], 1000)),
    mistrovska: lavka("2-03", 32, 4, rovne(32, 4, 1), zavazi([4, 8, 12, 16, 20, 24, 28], 2000)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("2-03", (k) => mostovka(k, 32, 4)) },
      { nazev: "nízká příhrada bez závaží", navrh: lavka("2-03", 32, 4, rovne(32, 4, 1)) },
    ],
  },

  "2-04": {
    pruchod: lavka("2-04", 32, 4, rovne(32, 4, 2)),
    // Vyladěná výška: vlastní frekvence mezi kroky útvaru a jejich dvojnásobky.
    rozpocet: lavka("2-04", 32, 4, [1, 1, 2, 2, 2, 1, 1]),
    // Dva tlumiče do kotev ve svazích: most může kmitat v rytmu pochodu, tlumiče to pohltí.
    mistrovska: lavka("2-04", 32, 4, rovne(32, 4, 1), (k) => {
      k.prut("tlumic", [8, 0], [8, -4], { tlumeni: 200_000 });
      k.prut("tlumic", [24, 0], [24, -4], { tlumeni: 200_000 });
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("2-04", (k) => mostovka(k, 32, 4)) },
      { nazev: "nízká příhrada bez tlumičů", navrh: lavka("2-04", 32, 4, rovne(32, 4, 1)) },
      { nazev: "vysoká příhrada kmitá na trojnásobku kroku", navrh: lavka("2-04", 32, 4, rovne(32, 4, 3)) },
    ],
  },

  // ---- Kapitola 3: Okresní silnice ----

  // Okresní silnice, 24 m, dva pruhy. Ocelobetonová mostovka váží sto tun: most nese hlavně
  // sám sebe. Metr vysoká příhrada se zlomí dřív, než na ni kdo vjede.
  "3-01": {
    pruchod: silnicni("3-01", 24, 3, O, O),
    rozpocet: silnicni("3-01", 24, 2, O, O),
    mistrovska: silnicni("3-01", 24, 4, O, O),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("3-01", (k) => vozovka(k, 24)) },
      { nazev: "metr vysoká příhrada neunese ani sebe", navrh: silnicni("3-01", 24, 1, O, O) },
    ],
  },

  // Pod vedením, 36 m, výš než tři metry stavět nejde. Tlačený horní pás z lehkého profilu
  // nestačí; těžký ano. Výplň a tažená mostovka těžký profil nepotřebují.
  "3-02": {
    pruchod: silnicni("3-02", 36, 3, TO, TO),
    rozpocet: silnicni("3-02", 36, 2, TO, O),
    mistrovska: silnicni("3-02", 36, 3, TO, O),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("3-02", (k) => vozovka(k, 36)) },
      { nazev: "horní pás z lehkého profilu", navrh: silnicni("3-02", 36, 3, O, O) },
      { nazev: "dvanáctimetrový horní pás z lehkého profilu se vzpírá", navrh: silnicni("3-02", 36, 3, O, O, 12) },
    ],
  },

  // Linka přes rokli, 30 m, autobusy v obou směrech po nové vozovce. Pod mostem je místa dost:
  // příhrada pod mostovkou tlačí do betonu, který tlak umí, a ocel jen táhne. Stejná příhrada
  // nad mostovkou má tlačený ocelový pás a je zhruba dvakrát víc namáhaná. Cestující
  // v autobusu poznají, jak moc se most prohýbá: mistrovská medaile chce hlubokou příhradu.
  "3-03": {
    pruchod: silnicni("3-03", 30, 3, O, O),
    rozpocet: podMostovkou("3-03", 30, 2, O, O),
    mistrovska: podMostovkou("3-03", 30, 4, O, O),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("3-03", (k) => vozovka(k, 30)) },
      { nazev: "metr vysoká příhrada nad mostovkou", navrh: silnicni("3-03", 30, 1, O, O) },
    ],
  },

  // Kolona, 2 × 24 m se skálou uprostřed. Oba konce leží na posuvných ložiskách, pevný bod
  // je jen na skále: nohy pilíře nesou půlku mostu a k tomu brzdnou sílu čtyř nákladních aut.
  "3-04": {
    pruchod: silnicni("3-04", 48, 4, O, O, 6, nohy(TO, [18, 30])),
    rozpocet: silnicni("3-04", 48, 2, O, O, 6, nohy(TO, [18, 30])),
    // Nejvíc namáhané jsou tlačené diagonály u pilíře; z těžkého profilu mají rezervu.
    mistrovska: silnicni("3-04", 48, 4, O, O, 6, (k) => {
      nohy(TO, [18, 30])(k);
      zmenPrvek(k, [12, 4], [18, 0], TO);
      zmenPrvek(k, [30, 0], [36, 4], TO);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("3-04", (k) => vozovka(k, 48)) },
      { nazev: "příhrada bez pilíře", navrh: silnicni("3-04", 48, 4, O, O) },
      { nazev: "pilíř z lehkého profilu", navrh: silnicni("3-04", 48, 4, O, O, 6, nohy(O, [18, 30])) },
    ],
  },

  // ---- Kapitola 5: Lávka II ----

  // Nábřeží, 48 m, dav 120 lidí. Prázdná dvoumetrová příhrada kmitá na 2,3 Hz, nad pásmem
  // kroků davu; s lidmi klesne na 2,0 Hz, přímo do něj. Třímetrová je i s lidmi nad pásmem.
  "5-01": {
    pruchod: lavka("5-01", 48, 4, rovne(48, 4, 4)),
    rozpocet: lavka("5-01", 48, 4, rovne(48, 4, 3)),
    // Dvoumetrová pole mostovky nedrnčí pod jednotlivými kroky.
    mistrovska: lavka("5-01", 48, 2, rovne(48, 2, 3)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("5-01", (k) => mostovka(k, 48, 4)) },
      { nazev: "dvoumetrová příhrada: prázdná mimo pásmo, s lidmi v něm", navrh: lavka("5-01", 48, 4, rovne(48, 4, 2)) },
    ],
  },

  // Městský běh, 32 m, 40 běžců kolem 2,6 Hz. Výš než metr stavět nejde a nízká příhrada
  // kmitá s běžci na 2,5 Hz, uprostřed jejich pásma. Pomůže jen laděný tlumič.
  "5-02": {
    pruchod: lavka("5-02", 32, 4, rovne(32, 4, 1), tlumice([16], 600, 2.5)),
    rozpocet: lavka("5-02", 32, 4, rovne(32, 4, 1), tlumice([16], 300, 2.5)),
    mistrovska: lavka("5-02", 32, 2, rovne(32, 2, 1), tlumice([16], 1000, 2.5)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("5-02", (k) => mostovka(k, 32, 4)) },
      { nazev: "nízká příhrada bez tlumiče", navrh: lavka("5-02", 32, 4, rovne(32, 4, 1)) },
      { nazev: "krátká pole mostovky bez tlumiče", navrh: lavka("5-02", 32, 2, rovne(32, 2, 1)) },
    ],
  },

  // Slavnost, 36 m, průvod 48 lidí s kapelou v taktu 2,0 Hz. Prázdný most kmitá na 2,2 Hz,
  // s průvodem na 2,0 Hz: tlumič se ladí na most s lidmi.
  "5-03": {
    pruchod: lavka("5-03", 36, 4, rovne(36, 4, 1), tlumice([16], 600, 2)),
    rozpocet: lavka("5-03", 36, 4, rovne(36, 4, 1), tlumice([16], 400, 2)),
    mistrovska: lavka("5-03", 36, 4, rovne(36, 4, 1), tlumice([16], 1200, 2)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("5-03", (k) => mostovka(k, 36, 4)) },
      { nazev: "nízká příhrada bez tlumiče", navrh: lavka("5-03", 36, 4, rovne(36, 4, 1)) },
      { nazev: "tlumič naladěný daleko od mostu", navrh: lavka("5-03", 36, 4, rovne(36, 4, 1), tlumice([16], 1200, 3.2)) },
    ],
  },

  // Koncert na mostě, 32 m, 30 lidí skáče v rytmu 2,2 Hz. Skákání budí i na dvojnásobku
  // a trojnásobku rytmu; dvoumetrová příhrada s lidmi kmitá na 4,5 Hz, přímo na dvojnásobku.
  // Tlumič se ladí na 4,4 Hz a mostovka musí mít krátká pole, jinak drnčí sama.
  "5-04": {
    pruchod: lavka("5-04", 32, 2, rovne(32, 2, 2), tlumice([16], 1000, 4.4)),
    rozpocet: lavka("5-04", 32, 2, rovne(32, 2, 2), tlumice([16], 700, 4.4)),
    mistrovska: lavka("5-04", 32, 2, rovne(32, 2, 2), tlumice([14, 18], 1000, 4.4)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("5-04", (k) => mostovka(k, 32, 4)) },
      { nazev: "dvoumetrová příhrada bez tlumiče", navrh: lavka("5-04", 32, 2, rovne(32, 2, 2)) },
      { nazev: "dlouhá pole mostovky", navrh: lavka("5-04", 32, 4, rovne(32, 4, 2), tlumice([16], 1000, 4.4)) },
    ],
  },
};
