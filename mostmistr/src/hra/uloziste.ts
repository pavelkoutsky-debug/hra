// Uložený postup v paměti prohlížeče: rozpracované mosty a rekordy úrovní.
// Tvar dat a jeho kontrolu řeší `src/data/ulozeni.ts`; tady je jen čtení a zápis.
// Sklad se předává zvenčí, takže stejný kód běží v prohlížeči i v testech.

import type { NavrhMostu } from "../data/navrh";
import { ID_SANDBOXU, sandboxNaText, sandboxZTextu, vychoziSandbox, type NastaveniSandboxu } from "../data/sandbox";
import {
  prazdneUlozeni,
  ulozeniNaText,
  ulozeniZTextu,
  vylepsiRekord,
  vylepsiZlom,
  type Medaile,
  type Rekord,
  type Ulozeni,
} from "../data/ulozeni";

/** Část rozhraní `Storage`, kterou úložiště potřebuje. */
export interface Sklad {
  getItem(klic: string): string | null;
  setItem(klic: string, hodnota: string): void;
}

export const KLIC_ULOZENI = "mostmistr.ulozeni";
/** Sem se odloží uložení, které nešlo přečíst, aby o něj hráč nepřišel. */
export const KLIC_POSKOZENEHO = "mostmistr.ulozeni.poskozene";
/** Ladicí volba pro testování: všechny úrovně odemčené. */
export const KLIC_ODEMCENI = "mostmistr.odemceno";
/** Volba hráče: ukazovat u prutů čísla využití. */
export const KLIC_CISEL = "mostmistr.cisla";
/** Volba hráče: hlasitost zvuku. */
export const KLIC_ZVUKU = "mostmistr.zvuk";
/** Nastavení sandboxu: údolí, trasa a provoz. */
export const KLIC_SANDBOXU = "mostmistr.sandbox";
export const KLIC_SANDBOX_NAVSTIVEN = "mostmistr.sandbox.navstiven";

export const HLASITOSTI = ["nahlas", "potichu", "vypnuto"] as const;
export type Hlasitost = (typeof HLASITOSTI)[number];
export const VYCHOZI_HLASITOST: Hlasitost = "potichu";

/**
 * Paměť prohlížeče, nebo null, když ji prohlížeč nedá (soukromé okno, zakázaná data webu).
 * Hra pak běží dál, jen si nic nepamatuje.
 */
export function skladProhlizece(): Sklad | null {
  try {
    const sklad = window.localStorage;
    const zkouska = "mostmistr.zkouska";
    sklad.setItem(zkouska, "1");
    sklad.removeItem(zkouska);
    return sklad;
  } catch {
    return null;
  }
}

export class Uloziste {
  readonly #sklad: Sklad | null;
  #ulozeni: Ulozeni;
  /** Uložený postup nešel přečíst; hra začala s prázdným a původní text odložila stranou. */
  readonly poskozeno: boolean;

  constructor(sklad: Sklad | null) {
    this.#sklad = sklad;
    let ulozeni = prazdneUlozeni();
    let poskozeno = false;
    const zapis = this.#cti(KLIC_ULOZENI);
    if (zapis !== null) {
      try {
        ulozeni = ulozeniZTextu(zapis);
      } catch {
        poskozeno = true;
        this.#pis(KLIC_POSKOZENEHO, zapis);
      }
    }
    this.#ulozeni = ulozeni;
    this.poskozeno = poskozeno;
  }

  /** Pamatuje si úložiště postup i po zavření stránky? */
  get trvale(): boolean {
    return this.#sklad !== null;
  }

  get ulozeni(): Ulozeni {
    return this.#ulozeni;
  }

  navrh(idUrovne: string): NavrhMostu | undefined {
    return this.#ulozeni.navrhy[idUrovne];
  }

  rekord(idUrovne: string): Rekord | undefined {
    return this.#ulozeni.rekordy[idUrovne];
  }

  /** Uloží rozpracovaný most úrovně, ke které patří. */
  ulozNavrh(navrh: NavrhMostu): void {
    this.#ulozeni = { ...this.#ulozeni, navrhy: { ...this.#ulozeni.navrhy, [navrh.uroven]: navrh } };
    this.#zapis();
  }

