// Referenční mosty zkouškové úrovně 6-05 „Nestejná pole“: trať 66 m s jediným základem ve 24 m,
// oba konce na posuvných ložiskách. Levé pole (24 m) vede nad nivou, pravé (42 m) nad plavební
// dráhou: pod ním se stavět nesmí. Nejdřív projede rychlík (lokomotiva a čtyři osobní vozy,
// 100 km/h), po něm nákladní vlak (lokomotiva a osm ložených vozů), který na mostě nouzově
// zabrzdí (2,5 m/s²). Brzdnou sílu nese jediný pilíř: holý ani se svařenou hlavou to nevydrží,
// potřebuje vzpěru z dříku, a ta smí jen doleva. Příhrada se svislicemi z lehké oceli, která
// stačí krátkému poli, nad dlouhým polem povolí v tlačeném pásu; unese ho těžký pás, nebo
// trojúhelníková příhrada s krátkými tlačenými pruty. Pohodlí v rychlíku (bonus 0,5 m/s²)
// rozhoduje hlavně krátké pole a to, jestli je příhrada nad pilířem průběžná.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const O: IdPrvku = "ocel-lehka";
const TO: IdPrvku = "ocel-tezka";
const ROZPETI = 66;
/** Kde stojí pilíř, jak hluboko má patu a v jaké výšce z něj vede vzpěra (půlka dříku). */
const PILIR = 24;
const PATA = -12;
const PULKA = -6;

type Dil = (k: Kreslic) => void;

function navrh(...dily: Dil[]): NavrhMostu {
  const k = new Kreslic("6-05");
  for (const dil of dily) dil(k);
  return k.navrh();
}

/** Kolejiště z polí po šesti metrech od opěry k opěře. */
const kolej: Dil = (k) => {
  for (let x = 0; x < ROZPETI; x += 6) k.prut("kolejiste", [x, 0], [x + 6, 0]);
};

/** Betonový pilíř ze základu do kolejiště se styčníkem v půlce dříku. */
const pilir: Dil = (k) => {
  k.prut("pilir", [PILIR, PATA], [PILIR, PULKA]);
  k.prut("pilir", [PILIR, PULKA], [PILIR, 0]);
};

/**
 * Příhrada se svislicemi jednoho pole mezi `od` a `po` s poli 6 m: pod kolejí (`h` záporné)
 * nebo nad ní. Krajní šikminy a pás z prvku `pas`, svislice a diagonály lehké; diagonály míří
 * ke středu pole.
 */
function seSvislicemi(od: number, po: number, h: number, pas: IdPrvku = O): Dil {
  return (k) => {
    k.prut(pas, [od, 0], [od + 6, h]);
    k.prut(pas, [po - 6, h], [po, 0]);
    for (let x = od + 6; x < po - 6; x += 6) k.prut(pas, [x, h], [x + 6, h]);
    for (let x = od + 6; x <= po - 6; x += 6) k.prut(O, [x, 0], [x, h]);
    for (let x = od + 6; x < po - 6; x += 6) {
      const dolu = (x < (od + po) / 2) === h > 0;
      k.prut(O, dolu ? [x, h] : [x, 0], dolu ? [x + 6, 0] : [x + 6, h]);
    }
  };
}

/**
 * Trojúhelníková příhrada nad kolejí bez svislic, celá z lehké oceli: vrcholy nad středy
 * šestimetrových polí koleje od `od` ve výškách `vysky`, z každého šikminy do obou sousedních
 * styčníků koleje a pás k dalšímu vrcholu. Tlačené pruty jsou krátké, takže nevybočí.
 */
function trojuhelniky(od: number, vysky: readonly number[]): Dil {
  return (k) => {
    vysky.forEach((h, i) => {
      const x = od + 6 * i;
      k.prut(O, [x, 0], [x + 3, h]);
      k.prut(O, [x + 3, h], [x + 6, 0]);
      if (i + 1 < vysky.length) k.prut(O, [x + 3, h], [x + 9, vysky[i + 1]!]);
    });
  };
}

/** Jeden prut navíc. */
function prut(prvek: IdPrvku, a: [number, number], b: [number, number]): Dil {
  return (k) => {
    k.prut(prvek, a, b);
  };
}

/** Svar hlavy pilíře s kolejištěm. */
const svarHlavy: Dil = (k) => {
  k.bod(PILIR, 0, { svar: true });
};

