// Proč na trase chybí mostovka: rozbor mezery pro značku při stavbě (bez prohlížeče).
//
// Provoz jde jen po čárkované trase úrovně a nese ho jen mostovka, jejíž oba konce na trase
// leží (`mezeryTras`). Nový hráč to nevidí: nakreslí mostovku po svahu údolí, nebo tahem přes
// kraj břehu, kde editor dřív nedal styčník, a lidé pak „propadnou mostovkou“. Tenhle rozbor
// řekne, kde a proč tam mostovka nenese, ještě než hráč pustí zkoušku.

import type { Bod } from "./geometrie";
import { KATALOG } from "./katalog";
import { mezeryTras, type MezeraTrasy, type NavrhMostu, type PrutNavrhu } from "./navrh";
import { bodNaTrase, TOLERANCE_TRASY, type Trasa, type Uroven } from "./uroven";

/**
 * Co se s mezerou děje:
 * - `presah`: mostovka leží na čáře trasy, ale přejíždí její konec a na kraji břehu nemá
 *   styčník; takový díl provoz nenese (na výkresu přitom vypadá, že na břeh dosáhl),
 * - `mimo-trasu`: nad mezerou leží mostovka, jenže jinde než trasa (po svahu, pod ní),
 * - `breh`: mostovka nedosáhla na břeh (nebo vůbec žádná není),
 * - `uprostred`: kus mostovky chybí mezi dvěma díly.
 */
export type DruhMezery = "presah" | "mimo-trasu" | "breh" | "uprostred";

export interface NalezMezery {
  druh: DruhMezery;
  mezera: MezeraTrasy;
  /** Kam značku na výkresu dát. */
  misto: Bod;
  /** Prut návrhu (id), o kterém značka mluví; null u `breh` a `uprostred`. */
  prut: number | null;
}

/** Patří prut k trase tohoto druhu (kolejiště na kolej, ostatní mostovka jinam)? */
function mostovkaProTrasu(p: PrutNavrhu, trasa: Trasa): boolean {
  return KATALOG[p.prvek].druh === "mostovka" && (p.prvek === "kolejiste") === (trasa.druh === "kolej");
}

/** Poloha bodu vůči trase: kolik metrů podél (od začátku) a napříč. */
function vuciTrase(trasa: Trasa, bod: Bod): { podel: number; napric: number; delka: number } {
  const dx = trasa.konec.x - trasa.zacatek.x;
  const dy = trasa.konec.y - trasa.zacatek.y;
  const delka = Math.sqrt(dx * dx + dy * dy);
  return {
    podel: ((bod.x - trasa.zacatek.x) * dx + (bod.y - trasa.zacatek.y) * dy) / delka,
    napric: ((bod.x - trasa.zacatek.x) * dy - (bod.y - trasa.zacatek.y) * dx) / delka,
    delka,
  };
}

/** Bod trasy nad souřadnicí x. */
function bodTrasy(trasa: Trasa, x: number): Bod {
  const dx = trasa.konec.x - trasa.zacatek.x;
  const y = dx === 0 ? trasa.zacatek.y : trasa.zacatek.y + ((x - trasa.zacatek.x) * (trasa.konec.y - trasa.zacatek.y)) / dx;
  return { x, y };
}

/** O kolik metrů se úsek x prutu překrývá s mezerou. */
function prekryv(a: Bod, b: Bod, mezera: MezeraTrasy): number {
  return Math.min(Math.max(a.x, b.x), mezera.do) - Math.max(Math.min(a.x, b.x), mezera.od);
}

/**
 * Rozbor první mezery na trasách úrovně; null, když mostovka vede po všech trasách celá.
 * Mostovka, která leží na jiné trase úrovně (dvoupatrový most), se za „mimo trasu“ nepočítá.
 */
