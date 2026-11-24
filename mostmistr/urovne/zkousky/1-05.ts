// Referenční mosty zkouškové úrovně 1-05 „Nad lesní cestou“: silnice přes údolí 20 m, kotva ve
// svahu jen vlevo. Nad levou částí mostovky a pod pravou částí se stavět nesmí, takže levých
// osm metrů nesou vzpěry z kotvy (lekce 1-02 a 1-04) a pravých dvanáct příhrada nad mostovkou
// (lekce 1-01 a 1-03). Přes most jedou dvě dodávky těsně za sebou a pak dodávka proti dvěma autům.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const L: IdPrvku = "drevo-lehke";
const T: IdPrvku = "drevo-tezke";
type Bod = [number, number];

function navrh(stav: (k: Kreslic) => void): NavrhMostu {
  const k = new Kreslic("1-05");
  stav(k);
  return k.navrh();
}

/** Mostovka přes styčníky `xs` (první a poslední jsou opěry). */
function mostovka(k: Kreslic, xs: readonly number[]): void {
  for (let i = 0; i + 1 < xs.length; i++) k.prut("mostovka-drevo", [xs[i]!, 0], [xs[i + 1]!, 0]);
}

const PO_CTYRECH = [0, 4, 8, 12, 16, 20];

/** Řetěz prutů z prvku `prvek` přes body `body`. */
function retez(k: Kreslic, prvek: IdPrvku, body: readonly Bod[]): void {
  for (let i = 0; i + 1 < body.length; i++) k.prut(prvek, body[i]!, body[i + 1]!);
}

/**
 * Levá strana jako v 1-04: sloup nad kotvou (4, −4), lomená vzpěra z kotvy přes uzel (6, −2)
 * do styčníku mostovky (8, 0) a šikmina, která uzel drží. Všechno z lehkého trámu; nejdelší
 * tlačený prut měří 2,8 m.
 */
function vzperyZKotvy(k: Kreslic): void {
  k.prut(L, [4, -4], [4, 0]);
  retez(k, L, [[4, -4], [6, -2], [8, 0]]);
  k.prut(L, [4, 0], [6, -2]);
}

/**
 * Dvojité věšadlo nad pravou částí (8 až 20 m) jako v 1-03: krajní šikminy z prvku `krajni`,
 * pás ve výšce `h` z prvku `pas`, dva sloupky a diagonála.
 */
function dvojiteVesadlo(k: Kreslic, h: number, krajni: IdPrvku, pas: IdPrvku): void {
  k.prut(krajni, [8, 0], [12, h]);
  k.prut(pas, [12, h], [16, h]);
  k.prut(krajni, [16, h], [20, 0]);
  k.prut(L, [12, 0], [12, h]);
  k.prut(L, [16, 0], [16, h]);
  k.prut(L, [12, h], [16, 0]);
}

/**
 * Příhrada nad pravou částí jen z lehkého trámu: krajní šikminy z opěr do pásu ve výšce `h`,
 * pás se styčníky po třech metrech (11, 14 a 17 m) a oba styčníky mostovky (12 a 16 m) zavěšené
 * dvěma pruty na sousední styčníky pásu. Sedmnáct metrů prutů v jedenácti kusech; čím vyšší
 * pás, tím menší síly v něm i v krajních šikminách.
 */
function lichobeznik(k: Kreslic, h: number): void {
  retez(k, L, [[8, 0], [11, h], [14, h], [17, h], [20, 0]]);
  k.prut(L, [12, 0], [11, h]);
  k.prut(L, [12, 0], [14, h]);
  k.prut(L, [16, 0], [14, h]);
  k.prut(L, [16, 0], [17, h]);
}

export const reseni: ReseniUrovne = {
  // Co hráč postaví nejspíš jako první: vzpěry z 1-04 a příhrada z 1-03 s těžkými krajními
  // šikminami a těžkým pásem. Projde s rezervou, ale těžký trám ji prodraží nad inženýrský rozpočet.
  pruchod: navrh((k) => {
    mostovka(k, PO_CTYRECH);
    vzperyZKotvy(k);
    dvojiteVesadlo(k, 2, T, T);
  }),
  // Lehká příhrada vysoká jen metr: nejlevnější most, o kterém se ví. Ploché krajní šikminy
  // (3,2 m) a třímetrový pás nesou velký tlak a jsou na 87 %.
  rozpocet: navrh((k) => {
    mostovka(k, PO_CTYRECH);
    vzperyZKotvy(k);
    lichobeznik(k, 1);
  }),
  // Tatáž příhrada o metr vyšší: síly v pásu i v šikminách klesnou skoro na polovinu a rozhodují
  // vzpěry z kotvy (53 %). Stejně dobře vyjde metr vysoká příhrada s pásem po dvou metrech
  // a sloupky (93 082 Kč, 54 %); viz zpráva.
  mistrovska: navrh((k) => {
    mostovka(k, PO_CTYRECH);
    vzperyZKotvy(k);
    lichobeznik(k, 2);
  }),
  pady: [
    { nazev: "jen mostovka", navrh: navrh((k) => mostovka(k, PO_CTYRECH)) },
    // Tvar, kterým se dá projít 1-04 (vzpěry z kotvy), přenesený sem: napravo kotva není
    // a pravých dvanáct metrů nemá na čem ležet.
    {
      nazev: "jen vzpěry z kotvy jako v 1-04",
      navrh: navrh((k) => {
        mostovka(k, PO_CTYRECH);
        vzperyZKotvy(k);
      }),
    },
    // Jen lekce 1-03: příhrada nad pravou částí a kotva ve svahu nevyužitá. Levá část se složí.
    {
      nazev: "jen příhrada nad pravou částí",
      navrh: navrh((k) => {
        mostovka(k, PO_CTYRECH);
        dvojiteVesadlo(k, 2, T, T);
      }),
    },
    // Obě lekce, ale bez citu pro vzpěr: čtyřmetrové pruty z lehkého trámu se pod dodávkami vzepřou.
    {
      nazev: "vzpěry a dvojité věšadlo jen z lehkého trámu",
      navrh: navrh((k) => {
        mostovka(k, PO_CTYRECH);
        vzperyZKotvy(k);
        dvojiteVesadlo(k, 2, L, L);
      }),
    },
    // Přímá vzpěra z kotvy do styčníku (8, 0) měří 5,7 m: z lehkého trámu se vzepře.
    {
      nazev: "přímá vzpěra z lehkého trámu",
      navrh: navrh((k) => {
        mostovka(k, PO_CTYRECH);
        k.prut(L, [4, -4], [4, 0]);
        k.prut(L, [4, -4], [8, 0]);
        lichobeznik(k, 2);
      }),
    },
  ],
};
