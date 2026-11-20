// Zkouška mostu v úrovni: postaví most z návrhu, pustí po něm provoz podle jízdního řádu,
// zaznamená průběh a vyhodnotí, kdo přejel, co se porušilo a jaké medaile most získal.
// Nezávisí na prohlížeči; ve hře ji pohání pracovní vlákno, v testech Node.

import { cenaNavrhu } from "../data/cena";
import type { NavrhMostu } from "../data/navrh";
import type { Medaile } from "../data/ulozeni";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { najdiRovnovahu } from "../jadro/matice";
import { ZPUSOB_TAH, ZPUSOB_ZADNY } from "../jadro/namahani";
import { Simulace, type Zatizeni } from "../jadro/simulace";
import { sestavSoustavu, type Soustava } from "../jadro/soustava";
import { volneStupne } from "../jadro/stupne";
import { pridejKontaktSTerenem, vytvorTeren, type Teren } from "../jadro/teren";
import { vytvorTrasu } from "../jadro/trasa";
import { otiskSimulace } from "./otisk";
import { naplanujProvoz, pridejOdporVody, Provoz, type PopisUcastnika } from "./provoz";
import type { ObalkaPrutu, Udalost, VysledekZkousky } from "./protokol";
import { sestavMost } from "./stavba";
import { topologieSoustavy, type PopisKresleni, type Snimek, type Topologie } from "./zaznam";

/** Počet snímků záznamu na sekundu děje. */
export const SNIMKU_ZA_SEKUNDU = 60;
/** Jak dlouho děj pokračuje poté, co poslední účastník dojel nebo spadl, v sekundách. */
const DOBEH = 1.5;
/** Délka zkoušky bez provozu: most jen stojí pod vlastní tíhou. */
const TRVANI_BEZ_PROVOZU = 3;
/** Po kolika krocích se aktualizuje obálka namáhání; shodně s posudkem v simulaci. */
const INTERVAL_OBALKY = 4;

/** Co zkouška vydala od minulého volání. */
export interface DavkaZkousky {
  snimky: Snimek[];
  /** Nové stavby konstrukce v pořadí, v jakém vznikly. */
  topologie: Topologie[];
  udalosti: Udalost[];
}

export class Zkouska {
  readonly simulace: Simulace;
  readonly provoz: Provoz;
  /** Očekávaná délka děje v sekundách; skutečná může být kratší i delší. */
  readonly trvani: number;
  /** Most neměl pod vlastní tíhou klidovou polohu. */
  readonly bezRovnovahy: boolean;

  readonly #uroven: Uroven;
  readonly #navrh: NavrhMostu;
  readonly #kresleni: PopisKresleni;
  readonly #obalka: ObalkaPrutu[];
  #dalsiSnimek = 0;
  #topologii = 0;
  #poruseni = 0;
  #udalostiProvozu = 0;
  #konec = Infinity;
  #zacala = false;

