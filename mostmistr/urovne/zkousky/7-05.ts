// Referenční mosty zkouškové úrovně 7-05 „Jediné křídlo“: kanál 20 m, strojovna (čep a kotvy
// pro píst 3 a 5 m pod ním) jen v levé zdi, vpravo pouhé ložisko. Jedno dvacetimetrové křídlo
// se zámkem na pravé opěře musí uhnout lodi o 45° a po sklopení unést nákladní auto.
// Křídlo zvedne a udrží jen píst z hluboké kotvy uchycený co nejdál od čepu (lekce 7-03 a 7-04
// naráz); bonus chce zkrátit nebo vyztužit převislý konec, který se při zvedání ohýbá.

import type { IdPrvku } from "../../src/data/katalog";
import { Kreslic } from "../../src/data/kreslic";
import type { NavrhMostu } from "../../src/data/navrh";
import type { ReseniUrovne } from "../reseni";

const O: IdPrvku = "ocel-lehka";
const TO: IdPrvku = "ocel-tezka";
const ROZPETI = 20;
type Bod = [number, number];

function navrh(stav: (k: Kreslic) => void): NavrhMostu {
  const k = new Kreslic("7-05");
  stav(k);
  return k.navrh();
}

/**
 * Křídlo s čepem v levé opěře: ocelová mostovka přes vnitřní styčníky `uzly` (metry od čepu),
 * svařené, pokud `svar` neřekne jinak, a zámek na pravé opěře, pokud ho `zamek` nevypne.
 */
function kridlo(k: Kreslic, uzly: readonly number[], volby: { svar?: boolean; zamek?: boolean } = {}): void {
  const xs = [0, ...uzly, ROZPETI];
  for (let i = 0; i + 1 < xs.length; i++) k.prut("mostovka-ocel", [xs[i]!, 0], [xs[i + 1]!, 0]);
  if (volby.svar !== false) for (const x of uzly) k.bod(x, 0, { svar: true });
  if (volby.zamek !== false) k.bod(ROZPETI, 0, { zamek: true });
}

/** Píst z kotvy `hloubka` metrů pod čepem do bodu `kam` (na mostovce nebo pod ní). */
function pist(k: Kreslic, hloubka: number, kam: Bod, zdvih: number): void {
  k.prut("pist", [0, -hloubka], kam, { zdvih });
}

/** Holé křídlo po polích 6, 5, 5 a 4 m s jedním pístem do styčníku mostovky. */
function hole(hloubka: number, kam: number, zdvih: number, uzly: readonly number[] = [6, 11, 16]): NavrhMostu {
  return navrh((k) => {
    kridlo(k, uzly);
    pist(k, hloubka, [kam, 0], zdvih);
  });
}

export const reseni: ReseniUrovne = {
  // Trojúhelník nad kořenem křídla (sloupek nad pístem, táhla k čepu a 11 m od čepu): ohyb srazí
  // na 30 %, ale stojí 688 tisíc a do inženýrského rozpočtu se nevejde. Jen průchod.
  pruchod: navrh((k) => {
    kridlo(k, [6, 11, 16]);
    pist(k, 5, [6, 0], 2.75);
    k.prut(O, [0, 0], [6, 3]);
    k.prut(O, [6, 0], [6, 3]);
    k.prut(O, [6, 3], [11, 0]);
  }),
  // Holé křídlo, píst z hluboké kotvy šest metrů od čepu: nejlevnější most úrovně. Převislých
  // čtrnáct metrů se při odemknutí zámku ohne na 47 % únosnosti, bonus mine.
  rozpocet: hole(5, 6, 2.75),
  // Trojúhelník pod křídlem mezi styčníky 5 a 10 m, píst do jeho spodního vrcholu (7, −2):
  // píst tlačí kolměji a přední vzpěra z těžké oceli podpírá mostovku deset metrů od čepu,
  // takže převislý konec měří jen deset metrů. Zdvih 3,75 m křídlo zvedne o 60°.
  mistrovska: navrh((k) => {
    kridlo(k, [5, 10, 15]);
    k.prut(O, [5, 0], [7, -2]);
    k.prut(TO, [7, -2], [10, 0]);
    pist(k, 5, [7, -2], 3.75);
  }),
  pady: [
    // Pravý konec leží na ložisku, takže se neskládá; křídlo se ale nezvedne a loď narazí.
    { nazev: "jen mostovka", navrh: navrh((k) => kridlo(k, [6, 11, 16])) },
    // Most pro průchod a rozpočtovou z 7-04: nejhlubší kotva, píst čtyři metry od čepu.
    { nazev: "tvar ze 7-04: píst z hluboké kotvy 4 m od čepu zvednuté křídlo neudrží", navrh: hole(5, 4, 2.25, [4, 9, 15]) },
    // Most pro mistrovskou ze 7-04: mělká kotva, píst sedm metrů od čepu.
    { nazev: "tvar ze 7-04: píst z mělké kotvy 7 m od čepu zvednuté křídlo neudrží", navrh: hole(3, 7, 1.75, [4, 7, 11, 16]) },
    // Jen jedna lekce: správný píst (hluboká kotva, co nejdál od čepu), ale zdvih jako v 7-03.
    { nazev: "správný píst s malým zdvihem: křídlo se zvedne jen o 41° a loď narazí", navrh: hole(5, 6, 2.25) },
    // Jen jedna lekce: velký zdvih z mělké kotvy blízko čepu (křídlo se ani nezvedne).
    { nazev: "píst z mělké kotvy 4 m od čepu křídlo nezvedne", navrh: hole(3, 4, 1.5, [4, 9, 15]) },
    {
      nazev: "bez zámku: konec křídla drží ložisko",
      navrh: navrh((k) => {
        kridlo(k, [6, 11, 16], { zamek: false });
        pist(k, 5, [6, 0], 2.75);
      }),
    },
    {
      nazev: "poslední styčník mostovky nesvařený: konec křídla se při zvedání zlomí v kloubu",
      navrh: navrh((k) => {
        kridlo(k, [6, 11, 16]);
        k.bod(16, 0, { svar: false });
        pist(k, 5, [6, 0], 2.75);
      }),
    },
  ],
};
