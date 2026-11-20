// Otisk stavu simulace: kontrolní součet, podle kterého se pozná, že dva výpočty
// dopadly bitově stejně (regresní sada, shoda mezi prohlížeči, uložení a načtení mostu).

import type { Simulace } from "../jadro/simulace";

/** Kontrolní součet FNV-1a přes bajty čísel, ve dvou nezávislých 32bitových větvích. */
export class Otisk {
  #a = 0x811c9dc5;
  #b = 0x01000193;
  readonly #cislo = new Float64Array(1);
  readonly #bajty = new Uint8Array(this.#cislo.buffer);

  pridej(hodnota: number): void {
    // Záporná nula se od kladné liší jen znaménkovým bitem a na výsledek výpočtu vliv nemá.
    this.#cislo[0] = hodnota === 0 ? 0 : hodnota;
    for (let i = 0; i < 8; i++) {
      const bajt = this.#bajty[i]!;
      this.#a = Math.imul(this.#a ^ bajt, 0x01000193);
      this.#b = Math.imul(this.#b ^ (bajt + i), 0x85ebca6b);
    }
  }

  pridejPole(pole: Float64Array, pocet: number): void {
    for (let i = 0; i < pocet; i++) this.pridej(pole[i]!);
  }

  get hodnota(): string {
    const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");
    return hex(this.#a) + hex(this.#b);
  }
}

/** Otisk okamžitého stavu simulace. */
export function otiskSimulace(sim: Simulace): string {
  const s = sim.soustava;
  const otisk = new Otisk();
  otisk.pridej(s.pocetStycniku);
  otisk.pridej(s.pocetPrvku);
  otisk.pridej(sim.kroku);
  otisk.pridej(sim.udalosti.length);
  for (const pole of [s.x, s.y, s.cosN, s.sinN, s.vx, s.vy, s.omega]) otisk.pridejPole(pole, s.pocetStycniku);
  otisk.pridejPole(s.plastA, s.pocetPrvku);
  otisk.pridejPole(s.plastB, s.pocetPrvku);
  otisk.pridejPole(s.plastDelka, s.pocetPrvku);
  return otisk.hodnota;
}
