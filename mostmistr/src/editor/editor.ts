// Stav stavebního režimu: návrh, výběr, zvolený prvek, historie úprav a rozdělaný tah myší.
// Neví nic o plátně ani o prohlížeči; dostává body ve světových souřadnicích a hlásí změny.

import type { Bod } from "../data/geometrie";
import type { IdPrvku } from "../data/katalog";
import type { DruhProblemu, NavrhMostu } from "../data/navrh";
import type { Uroven } from "../data/uroven";
import { duvodProtiPosunu, duvodProtiPrutu, lzeZacit } from "./pravidla";
import { posunStycnik, pridejPrut, smaz, stycnikV, zmenPrvek, zrcadli } from "./upravy";

/** Jak daleko od styčníku nebo prutu se ještě počítá kliknutí na něj, v metrech. */
const DOSAH_STYCNIKU = 0.38;
const DOSAH_PRUTU = 0.28;
/** Nejvíc kroků, o které se lze vrátit. */
const DELKA_HISTORIE = 200;

/** Rozdělaný tah myší. */
export type Tah =
  /** Kreslení prutu z bodu `od`; `duvod` říká, proč by nešel položit. */
  | { druh: "prut"; od: Bod; k: Bod; duvod: DruhProblemu | null }
  /** Posun styčníku. */
  | { druh: "posun"; stycnik: number; od: Bod; k: Bod; duvod: DruhProblemu | null }
  /** Výběr obdélníkem; `od` a `k` jsou nezaokrouhlené body světa. */
  | { druh: "obdelnik"; od: Bod; k: Bod };

function naRastr(bod: Bod): Bod {
  return { x: Math.round(bod.x), y: Math.round(bod.y) };
}

function vzdalenostOdUsecky(p: Bod, a: Bod, b: Bod): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const delka2 = ux * ux + uy * uy;
  let t = delka2 > 0 ? ((p.x - a.x) * ux + (p.y - a.y) * uy) / delka2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * ux), p.y - (a.y + t * uy));
}

export class Editor {
  readonly uroven: Uroven;
  /** Prvek, kterým se kreslí. */
  prvek: IdPrvku;
  readonly vybranePruty = new Set<number>();
  readonly vybraneStycniky = new Set<number>();
  tah: Tah | null = null;
  /** Proč se poslední pokus o úpravu nepovedl; hra to ukáže hráči. */
  posledniDuvod: DruhProblemu | null = null;

  #navrh: NavrhMostu;
  readonly #zpet: NavrhMostu[] = [];
  readonly #znovu: NavrhMostu[] = [];
  readonly #poZmene: () => void;
  /** Bod stisku a to, na co se kliklo; rozhodne se až podle toho, jestli se myš pohne. */
  #stisk: { bod: Bod; stycnik: number | null; prut: number | null; pridat: boolean } | null = null;

  constructor(uroven: Uroven, navrh: NavrhMostu, poZmene: () => void = () => {}) {
    this.uroven = uroven;
    this.#navrh = navrh;
    this.#poZmene = poZmene;
    this.prvek = uroven.povolenePrvky[0] ?? "mostovka-drevo";
  }

  get navrh(): NavrhMostu {
    return this.#navrh;
  }

  get lzeZpet(): boolean {
    return this.#zpet.length > 0;
  }

  get lzeZnovu(): boolean {
    return this.#znovu.length > 0;
  }