export function rozborMezery(navrh: NavrhMostu, uroven: Uroven): NalezMezery | null {
  const mezera = mezeryTras(navrh, uroven)[0];
  if (!mezera) return null;
  const trasa = mezera.trasa;
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  const naJineTrase = (a: Bod, b: Bod): boolean => uroven.trasy.some((t) => t !== trasa && bodNaTrase(t, a) && bodNaTrase(t, b));

  let presah: NalezMezery | null = null;
  let mimo: { nalez: NalezMezery; prekryv: number } | null = null;
  for (const p of navrh.pruty) {
    if (!mostovkaProTrasu(p, trasa)) continue;
    const a = podleId.get(p.a);
    const b = podleId.get(p.b);
    if (!a || !b) continue;
    const kolik = prekryv(a, b, mezera);
    if (!(kolik > 1e-9)) continue;
    const va = vuciTrase(trasa, a);
    const vb = vuciTrase(trasa, b);
    const naCare = Math.abs(va.napric) <= TOLERANCE_TRASY && Math.abs(vb.napric) <= TOLERANCE_TRASY;
    if (naCare) {
      // Na čáře trasy, a přitom ji nenese: některý konec je za koncem trasy. Značka patří
      // na kraj břehu, kde prutu chybí styčník.
      if (presah) continue;
      const odPodel = Math.min(va.podel, vb.podel);
      const poPodel = Math.max(va.podel, vb.podel);
      const kraj = odPodel < -1e-9 ? trasa.zacatek : poPodel > va.delka + 1e-9 ? trasa.konec : null;
      if (kraj) presah = { druh: "presah", mezera, misto: { x: kraj.x, y: kraj.y }, prut: p.id };
    } else if (!naJineTrase(a, b) && (!mimo || kolik > mimo.prekryv)) {
      mimo = { nalez: { druh: "mimo-trasu", mezera, misto: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, prut: p.id }, prekryv: kolik };
    }
  }
  if (presah) return presah;
  if (mimo) return mimo.nalez;

  const zacatek = Math.min(trasa.zacatek.x, trasa.konec.x);
  const konec = Math.max(trasa.zacatek.x, trasa.konec.x);
  const uZacatku = mezera.od <= zacatek + 1e-9;
  const uKonce = mezera.do >= konec - 1e-9;
  if (uZacatku || uKonce) {
    // Značka u volného konce mostovky; když mostovka na trase žádná není, u začátku trasy.
    const x = uZacatku && uKonce ? zacatek : uKonce ? mezera.od : mezera.do;
    return { druh: "breh", mezera, misto: bodTrasy(trasa, x), prut: null };
  }
  return { druh: "uprostred", mezera, misto: bodTrasy(trasa, (mezera.od + mezera.do) / 2), prut: null };
}

/**
 * Díl mostovky celý za koncem trasy (na břehu, „po zemi“): provoz po něm nejde (za koncem
 * trasy chodí po pevné zemi) a zem ho nenese, takže visí z mostu jako konzola a při
 * zkoušce se rozkmitá. Vrací první takový prut (id) a jeho střed; null, když žádný není.
 * U mostu, který se zvedá, se nehlásí: tam může rameno za opěrou dávat smysl.
 */
export function mostovkaZaBrehem(navrh: NavrhMostu, uroven: Uroven): { prut: number; misto: Bod } | null {
  if (uroven.pohyb) return null;
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  for (const p of navrh.pruty) {
    if (KATALOG[p.prvek].druh !== "mostovka") continue;
    const a = podleId.get(p.a);
    const b = podleId.get(p.b);
    if (!a || !b) continue;
    const trasy = uroven.trasy.filter((t) => mostovkaProTrasu(p, t));
    if (trasy.length === 0) continue;
    // Za koncem všech tras svého druhu: celý vlevo od jejich začátků, nebo vpravo od konců.
    const venku = trasy.every((t) => {
      const od = Math.min(t.zacatek.x, t.konec.x);
      const po = Math.max(t.zacatek.x, t.konec.x);
      return Math.max(a.x, b.x) <= od + 1e-9 || Math.min(a.x, b.x) >= po - 1e-9;
    });
    if (venku) return { prut: p.id, misto: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  return null;
}

/**
 * Vypadá mostovka na výkresu hotově, i když na trase mezera je? Mostovka správného druhu
 * (kdekoli, i mimo trasu) pokrývá v souřadnici x celou trasu bez děr. Pak hráč most za
 * hotový považuje a značka o mezeře mu nepřekáží; dokud staví, mezery jsou samozřejmé.
 */
export function mostovkaVypadaHotove(navrh: NavrhMostu, uroven: Uroven): boolean {
  const mezery = mezeryTras(navrh, uroven);
  if (mezery.length === 0) return false;
  const podleId = new Map(navrh.stycniky.map((s) => [s.id, s]));
  return mezery.every((mezera) => {
    const trasa = mezera.trasa;
    const useky: [number, number][] = [];
    for (const p of navrh.pruty) {
      if (!mostovkaProTrasu(p, trasa)) continue;
      const a = podleId.get(p.a);
      const b = podleId.get(p.b);
      if (!a || !b) continue;
      if (uroven.trasy.some((t) => t !== trasa && bodNaTrase(t, a) && bodNaTrase(t, b))) continue;
      useky.push([Math.min(a.x, b.x), Math.max(a.x, b.x)]);
    }
    useky.sort((p, q) => p[0] - q[0]);
    let pokryto = mezera.od;
    for (const [od, po] of useky) {
      if (od > pokryto + 1e-9) break;
      if (po > pokryto) pokryto = po;
    }
    return pokryto >= mezera.do - 1e-9;
  });
}
