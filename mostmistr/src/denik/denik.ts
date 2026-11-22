// Deník hraní na straně hry: sbírá události, skládá je do dávek a posílá na server.
// Neví nic o stránce ani o síti; paměť prohlížeče, hodiny, náhodu a odesílání dostává
// zvenčí, takže jde celý vyzkoušet v Node. Napojení na prohlížeč je v `prohlizec.ts`.
//
// Hráč může záznam vypnout. Pak se nic neposílá a do fronty k odeslání se nic neukládá;
// v paměti stránky zůstává jen krátký seznam posledních událostí, který se přiloží ke
// zpětné vazbě, pokud si to hráč sám zaškrtne.

import {
  NEJVIC_DAVEK_SEZENI,
  NEJVIC_UDALOSTI_U_VAZBY,
  VERZE_DENIKU,
  type DavkaDeniku,
  type HlavickaDeniku,
  type HodnotaDeniku,
  type UdalostDeniku,
  type ZpetnaVazba,
} from "./udalosti";

/** Část rozhraní `Storage`, kterou deník potřebuje. */
export interface PametDeniku {
  getItem(klic: string): string | null;
  setItem(klic: string, hodnota: string): void;
}

export interface ProstrediDeniku {
  /** Paměť, která přežije zavření prohlížeče (číslo hráče, vypínač); null, když ji prohlížeč nedá. */
  trvala: PametDeniku | null;
  /** Paměť jednoho panelu prohlížeče (číslo sezení, pořadí dávek). */
  sezeni: PametDeniku | null;
  /** Aktuální čas v milisekundách. */
  ted: () => number;
  /** Náhodné šestnáctkové číslo o šestnácti znacích. */
  nahoda: () => string;
  /**
   * Odešle text na adresu; vrací, zda ho server přijal. `naOdchodu` znamená, že se stránka
   * zavírá a na odpověď se nedá čekat.
   */
  posli: (adresa: string, telo: string, naOdchodu: boolean) => Promise<boolean>;
  hra: string;
  sestaveni: string;
  jazyk: string;
  okno: [number, number];
  dotyk: boolean;
}

export const ADRESA_DENIKU = "/api/denik";
export const ADRESA_VAZBY = "/api/vazba";

const KLIC_HRACE = "mostmistr.hrac";
const KLIC_ZAZNAMU = "mostmistr.denik";
const KLIC_UPOZORNENI = "mostmistr.denik.upozorneno";
const KLIC_SEZENI = "mostmistr.sezeni";
const KLIC_PORADI = "mostmistr.sezeni.poradi";
const KLIC_ZACATKU = "mostmistr.sezeni.zacatek";
const KLIC_POTIZI = "mostmistr.sezeni.potize";

/** Kolik událostí ve frontě spustí odeslání a jak dlouho smí nejstarší čekat, ms. */
export const UDALOSTI_NA_DAVKU = 40;
export const NEJDELSI_CEKANI = 20_000;
/** Nejvíc událostí ve frontě; když server neodpovídá, nejstarší se zahazují. */
const NEJDELSI_FRONTA = 400;
/** Po tolika nepovedených odesláních za sebou to deník do konce sezení vzdá. */
const NEJVIC_NEZDARU = 3;
/** Největší dávka v znacích zápisu; větší se rozdělí. */
const NEJVETSI_DAVKA = 60_000;

const ID = /^[0-9a-f]{8,32}$/;

export class Denik {
  readonly #p: ProstrediDeniku;
  readonly #hrac: string;
  readonly #sezeni: string;
  readonly #zacatek: number;
  /** Hráč tu byl už dřív (měl uložené své číslo). */
  readonly navrat: boolean;
  #zapnuto: boolean;
  #fronta: UdalostDeniku[] = [];
  #posledni: UdalostDeniku[] = [];
  #poradi: number;
  #nezdaru: number;
  /** Čas zápisu nejstarší události ve frontě; null, když je fronta prázdná. */
  #cekaOd: number | null = null;
  /** Kolik dávek deník v této stránce úspěšně odeslal. */
  odeslano = 0;

