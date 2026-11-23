// Písty: hydraulické válce, které zvedají a sklápějí pohyblivý most.
//
// Píst je osový prvek (pružina s tlumičem), jehož klidovou délku řídí zkouška: na povel se
// vysouvá k délce „vysunuto“ nebo zasouvá k délce „zasunuto“. Rozjíždí se a dojíždí se stálým
// zrychlením, mezi tím jede stálou rychlostí. Olej ve
// válci je skoro nestlačitelný, proto je píst tuhý; tlačit a táhnout ale umí jen silou, na
// jakou je stavěný. Když by musel víc (most je těžší, než píst uzvedne, nebo na zvednutý
// most něco dosedne), přetlakový ventil povolí: píst se zastaví nebo ustupuje a drží právě
// svou největší sílu.
//
// Olej protéká škrticími ventily, takže válec silně tlumí každý pohyb, který se liší od
// řízeného: tlumič prvku brzdí rozdíl mezi skutečnou a řízenou rychlostí prodlužování
// (`Soustava.rychlostKlidove`). Bez toho by se křídlo na sloupci oleje houpalo jako na pružině.
//
// Počítá se jen sčítáním, násobením, dělením a odmocninou (délka prvku), takže výsledek je
// ve všech prohlížečích stejný.

import type { Soustava } from "./soustava";

export interface PopisPistu {
  /** Index prvku soustavy (druh PRUZINA), který píst představuje. */
  prvek: number;
  /** Klidová délka zasunutého a vysunutého pístu, m. */
  zasunuty: number;
  vysunuty: number;
}

export interface Pisty {
  pocet: number;
  prvek: Int32Array;
  zasunuty: Float64Array;
  vysunuty: Float64Array;
  /** Kam písty právě míří: true vysunout, false zasunout. Mění ho řízení zkoušky. */
  vysunout: boolean;
  /** Největší rychlost, jakou se mění délka pístu, m/s. */
  rychlost: number;
  /** Zrychlení při rozjezdu a zpomalení při dojezdu, m/s². */
  zrychleni: number;
  /** Okamžitá rychlost změny délky každého pístu, m/s (kladná při vysouvání). */
  okamzita: Float64Array;
  /** Největší síla, kterou píst tlačí nebo táhne, N. */
  nejvetsiSila: number;
  /** U každého pístu: 1, když ho v posledním kroku zastavil přetlakový ventil. */
  pretizen: Uint8Array;
}

export function vytvorPisty(
  popisy: readonly PopisPistu[],
  rychlost: number,
  zrychleni: number,
  nejvetsiSila: number,
): Pisty {
  return {
    pocet: popisy.length,
    prvek: Int32Array.from(popisy, (p) => p.prvek),
    zasunuty: Float64Array.from(popisy, (p) => p.zasunuty),
    vysunuty: Float64Array.from(popisy, (p) => p.vysunuty),
    vysunout: false,
    rychlost,
    zrychleni,
    okamzita: new Float64Array(popisy.length),
    nejvetsiSila,
    pretizen: new Uint8Array(popisy.length),
  };
}

/**
 * Posune klidové délky pístů o krok `dt` směrem k cíli. Přetlakový ventil hlídá, aby píst
 * netlačil ani netáhl víc než `nejvetsiSila`: řízená rychlost se sníží tak, aby součet síly
 * sloupce oleje a škrcení mez nepřesáhl, a klidová délka se drží nejvýš o `síla/tuhost` od
 * skutečné délky. Volá se jednou na začátku každého kroku simulace.
 */
export function posunPisty(s: Soustava, p: Pisty, dt: number): void {
  const zmenaRychlosti = p.zrychleni * dt;
  for (let i = 0; i < p.pocet; i++) {
    const e = p.prvek[i]!;
    const cil = p.vysunout ? p.vysunuty[i]! : p.zasunuty[i]!;
    let klidova = s.klidovaDelka[e]!;
    let rychlost = p.okamzita[i]!;
    const zbyva = cil - klidova;
    if (zbyva !== 0 || rychlost !== 0) {
      // Rychlost, jakou smí píst k cíli nejvýš jet, aby před ním stihl zastavit: v² = 2·a·s.
      const vzdalenost = zbyva < 0 ? -zbyva : zbyva;
      let zadana = Math.sqrt(2 * p.zrychleni * vzdalenost);
      if (zadana > p.rychlost) zadana = p.rychlost;
      if (zbyva < 0) zadana = -zadana;
      if (rychlost < zadana) {
        rychlost += zmenaRychlosti;
        if (rychlost > zadana) rychlost = zadana;
      } else if (rychlost > zadana) {
        rychlost -= zmenaRychlosti;
        if (rychlost < zadana) rychlost = zadana;
      }
    }

    // Skutečná délka pístu a rychlost, jakou se právě prodlužuje.
    const a = s.prvekA[e]!;
    const b = s.prvekB[e]!;
    const dx = s.x[b]! - s.x[a]!;
    const dy = s.y[b]! - s.y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    const skutecna = delka > 0 ? (dx * (s.vx[b]! - s.vx[a]!) + dy * (s.vy[b]! - s.vy[a]!)) / delka : 0;
    // Síla v prvku: sloupec oleje tuhost × (délka − klidová) a škrcení tlumič × (skutečná −
    // řízená rychlost); kladná táhne, záporná tlačí. Ventil nepustí řízenou rychlost tak
    // daleko od skutečné, aby jejich součet přesáhl největší sílu.
    let pretizen = 0;
    const tlumic = s.tlumic[e]!;
    if (tlumic > 0) {
      const pruzina = s.tuhostOsova[e]! * (delka - klidova);
      const nejvys = skutecna + (p.nejvetsiSila + pruzina) / tlumic;
      const nejniz = skutecna - (p.nejvetsiSila - pruzina) / tlumic;
      if (rychlost > nejvys) {
        rychlost = nejvys;
        pretizen = 1;
      } else if (rychlost < nejniz) {
        rychlost = nejniz;
        pretizen = 1;
      }
    }

    const posun = rychlost * dt;
    // Poslední krok do cíle: píst v něm zastaví přesně.
    if ((zbyva > 0 && posun >= zbyva) || (zbyva < 0 && posun <= zbyva)) {
      klidova = cil;
      rychlost = 0;
    } else {
      klidova += posun;
    }

    const vule = p.nejvetsiSila / s.tuhostOsova[e]!;
    if (klidova > delka + vule) {
      klidova = delka + vule;
      pretizen = 1;
    } else if (klidova < delka - vule) {
      klidova = delka - vule;
      pretizen = 1;
    }
    p.pretizen[i] = pretizen;
    p.okamzita[i] = rychlost;
    s.rychlostKlidove[e] = rychlost;
    s.klidovaDelka[e] = klidova;
  }
}

/** Jsou všechny písty na délce, ke které míří (a žádný nezastavil přetlakový ventil)? */
export function pistyVCili(s: Soustava, p: Pisty): boolean {
  for (let i = 0; i < p.pocet; i++) {
    if (p.pretizen[i] === 1) return false;
    if (s.klidovaDelka[p.prvek[i]!] !== (p.vysunout ? p.vysunuty[i]! : p.zasunuty[i]!)) return false;
  }
  return true;
}
