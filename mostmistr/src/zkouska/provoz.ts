// Provoz při zkoušce: účastníci z jízdního řádu, jejich jízda po trase, průjezd a pád.
//
// Styčníky a pérování všech účastníků se do soustavy přidají předem; kdo ještě nevyjel,
// stojí před mostem na pevné zemi. Vodorovně je vede předepsaná rychlost, svisle je
// počítá jádro spolu s mostem. Kdo ztratí mostovku pod koly a propadne se, spadl: přestane
// se o trasu opírat a dopadne na terén nebo do vody.

import type { IdProvozu } from "../data/katalog";
import type { Uroven } from "../data/uroven";
import {
  nastavKrokBremen,
  posunBremena,
  pridavnaFrekvenceBremen,
  pridejSilyBremen,
  vytvorBremena,
  type Bremena,
  type PopisBremene,
} from "../jadro/bremena";
import { nahoda, nahodnaFaze } from "../jadro/nahoda";
import type { Zatizeni } from "../jadro/simulace";
import { popisPruziny, type PopisSoustavy, type Soustava } from "../jadro/soustava";
import { pridejKontaktSTerenem, vyskaTerenuV, type Teren } from "../jadro/teren";
import { prestavTrasu, type Trasa } from "../jadro/trasa";
import { modelUcastnika } from "./vozidla";

export const CEKA = 0;
export const JEDE = 1;
export const PREJEL = 2;
export const SPADL = 3;

/** O kolik metrů pod úroveň trasy se účastník musí propadnout, aby se počítal za spadlého. */
const HLOUBKA_PADU = 1.5;
/** Jak daleko za konec mostu musí účastník dojet, aby se počítal za přejetého, m. */
const DOJEZD = 2;
/** Odpor vody: zpomalení úměrné rychlosti, 1/s. Potopený kus klesá ustálenou rychlostí g/odpor. */
const ODPOR_VODY = 3;

/** Účastník provozu tak, jak ho potřebuje výkres. */
export interface PopisUcastnika {
  /** Index položky jízdního řádu a pořadí ve skupině. */
  polozka: number;
  clen: number;
  druh: IdProvozu;
  smer: 1 | -1;
  /** Čas vyjetí v sekundách. */
  start: number;
  rychlost: number;
  delka: number;
  /** Styčníky kontaktu s mostovkou (osy kol, těžiště chodce), od čela dozadu. */
  kola: number[];
  /** Styčníky karoserie nad nápravami; prázdné u účastníků bez pérování. */
  karoserie: number[];
  /** Výška styčníku kola nad povrchem (poloměr kola, výška těžiště chodce), m. */
  vyska: number;
  /** Kroková frekvence v Hz a výchozí fáze (cos, sin); jen u chodců. */
  kadence?: number;
  faze?: [number, number];
}

interface KontaktUcastnika {
  trasa: number;
  /** Index břemene v břemenech trasy. */
  bremeno: number;
}

interface PlanUcastnika extends PopisUcastnika {
  trasa: number;
  kontakty: KontaktUcastnika[];
  /** Všechny styčníky účastníka. */
  stycniky: number[];
}

/** Co se má přidat do soustavy a jak to pak řídit. */
export interface PlanProvozu {
  ucastnici: PlanUcastnika[];
  /** Kontakty břemen pro každou trasu úrovně. */
  kontakty: PopisBremene[][];
  /** Index prvního styčníku provozu; styčníky mostu jsou před ním. */
  prvniStycnik: number;
  /** Čas, kdy by měl poslední účastník dojet, kdyby nikdo nespadl. */
  konec: number;
}

export type UdalostProvozu = { cas: number; druh: "prujezd" | "pad"; polozka: number; clen: number };

/**
 * Přidá do popisu soustavy styčníky a pérování všech účastníků jízdního řádu a vrátí plán,
 * podle kterého je `Provoz` po sestavení soustavy řídí. Druh provozu, který hra zatím
 * neumí, skončí chybou.
 */
