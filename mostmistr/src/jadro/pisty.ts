// Písty: hydraulické válce, které zvedají a sklápějí pohyblivý most.
//
// Píst je osový prvek (pružina s tlumičem), jehož klidovou délku řídí zkouška: na povel se
// rovnoměrnou rychlostí vysouvá k délce „vysunuto“ nebo zasouvá k délce „zasunuto“. Olej ve
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
  /** Rychlost, jakou se mění délka pístu, m/s. */
  rychlost: number;
  /** Největší síla, kterou píst tlačí nebo táhne, N. */
  nejvetsiSila: number;
  /** U každého pístu: 1, když ho v posledním kroku zastavil přetlakový ventil. */
  pretizen: Uint8Array;
}

export function vytvorPisty(popisy: readonly PopisPistu[], rychlost: number, nejvetsiSila: number): Pisty {
  return {
    pocet: popisy.length,
    prvek: Int32Array.from(popisy, (p) => p.prvek),
    zasunuty: Float64Array.from(popisy, (p) => p.zasunuty),
    vysunuty: Float64Array.from(popisy, (p) => p.vysunuty),
    vysunout: false,
    rychlost,
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
  const zmena = p.rychlost * dt;
  for (let i = 0; i < p.pocet; i++) {
    const e = p.prvek[i]!;
    const cil = p.vysunout ? p.vysunuty[i]! : p.zasunuty[i]!;
    let klidova = s.klidovaDelka[e]!;
    if (klidova < cil) {
      klidova += zmena;
      if (klidova > cil) klidova = cil;
    } else if (klidova > cil) {
      klidova -= zmena;
      if (klidova < cil) klidova = cil;
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
    p.pretizen[i] = pretizen;
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
