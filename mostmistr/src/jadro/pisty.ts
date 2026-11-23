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
 * Posune klidové délky pístů o krok `dt` směrem k cíli. Píst, jehož síla by přesáhla
 * `nejvetsiSila`, dostane jen takovou klidovou délku, při které drží právě tuto sílu.
 * Volá se jednou na začátku každého kroku simulace.
 */
export function posunPisty(s: Soustava, p: Pisty, dt: number): void {
  const zmenaRychlosti = p.zrychleni * dt;
  for (let i = 0; i < p.pocet; i++) {
    const e = p.prvek[i]!;
    const cil = p.vysunout ? p.vysunuty[i]! : p.zasunuty[i]!;
    let klidova = s.klidovaDelka[e]!;
    let rychlost = p.okamzita[i]!;
    const zbyva = cil - klidova;
    if (zbyva === 0 && rychlost === 0) {
      // Píst stojí v cíli.
    } else {
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
      const posun = rychlost * dt;
      // Poslední krok do cíle: píst v něm zastaví přesně.
      if ((zbyva > 0 && posun >= zbyva) || (zbyva < 0 && posun <= zbyva)) {
        klidova = cil;
        rychlost = 0;
      } else {
        klidova += posun;
      }
    }
    // Síla v prvku je tuhost × (délka − klidová délka): kladná táhne, záporná tlačí.
    const a = s.prvekA[e]!;
    const b = s.prvekB[e]!;
    const dx = s.x[b]! - s.x[a]!;
    const dy = s.y[b]! - s.y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    const vule = p.nejvetsiSila / s.tuhostOsova[e]!;
    let pretizen = 0;
    if (klidova > delka + vule) {
      klidova = delka + vule;
      pretizen = 1;
    } else if (klidova < delka - vule) {
      klidova = delka - vule;
      pretizen = 1;
    }
    // Píst, který ventil zastavil, se rozjíždí znovu od nuly.
    if (pretizen === 1) rychlost = 0;
    p.pretizen[i] = pretizen;
    p.okamzita[i] = rychlost;
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
