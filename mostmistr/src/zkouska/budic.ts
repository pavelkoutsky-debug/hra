// Budič: zařízení, které do styčníku mostu tlačí a tahá harmonickou silou a hledá, kde most
// rezonuje. Buď drží stálý rytmus, nebo rozsah frekvencí projede tam a zpět. Při přelaďování
// most nestihne rozkmitat naplno a jeho odezva se za budičem zpožďuje: cestou nahoru vyjde
// špička výš, než kde rezonance je, cestou dolů níž. Průměr obou ji trefí.

import type { BudicZkousky } from "./protokol";

/** Drží budič stálý rytmus? */
export function jeStaly(budic: BudicZkousky): boolean {
  return budic.od === budic.do;
}

/**
 * Frekvence budiče v čase `cas` od začátku pokusu, Hz. Při přelaďování roste první polovinu
 * doby z `od` na `do` a druhou polovinu se stejnou rychlostí vrací. Jen sčítání a násobení:
 * hodnota vstupuje do simulace.
 */
export function frekvenceBudice(budic: BudicZkousky, cas: number): number {
  if (budic.od === budic.do) return budic.od;
  let podil = cas >= budic.trvani ? 1 : cas <= 0 ? 0 : cas / budic.trvani;
  podil = podil < 0.5 ? 2 * podil : 2 - 2 * podil;
  return budic.od + (budic.do - budic.od) * podil;
}

/** Jak daleko od sebe smějí být špičky z cesty nahoru a dolů, aby šlo o tutéž rezonanci, Hz. */
const NEJVETSI_ROZDIL_SPICEK = 1.2;

/**
 * Vyhodnotí měření budiče: body křivky v pořadí, v jakém vznikaly (frekvence v Hz, zrychlení
 * mostovky v m/s² na 1 kN). Vrátí frekvenci, na které most odpovídal nejsilněji, a jak moc.
 * Při přelaďování je to průměr špiček z cesty nahoru a dolů; když každá cesta našla jinou
 * rezonanci, platí ta silnější.
 */
export function vyhodnotBudic(
  budic: BudicZkousky,
  body: readonly { f: number; a: number }[],
): { frekvence: number | null; zrychleni: number } {
  let nahoru = { f: 0, a: 0 };
  let dolu = { f: 0, a: 0 };
  for (let i = 0; i < body.length; i++) {
    const bod = body[i]!;
    // Cesta dolů začíná, jakmile frekvence přestane růst.
    const klesa = i > 0 && bod.f < body[i - 1]!.f;
    if (!klesa && dolu.a === 0 && bod.a > nahoru.a) nahoru = bod;
    else if ((klesa || dolu.a > 0) && bod.a > dolu.a) dolu = bod;
  }
  const zrychleni = Math.max(nahoru.a, dolu.a);
  if (!(zrychleni > 0)) return { frekvence: null, zrychleni: 0 };
  if (jeStaly(budic)) return { frekvence: budic.od, zrychleni };
  if (nahoru.a > 0 && dolu.a > 0 && Math.abs(nahoru.f - dolu.f) <= NEJVETSI_ROZDIL_SPICEK) {
    return { frekvence: (nahoru.f + dolu.f) / 2, zrychleni };
  }
  return { frekvence: nahoru.a >= dolu.a ? nahoru.f : dolu.f, zrychleni };
}
