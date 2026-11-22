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
  /** Kolikrát rychleji než ve skutečnosti se ukázka přehrává; bez údaje stejně rychle. */
  rychlost?: number;
}

/** Stejný most s jinou silou všech tlumičů. */
function sTlumenim(navrh: NavrhMostu, tlumeni: number): NavrhMostu {
  return { ...navrh, pruty: navrh.pruty.map((p) => (p.prvek === "tlumic" ? { ...p, tlumeni } : p)) };
}

/** Stejný most, jehož laděné tlumiče mají jiné závaží a ladění. */
function sLadenymTlumicem(navrh: NavrhMostu, hmota: number, frekvence: number): NavrhMostu {
  return { ...navrh, stycniky: navrh.stycniky.map((s) => (s.tlumic ? { ...s, tlumic: { hmota, frekvence } } : s)) };
}

/** Stejný most s laděnými tlumiči ve styčnících mostovky na daných místech. */
function sTlumiciV(navrh: NavrhMostu, mista: readonly number[], hmota: number, frekvence: number): NavrhMostu {
  return {
    ...navrh,
    stycniky: navrh.stycniky.map((s) => (s.y === 0 && mista.includes(s.x) ? { ...s, tlumic: { hmota, frekvence } } : s)),
  };
}

function sProvozem(uroven: Uroven, jizdniRad: PolozkaJizdnihoRadu[]): Uroven {
  return { ...uroven, jizdniRad };
}

/**
 * Ukázka k úrovni, nebo null, když žádnou nemá. Ukázka předvádí princip, ne hospodaření:
 * její mosty nejsou vázané rozpočtem úrovně (most se třemi tlumiči smí být dražší), takže
 * úroveň obou stran rozpočet nemá. Bez toho by zkouška dražší most odmítla jako neplatný.
 */
export function ukazkaUrovne(uroven: Uroven): UkazkaUrovne | null {
  const sceny = scenyUkazky(uroven);
  if (!sceny) return null;
  const bezRozpoctu = (strana: StranaUkazky): StranaUkazky => ({
    ...strana,
    uroven: { ...strana.uroven, rozpocet: null, inzenyrskyRozpocet: null },
  });
  return { ...sceny, a: bezRozpoctu(sceny.a), b: bezRozpoctu(sceny.b) };
}

function scenyUkazky(uroven: Uroven): UkazkaUrovne | null {
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

    // Stejný dav, dva mosty: nižší s lidmi sjede do pásma jejich kroků, vyšší zůstane nad ním.
    case "5-01":
      return { a: { uroven, navrh: reseni.pady[1]!.navrh }, b: { uroven, navrh: reseni.rozpocet }, rychlost: 3 };

    // Stejná nízká lávka pod běžci: bez laděného tlumiče a s ním.
    case "5-02":
      return { a: { uroven, navrh: reseni.pady[1]!.navrh }, b: { uroven, navrh: sLadenymTlumicem(reseni.pruchod, 1000, 2.5) } };

    // Stejný most i závaží, jiné ladění: daleko od mostu a na most s lidmi.
    case "5-03":
      return { a: { uroven, navrh: reseni.pady[2]!.navrh }, b: { uroven, navrh: reseni.mistrovska }, rychlost: 2 };

    // Stejný most pod skákajícím davem: bez tlumičů a se třemi naladěnými na dvojnásobek rytmu.
    case "5-04": {
      const bez = reseni.pady[1]!.navrh;
      return { a: { uroven, navrh: bez }, b: { uroven, navrh: sTlumiciV(bez, [12, 16, 20], 1000, 4.4) }, rychlost: 2 };
    }

    default:
      return null;
  }
}
