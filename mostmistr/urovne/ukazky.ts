// Ukázky k úrovním: dvojice mostů ve stejné situaci, které vedle sebe předvedou, proč je
// potřeba prvek nebo postup, který úroveň učí. Přehrávají se v okně se zadáním. Mosty
// vycházejí z referenčních řešení, ale neukazují nejlevnější ani nejlepší z nich.

import type { NavrhMostu } from "../src/data/navrh";
import type { PolozkaJizdnihoRadu, Uroven } from "../src/data/uroven";
import { RESENI } from "./reseni";

export interface StranaUkazky {
  uroven: Uroven;
  navrh: NavrhMostu;
}

export interface UkazkaUrovne {
  a: StranaUkazky;
  b: StranaUkazky;
}

/** Stejný most s jinou silou všech tlumičů. */
function sTlumenim(navrh: NavrhMostu, tlumeni: number): NavrhMostu {
  return { ...navrh, pruty: navrh.pruty.map((p) => (p.prvek === "tlumic" ? { ...p, tlumeni } : p)) };
}

function sProvozem(uroven: Uroven, jizdniRad: PolozkaJizdnihoRadu[]): Uroven {
  return { ...uroven, jizdniRad };
}

/** Ukázka k úrovni, nebo null, když žádnou nemá. */
export function ukazkaUrovne(uroven: Uroven): UkazkaUrovne | null {
  const reseni = RESENI[uroven.id];
  if (!reseni) return null;
  const trasa = uroven.trasy[0]!.id;
  switch (uroven.id) {
    // Mostovka s kloubem uprostřed proti téže mostovce podepřené trojúhelníkem.
    case "1-01":
      return { a: { uroven, navrh: reseni.pady[0]!.navrh }, b: { uroven, navrh: reseni.pruchod } };

    // Stejná nízká lávka, jiný rytmus běhu: vlevo přesně na její vlastní frekvenci, vpravo pomaleji.
    case "2-02": {
      const nizka = reseni.pady[1]!.navrh;
      const beh = (kadence: number): Uroven =>
        sProvozem(uroven, [{ cas: 0, trasa, smer: 1, druh: "utvar", pocet: 4, kadence }]);
      return { a: { uroven: beh(3.4), navrh: nizka }, b: { uroven: beh(2.5), navrh: nizka } };
    }

    // Stejná lávka pod pochodem: bez závaží a se šesti tunami závaží.
    case "2-03":
      return { a: { uroven, navrh: reseni.pady[1]!.navrh }, b: { uroven, navrh: reseni.pruchod } };

    // Stejná lávka pod rychlým pochodem: bez tlumičů a s tlumiči do kotev ve svazích.
    case "2-04": {
      const pochod = sProvozem(uroven, [{ cas: 0, trasa, smer: 1, druh: "utvar", pocet: 24, kadence: 2.3 }]);
      return {
        a: { uroven: pochod, navrh: reseni.pady[1]!.navrh },
        b: { uroven: pochod, navrh: sTlumenim(reseni.mistrovska, 100_000) },
      };
    }

    default:
      return null;
  }
}