  constructor(uroven: Uroven, navrh: NavrhMostu, nasada: number) {
    this.#uroven = uroven;
    this.#navrh = navrh;
    const tiha = TIHOVE_ZRYCHLENI;
    const stavba = sestavMost(uroven, navrh);
    const stycnikuMostu = stavba.popis.stycniky.length;
    const prvkuMostu = stavba.popis.prvky.length;
    const plan = naplanujProvoz(stavba.popis, uroven, nasada, tiha);
    // Pérování vozidel není prut návrhu.
    for (let e = prvkuMostu; e < stavba.popis.prvky.length; e++) stavba.popis.prvky[e]!.prut = -1;

    // Výchozí poloha je rovnováha pod vlastní tíhou. Most bez ztužení ji nemá: zkouší se
    // z nakreslené polohy a zřítí se před očima.
    let s = sestavSoustavu(stavba.popis);
    const stupneMostu = (soustava: Soustava): Int32Array =>
      volneStupne(soustava).filter((kod) => kod < 3 * stycnikuMostu);
    let stupne = stupneMostu(s);
    this.bezRovnovahy = stupne.length > 0 && najdiRovnovahu(s, stupne, new Float64Array(stupne.length), tiha) < 0;
    if (this.bezRovnovahy) {
      s = sestavSoustavu(stavba.popis);
      stupne = stupneMostu(s);
    }

    const trasy = uroven.trasy.map((trasa, i) =>
      vytvorTrasu(s, stavba.trasy[i]?.pruty ?? [], {
        xLevy: trasa.zacatek.x,
        yLevy: trasa.zacatek.y,
        xPravy: trasa.konec.x,
        yPravy: trasa.konec.y,
      }),
    );
    const teren = vytvorTeren(uroven.teren);
    this.provoz = new Provoz(s, plan, trasy, uroven, teren);

    const utlumPrvku = new Float64Array(s.pocetPrvku);
    utlumPrvku.set(stavba.utlumPrvku);
    let utlum = 0.01;
    if (stavba.utlumPrvku.length > 0) {
      utlum = 0;
      for (const u of stavba.utlumPrvku) utlum += u / stavba.utlumPrvku.length;
    }
    this.simulace = new Simulace(s, {
      tiha,
      utlum,
      utlumPrvku,
      tlumeneStupne: stupne,
      zatizeni: this.#zatizeni(teren, stycnikuMostu),
    });

    this.trasyMostovky = stavba.trasy.flatMap((t) => t.pruty);
    const skryte: number[] = [];
    for (let i = stycnikuMostu; i < s.pocetStycniku; i++) skryte.push(i);
    const zavazi: number[] = [];
    navrh.stycniky.forEach((st, i) => {
      if (st.zavazi) zavazi.push(i);
    });
    this.#kresleni = { mostovka: this.trasyMostovky, skryte, zavazi };
    this.#obalka = navrh.pruty.map(() => ({ vyuziti: 0, zpusob: ZPUSOB_ZADNY, cas: 0 }));
    this.trvani = plan.ucastnici.length > 0 ? plan.konec + DOBEH : TRVANI_BEZ_PROVOZU;
    if (plan.ucastnici.length === 0) this.#konec = TRVANI_BEZ_PROVOZU;
  }

  /** Pořadí prutů návrhu, které tvoří mostovku tras. */
  readonly trasyMostovky: number[];

  get ucastnici(): readonly PopisUcastnika[] {
    return this.provoz.ucastnici;
  }

  get hotovo(): boolean {
    return this.simulace.cas >= this.#konec || this.simulace.rozpadla;
  }

  /** Provoz a po prvním porušení i dopad trosek mostu na terén a do vody. */
  #zatizeni(teren: Teren, stycnikuMostu: number): Zatizeni {
    const provoz = this.provoz;
    const hladina = this.#uroven.hladina;
    return {
      pridejSily: (s, cas) => {
        provoz.pridejSily(s);
        if (this.simulace?.porusena || this.bezRovnovahy) {
          // Styčníky vzniklé rozlomením prutů jsou až za styčníky provozu.
          pridejKontaktSTerenem(s, teren, 0, stycnikuMostu);
          pridejKontaktSTerenem(s, teren, this.#prvniTroska, s.pocetStycniku);
          if (hladina !== null) {
            pridejOdporVody(s, hladina, 0, stycnikuMostu);
            pridejOdporVody(s, hladina, this.#prvniTroska, s.pocetStycniku);
          }
        }
        void cas;
      },
      posun: (s, cas) => provoz.posun(s, cas),
      poZmene: (s) => provoz.poZmene(s),
      zmenaKroku: (dt) => provoz.zmenaKroku(dt),
      pridavnaFrekvence: (s) => provoz.pridavnaFrekvence(s),
    };
  }

  /** Index prvního styčníku, který vznikl až porušením (za mostem a provozem). */
  get #prvniTroska(): number {
    return this.#pocatecnichStycniku;
  }

  #pocatecnichStycniku = Infinity;

