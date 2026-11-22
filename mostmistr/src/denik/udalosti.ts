// Deník hraní a zpětná vazba: tvar dat, která hra posílá na server, a jejich kontrola.
// Soubor nezná prohlížeč ani Netlify; používá ho hra při odesílání i server při příjmu,
// takže obě strany rozumějí témuž.
//
// Deník je anonymní: hráče označuje náhodné číslo uložené v jeho prohlížeči. Neposílá se
// jméno, e-mail ani nic, podle čeho by šel člověk poznat; kontakt vyplní hráč jen sám
// a jen ve zpětné vazbě.

import { ChybaDat, cislo, jenZnameKlice, logicka, objekt, pole, text, volitelne } from "../data/kontrola";

export const VERZE_DENIKU = 1;

/** Nejvíc událostí v jedné dávce a nejvíc dávek jednoho sezení; víc server odmítne. */
export const NEJVIC_UDALOSTI_V_DAVCE = 200;
export const NEJVIC_DAVEK_SEZENI = 2000;
/** Největší délka textu zpětné vazby a kontaktu. */
export const NEJDELSI_VAZBA = 4000;
export const NEJDELSI_KONTAKT = 200;
/** Kolik posledních událostí deníku se ke zpětné vazbě nejvýš přikládá. */
export const NEJVIC_UDALOSTI_U_VAZBY = 150;

/** Kdo a v čem hraje; jde s každou dávkou deníku i se zpětnou vazbou. */
export interface HlavickaDeniku {
  verze: typeof VERZE_DENIKU;
  /** Náhodné číslo hráče (šestnáctkově), stejné při každé návštěvě z téhož prohlížeče. */
  hrac: string;
  /** Náhodné číslo jednoho sezení: od otevření hry po zavření panelu prohlížeče. */
  sezeni: string;
  /** Kdy sezení začalo podle hodin hráče (ms od roku 1970); řadí se podle něj sezení za sebou. */
  zacatek: number;
  /** Verze hry a otisk sestavení. */
  hra: string;
  sestaveni: string;
  /** Jazyk prohlížeče, např. „cs-CZ“. */
  jazyk: string;
  /** Šířka a výška okna v pixelech. */
  okno: [number, number];
  /** Zařízení se ovládá hlavně dotykem. */
  dotyk: boolean;
}

/** Hodnota, kterou událost smí nést: jednoduchá data, která projdou zápisem JSON. */
export type HodnotaDeniku = string | number | boolean | null | HodnotaDeniku[] | { [klic: string]: HodnotaDeniku };

/** Jedna věc, která se ve hře stala. */
export interface UdalostDeniku {
  /** Milisekundy od začátku sezení. */
  t: number;
  /** Co se stalo, např. „uroven.otevrena“, „stavba.zmena“, „zkouska.konec“. */
  druh: string;
  /** Úroveň, ve které se to stalo; chybí v přehledu kampaně. */
  uroven?: string;
  /** Podrobnosti; tvar záleží na druhu události. */
  data?: { [klic: string]: HodnotaDeniku };
}

/** Dávka událostí jednoho sezení. Dávky jsou číslované od nuly. */
export interface DavkaDeniku {
  hlavicka: HlavickaDeniku;
  poradi: number;
  udalosti: UdalostDeniku[];
}

export const DRUHY_VAZBY = ["chyba", "napad", "obtiznost", "pochvala", "jine"] as const;
export type DruhVazby = (typeof DRUHY_VAZBY)[number];

/** Zpětná vazba, jak ji hráč odesílá. */
export interface ZpetnaVazba {
  hlavicka: HlavickaDeniku;
  druh: DruhVazby;
  text: string;
  /** Jak hráče hra baví, 1 (vůbec) až 5 (moc); nepovinné. */
  hodnoceni?: number;
  /** Kam odpovědět; vyplňuje jen hráč, který o odpověď stojí. */
  kontakt?: string;
  /** Úroveň, ve které hráč zpětnou vazbu psal. */
  uroven?: string;
  /** Most, který měl hráč na výkresu (zápis návrhu), pokud ho chtěl přiložit. */
  navrh?: string;
  /** Poslední události deníku, pokud je chtěl přiložit. */
  udalosti?: UdalostDeniku[];
}

export const STAVY_VAZBY = ["nova", "resi-se", "vyreseno", "zamitnuto"] as const;
export type StavVazby = (typeof STAVY_VAZBY)[number];

