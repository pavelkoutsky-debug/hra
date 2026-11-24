// Uložený postup v paměti prohlížeče: rozpracované mosty a rekordy úrovní.
// Tvar dat a jeho kontrolu řeší `src/data/ulozeni.ts`; tady je jen čtení a zápis.
// Sklad se předává zvenčí, takže stejný kód běží v prohlížeči i v testech.

import { galerieNaText, galerieZTextu, lepsiMost, type Galerie, type MostGalerie } from "../data/galerie";
import type { NavrhMostu } from "../data/navrh";
import { dilnaNaText, dilnaZTextu, type Dilna } from "../data/dilna";
import { postupHavariiZTextu, zapisUzavreni, type PostupHavarii } from "../data/havarie";
import { ID_SANDBOXU, sandboxNaText, sandboxZTextu, vychoziSandbox, type NastaveniSandboxu } from "../data/sandbox";
import { NEJDELSI_KOD_MOSTU } from "../data/sdileni";
import { jeIdHraceZebricku, upravPrezdivku } from "../data/zebricek";
import {
  prazdneUlozeni,
  ulozeniNaText,
  ulozeniZTextu,
  VERZE_ULOZENI_M12,
  verzeZapisuUlozeni,
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
/** Volba hráče: zpomalený záběr na první porušení při zkoušce. */
export const KLIC_ZABERU = "mostmistr.zaber";
/** Kreslit při zkoušce pohyb mostu zvětšeně, aby bylo kmitání vidět? */
export const KLIC_ZVETSENI = "mostmistr.zvetseni";
/** Zrychlovat při přehrávání zkoušky úseky, kdy se nic neděje? */
export const KLIC_CEKANI = "mostmistr.cekani";
/** Otisky mostů, které úrovní prošly: zkouška do zlomu se do výzvy počítá jen jim. */
export const KLIC_PROSLYCH = "mostmistr.prosle";
/** Oznámení, které má hráč po načtení staršího postupu jednou vidět v přehledu kampaně. */
export const KLIC_OZNAMENI = "mostmistr.oznameni";
/** Oznámení o nových pravidlech medailí a přeladěných úrovních (M12). */
export const OZNAMENI_M12 = "m12";
/** Výzvy z odkazů: kód mostu, který má hráč v úrovni překonat cenou (viz `src/data/sdileni.ts`). */
export const KLIC_VYZEV_ODKAZU = "mostmistr.vyzvy-odkazu";
/** Galerie: nejlepší most hráče v každé úrovni (viz `src/data/galerie.ts`); z ní je závěrečný list. */
export const KLIC_GALERIE = "mostmistr.galerie";
/** Kolik posledních prošlých mostů si hra na úroveň pamatuje. */
const NEJVIC_PROSLYCH = 8;
/** Nastavení sandboxu: údolí, trasa a provoz. */
export const KLIC_SANDBOXU = "mostmistr.sandbox";
export const KLIC_SANDBOX_NAVSTIVEN = "mostmistr.sandbox.navstiven";
/** Dílna: pojmenované práce z pískoviště (údolí s provozem a most). */
export const KLIC_DILNY = "mostmistr.dilna";
/** Žebříčky: náhodné číslo hráče (podle něj server pozná jeho starší zápis) a přezdívka. */
export const KLIC_ZEBRICKU = "mostmistr.zebricek";
/** Havarijní komise: které případy hráč uzavřel a kolika změnami. */
export const KLIC_HAVARII = "mostmistr.havarie";

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
  /**
   * Text postupu, jak ho tahle stránka naposledy četla nebo zapsala. Když je v paměti prohlížeče
   * jiný, zapsala ho mezitím jiná záložka a postup se před čtením i zápisem načte znovu.
   */
  #znamyZapis: string | null = null;
  /** Uložený postup nešel přečíst; hra začala s prázdným a původní text odložila stranou. */
  readonly poskozeno: boolean;

  constructor(sklad: Sklad | null) {
    this.#sklad = sklad;
    let ulozeni = prazdneUlozeni();
    let poskozeno = false;
    const zapis = this.#cti(KLIC_ULOZENI);
    if (zapis !== null) {
      try {
        const zahozene: string[] = [];
        ulozeni = ulozeniZTextu(zapis, zahozene);
        // Most, který nešel přečíst, hra zahodila a jede dál; původní zápis zůstane stranou
        // pro případ, že by ho někdo chtěl zachránit ručně.
        if (zahozene.length > 0) {
          this.#pis(KLIC_POSKOZENEHO, zapis);
          this.#pis(KLIC_ULOZENI, ulozeniNaText(ulozeni));
        }
        const puvodni = verzeZapisuUlozeni(zapis);
        if (puvodni !== null && puvodni < ulozeni.verze) {
          // Starší formát se hned zapíše v novém: převod by jinak proběhl při každém načtení
          // a s ním i úklid, který k němu patří.
          this.#pis(KLIC_ULOZENI, ulozeniNaText(ulozeni));
          if (puvodni < VERZE_ULOZENI_M12) {
            // Mosty, které prošly před M12, prošly jinou úrovní: zkouška do zlomu chce nový průchod.
            this.#pis(KLIC_PROSLYCH, "{}");
            if (Object.keys(ulozeni.rekordy).length > 0) this.#pis(KLIC_OZNAMENI, OZNAMENI_M12);
          }
        }
      } catch {
        poskozeno = true;
        this.#pis(KLIC_POSKOZENEHO, zapis);
      }
    }
    this.#ulozeni = ulozeni;
    this.poskozeno = poskozeno;
    this.#znamyZapis = this.#cti(KLIC_ULOZENI);
  }

  /**
   * Srovná postup s pamětí prohlížeče. Hra otevřená ve dvou záložkách (odkaz na cizí most se
   * typicky otevře vedle rozehrané hry) má v každé vlastní snímek postupu; bez srovnání by
   * zápis z jedné vrátil druhé starý most i medaile. Zápis, který nejde přečíst nebo je
   * z novější hry, se nebere: stránka pokračuje se svým.
   */
  #srovnej(): void {
    const zapis = this.#cti(KLIC_ULOZENI);
    if (zapis === null || zapis === this.#znamyZapis) return;
    this.#znamyZapis = zapis;
    try {
      this.#ulozeni = ulozeniZTextu(zapis);
    } catch {
      // Nečitelný zápis cizí záložky: zůstává postup téhle stránky.
    }
  }

  /**
   * Oznámení, které na hráče čeká (zatím jen `OZNAMENI_M12`), a jeho odložení: přehled ho
   * ukáže jednou a pak už ne.
   */
  get oznameni(): string | null {
    const zapis = this.#cti(KLIC_OZNAMENI);
    return zapis === null || zapis === "" ? null : zapis;
  }

  odlozOznameni(): void {
    if (this.oznameni !== null) this.#pis(KLIC_OZNAMENI, "");
  }

  /** Pamatuje si úložiště postup i po zavření stránky? */
  get trvale(): boolean {
    return this.#sklad !== null;
  }

  get ulozeni(): Ulozeni {
    this.#srovnej();
    return this.#ulozeni;
  }

  navrh(idUrovne: string): NavrhMostu | undefined {
    this.#srovnej();
    return this.#ulozeni.navrhy[idUrovne];
  }

  rekord(idUrovne: string): Rekord | undefined {
    this.#srovnej();
    return this.#ulozeni.rekordy[idUrovne];
  }

  /** Uloží rozpracovaný most úrovně, ke které patří. */
  ulozNavrh(navrh: NavrhMostu): void {
    this.#srovnej();
    this.#ulozeni = { ...this.#ulozeni, navrhy: { ...this.#ulozeni.navrhy, [navrh.uroven]: navrh } };
    this.#zapis();
  }

  /** Započítá výsledek zkoušky do rekordu úrovně a vrátí nový rekord. */
  zapocitej(idUrovne: string, medaile: Medaile, cena: number, verzeFyziky: number, hmotnost?: number, celistvy = true): Rekord {
    this.#srovnej();
    const rekord = vylepsiRekord(this.#ulozeni.rekordy[idUrovne], medaile, cena, verzeFyziky, hmotnost, celistvy);
    this.#ulozeni = { ...this.#ulozeni, rekordy: { ...this.#ulozeni.rekordy, [idUrovne]: rekord } };
    this.#zapis();
    return rekord;
  }

  /** Započítá výsledek zkoušky do zlomu (únosnost na korunu, N/Kč) a vrátí nový rekord. */
  zapocitejZlom(idUrovne: string, unosnostNaKorunu: number, verzeFyziky: number): Rekord {
    this.#srovnej();
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

  /** Zpomalit a přiblížit první porušení při zkoušce? Dokud hráč nezvolí jinak, ano. */
  get zpomaleniPadu(): boolean {
    return this.#cti(KLIC_ZABERU) !== "0";
  }

  set zpomaleniPadu(zapnuto: boolean) {
    this.#pis(KLIC_ZABERU, zapnuto ? "1" : "0");
  }

  /** Zrychlit při přehrávání zkoušky čekání, kdy se na mostě nic neděje? Dokud hráč nezvolí jinak, ano. */
  get zrychleniCekani(): boolean {
    return this.#cti(KLIC_CEKANI) !== "0";
  }

  set zrychleniCekani(zapnuto: boolean) {
    this.#pis(KLIC_CEKANI, zapnuto ? "1" : "0");
  }

  /** Kreslit pohyb celého mostu při zkoušce zvětšeně? Dokud hráč nezvolí jinak, ano. */
  get zvetseniPohybu(): boolean {
    return this.#cti(KLIC_ZVETSENI) !== "0";
  }

  set zvetseniPohybu(zapnuto: boolean) {
    this.#pis(KLIC_ZVETSENI, zapnuto ? "1" : "0");
  }

  /**
   * Prošel most s otiskem `otisk` úrovní `uroven`? Pamatuje se i přes zavření hry: kdo se
   * k mostu vrátí, nemusí běžnou zkoušku opakovat, aby se mu počítala zkouška do zlomu.
   */
  prosel(uroven: string, otisk: string): boolean {
    return this.#prosle()[uroven]?.includes(otisk) === true;
  }

  /** Zapamatuje si, že most s otiskem `otisk` úrovní prošel; drží jen několik posledních. */
  zapisProsly(uroven: string, otisk: string): void {
    const vse = this.#prosle();
    const seznam = (vse[uroven] ?? []).filter((o) => o !== otisk);
    seznam.push(otisk);
    vse[uroven] = seznam.slice(-NEJVIC_PROSLYCH);
    this.#pis(KLIC_PROSLYCH, JSON.stringify(vse));
  }

  #prosle(): Record<string, string[]> {
    const zapis = this.#cti(KLIC_PROSLYCH);
    if (zapis === null) return {};
    try {
      const data: unknown = JSON.parse(zapis);
      if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
      const vysledek: Record<string, string[]> = {};
      for (const [uroven, seznam] of Object.entries(data)) {
        if (Array.isArray(seznam)) vysledek[uroven] = seznam.filter((o): o is string => typeof o === "string");
      }
      return vysledek;
    } catch {
      return {};
    }
  }

  /**
   * Výzva z odkazu pro úroveň: kód mostu, který má hráč překonat cenou, nebo null. Pamatuje se
   * přes zavření hry, dokud ji hráč nezruší nebo nepřijme jinou.
   */
  vyzvaOdkazu(uroven: string): string | null {
    return this.#vyzvyOdkazu()[uroven] ?? null;
  }

  nastavVyzvuOdkazu(uroven: string, kod: string | null): void {
    const vse = this.#vyzvyOdkazu();
    if (kod === null) delete vse[uroven];
    else vse[uroven] = kod;
    this.#pis(KLIC_VYZEV_ODKAZU, JSON.stringify(vse));
  }

  #vyzvyOdkazu(): Record<string, string> {
    const zapis = this.#cti(KLIC_VYZEV_ODKAZU);
    if (zapis === null) return {};
    try {
      const data: unknown = JSON.parse(zapis);
      if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
      const vysledek: Record<string, string> = {};
      for (const [uroven, kod] of Object.entries(data)) {
        if (typeof kod === "string" && kod.length <= NEJDELSI_KOD_MOSTU) vysledek[uroven] = kod;
      }
      return vysledek;
    } catch {
      return {};
    }
  }

  /** Galerie mostů hráče: nejlepší most, který každou úrovní prošel. */
  get galerie(): Galerie {
    return galerieZTextu(this.#cti(KLIC_GALERIE));
  }

  /**
   * Nabídne galerii most, který úrovní právě prošel. Zapíše ho, jen když je lepší než ten,
   * který tam úroveň má (`lepsiMost`), a vrátí, jestli se to stalo.
   */
  zapisDoGalerie(uroven: string, most: MostGalerie): boolean {
    const galerie = this.galerie;
    if (!lepsiMost(galerie[uroven], most)) return false;
    galerie[uroven] = most;
    this.#pis(KLIC_GALERIE, galerieNaText(galerie));
    return true;
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

  /**
   * Dílna: uložené práce z pískoviště. Čte se pokaždé z paměti prohlížeče (druhá záložka do ní
   * mohla mezitím zapsat); nečitelný zápis je prázdná dílna.
   */
  get dilna(): Dilna {
    return dilnaZTextu(this.#cti(KLIC_DILNY));
  }

  set dilna(dilna: Dilna) {
    this.#pis(KLIC_DILNY, dilnaNaText(dilna));
  }

  /**
   * Kdo hráč v žebříčcích je: číslo a přezdívka. Null, dokud se do žebříčku nezapsal. Nečitelný
   * zápis je „ještě se nezapsal“: dostane nové číslo a jeho starší řádky zůstanou cizí.
   */
  get zebricek(): { hrac: string; jmeno: string } | null {
    const zapis = this.#cti(KLIC_ZEBRICKU);
    if (zapis === null) return null;
    try {
      const data = JSON.parse(zapis) as { hrac?: unknown; jmeno?: unknown };
      const jmeno = upravPrezdivku(data.jmeno);
      return jeIdHraceZebricku(data.hrac) && jmeno !== null ? { hrac: data.hrac, jmeno } : null;
    } catch {
      return null;
    }
  }

  /** Zapamatuje přezdívku; číslo hráče vznikne při prvním zápisu a pak už se nemění. */
  nastavPrezdivku(jmeno: string): { hrac: string; jmeno: string } {
    const dosud = this.zebricek;
    const hrac = dosud?.hrac ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    const identita = { hrac, jmeno };
    this.#pis(KLIC_ZEBRICKU, JSON.stringify(identita));
    return identita;
  }

  /** Postup v Havarijní komisi: id případu → nejmenší počet změn, kterým ho hráč uzavřel. */
  get havarie(): PostupHavarii {
    return postupHavariiZTextu(this.#cti(KLIC_HAVARII));
  }

  /** Zapíše uzavření případu; lepší dřívější výsledek zůstane. */
  zapisHavarii(id: string, zmen: number): void {
    const postup = this.havarie;
    const novy = zapisUzavreni(postup, id, zmen);
    if (novy !== postup) this.#pis(KLIC_HAVARII, JSON.stringify(novy));
  }

  /** Smaže rozpracovaný most úrovně (sandbox po změně údolí). */
  smazNavrh(idUrovne: string): void {
    this.#srovnej();
    if (!(idUrovne in this.#ulozeni.navrhy)) return;
    const navrhy = { ...this.#ulozeni.navrhy };
    delete navrhy[idUrovne];
    this.#ulozeni = { ...this.#ulozeni, navrhy };
    this.#zapis();
  }

  #zapis(): void {
    const zapis = ulozeniNaText(this.#ulozeni);
    this.#pis(KLIC_ULOZENI, zapis);
    // Co se opravdu zapsalo (plná paměť nezapíše nic): podle toho se pozná zápis cizí záložky.
    this.#znamyZapis = this.#cti(KLIC_ULOZENI) ?? zapis;
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
