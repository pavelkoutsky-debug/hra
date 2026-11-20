// Prototyp kontaktu kol s mostovkou, jen pro odhad ceny výpočtu.
// Kolo je hmota na pružině s tlumičem (pneumatika), jede vodorovně stálou rychlostí
// a jeho síla se dělí mezi dva styčníky mostovky, mezi kterými právě je.
// Skutečný model vozidel přijde v pozdějších milnících; počet operací na kolo
// tu odpovídá tomu, co bude kontakt potřebovat.

import type { Soustava } from "../src/jadro/soustava";

export interface Kola {
  pocet: number;
  x: Float64Array;
  y: Float64Array;
  vy: Float64Array;
  /** Index pole mostovky, ve kterém kolo naposledy bylo. */
  pole: Int32Array;
  hmota: number;
  tuhost: number;
  tlumeni: number;
  rychlost: number;
  mostovka: Int32Array;
}

export function vytvorKola(s: Soustava, mostovka: number[], pocet: number): Kola {
  const x = new Float64Array(pocet);
  const y = new Float64Array(pocet);
  const zacatek = s.x[mostovka[0]!]!;
  const konec = s.x[mostovka[mostovka.length - 1]!]!;
  for (let i = 0; i < pocet; i++) {
    x[i] = zacatek + ((konec - zacatek) * (i + 0.5)) / pocet;
    y[i] = 0;
  }
  return {
    pocet,
    x,
    y,
    vy: new Float64Array(pocet),
    pole: new Int32Array(pocet),
    hmota: 500,
    tuhost: 1e6,
    tlumeni: 5e3,
    rychlost: 10,
    mostovka: Int32Array.from(mostovka),
  };
}

/** Posune kola o krok a přičte jejich síly ke styčníkům mostovky. Volá se po výpočtu sil mostu. */
export function krokKol(s: Soustava, k: Kola, dt: number, tiha: number): void {
  const { x, y, vy, pole, mostovka } = k;
  const posledniPole = mostovka.length - 2;
  const levyKraj = s.x[mostovka[0]!]!;
  const pravyKraj = s.x[mostovka[posledniPole + 1]!]!;

  for (let i = 0; i < k.pocet; i++) {
    let poloha = x[i]! + k.rychlost * dt;
    if (poloha >= pravyKraj) poloha = levyKraj + (poloha - pravyKraj); // kolo se vrací na začátek
    x[i] = poloha;

    // Najít pole mostovky od naposledy známého; kolo se za krok posune o zlomek pole.
    let j = pole[i]!;
    if (j > posledniPole) j = posledniPole;
    while (j > 0 && s.x[mostovka[j]!]! > poloha) j--;
    while (j < posledniPole && s.x[mostovka[j + 1]!]! <= poloha) j++;
    pole[i] = j;

    const a = mostovka[j]!;
    const b = mostovka[j + 1]!;
    const xa = s.x[a]!;
    const xb = s.x[b]!;
    const podil = (poloha - xa) / (xb - xa);
    const vyskaMostovky = s.y[a]! + (s.y[b]! - s.y[a]!) * podil;
    const rychlostMostovky = s.vy[a]! + (s.vy[b]! - s.vy[a]!) * podil;

    // Pneumatika: jednostranná pružina s tlumičem.
    let sila = k.tuhost * (vyskaMostovky - y[i]!) + k.tlumeni * (rychlostMostovky - vy[i]!);
    if (sila < 0) sila = 0;
    s.fy[a] = s.fy[a]! - sila * (1 - podil);
    s.fy[b] = s.fy[b]! - sila * podil;

    const zrychleni = sila / k.hmota - tiha;
    vy[i] = vy[i]! + zrychleni * dt;
    y[i] = y[i]! + vy[i]! * dt;
  }
}
