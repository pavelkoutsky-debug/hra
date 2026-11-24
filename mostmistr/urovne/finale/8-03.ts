// Referenční mosty úrovně 8-03 „Přístavní trať“ (závěrečná kapitola): přístavní trať přes
// plavební kanál 30 m. Strojovna je v levé zdi (čep a kotvy pro píst 3 a 5 m pod ním), vpravo
// leží konec křídla na ložisku se zámkem. Ráno přejede lokomotiva, pak se most zvedne pro loď
// vysokou 14 m a po sklopení přes něj projede nákladní vlak se třemi loženými vozy.
// Spojuje kapitolu 6 (vlak unese jen příhrada nad kolejí) a kapitolu 7 (píst z hluboké kotvy,
// zdvih podle lodi, zámek na ložisku). Bonus je měkké dosednutí: jediný píst křídlo spouští
// rychle (konec dosedá kolem 3 m/s), s druhým pístem z druhé kotvy dosedne kolem 2 m/s.
// Mistrovská proto chce lehké křídlo a druhý píst. Písty se přitom o tíhu nedělí: mají jinou
// kinematiku a přetlačují se (při zvedání nese křídlo mělký píst na ventilu, při sklápění je
// na ventilu hluboký a mělký křídlo brzdí); změřila to nezávislá kontrola výpočtů M14.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const O: IdPrvku = "ocel-lehka";
const KOLEJ: IdPrvku = "kolejiste";
const ROZPETI = 30;
type Bod = [number, number];

interface Pist {
  /** Hloubka kotvy pod čepem (3 nebo 5 m). */
  hloubka: number;
  /** Vzdálenost styčníku kolejiště od čepu. */
  kam: number;
  zdvih: number;
}

interface Kridlo {
  /** Styčníky kolejiště (vzdálenost od čepu), mezi nimi díly kolejiště. */
  uzly?: number[];
  /** Svařit vnitřní styčníky kolejiště. */
  svar?: boolean;
  pruty?: [IdPrvku, Bod, Bod][];
  pisty?: Pist[];
  zamek?: boolean;
}

const PO_SESTI = [0, 6, 12, 18, 24, 30];

/** Jedno křídlo přes celý kanál: čep vlevo, zámek na ložisku vpravo. */
function kridlo(v: Kridlo): NavrhMostu {
  const k = new Kreslic("8-03");
  const uzly = v.uzly ?? PO_SESTI;
  for (let i = 0; i + 1 < uzly.length; i++) k.prut(KOLEJ, [uzly[i]!, 0], [uzly[i + 1]!, 0]);
  if (v.svar) for (const x of uzly.slice(1, -1)) k.bod(x, 0, { svar: true });
  for (const [prvek, a, b] of v.pruty ?? []) k.prut(prvek, a, b);
  for (const p of v.pisty ?? []) k.prut("pist", [0, -p.hloubka], [p.kam, 0], { zdvih: p.zdvih });
  if (v.zamek !== false) k.bod(ROZPETI, 0, { zamek: true });
  return k.navrh();
}

/** Langerův trám: lomený oblouk nad kolejí s vrcholy nad styčníky 6, 12, 18 a 24 m, svislice do kolejiště. */
function langer(vysky: readonly number[]): [IdPrvku, Bod, Bod][] {
  const xs = [6, 12, 18, 24];
  const body: Bod[] = [[0, 0], ...xs.map((x, i): Bod => [x, vysky[i]!]), [ROZPETI, 0]];
  const p: [IdPrvku, Bod, Bod][] = [];
  for (let i = 0; i + 1 < body.length; i++) p.push([O, body[i]!, body[i + 1]!]);
  xs.forEach((x, i) => p.push([O, [x, 0], [x, vysky[i]!]]));
  return p;
}