/** Zpětná vazba, jak ji eviduje server. */
export interface EvidovanaVazba extends ZpetnaVazba {
  /** Číslo zpětné vazby: čas přijetí a náhodný dovětek; řadí se podle času. */
  id: string;
  /** Čas přijetí, ISO 8601. */
  prijato: string;
  /** Odkud přišla: „production“, „deploy-preview“ a podobně. */
  prostredi: string;
  stav: StavVazby;
  /** Poznámka správce k řešení. */
  poznamka: string;
  /** Čas poslední změny stavu nebo poznámky, ISO 8601; null, dokud ji nikdo neupravil. */
  upraveno: string | null;
}

/** Nejdelší text a největší číslo v datech události; zápis mostu (`navrh`) smí být delší. */
const NEJDELSI_TEXT_UDALOSTI = 300;
const NEJDELSI_NAVRH_UDALOSTI = 80_000;
const NEJVETSI_CISLO_UDALOSTI = 1e12;

const ID = /^[0-9a-f]{8,32}$/;
const DRUH_UDALOSTI = /^[a-z][a-z0-9]*(\.[a-z0-9-]+){0,3}$/;
const ID_UROVNE = /^[0-9]{1,2}-[0-9]{2}$/;

function kratkyText(h: unknown, cesta: string, nejvic: number): string {
  const hodnota = text(h, cesta);
  if (hodnota.length > nejvic) throw new ChybaDat(cesta, `text je delší než ${nejvic} znaků`);
  return hodnota;
}

function podleVzoru(h: unknown, cesta: string, vzor: RegExp, nejvic: number): string {
  const hodnota = kratkyText(h, cesta, nejvic);
  if (!vzor.test(hodnota)) throw new ChybaDat(cesta, "hodnota nemá očekávaný tvar");
  return hodnota;
}

/** Zkontroluje, že hodnota je jen z jednoduchých dat a není zanořená hlouběji, než je rozumné. */
function hodnotaDeniku(h: unknown, cesta: string, hloubka: number, nejdelsiText = NEJDELSI_TEXT_UDALOSTI): HodnotaDeniku {
  if (h === null || typeof h === "boolean") return h;
  if (typeof h === "string") {
    if (h.length > nejdelsiText) throw new ChybaDat(cesta, `text je delší než ${nejdelsiText} znaků`);
    return h;
  }
  if (typeof h === "number") {
    if (!Number.isFinite(h) || Math.abs(h) > NEJVETSI_CISLO_UDALOSTI) throw new ChybaDat(cesta, "očekáváno konečné číslo rozumné velikosti");
    return h;
  }
  if (hloubka <= 0) throw new ChybaDat(cesta, "data jsou zanořená příliš hluboko");
  if (Array.isArray(h)) return h.map((p, i) => hodnotaDeniku(p, `${cesta}[${i}]`, hloubka - 1));
  if (typeof h === "object") {
    const vysledek: { [klic: string]: HodnotaDeniku } = {};
    for (const [klic, hodnota] of Object.entries(h)) {
      if (klic.length > 40) throw new ChybaDat(cesta, "název údaje je příliš dlouhý");
      // Zápis mostu je jediný dlouhý text, který událost smí nést.
      vysledek[klic] = hodnotaDeniku(hodnota, `${cesta}.${klic}`, hloubka - 1, klic === "navrh" ? NEJDELSI_NAVRH_UDALOSTI : NEJDELSI_TEXT_UDALOSTI);
    }
    return vysledek;
  }
  throw new ChybaDat(cesta, "nepodporovaný druh hodnoty");
}

export function nactiHlavicku(h: unknown, cesta: string): HlavickaDeniku {
  const o = objekt(h, cesta);
  jenZnameKlice(o, cesta, ["verze", "hrac", "sezeni", "zacatek", "hra", "sestaveni", "jazyk", "okno", "dotyk"]);
  if (o.verze !== VERZE_DENIKU) throw new ChybaDat(`${cesta}.verze`, `očekávána verze ${VERZE_DENIKU}`);
  const okno = pole(o.okno, `${cesta}.okno`);
  if (okno.length !== 2) throw new ChybaDat(`${cesta}.okno`, "očekávána šířka a výška");
  return {
    verze: VERZE_DENIKU,
    hrac: podleVzoru(o.hrac, `${cesta}.hrac`, ID, 32),
    sezeni: podleVzoru(o.sezeni, `${cesta}.sezeni`, ID, 32),
    zacatek: cislo(o.zacatek, `${cesta}.zacatek`, { min: 0, max: 1e14, cele: true }),
    hra: kratkyText(o.hra, `${cesta}.hra`, 40),
    sestaveni: kratkyText(o.sestaveni, `${cesta}.sestaveni`, 40),
    // Jazyk prohlížeč uvádět nemusí; prázdný je v pořádku.
    jazyk: typeof o.jazyk === "string" && o.jazyk.length === 0 ? "" : kratkyText(o.jazyk, `${cesta}.jazyk`, 20),
    okno: [
      cislo(okno[0], `${cesta}.okno[0]`, { min: 0, max: 100000, cele: true }),
      cislo(okno[1], `${cesta}.okno[1]`, { min: 0, max: 100000, cele: true }),
    ],
    dotyk: logicka(o.dotyk, `${cesta}.dotyk`),
  };
}