  /** Nahradí návrh novým a zapíše krok do historie. Stejný návrh nic nezmění. */
  #zmen(novy: NavrhMostu): boolean {
    if (novy === this.#navrh) return false;
    this.#zpet.push(this.#navrh);
    if (this.#zpet.length > DELKA_HISTORIE) this.#zpet.shift();
    this.#znovu.length = 0;
    this.#navrh = novy;
    this.#ocistiVyber();
    this.#poZmene();
    return true;
  }

  /** Z výběru vyřadí to, co v návrhu už není. */
  #ocistiVyber(): void {
    const pruty = new Set(this.#navrh.pruty.map((p) => p.id));
    const stycniky = new Set(this.#navrh.stycniky.map((s) => s.id));
    for (const id of this.vybranePruty) if (!pruty.has(id)) this.vybranePruty.delete(id);
    for (const id of this.vybraneStycniky) if (!stycniky.has(id)) this.vybraneStycniky.delete(id);
  }

  /** Nahradí celý návrh (načtení uloženého mostu, import); jde vzít zpět. */
  nahrad(navrh: NavrhMostu): void {
    this.zrusVyber();
    this.#zmen(navrh);
  }

  zpet(): void {
    const predchozi = this.#zpet.pop();
    if (!predchozi) return;
    this.#znovu.push(this.#navrh);
    this.#navrh = predchozi;
    this.tah = null;
    this.#ocistiVyber();
    this.#poZmene();
  }

  znovu(): void {
    const dalsi = this.#znovu.pop();
    if (!dalsi) return;
    this.#zpet.push(this.#navrh);
    this.#navrh = dalsi;
    this.tah = null;
    this.#ocistiVyber();
    this.#poZmene();
  }

  /** Styčník návrhu nejblíž bodu, pokud je v dosahu. */
  stycnikU(bod: Bod): number | null {
    let nejblizsi: number | null = null;
    let nejmensi = DOSAH_STYCNIKU;
    for (const s of this.#navrh.stycniky) {
      const d = Math.hypot(s.x - bod.x, s.y - bod.y);
      if (d <= nejmensi) {
        nejmensi = d;
        nejblizsi = s.id;
      }
    }
    return nejblizsi;
  }

  /** Prut návrhu nejblíž bodu, pokud je v dosahu. */
  prutU(bod: Bod): number | null {
    const podleId = new Map(this.#navrh.stycniky.map((s) => [s.id, s]));
    let nejblizsi: number | null = null;
    let nejmensi = DOSAH_PRUTU;
    for (const p of this.#navrh.pruty) {
      const a = podleId.get(p.a);
      const b = podleId.get(p.b);
      if (!a || !b) continue;
      const d = vzdalenostOdUsecky(bod, a, b);
      if (d <= nejmensi) {
        nejmensi = d;
        nejblizsi = p.id;
      }
    }
    return nejblizsi;
  }

  /**
   * Stisk levého tlačítka v bodě světa. `pridat` (Shift) přidává k výběru,
   * `posouvat` (Alt nebo nástroj výběru) místo kreslení táhne styčníkem,
   * `bezKresleni` (nástroj výběru) nezačne kreslit ani z kotvy.
   */
  stiskni(bod: Bod, volby: { pridat?: boolean; posouvat?: boolean; bezKresleni?: boolean } = {}): void {
    this.posledniDuvod = null;
    const mriz = naRastr(bod);
    const stycnik = this.stycnikU(bod);
    this.#stisk = { bod, stycnik, prut: stycnik === null ? this.prutU(bod) : null, pridat: volby.pridat === true };
    if (volby.posouvat && stycnik !== null) {
      const s = this.#navrh.stycniky.find((x) => x.id === stycnik)!;
      this.tah = { druh: "posun", stycnik, od: { x: s.x, y: s.y }, k: { x: s.x, y: s.y }, duvod: null };
    } else if (
      !volby.bezKresleni &&
      lzeZacit(this.#navrh, this.uroven, mriz) &&
      Math.hypot(bod.x - mriz.x, bod.y - mriz.y) <= 0.5
    ) {
      this.tah = { druh: "prut", od: mriz, k: mriz, duvod: "prut-kratky" };
    } else {
      this.tah = { druh: "obdelnik", od: bod, k: bod };
    }
  }

  /** Pohyb myši se stisknutým tlačítkem. */
  tahni(bod: Bod): void {
    const tah = this.tah;
    if (!tah) return;
    if (tah.druh === "prut") {
      tah.k = naRastr(bod);
      tah.duvod = duvodProtiPrutu(this.#navrh, this.uroven, tah.od, tah.k, this.prvek);
    } else if (tah.druh === "posun") {
      tah.k = naRastr(bod);
      const beze = tah.k.x === tah.od.x && tah.k.y === tah.od.y;
      tah.duvod = beze ? null : duvodProtiPosunu(this.#navrh, this.uroven, tah.stycnik, tah.k);
    } else {
      tah.k = bod;
    }
  }

  /** Uvolnění tlačítka: dokončí tah. Vrací true, když se návrh změnil. */
  pust(): boolean {
    const tah = this.tah;
    const stisk = this.#stisk;
    this.tah = null;
    this.#stisk = null;
    if (!tah || !stisk) return false;

    if (tah.druh === "prut") {
      if (tah.k.x === tah.od.x && tah.k.y === tah.od.y) {
        // Kliknutí bez tažení: výběr toho, na co se kliklo.
        this.#vyberKliknutim(stisk);
        return false;
      }
      if (tah.duvod) {
        this.posledniDuvod = tah.duvod;
        this.#poZmene();
        return false;
      }
      this.zrusVyber();
      return this.#zmen(pridejPrut(this.#navrh, tah.od, tah.k, this.prvek));
    }

    if (tah.druh === "posun") {
      if (tah.k.x === tah.od.x && tah.k.y === tah.od.y) return false;
      if (tah.duvod) {
        this.posledniDuvod = tah.duvod;
        this.#poZmene();
        return false;
      }
      const posunuty = posunStycnik(this.#navrh, tah.stycnik, tah.k);
      return posunuty ? this.#zmen(posunuty) : false;
    }

    // Obdélník: nepatrný pohyb je kliknutí.
    if (Math.hypot(tah.k.x - tah.od.x, tah.k.y - tah.od.y) < 0.15) {
      this.#vyberKliknutim(stisk);
      return false;
    }
    this.#vyberObdelnikem(tah.od, tah.k, stisk.pridat);
    return false;
  }

  /** Zruší rozdělaný tah (Escape). */
  zrusTah(): void {
    this.tah = null;
    this.#stisk = null;
    this.#poZmene();
  }

  #vyberKliknutim(stisk: { stycnik: number | null; prut: number | null; pridat: boolean }): void {
    if (!stisk.pridat) {
      this.vybranePruty.clear();
      this.vybraneStycniky.clear();
    }
    const prepni = (mnozina: Set<number>, id: number): void => {
      if (stisk.pridat && mnozina.has(id)) mnozina.delete(id);
      else mnozina.add(id);
    };
    if (stisk.stycnik !== null) prepni(this.vybraneStycniky, stisk.stycnik);
    else if (stisk.prut !== null) prepni(this.vybranePruty, stisk.prut);
    this.#poZmene();
  }

  #vyberObdelnikem(a: Bod, b: Bod, pridat: boolean): void {
    if (!pridat) this.zrusVyber();
    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);
    const uvnitr = new Set<number>();
    for (const s of this.#navrh.stycniky) {
      if (s.x >= xMin && s.x <= xMax && s.y >= yMin && s.y <= yMax) {
        uvnitr.add(s.id);
        this.vybraneStycniky.add(s.id);
      }
    }
    // Prut se vybere, když má v obdélníku oba konce.
    for (const p of this.#navrh.pruty) if (uvnitr.has(p.a) && uvnitr.has(p.b)) this.vybranePruty.add(p.id);
    this.#poZmene();
  }

  zrusVyber(): void {
    this.vybranePruty.clear();
    this.vybraneStycniky.clear();
  }

  vyberVse(): void {
    for (const p of this.#navrh.pruty) this.vybranePruty.add(p.id);
    for (const s of this.#navrh.stycniky) this.vybraneStycniky.add(s.id);
    this.#poZmene();
  }

  get neconiJeVybrano(): boolean {
    return this.vybranePruty.size > 0 || this.vybraneStycniky.size > 0;
  }

  /** Smaže vybrané pruty a styčníky. */
  smazVybrane(): boolean {
    if (!this.neconiJeVybrano) return false;
    return this.#zmen(smaz(this.#navrh, this.vybranePruty, this.vybraneStycniky));
  }

  /** Smaže celý most. */
  smazVse(): boolean {
    if (this.#navrh.pruty.length === 0) return false;
    this.zrusVyber();
    return this.#zmen({ ...this.#navrh, stycniky: [], pruty: [] });
  }

  /**
   * Zvolí prvek, kterým se kreslí. Když jsou vybrané pruty, změní je na něj; změna, která
   * by porušila pravidla (příliš dlouhý prut pro nový prvek), se neprovede.
   */
  zvolPrvek(prvek: IdPrvku): boolean {
    this.prvek = prvek;
    this.posledniDuvod = null;
    if (this.vybranePruty.size === 0) {
      this.#poZmene();
      return false;
    }
    let navrh = this.#navrh;
    const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
    for (const id of this.vybranePruty) {
      const p = navrh.pruty.find((x) => x.id === id);
      if (!p || p.prvek === prvek) continue;
      const a = podleId.get(p.a)!;
      const b = podleId.get(p.b)!;
      const bez = smaz(navrh, new Set([id]), new Set());
      const duvod = duvodProtiPrutu(bez, this.uroven, a, b, prvek);
      if (duvod) {
        this.posledniDuvod = duvod;
        continue;
      }
      navrh = zmenPrvek(navrh, [id], prvek);
    }
    if (!this.#zmen(navrh)) {
      this.#poZmene();
      return false;
    }
    return true;
  }

  /** Doplní zrcadlový obraz mostu (nebo výběru) podle osy hlavní trasy. */
  zrcadli(): boolean {
    const trasa = this.uroven.trasy[0];
    if (!trasa) return false;
    const osa = (trasa.zacatek.x + trasa.konec.x) / 2;
    const zrcadleny = zrcadli(this.#navrh, osa, this.vybranePruty);
    // Obraz se přidá jen tehdy, když celý vyhovuje pravidlům.
    let duvod: DruhProblemu | null = null;
    const podleId = new Map(zrcadleny.stycniky.map((s) => [s.id, s]));
    const stare = new Set(this.#navrh.pruty.map((p) => p.id));
    let postupny = this.#navrh;
    for (const p of zrcadleny.pruty) {
      if (stare.has(p.id)) continue;
      const a = podleId.get(p.a)!;
      const b = podleId.get(p.b)!;
      const d = duvodProtiPrutu(postupny, this.uroven, a, b, p.prvek);
      if (d) {
        duvod = d;
        continue;
      }
      postupny = pridejPrut(postupny, a, b, p.prvek);
    }
    this.posledniDuvod = duvod;
    if (!this.#zmen(postupny)) {
      this.#poZmene();
      return false;
    }
    return true;
  }

  /** Bod, ve kterém by teď šlo začít kreslit, pokud je kurzor u něj; pro zvýraznění. */
  mistoZacatku(bod: Bod): Bod | null {
    const mriz = naRastr(bod);
    if (Math.hypot(bod.x - mriz.x, bod.y - mriz.y) > 0.5) return null;
    return lzeZacit(this.#navrh, this.uroven, mriz) ? mriz : null;
  }

  /** Je v daném bodě rastru styčník návrhu? */
  maStycnik(bod: Bod): boolean {
    return stycnikV(this.#navrh, bod) !== undefined;
  }
}