export const reseni: ReseniUrovne = {
  // Jistota: příhrady se svislicemi (tři metry pod krátkým polem, pět metrů nad dlouhým), nad
  // dlouhým polem těžký horní pás, a těžká vzpěra z půlky pilíře do kolejiště. Nic není nad
  // 57 %, ale do inženýrského rozpočtu se nevejde a rychlík se na krátkém poli houpe (0,58 m/s²).
  pruchod: navrh(kolej, pilir, seSvislicemi(0, PILIR, -3), seSvislicemi(PILIR, ROZPETI, 5, TO), prut(TO, [PILIR, PULKA], [18, 0])),
  // Nejlevnější cesta: metr vysoká příhrada pod krátkým polem, nad dlouhým lehké trojúhelníky
  // (3 až 6 m) a lehká vzpěra z půlky pilíře do dolního pásu sousední příhrady. Unese to (88 %),
  // ale krátké pole je měkké a rychlík se na něm rozhoupe: ve voze je 2,03 m/s².
  rozpocet: navrh(
    kolej,
    pilir,
    seSvislicemi(0, PILIR, -1),
    trojuhelniky(PILIR, [3, 5, 6, 6, 6, 5, 3]),
    prut(O, [PILIR, PULKA], [18, -1]),
  ),
  // Trojúhelníky nad oběma poli a horní pás průběžný přes pilíř (prut z (21, 4) do (27, 4)):
  // most je nad pilířem spojitý, krátké pole se pod vozem prohne míň a ve voze je 0,44 m/s².
  // Bez toho jednoho prutu je to 0,60. Lehká vzpěra z půlky pilíře do kolejiště je na 92 %.
  mistrovska: navrh(
    kolej,
    pilir,
    trojuhelniky(0, [3, 3, 3, 4]),
    prut(O, [21, 4], [27, 4]),
    trojuhelniky(PILIR, [4, 5, 6, 6, 6, 5, 4]),
    prut(O, [PILIR, PULKA], [18, 0]),
  ),
  pady: [
    { nazev: "jen kolejiště", navrh: navrh(kolej) },
    { nazev: "kolejiště na pilíři bez příhrad", navrh: navrh(kolej, pilir) },
    // Bez pilíře nemá most na dvou posuvných ložiskách co držet a dlouhé pole se zlomí.
    {
      nazev: "příhrady bez pilíře",
      navrh: navrh(kolej, seSvislicemi(0, PILIR, -3), trojuhelniky(PILIR, [4, 6, 7, 8, 7, 6, 4])),
    },
    // Most pro průchod z 6-03 na tomhle údolí: stejně vysoké lehké příhrady v obou polích
    // (pod dlouhé pole se nesmí, tak nad ním) a svařená hlava pilíře.
    {
      nazev: "most z 6-03: stejné lehké příhrady a svařená hlava pilíře",
      navrh: navrh(kolej, pilir, seSvislicemi(0, PILIR, -4), seSvislicemi(PILIR, ROZPETI, 4), svarHlavy),
    },
    // Jedna lekce (pilíř a brzdění): vzpěra je, ale dlouhé pole má stejnou lehkou příhradu jako
    // krátké a jeho tlačený horní pás vybočí.
    {
      nazev: "vzpěra z pilíře, ale dlouhé pole jako krátké",
      navrh: navrh(kolej, pilir, seSvislicemi(0, PILIR, -4), seSvislicemi(PILIR, ROZPETI, 4), prut(O, [PILIR, PULKA], [18, -4])),
    },
    // Jedna lekce (dlouhé pole): příhrady unesou, ale pilíř bez vzpěry se pod brzdícím vlakem zlomí.
    {
      nazev: "dobré příhrady, pilíř bez vzpěry",
      navrh: navrh(kolej, pilir, seSvislicemi(0, PILIR, -3), trojuhelniky(PILIR, [4, 6, 7, 8, 7, 6, 4])),
    },
    // V 6-03 stačilo hlavu pilíře svařit s kolejištěm. Jediný pilíř nese celou brzdnou sílu a svar nestačí.
    {
      nazev: "dobré příhrady, hlava pilíře svařená místo vzpěry",
      navrh: navrh(kolej, pilir, seSvislicemi(0, PILIR, -3), trojuhelniky(PILIR, [4, 6, 7, 8, 7, 6, 4]), svarHlavy),
    },
  ],
};