export function naplanujProvoz(popis: PopisSoustavy, uroven: Uroven, nasada: number, tiha: number): PlanProvozu {
  const nahodne = nahoda(nasada);
  const plan: PlanProvozu = {
    ucastnici: [],
    kontakty: uroven.trasy.map(() => []),
    prvniStycnik: popis.stycniky.length,
    konec: 0,
  };

  uroven.jizdniRad.forEach((polozka, cisloPolozky) => {
    const cisloTrasy = uroven.trasy.findIndex((t) => t.id === polozka.trasa);
    const trasa = uroven.trasy[cisloTrasy];
    if (!trasa) throw new Error(`Jízdní řád odkazuje na trasu „${polozka.trasa}“, která v úrovni není.`);
    const model = modelUcastnika(polozka.druh, polozka.kadence);
    if (!model) throw new Error(`Provoz druhu „${polozka.druh}“ hra zatím neumí.`);
    const pocet = polozka.pocet ?? 1;
    // Před mostem je rozjezd dlouhý sekundu jízdy, aby bylo vidět, kdo přijíždí.
    const nabeh = Math.max(2, model.rychlost);

    for (let clen = 0; clen < pocet; clen++) {
      const odCela = nabeh + clen * model.rozestup;
      const celo = polozka.smer === 1 ? trasa.zacatek.x - odCela : trasa.konec.x + odCela;
      const zem = polozka.smer === 1 ? trasa.zacatek.y : trasa.konec.y;
      const ucastnik: PlanUcastnika = {
        polozka: cisloPolozky,
        clen,
        druh: polozka.druh,
        smer: polozka.smer,
        start: polozka.cas,
        rychlost: model.rychlost,
        delka: model.delka,
        kola: [],
        karoserie: [],
        vyska: model.napravy[0]!.kontakt.vyska,
        trasa: cisloTrasy,
        kontakty: [],
        stycniky: [],
      };
      if (model.buzeni) {
        ucastnik.kadence = model.buzeni.frekvence;
        ucastnik.faze = nahodnaFaze(nahodne);
      }

      for (const naprava of model.napravy) {
        const x = celo - polozka.smer * naprava.odstup;
        // Výchozí poloha je klidová: kontakt stlačený tíhou všeho, co nese.
        const nesena = naprava.odpruzena + naprava.neodpruzena;
        const yKola = zem + naprava.kontakt.vyska - (nesena * tiha) / naprava.kontakt.tuhost;
        const kolo = popis.stycniky.length;
        const bremeno: PopisBremene = {
          stycnik: kolo,
          tuhost: naprava.kontakt.tuhost,
          tlumeni: naprava.kontakt.tlumeni,
          vyskaNad: naprava.kontakt.vyska,
        };
        if (model.buzeni && ucastnik.faze) bremeno.buzeni = { ...model.buzeni, faze: ucastnik.faze };

        if (naprava.perovani && naprava.neodpruzena > 0) {
          popis.stycniky.push({ x, y: yKola, pevneX: true, hmota: naprava.neodpruzena });
          const karoserie = popis.stycniky.length;
          popis.stycniky.push({ x, y: yKola + naprava.perovani.vyska, pevneX: true, hmota: naprava.odpruzena });
          // Pružina je v klidové poloze stlačená tíhou karoserie.
          const stlaceni = (naprava.odpruzena * tiha) / naprava.perovani.tuhost;
          popis.prvky.push({
            ...popisPruziny(kolo, karoserie, naprava.perovani.tuhost, naprava.perovani.tlumeni),
            klidovaDelka: naprava.perovani.vyska + stlaceni,
          });
          ucastnik.karoserie.push(karoserie);
          ucastnik.stycniky.push(kolo, karoserie);
        } else {
          popis.stycniky.push({ x, y: yKola, pevneX: true, hmota: nesena });
          ucastnik.stycniky.push(kolo);
        }
        ucastnik.kola.push(kolo);
        const kontakty = plan.kontakty[cisloTrasy]!;
        ucastnik.kontakty.push({ trasa: cisloTrasy, bremeno: kontakty.length });
        kontakty.push(bremeno);
      }
      plan.ucastnici.push(ucastnik);
      const draha = odCela + (trasa.konec.x - trasa.zacatek.x) + model.delka + DOJEZD;
      plan.konec = Math.max(plan.konec, polozka.cas + draha / model.rychlost);
    }
  });
  return plan;
}

/** Běžící provoz: zatížení pro simulaci a sledování, kdo přejel a kdo spadl. */
export class Provoz implements Zatizeni {
  readonly ucastnici: readonly PopisUcastnika[];
  /** Stav každého účastníka: CEKA, JEDE, PREJEL nebo SPADL. */
  readonly stavy: Uint8Array;
  /** Průjezdy a pády od začátku zkoušky. */
  readonly udalosti: UdalostProvozu[] = [];
  readonly bremena: Bremena[];

  readonly #plan: PlanProvozu;
  readonly #uroven: Uroven;
  readonly #teren: Teren;
  readonly #trasy: Trasa[];
  #nedokonceno: number;

  constructor(s: Soustava, plan: PlanProvozu, trasy: Trasa[], uroven: Uroven, teren: Teren) {
    this.#plan = plan;
    this.#uroven = uroven;
    this.#teren = teren;
    this.#trasy = trasy;
    this.ucastnici = plan.ucastnici;
    this.stavy = new Uint8Array(plan.ucastnici.length);
    this.#nedokonceno = plan.ucastnici.length;
    this.bremena = trasy.map((trasa, i) => vytvorBremena(trasa, plan.kontakty[i] ?? []));
    // Nikdo ještě nejede; rychlost dostane každý až při vyjetí.
    for (const u of plan.ucastnici) for (const i of u.stycniky) s.vx[i] = 0;
  }

