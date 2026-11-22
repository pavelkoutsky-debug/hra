// Deník hraní na straně hry: sbírá události, skládá je do dávek a posílá na server.
// Neví nic o stránce ani o síti; paměť prohlížeče, hodiny, náhodu a odesílání dostává
// zvenčí, takže jde celý vyzkoušet v Node. Napojení na prohlížeč je v `prohlizec.ts`.
//
// Hráč může záznam vypnout. Pak se nic neposílá a do fronty k odeslání se nic neukládá;
// v paměti stránky zůstává jen krátký seznam posledních událostí, který se přiloží ke
// zpětné vazbě, pokud si to hráč sám zaškrtne. Volba se čte z paměti prohlížeče znovu před
// každým odesláním, takže platí i tehdy, když ji hráč změnil v jiném panelu.

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

/**
 * Jak dopadlo odeslání: server dávku přijal; odmítl ji natrvalo (špatný tvar, moc velká:
 * zkoušet znovu nemá smysl); nebo je nedostupný a má se to zkusit později.
 */
export type VysledekOdeslani = "prijato" | "odmitnuto" | "nedostupne";

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
   * Odešle text na adresu. `naOdchodu` znamená, že se stránka zavírá a na odpověď se nedá
   * čekat; pak stačí, že prohlížeč žádost převzal.
   */
  posli: (adresa: string, telo: string, naOdchodu: boolean) => Promise<VysledekOdeslani>;
  hra: string;
  sestaveni: string;
  jazyk: string;
  okno: [number, number];
  dotyk: boolean;
}

export const ADRESA_DENIKU = "/api/denik";
export const ADRESA_VAZBY = "/api/vazba";

const KLIC_HRACE = "mostmistr.hrac";
export const KLIC_ZAZNAMU = "mostmistr.denik";
const KLIC_UPOZORNENI = "mostmistr.denik.upozorneno";
const KLIC_SEZENI = "mostmistr.sezeni";
const KLIC_PORADI = "mostmistr.sezeni.poradi";
const KLIC_ZACATKU = "mostmistr.sezeni.zacatek";

/** Kolik událostí ve frontě spustí odeslání a jak dlouho smí nejstarší čekat, ms. */
export const UDALOSTI_NA_DAVKU = 40;
export const NEJDELSI_CEKANI = 20_000;
/** Nejvíc událostí ve frontě; když server neodpovídá, nejstarší se zahazují. */
const NEJDELSI_FRONTA = 400;
/** Po tolika nepovedených odesláních za sebou si deník dá přestávku. */
const NEJVIC_NEZDARU = 3;
/** Jak dlouho po opakovaném nezdaru deník server nezkouší, ms. Hraní tím netrpí. */
export const PRESTAVKA_PO_NEZDARECH = 5 * 60_000;
/** Největší dávka v znacích zápisu; větší se rozdělí. */
const NEJVETSI_DAVKA = 60_000;

const ID = /^[0-9a-f]{8,32}$/;

export class Denik {
  readonly #p: ProstrediDeniku;
  /** Kam se ukládá číslo hráče, vypínač a potvrzení upozornění: trvalá paměť, jinak paměť panelu. */
  readonly #volby: PametDeniku | null;
  readonly #hrac: string;
  readonly #sezeni: string;
  readonly #zacatek: number;
  /** Hráč tu byl už dřív (měl uložené své číslo). */
  readonly navrat: boolean;
  #zapnuto: boolean;
  #upozorneno = false;
  #fronta: UdalostDeniku[] = [];
  #posledni: UdalostDeniku[] = [];
  #poradi: number;
  #nezdaru = 0;
  /** Do kdy se po opakovaném nezdaru nic neposílá; čas v ms. */
  #prestavkaDo = 0;
  /** Čas zápisu nejstarší události ve frontě; null, když je fronta prázdná. */
  #cekaOd: number | null = null;
  /**
   * Dávka, na kterou server neodpověděl: příště odejde znovu beze změny a pod stejným číslem.
   * Server ji totiž uložit mohl (ztratila se jen odpověď) a souhrn tak pozná, že ji má dvakrát.
   */
  #nedorucena: { poradi: number; udalosti: UdalostDeniku[] } | null = null;
  /** Právě se odesílá a čeká na odpověď serveru; další odeslání počká, až tohle doběhne. */
  #odesilaSe = false;
  #odeslatZnovu = false;
  /** Kolik dávek deník v této stránce úspěšně odeslal. */
  odeslano = 0;