  /** Započítá výsledek zkoušky do rekordu úrovně a vrátí nový rekord. */
  zapocitej(idUrovne: string, medaile: Medaile, cena: number, verzeFyziky: number, hmotnost?: number): Rekord {
    const rekord = vylepsiRekord(this.#ulozeni.rekordy[idUrovne], medaile, cena, verzeFyziky, hmotnost);
    this.#ulozeni = { ...this.#ulozeni, rekordy: { ...this.#ulozeni.rekordy, [idUrovne]: rekord } };
    this.#zapis();
    return rekord;
  }

  /** Započítá výsledek zkoušky do zlomu (únosnost na korunu, N/Kč) a vrátí nový rekord. */
  zapocitejZlom(idUrovne: string, unosnostNaKorunu: number, verzeFyziky: number): Rekord {
    const rekord = vylepsiZlom(this.#ulozeni.rekordy[idUrovne], unosnostNaKorunu, verzeFyziky);
    this.#ulozeni = { ...this.#ulozeni, rekordy: { ...this.#ulozeni.rekordy, [idUrovne]: rekord } };
    this.#zapis();
    return rekord;
  }

  get odemcenoVse(): boolean {
    return this.#cti(KLIC_ODEMCENI) === "1";
  }

  set odemcenoVse(odemceno: boolean) {
    this.#pis(KLIC_ODEMCENI, odemceno ? "1" : "0");
  }

  /** Mají se u prutů ukazovat čísla využití? Dokud hráč nezvolí jinak, ano. */
  get cislaVyuziti(): boolean {
    return this.#cti(KLIC_CISEL) !== "0";
  }

  set cislaVyuziti(ukazovat: boolean) {
    this.#pis(KLIC_CISEL, ukazovat ? "1" : "0");
  }

  /**
   * Hlasitost zvuku. Dokud hráč nezvolí jinak, hraje hra potichu: zvuky jsou zatím pracovní
   * (rozhodnutí zadavatele), mají být slyšet, ale nerušit.
   */
  get hlasitost(): Hlasitost {
    const zapis = this.#cti(KLIC_ZVUKU);
    return HLASITOSTI.find((h) => h === zapis) ?? VYCHOZI_HLASITOST;
  }

  set hlasitost(hlasitost: Hlasitost) {
    this.#pis(KLIC_ZVUKU, hlasitost);
  }

  /** Nastavení sandboxu; výchozí, dokud si ho hráč nezmění nebo když uložené nejde přečíst. */
  get sandbox(): NastaveniSandboxu {
    const zapis = this.#cti(KLIC_SANDBOXU);
    if (zapis === null) return vychoziSandbox();
    try {
      return sandboxZTextu(zapis);
    } catch {
      // Nečitelné nastavení: hra začne s výchozím údolím a rozestavěný most, který patřil do
      // toho ztraceného, zahodí (jinak by v cizím údolí jen svítil chybami).
      this.smazNavrh(ID_SANDBOXU);
      this.#pis(KLIC_SANDBOXU, sandboxNaText(vychoziSandbox()));
      return vychoziSandbox();
    }
  }

  set sandbox(nastaveni: NastaveniSandboxu) {
    this.#pis(KLIC_SANDBOXU, sandboxNaText(nastaveni));
  }

  /** Už hráč sandbox někdy otevřel? Podruhé se mu zadání samo neotvírá. */
  get sandboxNavstiven(): boolean {
    return this.#cti(KLIC_SANDBOX_NAVSTIVEN) === "1";
  }

  set sandboxNavstiven(navstiven: boolean) {
    this.#pis(KLIC_SANDBOX_NAVSTIVEN, navstiven ? "1" : "0");
  }

  /** Smaže rozpracovaný most úrovně (sandbox po změně údolí). */
  smazNavrh(idUrovne: string): void {
    if (!(idUrovne in this.#ulozeni.navrhy)) return;
    const navrhy = { ...this.#ulozeni.navrhy };
    delete navrhy[idUrovne];
    this.#ulozeni = { ...this.#ulozeni, navrhy };
    this.#zapis();
  }

  #zapis(): void {
    this.#pis(KLIC_ULOZENI, ulozeniNaText(this.#ulozeni));
  }

  #cti(klic: string): string | null {
    try {
      return this.#sklad?.getItem(klic) ?? null;
    } catch {
      return null;
    }
  }

  #pis(klic: string, hodnota: string): void {
    try {
      this.#sklad?.setItem(klic, hodnota);
    } catch {
      // Plná nebo zakázaná paměť: hra běží dál, postup se jen neuloží.
    }
  }
}