  /** Všichni účastníci dojeli nebo spadli. */
  get hotovo(): boolean {
    return this.#nedokonceno === 0;
  }

  get prejelo(): number {
    return this.#pocet(PREJEL);
  }

  get spadlo(): number {
    return this.#pocet(SPADL);
  }

  #pocet(stav: number): number {
    let pocet = 0;
    for (const s of this.stavy) if (s === stav) pocet++;
    return pocet;
  }

  pridejSily(s: Soustava): void {
    for (const b of this.bremena) pridejSilyBremen(s, b);
    const od = this.#plan.prvniStycnik;
    // Spadlí účastníci dopadají na terén; ostatní jsou vysoko nad ním a výpočet je mine.
    pridejKontaktSTerenem(s, this.#teren, od, s.pocetStycniku);
    const hladina = this.#uroven.hladina;
    if (hladina !== null) pridejOdporVody(s, hladina, od, s.pocetStycniku);
  }

  posun(s: Soustava, cas: number, dt: number): void {
    for (const b of this.bremena) posunBremena(b);
    const { ucastnici } = this.#plan;
    const hladina = this.#uroven.hladina;
    for (let k = 0; k < ucastnici.length; k++) {
      const u = ucastnici[k]!;
      const stav = this.stavy[k]!;
      if (stav === CEKA) {
        if (cas >= u.start) {
          this.stavy[k] = JEDE;
          for (const i of u.stycniky) s.vx[i] = u.smer * u.rychlost;
        }
      } else if (stav === JEDE) {
        const trasa = this.#uroven.trasy[u.trasa]!;
        // Úroveň trasy pod účastníkem; trasa může být ve sklonu.
        const sklon = (trasa.konec.y - trasa.zacatek.y) / (trasa.konec.x - trasa.zacatek.x);
        let spadl = false;
        let dojel = true;
        for (const i of u.kola) {
          const x = s.x[i]!;
          let naTrase = trasa.zacatek.y + sklon * (x - trasa.zacatek.x);
          if (x < trasa.zacatek.x) naTrase = trasa.zacatek.y;
          else if (x > trasa.konec.x) naTrase = trasa.konec.y;
          if (s.y[i]! < naTrase + u.vyska - HLOUBKA_PADU) spadl = true;
          if (u.smer === 1 ? x < trasa.konec.x + DOJEZD : x > trasa.zacatek.x - DOJEZD) dojel = false;
        }
        if (spadl) {
          this.#ukonci(k, SPADL, cas, "pad");
          // Od této chvíle se o trasu neopírá; zachytí ho až terén.
          for (const kontakt of u.kontakty) this.bremena[kontakt.trasa]!.vypnuto[kontakt.bremeno] = 1;
        } else if (dojel) {
          this.#ukonci(k, PREJEL, cas, "prujezd");
          for (const i of u.stycniky) s.vx[i] = 0;
        }
      } else if (stav === SPADL) {
        // Po dopadu na zem nebo do vody se vodorovný pohyb rychle zastaví.
        for (const i of u.stycniky) {
          const naZemi = s.y[i]! <= vyskaTerenuV(this.#teren, s.x[i]!) + 0.05;
          const veVode = hladina !== null && s.y[i]! < hladina;
          if (naZemi || veVode) s.vx[i] = s.vx[i]! * (1 - Math.min(1, 8 * dt));
        }
      }
    }
  }

  #ukonci(k: number, stav: number, cas: number, druh: "prujezd" | "pad"): void {
    const u = this.#plan.ucastnici[k]!;
    this.stavy[k] = stav;
    this.#nedokonceno -= 1;
    this.udalosti.push({ cas, druh, polozka: u.polozka, clen: u.clen });
  }

  poZmene(s: Soustava): void {
    for (const trasa of this.#trasy) prestavTrasu(s, trasa);
  }

  zmenaKroku(dt: number): void {
    for (const b of this.bremena) nastavKrokBremen(b, dt);
  }

  pridavnaFrekvence(s: Soustava): number {
    let nejvic = 0;
    for (const b of this.bremena) nejvic = Math.max(nejvic, pridavnaFrekvenceBremen(s, b));
    return nejvic;
  }
}

/** Zpomalí styčníky pod hladinou: síla proti rychlosti úměrná hmotě. */
export function pridejOdporVody(s: Soustava, hladina: number, od: number, po: number): void {
  const { y, vx, vy, fx, fy, hmota, invHmotaX, invHmotaY } = s;
  for (let i = od; i < po; i++) {
    if (y[i]! >= hladina) continue;
    const odpor = ODPOR_VODY * hmota[i]!;
    if (invHmotaX[i] !== 0) fx[i] = fx[i]! - odpor * vx[i]!;
    if (invHmotaY[i] !== 0) fy[i] = fy[i]! - odpor * vy[i]!;
  }
}