export function nactiUdalost(h: unknown, cesta: string): UdalostDeniku {
  const o = objekt(h, cesta);
  jenZnameKlice(o, cesta, ["t", "druh", "uroven", "data"]);
  const udalost: UdalostDeniku = {
    t: cislo(o.t, `${cesta}.t`, { min: 0, cele: true }),
    druh: podleVzoru(o.druh, `${cesta}.druh`, DRUH_UDALOSTI, 60),
  };
  const uroven = volitelne(o.uroven, (v) => podleVzoru(v, `${cesta}.uroven`, ID_UROVNE, 8));
  if (uroven !== undefined) udalost.uroven = uroven;
  if (o.data !== undefined) {
    objekt(o.data, `${cesta}.data`);
    udalost.data = hodnotaDeniku(o.data, `${cesta}.data`, 6) as { [klic: string]: HodnotaDeniku };
  }
  return udalost;
}

/** Přečte dávku deníku z dat neznámého tvaru; nevyhovující odmítne chybou s cestou. */
export function nactiDavku(data: unknown): DavkaDeniku {
  const c = "davka";
  const o = objekt(data, c);
  jenZnameKlice(o, c, ["hlavicka", "poradi", "udalosti"]);
  const udalosti = pole(o.udalosti, `${c}.udalosti`);
  if (udalosti.length === 0) throw new ChybaDat(`${c}.udalosti`, "dávka je prázdná");
  if (udalosti.length > NEJVIC_UDALOSTI_V_DAVCE) {
    throw new ChybaDat(`${c}.udalosti`, `dávka má víc než ${NEJVIC_UDALOSTI_V_DAVCE} událostí`);
  }
  return {
    hlavicka: nactiHlavicku(o.hlavicka, `${c}.hlavicka`),
    poradi: cislo(o.poradi, `${c}.poradi`, { min: 0, max: NEJVIC_DAVEK_SEZENI - 1, cele: true }),
    udalosti: udalosti.map((u, i) => nactiUdalost(u, `${c}.udalosti[${i}]`)),
  };
}

/** Přečte zpětnou vazbu z dat neznámého tvaru. */
export function nactiVazbu(data: unknown): ZpetnaVazba {
  const c = "vazba";
  const o = objekt(data, c);
  jenZnameKlice(o, c, ["hlavicka", "druh", "text", "hodnoceni", "kontakt", "uroven", "navrh", "udalosti"]);
  const druh = text(o.druh, `${c}.druh`);
  if (!(DRUHY_VAZBY as readonly string[]).includes(druh)) throw new ChybaDat(`${c}.druh`, "neznámý druh zpětné vazby");
  const zprava = kratkyText(o.text, `${c}.text`, NEJDELSI_VAZBA).trim();
  if (zprava.length === 0) throw new ChybaDat(`${c}.text`, "zpětná vazba je prázdná");
  const vazba: ZpetnaVazba = {
    hlavicka: nactiHlavicku(o.hlavicka, `${c}.hlavicka`),
    druh: druh as DruhVazby,
    text: zprava,
  };
  const hodnoceni = volitelne(o.hodnoceni, (v) => cislo(v, `${c}.hodnoceni`, { min: 1, max: 5, cele: true }));
  if (hodnoceni !== undefined) vazba.hodnoceni = hodnoceni;
  const kontakt = volitelne(o.kontakt, (v) => kratkyText(v, `${c}.kontakt`, NEJDELSI_KONTAKT).trim());
  if (kontakt) vazba.kontakt = kontakt;
  const uroven = volitelne(o.uroven, (v) => podleVzoru(v, `${c}.uroven`, ID_UROVNE, 8));
  if (uroven !== undefined) vazba.uroven = uroven;
  const navrh = volitelne(o.navrh, (v) => kratkyText(v, `${c}.navrh`, 200_000));
  if (navrh !== undefined) vazba.navrh = navrh;
  if (o.udalosti !== undefined) {
    const udalosti = pole(o.udalosti, `${c}.udalosti`);
    if (udalosti.length > NEJVIC_UDALOSTI_U_VAZBY) {
      throw new ChybaDat(`${c}.udalosti`, `přiloženo víc než ${NEJVIC_UDALOSTI_U_VAZBY} událostí`);
    }
    vazba.udalosti = udalosti.map((u, i) => nactiUdalost(u, `${c}.udalosti[${i}]`));
  }
  return vazba;
}
