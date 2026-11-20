// Běh jednoho případu zkušebny: krokuje simulaci a vydává snímky pro záznam.
// Nezávisí na prohlížeči; ve zkušebně ho pohání pracovní vlákno, v testech Node.

import { krok } from "../jadro/integrator";
import { topologieSoustavy, type Snimek, type Topologie } from "../zkouska/zaznam";
import type { BehPripadu, Overeni } from "./pripady";

/** Počet snímků záznamu na sekundu děje. */
export const SNIMKU_ZA_SEKUNDU = 60;
/** Poloměr kola při kreslení, v metrech. */
export const POLOMER_KOLA = 0.45;
/** Podíl únosnosti v tahu, od kterého se prut kreslí jako tažený. */
const PRAH_TAHU = 0.02;

export class BehZkusebny {
  readonly topologie: Topologie;
  readonly #pripad: BehPripadu;
  #cas = 0;
  #kroku = 0;
  #dalsiSnimek = 0;

  constructor(pripad: BehPripadu) {
    this.#pripad = pripad;
    this.topologie = topologieSoustavy(pripad.soustava, pripad.mostovka);
  }

  get cas(): number {
    return this.#cas;
  }

  get kroku(): number {
    return this.#kroku;
  }

  get hotovo(): boolean {
    return this.#cas >= this.#pripad.trvani;
  }

  get pocetKol(): number {
    return this.#pripad.kola?.pocet ?? 0;
  }

  /**
   * Posune děj nejvýš o `sekundDeje` a pro každý okamžik záznamu zavolá `vydej`.
   * První volání vydá i snímek výchozího stavu.
   */
  pokracuj(sekundDeje: number, vydej: (snimek: Snimek) => void): void {
    const { soustava, nastaveni, trvani, predKrokem, poKroku } = this.#pripad;
    const do_ = Math.min(trvani, this.#cas + sekundDeje);
    if (this.#kroku === 0) {
      vydej(this.#snimek());
      this.#dalsiSnimek = 1 / SNIMKU_ZA_SEKUNDU;
    }
    while (this.#cas < do_) {
      if (predKrokem) predKrokem(this.#cas);
      krok(soustava, nastaveni);
      this.#kroku += 1;
      // Čas se počítá z počtu kroků, aby se v něm nesčítala zaokrouhlovací chyba.
      this.#cas = this.#kroku * nastaveni.dt;
      if (poKroku) poKroku(this.#cas);
      if (this.#cas >= this.#dalsiSnimek) {
        vydej(this.#snimek());
        this.#dalsiSnimek += 1 / SNIMKU_ZA_SEKUNDU;
      }
    }
  }

  vyhodnot(): Overeni[] {
    return this.#pripad.vyhodnot();
  }

  #snimek(): Snimek {
    const { soustava: s, unosnost, kola } = this.#pripad;
    const polohy = new Float32Array(2 * s.pocetStycniku);
    for (let i = 0; i < s.pocetStycniku; i++) {
      polohy[2 * i] = s.x[i]!;
      polohy[2 * i + 1] = s.y[i]!;
    }
    const vyuziti = new Float32Array(s.pocetPrvku);
    for (let e = 0; e < s.pocetPrvku; e++) {
      const osova = s.osovaSila[e]!;
      const moment = Math.max(Math.abs(s.momentA[e]!), Math.abs(s.momentB[e]!));
      // Prosté sečtení podílů osové síly a momentu; přesnější posudek přijde s porušením.
      const podilOsovy = Math.abs(osova) / (osova >= 0 ? unosnost.tah[e]! : unosnost.tlak[e]!);
      const podil = podilOsovy + moment / unosnost.moment[e]!;
      // Jako tažený se prut kreslí jen tehdy, když je tah znatelný; prut namáhaný
      // jen ohybem má osovou sílu kolem nuly a její znaménko nic neznamená.
      vyuziti[e] = osova > 0 && podilOsovy > PRAH_TAHU ? podil : -podil;
    }
    const stredyKol = new Float32Array(2 * (kola?.pocet ?? 0));
    if (kola) {
      for (let i = 0; i < kola.pocet; i++) {
        stredyKol[2 * i] = kola.x[i]!;
        stredyKol[2 * i + 1] = kola.y[i]! + POLOMER_KOLA;
      }
    }
    return { cas: this.#cas, polohy, vyuziti, kola: stredyKol };
  }
}
