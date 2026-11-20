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
};
