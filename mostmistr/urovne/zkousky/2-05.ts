// Referenční mosty zkouškové úrovně 2-05 „Pochod a běh“: lávka 36 m, přes kterou pochoduje útvar
// (24 lidí, 1,8 Hz) a po něm běží devět běžců v rytmu (3 Hz). Výš než metr nad mostovku a pod ni se
// stavět nesmí, takže most nejde ztužit: jeho první vlastní frekvence (2,1 Hz, s lidmi 1,8 Hz) leží
// přesně v rytmu pochodu. Běžci prohýbají dlouhá pole mostovky. Tlumič má jedinou kotvu, ve třetině
// rozpětí u levého břehu.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const O: IdPrvku = "ocel-lehka";
type Bod = [number, number];
type Uprava = (k: Kreslic) => void;

/** Styčníky mostovky po stejných polích od 0 do 36 m. */
function poPolich(pole: number): number[] {
  return Array.from({ length: 36 / pole + 1 }, (_, i) => i * pole);
}

/**
 * Nízká ocelová lávka: dřevěná mostovka přes styčníky `xs` a metr nad ní pás se styčníky nad
 * místy `svislice`. Pod každým styčníkem pásu stojí svislice; ostatní styčníky mostovky drží
 * diagonály k nejbližšímu styčníku pásu vlevo a vpravo (krajní jen k jednomu).
 */
function lavka(xs: readonly number[], svislice: readonly number[], uprava?: Uprava): NavrhMostu {
  const k = new Kreslic("2-05");
  for (let i = 0; i + 1 < xs.length; i++) k.prut("mostovka-drevo", [xs[i]!, 0], [xs[i + 1]!, 0]);
  const horni = svislice.map((x): Bod => [x, 1]);
  for (let i = 0; i + 1 < horni.length; i++) k.prut(O, horni[i]!, horni[i + 1]!);
  for (const x of svislice) k.prut(O, [x, 0], [x, 1]);
  for (const x of xs) {
    if (svislice.includes(x)) continue;
    const vlevo = horni.filter(([hx]) => hx < x).at(-1);
    const vpravo = horni.find(([hx]) => hx > x);
    if (vlevo) k.prut(O, [x, 0], vlevo);
    if (vpravo) k.prut(O, [x, 0], vpravo);
  }
  uprava?.(k);
  return k.navrh();
}

/**
 * Nízká příhrada, jak ji učí 2-03: svislice nad každým styčníkem mostovky po čtyřech metrech,
 * pás metr nad mostovkou a diagonály klesající ke středu.
 */
function plnaLavka(uprava?: Uprava): NavrhMostu {
  const xs = poPolich(4);
  const k = new Kreslic("2-05");
  for (let i = 0; i + 1 < xs.length; i++) k.prut("mostovka-drevo", [xs[i]!, 0], [xs[i + 1]!, 0]);
  k.prut(O, [0, 0], [4, 1]);
  k.prut(O, [32, 1], [36, 0]);
  for (let x = 4; x < 32; x += 4) k.prut(O, [x, 1], [x + 4, 1]);
  for (let x = 4; x <= 32; x += 4) k.prut(O, [x, 0], [x, 1]);
  for (let x = 4; x < 32; x += 4) k.prut(O, x < 18 ? [x, 1] : [x, 0], x < 18 ? [x + 4, 0] : [x + 4, 1]);
  uprava?.(k);
  return k.navrh();
}

/** Viskózní tlumič ze styčníku mostovky nad kotvou (12 m) do kotvy; `tlumeni` v N·s/m. */
const tlumic = (tlumeni: number): Uprava => (k) => {
  k.prut("tlumic", [12, 0], [12, -4], { tlumeni });
};

/** Závaží `kg` v každém ze styčníků mostovky `mista`. */
const zavazi = (mista: readonly number[], kg: number): Uprava => (k) => {
  for (const x of mista) k.bod(x, 0, { zavazi: kg });
};

const spolu = (...upravy: Uprava[]): Uprava => (k) => {
  for (const u of upravy) u(k);
};

/** Svislice nad každým druhým styčníkem mostovky, počínaje prvním vnitřním. */
const OB_JEDEN_3 = [3, 9, 15, 21, 27, 33];
const OB_JEDEN_2 = [4, 8, 12, 16, 20, 24, 28, 32];

export const reseni: ReseniUrovne = {
  // Cesta bez tlumiče: dvoumetrová pole a šest tun závaží uprostřed, které stáhnou vlastní
  // frekvenci pod rytmus pochodu a běžcům přidají hmotu. Kmitá málo, ale je drahá.
  pruchod: lavka(poPolich(2), OB_JEDEN_2, zavazi([16, 18, 20], 2000)),
  // Třímetrová pole, svislice jen po šesti metrech a tlumič s výchozím tlumením: nejlevnější
  // tvar, o kterém se ví, že projde. Pochod tlumič zkrotí jen napůl a běžci most rozhoupou.
  rozpocet: lavka(poPolich(3), [6, 12, 18, 24, 30], tlumic(50_000)),
  // Třímetrová pole se svislicí ob styčník, tlumič přitažený na 150 kN·s/m a dvě tuny závaží
  // uprostřed: tlumič bere pochod, závaží přidá hmotu proti běžcům.
  mistrovska: lavka(poPolich(3), OB_JEDEN_3, spolu(tlumic(150_000), zavazi([18], 2000))),
  pady: [
    { nazev: "jen mostovka", navrh: lavka(poPolich(4), []) },
    // Tvar, kterým se dá projít 2-04 (lehká příhrada se čtyřmetrovými poli a tlumič do kotvy):
    // tlumič pochod utlumí, ale čtyřmetrová pole se pod běžci prohýbají.
    { nazev: "lehká lávka z 2-04 s jedním tlumičem", navrh: lavka(poPolich(4), [8, 16, 24, 32], tlumic(200_000)) },
    // Jen jedna lekce: krátká pole bez tlumiče a bez závaží. Most kmitá v rytmu pochodu.
    { nazev: "krátká pole bez tlumiče a bez závaží", navrh: lavka(poPolich(3), OB_JEDEN_3) },
    // Jen jedna lekce: nízká příhrada z 2-03 s osmi tunami závaží. Pochod neublíží, běžci ano.
    { nazev: "nízká příhrada z 2-03 se závažím", navrh: plnaLavka(zavazi([12, 16, 20, 24], 2000)) },
    // Závaží málo: dvě tuny stáhnou vlastní frekvenci s lidmi z 1,84 na 1,69 Hz, přímo do rytmu pochodu.
    { nazev: "krátká pole a jen dvě tuny závaží", navrh: lavka(poPolich(3), OB_JEDEN_3, zavazi([18], 2000)) },
  ],
};
