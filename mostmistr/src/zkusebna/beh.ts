// Běh jednoho případu zkušebny: krokuje simulaci a vydává snímky, změny stavby a porušení
// pro záznam. Nezávisí na prohlížeči; ve zkušebně ho pohání pracovní vlákno, v testech Node.

import { BEZ_OPORY } from "../jadro/bremena";
import { ZPUSOB_TAH } from "../jadro/namahani";
import {
  topologieSoustavy,
  type PopisKresleni,
  type Snimek,
  type Topologie,
  type UdalostZaznamu,
  plastickeKlouby,
} from "../zkouska/zaznam";
import type { BehPripadu, Overeni } from "./pripady";

/** Počet snímků záznamu na sekundu děje. */
export const SNIMKU_ZA_SEKUNDU = 60;
/** Poloměr kola při kreslení, v metrech. */
export const POLOMER_KOLA = 0.45;

/** Co běh vydal od minulého volání. */
export interface DavkaZaznamu {
  snimky: Snimek[];
  /** Nové stavby konstrukce v pořadí, v jakém vznikly. */
  topologie: Topologie[];
  udalosti: UdalostZaznamu[];
}

export class BehZkusebny {
  readonly #pripad: BehPripadu;
  readonly #kresleni: PopisKresleni;
  #dalsiSnimek = 0;
  #topologii = 0;
  #udalosti = 0;
  #casPoruseni = Infinity;
  #zacal = false;

  constructor(pripad: BehPripadu) {
    this.#pripad = pripad;
    const skryte: number[] = [];
    const bremena = pripad.bremena;
    if (bremena) {
      for (let i = 0; i < bremena.pocet; i++) if (bremena.stycnik[i]! >= 0) skryte.push(bremena.stycnik[i]!);
    }
    this.#kresleni = { mostovka: pripad.mostovka, skryte, zavazi: pripad.zavazi ?? [] };
  }

  get cas(): number {
    return this.#pripad.simulace.cas;
  }

  get kroku(): number {
    return this.#pripad.simulace.kroku;
  }

  /** Krok výpočtu na začátku děje; po porušení se může zkrátit. */
  get dt(): number {
    return this.#pripad.simulace.dt;
  }

  /** Do kdy děj nejvýš poběží; po porušení se může zkrátit. */
  get konec(): number {
    const { trvani, dobehPoPoruseni } = this.#pripad;
    return dobehPoPoruseni === undefined ? trvani : Math.min(trvani, this.#casPoruseni + dobehPoPoruseni);
  }

  get hotovo(): boolean {
    return this.cas >= this.konec || this.#pripad.simulace.rozpadla;
  }

  get pocetKol(): number {
    return this.#pripad.bremena?.pocet ?? 0;
  }

  /**
   * Posune děj nejvýš o `sekundDeje` a vrátí, co přibylo do záznamu.
   * První volání vydá i výchozí stavbu a snímek výchozího stavu.
   */
  pokracuj(sekundDeje: number): DavkaZaznamu {
    const { simulace, poKroku } = this.#pripad;
    const davka: DavkaZaznamu = { snimky: [], topologie: [], udalosti: [] };
    if (!this.#zacal) {
      this.#zacal = true;
      davka.topologie.push(this.#novaTopologie());
      davka.snimky.push(this.#snimek());
      this.#dalsiSnimek = 1 / SNIMKU_ZA_SEKUNDU;
    }
    const do_ = this.cas + sekundDeje;
    while (this.cas < do_ && !this.hotovo) {
      simulace.krok();
      if (poKroku) poKroku(simulace.cas);

      if (simulace.udalosti.length > this.#udalosti) {
        // Porušení: zaznamenat, co se stalo, a hned vydat snímek s novou stavbou,
        // aby se přehrávání nepokoušelo prokládat přes zlom.
        for (let i = this.#udalosti; i < simulace.udalosti.length; i++) {
          const u = simulace.udalosti[i]!;
          davka.udalosti.push({ cas: u.cas, prut: u.prut, zpusob: u.zpusob, nasledek: u.nasledek });
        }
        this.#udalosti = simulace.udalosti.length;
        this.#casPoruseni = Math.min(this.#casPoruseni, simulace.cas);
        davka.topologie.push(this.#novaTopologie());
        davka.snimky.push(this.#snimek());
      } else if (simulace.cas >= this.#dalsiSnimek) {
        davka.snimky.push(this.#snimek());
        this.#dalsiSnimek += 1 / SNIMKU_ZA_SEKUNDU;
      }
    }
    return davka;
  }

  vyhodnot(): Overeni[] {
    return this.#pripad.vyhodnot();
  }

  #novaTopologie(): Topologie {
    this.#topologii += 1;
    return topologieSoustavy(this.#pripad.simulace.soustava, this.#kresleni);
  }

  #snimek(): Snimek {
    const { simulace, bremena, sily } = this.#pripad;
    const s = simulace.soustava;
    const polohy = new Float32Array(2 * s.pocetStycniku);
    for (let i = 0; i < s.pocetStycniku; i++) {
      polohy[2 * i] = s.x[i]!;
      polohy[2 * i + 1] = s.y[i]!;
    }
    const vyuziti = new Float32Array(s.pocetPrvku);
    for (let e = 0; e < s.pocetPrvku; e++) {
      // Jako tažený se kreslí prut, u kterého rozhoduje tah; ohyb a tlak plnou čarou.
      vyuziti[e] = s.zpusob[e] === ZPUSOB_TAH ? s.vyuziti[e]! : -s.vyuziti[e]!;
    }
    const kola = new Float32Array(2 * (bremena?.pocet ?? 0));
    if (bremena) {
      for (let i = 0; i < bremena.pocet; i++) {
        const uzel = bremena.stycnik[i]!;
        if (uzel >= 0) {
          kola[2 * i] = s.x[uzel]!;
          kola[2 * i + 1] = s.y[uzel]! + POLOMER_KOLA;
        } else {
          kola[2 * i] = bremena.x[i]!;
          // Síla bez styčníku se kreslí jako kolo položené na mostovce.
          const povrch = bremena.prvek[i] === BEZ_OPORY ? Number.NaN : bremena.vyska[i]!;
          kola[2 * i + 1] = povrch + POLOMER_KOLA;
        }
      }
    }
    const sipky = new Float32Array(4 * (sily?.length ?? 0));
    sily?.forEach((sila, i) => {
      sipky[4 * i] = s.x[sila.stycnik]!;
      sipky[4 * i + 1] = s.y[sila.stycnik]!;
      sipky[4 * i + 2] = sila.fx;
      sipky[4 * i + 3] = sila.fy;
    });
    return {
      cas: simulace.cas,
      topologie: this.#topologii - 1,
      polohy,
      vyuziti,
      kola,
      sily: sipky,
      provoz: new Uint8Array(0),
      kmitani: 0,
      klouby: plastickeKlouby(s),
    };
  }
}