  /**
   * Posune děj nejvýš o `sekundDeje` a vrátí, co přibylo do záznamu.
   * První volání vydá i výchozí stavbu a snímek výchozího stavu.
   */
  pokracuj(sekundDeje: number): DavkaZkousky {
    const sim = this.simulace;
    const s = sim.soustava;
    const davka: DavkaZkousky = { snimky: [], topologie: [], udalosti: [] };
    if (!this.#zacala) {
      this.#zacala = true;
      this.#pocatecnichStycniku = s.pocetStycniku;
      davka.topologie.push(this.#novaTopologie());
      davka.snimky.push(this.#snimek());
      this.#dalsiSnimek = 1 / SNIMKU_ZA_SEKUNDU;
    }
    const do_ = sim.cas + sekundDeje;
    while (sim.cas < do_ && !this.hotovo) {
      sim.krok();
      if (sim.kroku % INTERVAL_OBALKY === 0) this.#aktualizujObalku();

      // Průjezdy a pády.
      const provozni = this.provoz.udalosti;
      for (; this.#udalostiProvozu < provozni.length; this.#udalostiProvozu++) {
        davka.udalosti.push(provozni[this.#udalostiProvozu]!);
      }
      if (this.provoz.hotovo && this.#konec === Infinity && this.provoz.ucastnici.length > 0) {
        this.#konec = sim.cas + DOBEH;
      }

      if (sim.udalosti.length > this.#poruseni) {
        // Porušení: zaznamenat a hned vydat snímek s novou stavbou, aby se přehrávání
        // nepokoušelo prokládat přes zlom.
        for (; this.#poruseni < sim.udalosti.length; this.#poruseni++) {
          const u = sim.udalosti[this.#poruseni]!;
          if (u.prut < 0) continue;
          davka.udalosti.push({ cas: u.cas, druh: "poruseni", prut: u.prut, zpusob: u.zpusob, nasledek: u.nasledek, mira: u.mira });
          const obalka = this.#obalka[u.prut];
          if (obalka && u.mira > obalka.vyuziti) {
            obalka.vyuziti = u.mira;
            obalka.zpusob = u.zpusob;
            obalka.cas = u.cas;
          }
        }
        davka.topologie.push(this.#novaTopologie());
        davka.snimky.push(this.#snimek());
      } else if (sim.cas >= this.#dalsiSnimek) {
        davka.snimky.push(this.#snimek());
        this.#dalsiSnimek += 1 / SNIMKU_ZA_SEKUNDU;
      }
    }
    return davka;
  }

  /** Největší využití každého prutu návrhu; utržené kusy se už nepočítají. */
  #aktualizujObalku(): void {
    const s = this.simulace.soustava;
    const cas = this.simulace.cas;
    for (let e = 0; e < s.pocetPrvku; e++) {
      const prut = s.prut[e]!;
      if (prut < 0 || s.utrzeny[e] === 1) continue;
      const obalka = this.#obalka[prut];
      const vyuziti = s.vyuziti[e]!;
      if (obalka && vyuziti > obalka.vyuziti) {
        obalka.vyuziti = vyuziti;
        obalka.zpusob = s.zpusob[e]!;
        obalka.cas = cas;
      }
    }
  }

  vysledek(): VysledekZkousky {
    const provoz = this.provoz;
    const ucastniku = provoz.ucastnici.length;
    const prejelo = provoz.prejelo;
    const spadlo = provoz.spadlo;
    const rozpad = this.simulace.rozpadla;
    const cena = cenaNavrhu(this.#navrh);
    let nejvetsiVyuziti = 0;
    for (const o of this.#obalka) nejvetsiVyuziti = Math.max(nejvetsiVyuziti, o.vyuziti);
    let poruseni = 0;
    for (const u of this.simulace.udalosti) if (u.prut >= 0) poruseni++;

    // Bez provozu projde most, který pod vlastní tíhou vydržel celý.
    const pruchod = !rozpad && spadlo === 0 && prejelo === ucastniku && (ucastniku > 0 || (poruseni === 0 && !this.bezRovnovahy));
    const uroven = this.#uroven;
    const bonus = uroven.mistrovska;
    const medaile: Medaile = {
      pruchod,
      rozpocet: pruchod && uroven.inzenyrskyRozpocet !== null && cena <= uroven.inzenyrskyRozpocet,
      // Komfort chodců a cestujících se zatím neměří; takový bonus proto získat nejde.
      mistrovska: pruchod && bonus !== null && bonus.druh === "rezerva" && nejvetsiVyuziti <= bonus.limit,
    };
    return {
      pruchod,
      ucastniku,
      prejelo,
      spadlo,
      poruseni,
      cena,
      nejvetsiVyuziti,
      medaile,
      obalka: this.#obalka.map((o) => ({ ...o })),
      bezRovnovahy: this.bezRovnovahy,
      rozpad,
      trvani: this.simulace.cas,
      kroku: this.simulace.kroku,
      otisk: otiskSimulace(this.simulace),
    };
  }

  #novaTopologie(): Topologie {
    this.#topologii += 1;
    return topologieSoustavy(this.simulace.soustava, this.#kresleni);
  }

  #snimek(): Snimek {
    const s = this.simulace.soustava;
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
    return {
      cas: this.simulace.cas,
      topologie: this.#topologii - 1,
      polohy,
      vyuziti,
      kola: new Float32Array(0),
      sily: new Float32Array(0),
      provoz: this.provoz.stavy.slice(),
    };
  }
}