/** Trojúhelníková příhrada nad kolejí (most pro mistrovskou z 6-01): vrcholy nad středy polí. */
function warren(vysky: readonly number[]): [IdPrvku, Bod, Bod][] {
  const p: [IdPrvku, Bod, Bod][] = [];
  vysky.forEach((h, i) => {
    const x = 6 * i;
    p.push([O, [x, 0], [x + 3, h]]);
    p.push([O, [x + 3, h], [x + 6, 0]]);
    if (i + 1 < vysky.length) p.push([O, [x + 3, h], [x + 9, vysky[i + 1]!]]);
  });
  return p;
}

/** Totéž zrcadlené pod kolej: dolní styčníky v hloubkách `hloubky`. */
function warrenPod(hloubky: readonly number[]): [IdPrvku, Bod, Bod][] {
  return warren(hloubky).map(([prvek, a, b]) => [prvek, [a[0], -a[1]], [b[0], -b[1]]]);
}

/** Píst z hluboké kotvy do styčníku 6 m od čepu: zvedne křídlo o 57°; o 49° (zdvih 2,5 m) je málo. */
const HLUBOKY: Pist = { hloubka: 5, kam: 6, zdvih: 2.75 };
/** Píst z mělké kotvy do téhož styčníku (jako v 7-03): zvedl by o 59°, ale sám nemá sílu. */
const MELKY: Pist = { hloubka: 3, kam: 6, zdvih: 2 };

export const reseni: ReseniUrovne = {
  // Most pro mistrovskou z 6-01 se správným pístem: projde, ale je těžký a drahý a dosedá tvrdě (1,5 MN).
  pruchod: kridlo({ pruty: warren([3, 5, 6, 5, 3]), pisty: [HLUBOKY] }),
  // Nejlevnější známý most: nízký Langerův trám 2-3-3-2 a jeden píst; křídlo dosedá rychle.
  rozpocet: kridlo({ svar: true, pruty: langer([2, 3, 3, 2]), pisty: [HLUBOKY] }),
  // Týž trám a druhý píst z mělké kotvy do téhož styčníku: při sklápění křídlo brzdí a to dosedne měkce.
  mistrovska: kridlo({ svar: true, pruty: langer([2, 3, 3, 2]), pisty: [HLUBOKY, MELKY] }),
  pady: [
    // Svařené kolejiště se zámkem: zlomí ho už ranní lokomotiva.
    { nazev: "jen kolejiště", navrh: kridlo({ svar: true }) },
    // Jen kapitola 7: svařená mostovka s pístem jako v 7-03 (pole po 4 m); píst by ji zvedl, vlak ji zlomí.
    {
      nazev: "most jako v 7-03: svařené kolejiště s pístem, bez příhrady",
      navrh: kridlo({ uzly: [0, 4, 8, 12, 16, 20, 24, 28, 30], svar: true, pisty: [{ hloubka: 5, kam: 4, zdvih: 2.25 }] }),
    },
    // Příhrada z 6-01 vlak unese, ale píst z mělké kotvy ji nezvedne a loď narazí.
    { nazev: "most jako v 6-01 s pístem z mělké kotvy", navrh: kridlo({ pruty: warren([3, 5, 6, 5, 3]), pisty: [MELKY] }) },
    // Jen kapitola 6: bez pístu se křídlo nezvedne a loď narazí; navíc pod nákladním vlakem povolí
    // oblouk u čepu, protože zavřené křídlo jinak podpírá i píst.
    { nazev: "Langerův trám bez pístu", navrh: kridlo({ svar: true, pruty: langer([2, 3, 3, 2]) }) },
    // Příhrada pod kolejí unese vlak a píst ji zvedne, ale zvednutá trčí lodi do cesty.
    { nazev: "příhrada pod kolejí", navrh: kridlo({ pruty: warrenPod([2, 3, 3, 3, 2]), pisty: [HLUBOKY] }) },
    // Správný píst s malým zdvihem 2,5 m: křídlo se zvedne jen o 49° a loď o ně zavadí.
    { nazev: "malý zdvih", navrh: kridlo({ svar: true, pruty: langer([2, 3, 3, 2]), pisty: [{ ...HLUBOKY, zdvih: 2.5 }] }) },
  ],
};