  constructor(p: ProstrediDeniku) {
    this.#p = p;
    this.#volby = p.trvala ?? p.sezeni;
    const ulozeny = this.#cti(this.#volby, KLIC_HRACE);
    this.navrat = ulozeny !== null && ID.test(ulozeny);
    this.#hrac = this.navrat ? ulozeny! : p.nahoda();
    if (!this.navrat) this.#pis(this.#volby, KLIC_HRACE, this.#hrac);
    // Bez paměti prohlížeče by si hra nepamatovala ani to, že hráč záznam vypnul, a s každou
    // stránkou by ho zapnula znovu. Takovému hráči se proto deník nevede vůbec.
    this.#zapnuto = this.#volby !== null && this.#cti(this.#volby, KLIC_ZAZNAMU) !== "0";

    const sezeni = this.#cti(p.sezeni, KLIC_SEZENI);
    const zacatek = Number(this.#cti(p.sezeni, KLIC_ZACATKU));
    const pokracuje = sezeni !== null && ID.test(sezeni) && Number.isFinite(zacatek) && zacatek > 0;
    this.#sezeni = pokracuje ? sezeni : p.nahoda();
    this.#zacatek = pokracuje ? zacatek : p.ted();
    this.#poradi = pokracuje ? this.#ulozenePoradi() : 0;
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
    if (this.#volby === null) return;
    if (zapnuto === this.#zapnuto) return;
    this.#zapnuto = zapnuto;
    this.#pis(this.#volby, KLIC_ZAZNAMU, zapnuto ? "1" : "0");
    if (zapnuto) {
      this.zapis("denik.zapnut");
      return;
    }
    // Co čekalo ve frontě, se zahodí. Odejde jen zpráva o vypnutí samotná, ať je vidět,
    // kolik hráčů záznam vypíná; pak už nic.
    this.#fronta = [];
    this.#nedorucena = null;
    this.#cekaOd = null;
    const vypnuti: UdalostDeniku = { t: this.#cas(), druh: "denik.vypnut" };
    this.#zapamatuj(vypnuti);
    void this.#odesliDavku([vypnuti], false);
  }

  /**
   * Přečte vypínač znovu z paměti prohlížeče (hráč ho mohl přepnout v jiném panelu).
   * Vrací, zda je záznam zapnutý.
   */
  nactiVolbu(): boolean {
    if (this.#volby === null) return false;
    const zapnuto = this.#cti(this.#volby, KLIC_ZAZNAMU) !== "0";
    if (!zapnuto && this.#zapnuto) {
      this.#fronta = [];
      this.#nedorucena = null;
      this.#cekaOd = null;
    }
    this.#zapnuto = zapnuto;
    return zapnuto;
  }

  /** Jde záznam vůbec vést? Bez paměti prohlížeče ne (hra by si nepamatovala vypnutí). */
  get lzeZapnout(): boolean {
    return this.#volby !== null;
  }

  /** Viděl už hráč upozornění, že hra deník vede? */
  get upozorneno(): boolean {
    return this.#upozorneno || this.#cti(this.#volby, KLIC_UPOZORNENI) === "1";
  }

  potvrdUpozorneni(): void {
    this.#upozorneno = true;
    this.#pis(this.#volby, KLIC_UPOZORNENI, "1");
  }

  /** Server neodpovídá a deník si dává přestávku (místní spuštění bez serveru, výpadek). */
  get vzdano(): boolean {
    return this.#p.ted() < this.#prestavkaDo;
  }

  get hlavicka(): HlavickaDeniku {
    const p = this.#p;
    return {
      verze: VERZE_DENIKU,
      hrac: this.#hrac,
      sezeni: this.#sezeni,
      zacatek: this.#zacatek,
      hra: p.hra,
      sestaveni: p.sestaveni,
      jazyk: p.jazyk.slice(0, 20),
      okno: p.okno,
      dotyk: p.dotyk,
    };
  }

  /** Zapíše událost. `uroven` je id úrovně, ve které se stala. */
  zapis(druh: string, data?: { [klic: string]: HodnotaDeniku }, uroven?: string): void {
    const ted = this.#p.ted();
    const udalost: UdalostDeniku = { t: this.#cas(), druh };
    if (uroven !== undefined) udalost.uroven = uroven;
    if (data !== undefined) udalost.data = data;
    this.#zapamatuj(udalost);
    if (!this.#zapnuto) return;
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
    // Dávky jedné stránky jdou na server po jedné: dvě žádosti naráz by se mohly předběhnout
    // a souhrn by pak četl události v jiném pořadí, než se staly. Odchod ze stránky čekat nemůže.
    if (this.#odesilaSe && !naOdchodu) {
      this.#odeslatZnovu = true;
      return;
    }
    if (!this.nactiVolbu() || this.vzdano || (this.#fronta.length === 0 && this.#nedorucena === null)) return;
    const davky: { poradi?: number; udalosti: UdalostDeniku[] }[] = this.#rozdel(this.#fronta).map((udalosti) => ({ udalosti }));
    if (this.#nedorucena) davky.unshift(this.#nedorucena);
    this.#fronta = [];
    this.#nedorucena = null;
    this.#cekaOd = null;
    if (!naOdchodu) {
      this.#odesilaSe = true;
      this.#odeslatZnovu = false;
    }
    let doslo = true;
    try {
      for (let i = 0; i < davky.length && doslo; i++) {
        // Hráč mohl záznam vypnout, zatímco se čekalo na odpověď: zbytek už neodejde.
        if (!this.#zapnuto) return;
        const davka = davky[i]!;
        const { vysledek, poradi } = await this.#odesliDavku(davka.udalosti, naOdchodu, davka.poradi);
        if (vysledek !== "nedostupne") continue;
        doslo = false;
        // Server neodpověděl. Tahle dávka počká a odejde znovu tak, jak je; co se ještě
        // neposílalo, se vrátí do fronty.
        if (this.#zapnuto) {
          this.#nedorucena = { poradi, udalosti: davka.udalosti };
          const zbytek = davky.slice(i + 1).flatMap((d) => d.udalosti);
          this.#fronta = [...zbytek, ...this.#fronta].slice(-NEJDELSI_FRONTA);
          this.#cekaOd ??= this.#p.ted();
        }
      }
    } finally {
      if (!naOdchodu) this.#odesilaSe = false;
    }
    // Mezitím přibylo, co mělo odejít hned (výsledek zkoušky, plná fronta).
    if (this.#odeslatZnovu && !naOdchodu) {
      this.#odeslatZnovu = false;
      if (doslo && this.#fronta.length > 0) await this.odesli();
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
      const data: { [klic: string]: HodnotaDeniku } = { druh: vazba.druh };
      if (vazba.hodnoceni !== undefined) data.hodnoceni = vazba.hodnoceni;
      this.zapis("vazba.odeslana", data, vazba.uroven);
    }
    return odpoved ? odpoved.id : null;
  }

  /** Čas události: milisekundy od začátku sezení. */
  #cas(): number {
    return Math.max(0, Math.round(this.#p.ted() - this.#zacatek));
  }

  #zapamatuj(udalost: UdalostDeniku): void {
    this.#posledni.push(udalost);
    if (this.#posledni.length > NEJVIC_UDALOSTI_U_VAZBY) this.#posledni.shift();
  }

  /** Pořadí další dávky uložené v paměti panelu (zapisují ho všechny stránky téhož sezení). */
  #ulozenePoradi(): number {
    return Math.max(0, Math.floor(Number(this.#cti(this.#p.sezeni, KLIC_PORADI)) || 0));
  }

  /**
   * Odešle jednu dávku a zaznamená, jak to dopadlo. `opakovane` je číslo dávky, která se
   * posílá znovu; nová dávka dostane číslo další v řadě. Vrací i číslo, pod kterým šla.
   */
  async #odesliDavku(
    udalosti: UdalostDeniku[],
    naOdchodu: boolean,
    opakovane?: number,
  ): Promise<{ vysledek: VysledekOdeslani; poradi: number }> {
    // Číslo dávky je větší z toho, co si pamatuje stránka a co je v paměti panelu: jiná
    // stránka téhož sezení (návrat tlačítkem Zpět) mezitím mohla čísla spotřebovat.
    const poradi = opakovane ?? Math.max(this.#poradi, this.#ulozenePoradi());
    if (poradi >= NEJVIC_DAVEK_SEZENI) return { vysledek: "odmitnuto", poradi };
    if (opakovane === undefined) {
      this.#poradi = poradi + 1;
      this.#pis(this.#p.sezeni, KLIC_PORADI, String(this.#poradi));
    }
    const davka: DavkaDeniku = { hlavicka: this.hlavicka, poradi, udalosti };
    let vysledek: VysledekOdeslani;
    try {
      vysledek = await this.#p.posli(ADRESA_DENIKU, JSON.stringify(davka), naOdchodu);
    } catch {
      vysledek = "nedostupne";
    }
    if (vysledek === "prijato") {
      this.odeslano += 1;
      this.#nezdaru = 0;
    } else if (vysledek === "nedostupne") {
      this.#nezdaru += 1;
      if (this.#nezdaru >= NEJVIC_NEZDARU) {
        this.#nezdaru = 0;
        this.#prestavkaDo = this.#p.ted() + PRESTAVKA_PO_NEZDARECH;
      }
    }
    return { vysledek, poradi };
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
