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
import { pridejKontaktSTerenem, type Teren } from "../jadro/teren";
import { prestavTrasu, type Trasa } from "../jadro/trasa";
import { modelUcastnika, SIRKA_NA_OSOBU, vedleSebe } from "./vozidla";

export const CEKA = 0;
export const JEDE = 1;
export const PREJEL = 2;
export const SPADL = 3;

/** Druhy provozu, které jsou lidé: jejich pohodlí se měří zrychlením mostovky. */
const LIDE: ReadonlySet<string> = new Set([
  "chodec",
  "bezec",
  "dav",
  "utvar",
  "bezecky-zavod",
  "pruvod",
  "skakajici-dav",
]);

/** Je daný druh provozu člověk (nebo skupina lidí)? */
export function jeClovek(druh: string): boolean {
  return LIDE.has(druh);
}

/** O kolik metrů pod úroveň trasy se účastník musí propadnout, aby se počítal za spadlého. */
const HLOUBKA_PADU = 1.5;
/** Jak daleko za konec mostu musí účastník dojet, aby se počítal za přejetého, m. */
const DOJEZD = 2;
/** Odpor vody: zpomalení úměrné rychlosti, 1/s. Potopený kus klesá ustálenou rychlostí g/odpor. */
const ODPOR_VODY = 3;
/**
 * Tuhost a tlumení spojení mezi nápravami (N/m, N·s/m). Při jízdě vede každou nápravu
 * předepsaná rychlost a spojení jen nepatrně brání kývání karoserie; drží vozidlo
 * pohromadě, až když spadne a nápravy se uvolní.
 */
const TUHOST_SPOJENI_NAPRAV = 2e6;
const TLUMENI_SPOJENI_NAPRAV = 4e3;

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
  /** Kroková frekvence v Hz a výchozí fáze (cos, sin); jen u lidí. */
  kadence?: number;
  faze?: [number, number];
  /** Kolik lidí jde v tomto členu vedle sebe (řada útvaru); bez údaje jeden. */
  lidi?: number;
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
    const jeden = modelUcastnika(polozka.druh, polozka.kadence);
    if (!jeden) throw new Error(`Provoz druhu „${polozka.druh}“ hra zatím neumí.`);
    const lidi = polozka.pocet ?? 1;
    // Útvar jde v řadách přes celou šířku mostovky a všichni ve stejné fázi kroku;
    // ostatní jdou po jednom a každý má fázi svou.
    const utvar = polozka.druh === "utvar";
    const vRade = utvar ? Math.max(1, Math.floor(uroven.sirkaMostovky / SIRKA_NA_OSOBU)) : 1;
    const pocet = Math.ceil(lidi / vRade);
    const spolecnaFaze = utvar && jeden.buzeni ? nahodnaFaze(nahodne) : null;
    // Před mostem je rozjezd dlouhý sekundu jízdy, aby bylo vidět, kdo přijíždí.
    const nabeh = Math.max(2, jeden.rychlost);

    for (let clen = 0; clen < pocet; clen++) {
      const vTetoRade = Math.min(vRade, lidi - clen * vRade);
      const model = vedleSebe(jeden, vTetoRade);
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
        ucastnik.faze = spolecnaFaze ?? nahodnaFaze(nahodne);
      }
      if (vTetoRade > 1) ucastnik.lidi = vTetoRade;

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
      // Nápravy téhož vozidla drží pohromadě spojení mezi karoseriemi (u kola mezi koly).
      const spojovane = ucastnik.karoserie.length > 0 ? ucastnik.karoserie : ucastnik.kola;
      for (let i = 0; i + 1 < spojovane.length; i++) {
        popis.prvky.push(popisPruziny(spojovane[i]!, spojovane[i + 1]!, TUHOST_SPOJENI_NAPRAV, TLUMENI_SPOJENI_NAPRAV));
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
  /** Výška každého styčníku provozu nad jeho dotykem se zemí (osa kola, těžiště chodce). */
  readonly #vysky: Float64Array;
  /** Styčníky spadlých účastníků: jen ty se opírají o terén, ostatní nese trasa. */
  readonly #naTerenu: Uint8Array;
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
    this.#naTerenu = new Uint8Array(s.pocetStycniku);
    this.#vysky = new Float64Array(s.pocetStycniku);
    for (const u of plan.ucastnici) {
      for (const i of u.kola) this.#vysky[i] = u.vyska;
      // Karoserie dosedne o něco výš než kola, aby vozidlo po pádu neleželo zploštělé.
      for (const i of u.karoserie) this.#vysky[i] = u.vyska + 0.2;
    }
    // Nikdo ještě nejede; rychlost dostane každý až při vyjetí.
    for (const u of plan.ucastnici) for (const i of u.stycniky) s.vx[i] = 0;
  }

  /** Je právě na mostě (mezi konci své trasy) aspoň jeden člověk? */
  lideNaMoste(s: Soustava): boolean {
    const { ucastnici } = this.#plan;
    for (let k = 0; k < ucastnici.length; k++) {
      if (this.stavy[k] !== JEDE) continue;
      const u = ucastnici[k]!;
      if (!LIDE.has(u.druh)) continue;
      const trasa = this.#uroven.trasy[u.trasa]!;
      const x = s.x[u.kola[0]!]!;
      if (x >= trasa.zacatek.x && x <= trasa.konec.x) return true;
    }
    return false;
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
    // Spadlí účastníci dopadají na terén a do vody; ostatní nese trasa.
    if (this.#nekdoSpadl) {
      pridejKontaktSTerenem(s, this.#teren, od, this.#vysky.length, this.#vysky, this.#naTerenu);
      const hladina = this.#uroven.hladina;
      if (hladina !== null) pridejOdporVody(s, hladina, od, this.#vysky.length);
    }
  }

  posun(s: Soustava, cas: number): void {
    for (const b of this.bremena) posunBremena(b);
    const { ucastnici } = this.#plan;
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
          // Stává se volným tělesem: vodorovně už ho nevede předepsaná rychlost, jen setrvačnost.
          for (const i of u.stycniky) {
            this.#naTerenu[i] = 1;
            s.podpora[i] = s.podpora[i]! & ~1;
            s.invHmotaX[i] = 1 / s.hmota[i]!;
          }
          this.#nekdoSpadl = true;
        } else if (dojel) {
          this.#ukonci(k, PREJEL, cas, "prujezd");
          for (const i of u.stycniky) s.vx[i] = 0;
        }
      }
    }
  }

  #nekdoSpadl = false;

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
