// Zvuk ve hře: zvukový kontext prohlížeče, hlasitost a předávání zvuků syntezátoru.
//
// Kontext vzniká až na gesto hráče (spuštění zkoušky, přepnutí hlasitosti); do té doby
// hra nevydá ani tón a o zvuk prohlížeč vůbec nežádá. Se ztlumeným zvukem se nic neplánuje.

import type { Hlasitost } from "../hra/uloziste";
import type { DruhZvuku, Zvuk } from "./deje";
import { Syntezator, vytvorVystup } from "./syntezator";

const ZISK: Readonly<Record<Hlasitost, number>> = { nahlas: 0.9, potichu: 0.3, vypnuto: 0 };
/** O kolik sekund dopředu se zvuk plánuje, aby ho prohlížeč stihl připravit. */
const PREDSTIH = 0.012;

export class Ozvuceni {
  #hlasitost: Hlasitost;
  #ctx: AudioContext | null = null;
  #hlavni: GainNode | null = null;
  #synt: Syntezator | null = null;
  /** Kolik zvuků kterého druhu hra od spuštění zahrála. */
  readonly zaznelo = new Map<DruhZvuku, number>();
  /** Zavolá se, když se změní stav zvukového kontextu (rozběhl se, prohlížeč ho uspal). */
  priZmeneStavu: (() => void) | null = null;

  constructor(hlasitost: Hlasitost) {
    this.#hlasitost = hlasitost;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.ztis();
    });
  }

  /** Umí prohlížeč zvuk skládat? */
  static get dostupne(): boolean {
    return typeof AudioContext !== "undefined";
  }

  get hlasitost(): Hlasitost {
    return this.#hlasitost;
  }

  /** Stav zvukového kontextu; „zadny“, dokud hráč nic neudělal. */
  get stav(): "zadny" | AudioContextState {
    return this.#ctx ? this.#ctx.state : "zadny";
  }

  nastavHlasitost(hlasitost: Hlasitost): void {
    this.#hlasitost = hlasitost;
    if (this.#ctx && this.#hlavni) this.#hlavni.gain.setTargetAtTime(ZISK[hlasitost], this.#ctx.currentTime, 0.03);
    if (hlasitost === "vypnuto") this.ztis();
  }

  /**
   * Připraví zvuk k hraní. Smí se volat jen z obsluhy gesta hráče (kliknutí, klávesa):
   * jinde by prohlížeč kontext nepustil a hra by porušila slib, že bez gesta mlčí.
   */
  probud(): void {
    if (this.#hlasitost === "vypnuto" || !Ozvuceni.dostupne) return;
    if (!this.#ctx) {
      try {
        const ctx = new AudioContext({ latencyHint: "interactive" });
        const { vstup, hlavni } = vytvorVystup(ctx, ZISK[this.#hlasitost]);
        this.#ctx = ctx;
        this.#hlavni = hlavni;
        this.#synt = new Syntezator(ctx, vstup);
        ctx.addEventListener("statechange", () => this.priZmeneStavu?.());
      } catch {
        // Prohlížeč zvuk nedal; hra běží dál potichu.
        return;
      }
    }
    if (this.#ctx.state === "suspended") void this.#ctx.resume().catch(() => undefined);
  }

  /**
   * Zahraje zvuky. `panorama` určí, odkud který zní (−1 vlevo až 1 vpravo), `tempo` je
   * zpomalení nebo zrychlení zvuku podle rychlosti přehrávání.
   */
  zahraj(zvuky: readonly Zvuk[], panorama: (zvuk: Zvuk) => number, tempo = 1): void {
    const ctx = this.#ctx;
    const synt = this.#synt;
    // Do pozastaveného kontextu se neplánuje: zvuky by se nastřádaly a spustily naráz.
    if (!ctx || !synt || this.#hlasitost === "vypnuto" || ctx.state !== "running" || zvuky.length === 0) return;
    const ted = ctx.currentTime + PREDSTIH;
    for (const zvuk of zvuky) {
      if (synt.zahraj(zvuk, ted, panorama(zvuk), tempo)) {
        this.zaznelo.set(zvuk.druh, (this.zaznelo.get(zvuk.druh) ?? 0) + 1);
      }
    }
  }

  /** Souvislý hluk kol: `uroven` 0 až 1. */
  valeni(uroven: number, panorama: number): void {
    if (!this.#synt || !this.#ctx || this.#ctx.state !== "running") return;
    this.#synt.nastavValeni(this.#hlasitost === "vypnuto" ? 0 : uroven, panorama);
  }

  /** Utiší souvislé zvuky (pauza, návrat ke stavbě, skrytá záložka). */
  ztis(): void {
    this.#synt?.nastavValeni(0, 0);
  }
}