  constructor(p: ProstrediDeniku) {
    this.#p = p;
    const ulozeny = this.#cti(p.trvala, KLIC_HRACE);
    this.navrat = ulozeny !== null && ID.test(ulozeny);
    this.#hrac = this.navrat ? ulozeny! : p.nahoda();
    if (!this.navrat) this.#pis(p.trvala, KLIC_HRACE, this.#hrac);
    this.#zapnuto = this.#cti(p.trvala, KLIC_ZAZNAMU) !== "0";

    const sezeni = this.#cti(p.sezeni, KLIC_SEZENI);
    const zacatek = Number(this.#cti(p.sezeni, KLIC_ZACATKU));
    const pokracuje = sezeni !== null && ID.test(sezeni) && Number.isFinite(zacatek) && zacatek > 0;
    this.#sezeni = pokracuje ? sezeni : p.nahoda();
    this.#zacatek = pokracuje ? zacatek : p.ted();
    this.#poradi = pokracuje ? Math.max(0, Math.floor(Number(this.#cti(p.sezeni, KLIC_PORADI)) || 0)) : 0;
    this.#nezdaru = pokracuje ? Math.max(0, Math.floor(Number(this.#cti(p.sezeni, KLIC_POTIZI)) || 0)) : 0;
    if (!pokracuje) {
      this.#pis(p.sezeni, KLIC_SEZENI, this.#sezeni);
      this.#pis(p.sezeni, KLIC_ZACATKU, String(this.#zacatek));
      this.#pis(p.sezeni, KLIC_PORADI, "0");
      this.zapis("sezeni.start", { navrat: this.navrat });
    }
  }

  /** Posílá se deník na server? Dokud hráč nezvolí jinak, ano. */
  get zapnuto(): boolean {
    return this.#zapnuto;
  }

  set zapnuto(zapnuto: boolean) {
    if (zapnuto === this.#zapnuto) return;
    // Vypnutí se ještě zapíše a odešle (ať je vidět, kolik hráčů záznam vypíná), pak už nic.
    if (!zapnuto) {
      this.zapis("denik.vypnut");
      void this.odesli();
    }
    this.#zapnuto = zapnuto;
    this.#pis(this.#p.trvala, KLIC_ZAZNAMU, zapnuto ? "1" : "0");
    if (zapnuto) this.zapis("denik.zapnut");
    else {
      this.#fronta = [];
      this.#cekaOd = null;
    }
  }

  /** Viděl už hráč upozornění, že hra deník vede? */
  get upozorneno(): boolean {
    return this.#cti(this.#p.trvala, KLIC_UPOZORNENI) === "1";
  }

  potvrdUpozorneni(): void {
    this.#pis(this.#p.trvala, KLIC_UPOZORNENI, "1");
  }

  /** Server neodpovídá a deník to do konce sezení vzdal (místní spuštění bez serveru, výpadek). */
  get vzdano(): boolean {
    return this.#nezdaru >= NEJVIC_NEZDARU;
  }

  get hlavicka(): HlavickaDeniku {
    const p = this.#p;
    return {
      verze: VERZE_DENIKU,
      hrac: this.#hrac,
      sezeni: this.#sezeni,
      hra: p.hra,
      sestaveni: p.sestaveni,
      jazyk: p.jazyk,
      okno: p.okno,
      dotyk: p.dotyk,
    };
  }

  /** Zapíše událost. `uroven` je id úrovně, ve které se stala. */
  zapis(druh: string, data?: { [klic: string]: HodnotaDeniku }, uroven?: string): void {
    const ted = this.#p.ted();
    const udalost: UdalostDeniku = { t: Math.max(0, Math.round(ted - this.#zacatek)), druh };
    if (uroven !== undefined) udalost.uroven = uroven;
    if (data !== undefined) udalost.data = data;
    this.#posledni.push(udalost);
    if (this.#posledni.length > NEJVIC_UDALOSTI_U_VAZBY) this.#posledni.shift();
    if (!this.#zapnuto || this.vzdano) return;
    this.#fronta.push(udalost);
    if (this.#fronta.length > NEJDELSI_FRONTA) this.#fronta.shift();
    this.#cekaOd ??= ted;
    if (this.#fronta.length >= UDALOSTI_NA_DAVKU) void this.odesli();
  }

  /** Volá se pravidelně: odešle frontu, když v ní nejstarší událost čeká dost dlouho. */
  tik(): void {
    if (this.#cekaOd !== null && this.#p.ted() - this.#cekaOd >= NEJDELSI_CEKANI) void this.odesli();
  }

  /** Posledních nejvýš `pocet` událostí, i když je záznam vypnutý; k přiložení ke zpětné vazbě. */
  posledni(pocet = NEJVIC_UDALOSTI_U_VAZBY): UdalostDeniku[] {
    return this.#posledni.slice(-pocet);
  }

  /** Odešle všechno, co čeká. Při zavírání stránky (`naOdchodu`) nečeká na odpověď. */
  async odesli(naOdchodu = false): Promise<void> {
    if (!this.#zapnuto || this.vzdano || this.#fronta.length === 0) return;
    const udalosti = this.#fronta;
    this.#fronta = [];
    this.#cekaOd = null;
    for (const cast of this.#rozdel(udalosti)) {
      if (this.#poradi >= NEJVIC_DAVEK_SEZENI) return;
      // Číslo dávky se zabere hned, takže souběžné odeslání při zavírání stránky dostane další.
      const poradi = this.#poradi++;
      this.#pis(this.#p.sezeni, KLIC_PORADI, String(this.#poradi));
      const davka: DavkaDeniku = { hlavicka: this.hlavicka, poradi, udalosti: cast };
      let prijato = false;
      try {
        prijato = await this.#p.posli(ADRESA_DENIKU, JSON.stringify(davka), naOdchodu);
      } catch {
        prijato = false;
      }
      if (prijato) {
        this.odeslano += 1;
        this.#nezdar(0);
      } else {
        this.#nezdar(this.#nezdaru + 1);
        // Nepřijaté události se vrátí na začátek fronty a zkusí se příště s novým číslem dávky.
        if (!this.vzdano && this.#zapnuto) {
          this.#fronta = [...cast, ...this.#fronta].slice(-NEJDELSI_FRONTA);
          this.#cekaOd ??= this.#p.ted();
        } else this.#fronta = [];
        return;
      }
    }
  }

  /**
   * Odešle zpětnou vazbu hráče. Vrací její číslo, nebo null, když ji server nepřijal.
   * Posílá se i s vypnutým záznamem: je to výslovná zpráva od hráče.
   */
  async posliVazbu(
    vazba: Omit<ZpetnaVazba, "hlavicka">,
    posli: (adresa: string, telo: string) => Promise<{ id: string } | null>,
  ): Promise<string | null> {
    const cela: ZpetnaVazba = { ...vazba, hlavicka: this.hlavicka };
    let odpoved: { id: string } | null = null;
    try {
      odpoved = await posli(ADRESA_VAZBY, JSON.stringify(cela));
    } catch {
      odpoved = null;
    }
    if (odpoved) {
      const data: { [klic: string]: HodnotaDeniku } = { id: odpoved.id, druh: vazba.druh };
      if (vazba.hodnoceni !== undefined) data.hodnoceni = vazba.hodnoceni;
      this.zapis("vazba.odeslana", data, vazba.uroven);
    }
    return odpoved ? odpoved.id : null;
  }

  /** Rozdělí události na dávky, které se vejdou do meze velikosti. */
  #rozdel(udalosti: UdalostDeniku[]): UdalostDeniku[][] {
    const davky: UdalostDeniku[][] = [];
    let davka: UdalostDeniku[] = [];
    let velikost = 0;
    for (const udalost of udalosti) {
      const delka = JSON.stringify(udalost).length;
      if (davka.length > 0 && (velikost + delka > NEJVETSI_DAVKA || davka.length >= 150)) {
        davky.push(davka);
        davka = [];
        velikost = 0;
      }
      davka.push(udalost);
      velikost += delka;
    }
    if (davka.length > 0) davky.push(davka);
    return davky;
  }

  #nezdar(pocet: number): void {
    this.#nezdaru = pocet;
    this.#pis(this.#p.sezeni, KLIC_POTIZI, String(pocet));
  }

  #cti(pamet: PametDeniku | null, klic: string): string | null {
    try {
      return pamet?.getItem(klic) ?? null;
    } catch {
      return null;
    }
  }

  #pis(pamet: PametDeniku | null, klic: string, hodnota: string): void {
    try {
      pamet?.setItem(klic, hodnota);
    } catch {
      // Plná nebo zakázaná paměť: deník běží dál, jen si číslo nepamatuje.
    }
  }
}
