// Odhad kmitání mostu pod lidmi ještě při stavbě, bez časové simulace.
//
// Lidé na mostě nejsou mrtvá váha: tělo je hmota na pružině s tlumičem (chodec 2,85 Hz,
// útlum 30 %). Most pod kmitočtem těla lidé zpomalí víc, než kolik by odpovídalo jejich váze,
// most nad ním naopak zrychlí, a vždycky ho tlumí. Odhad proto počítá ustálenou odezvu mostu,
// na kterém skupina z jízdního řádu stojí tak, jak ji vede zkouška (řady, rozestupy, kdo drží
// krok a kdo ne), a budí ho silou svého kroku v místech, kde stojí.
//
// Skupina, která drží krok, se sčítá s fází; volně jdoucí lidé má každý svou kadenci a fázi,
// takže se sčítají jejich výkony a výsledek se násobí činitelem špičky (rázy mezi blízkými
// kadencemi zvednou okamžité kmitání nad průměr). Výsledek je totéž číslo, které měří zkouška:
// amplituda svislého zrychlení mostovky v pásmu 0,5 až 10 Hz.
//
// Odhad je odhad: skupina ve skutečnosti přechází, ustálený stav nemusí stihnout nastat
// a lidé nad 2,5 m/s² ztrácejí krok. O mostě rozhoduje zkouška. Do simulace odtud nic
// nevstupuje, takže se tu smí počítat se siny a kosiny.

import type { IdProvozu } from "../data/katalog";
import type { Uroven } from "../data/uroven";
import { TIHOVE_ZRYCHLENI } from "../jadro/integrator";
import { poddajnost, type ZakladOdezvy } from "../jadro/odezva";
import { zesileniPasma } from "./kmitani";
import { jeClovek, radySkupiny } from "./provoz";
import type { StavbaMostu } from "./stavba";
import { ROZPTYL_DAVU, ROZPTYL_ZAVODU, skokan, vedleSebe } from "./vozidla";

/**
 * Kolik vlastních tvarů mostu odhad bere. Se čtrnácti vychází stejně jako s dvaceti
 * (měřeno na zkouškách všech úrovní s lidmi) a počítá se zhruba dvakrát rychleji.
 */
export const POCET_TVARU_ODHADU = 14;
/**
 * Kde na mostě se skupina zkouší: čelo skupiny v těchto podílech cesty od vstupu čela na most
 * po odchod poslední řady. Dlouhá skupina je tak na mostě i jen zčásti (čelo průvodu uprostřed
 * mostu, zbytek teprve přichází).
 */
const MISTA_SKUPINY = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85];
/**
 * Skákání začíná naráz: než se kmitání ustálí, přechodový děj ho krátce zvedne nad ustálenou
 * hodnotu. Změřeno na zkouškách skákajícího davu (ustálený odhad dával 0,77 až 0,91 zkoušky).
 */
const NABEH_SKAKANI = 1.15;
/**
 * Běžec je část kroku ve vzduchu (síla jeho kroku klesá pod nulu a ořízne se). Na kmitajícím
 * mostě mu mostovka mezitím uhne a síla, kterou mostu předá, je menší než na pevné zemi:
 * změřeno o 15 až 20 %. Platí pro každého, jehož kroková síla přesáhne jeho váhu.
 */
const BEH_NA_MOSTE = 0.85;
/** V jakém okolí frekvence prázdného mostu (jako její násobky) se hledá špička mostu s lidmi. */
const OKOLI_TVARU = [0.55, 1.5] as const;
/** Kolika vzorky se pokrývá rozptyl kadence volně jdoucích lidí (od −2 do +2 odchylek). */
const VZORKU_KADENCE = 7;

/**
 * Činitel špičky volně jdoucích lidí: kolikrát největší okamžité kmitání přesáhne odmocninu ze
 * součtu výkonů jednotlivých řad. Řady s různými kadencemi se chvílemi sejdou ve fázi; čím širší
 * je pásmo kadencí `pasmo` (Hz) a čím déle skupina po mostě jde (`doba`, s), tím víc takových
 * chvil stihne nastat. Obálka součtu mnoha nezávislých kmitů má Rayleighovo rozdělení a její
 * největší hodnota z K nezávislých okamžiků je √(ln K) násobek odmocniny součtu výkonů;
 * nezávislých okamžiků je zhruba pásmo × doba. Lidé se stejnou kadencí (pásmo 0) mají fáze
 * dané jednou provždy a činitel je 1.
 */
export function cinitelSpicky(pasmo: number, doba: number): number {
  const okamziku = 1 + pasmo * doba;
  return Math.sqrt(Math.max(1, Math.log(okamziku)));
}

/** Jedna složka kroku skupiny a jak silně jí most podle odhadu odpovídá. */
export interface SlozkaOdhadu {
  /** Rytmus kroku lidí, kteří tu složku působí, Hz. */
  rytmus: number;
  nasobek: 1 | 2 | 3;
  /** Frekvence složky v Hz (rytmus × násobek). */
  frekvence: number;
  /** Drží ti lidé krok? */
  vTaktu: boolean;
  /** Odhad zrychlení mostovky od té složky samotné, m/s². */
  zrychleni: number;
}

/** Odhad pro jednu skupinu lidí z jízdního řádu. */
export interface OdhadSkupiny {
  /** Pořadí položky v jízdním řádu úrovně. */
  polozka: number;
  druh: IdProvozu;
  /** Odhad největšího zrychlení mostovky pod tou skupinou, m/s². */
  zrychleni: number;
  /** Složky kroku seřazené od nejsilnější odezvy. */
  slozky: SlozkaOdhadu[];
  /** Kde na své cestě mostem (0 vstup čela, 1 odchod poslední řady) skupina most rozkmitá nejvíc. */
  misto: number;
}

/** Odhad kmitání mostu pod lidmi úrovně. */
export interface OdhadKmitani {
  /** Největší odhad přes skupiny, m/s². */
  zrychleni: number;
  /** Skupiny v pořadí jízdního řádu. */
  skupiny: OdhadSkupiny[];
}

/** Řada lidí pro odhad: kde za čelem skupiny stojí, co váží její těla a jak budí. */
interface RadaOdhadu {
  zaCelem: number;
  /** Tělo řady: hmota na pružině s tlumičem. */
  hmota: number;
  tuhost: number;
  tlumeni: number;
  /** Amplitudy tří složek síly kroku celé řady, N. */
  sily: [number, number, number];
}

/** Lidé jedné skupiny se stejným rytmem. */
interface CastSkupiny {
  rytmus: number;
  /** Směrodatná odchylka kadence mezi řadami, Hz; nula, když ji všichni drží stejnou. */
  rozptyl: number;
  vTaktu: boolean;
  rady: RadaOdhadu[];
}

interface SkupinaOdhadu {
  /** Těla všech lidí skupiny (i těch, kteří zrovna nebudí). */
  tela: RadaOdhadu[];
  casti: CastSkupiny[];
  /** Vzdálenost poslední řady od čela, m. */
  delka: number;
  /** Jen uprostřed mostu (skákající dav), nebo po celé délce. */
  jenUprostred: boolean;
  /** Rychlost, kterou skupina po mostě jde, m/s. */
  rychlost: number;
  /** Směr chůze: 1 od začátku mostovky ke konci, −1 opačně. */
  smer: 1 | -1;
}

function silySlozek(amplitudy: readonly number[]): [number, number, number] {
  const sila = (k: number): number => Math.hypot(amplitudy[2 * k - 2] ?? 0, amplitudy[2 * k - 1] ?? 0);
  return [sila(1), sila(2), sila(3)];
}

/** Rozptyl kadence volně jdoucích lidí daného druhu provozu, Hz. */
function rozptylKadence(druh: IdProvozu): number {
  if (druh === "bezecky-zavod") return ROZPTYL_ZAVODU;
  if (druh === "dav" || druh === "pruvod" || druh === "skakajici-dav") return ROZPTYL_DAVU;
  return 0;
}

/**
 * „Náhoda“ pro plán řad, se kterou každá volně jdoucí řada dostane střední kadenci své
 * skupiny: střídá 0,8 a 0,2. Součet čtyř po sobě jdoucích čísel je 2, takže odchylka kadence
 * vyjde nulová; dvojice přitom dává platnou fázi (fáze se v odhadu nepoužije, ale plán ji losuje
 * a na samých polovinách by se nedolosoval).
 */
function stredniNahoda(): () => number {
  let sude = false;
  return () => {
    sude = !sude;
    return sude ? 0.8 : 0.2;
  };
}

/**
 * Rozloží položku jízdního řádu na skupiny pro odhad; prázdný seznam, když to nejsou lidé nebo
 * nejdou po první trase úrovně (odhad se dělá pro její mostovku).
 */
function skupinyPolozky(polozka: Uroven["jizdniRad"][number], uroven: Uroven): SkupinaOdhadu[] {
  if (!jeClovek(polozka.druh) || polozka.trasa !== uroven.trasy[0]?.id) return [];
  const rady = radySkupiny(polozka, uroven, stredniNahoda());
  if (!rady || rady.length === 0) return [];
  const tela: RadaOdhadu[] = [];
  const casti = new Map<string, CastSkupiny>();
  for (const rada of rady) {
    let hmota = 0;
    let tuhost = 0;
    let tlumeni = 0;
    for (const n of rada.model.napravy) {
      hmota += n.odpruzena + n.neodpruzena;
      tuhost += n.kontakt.tuhost;
      tlumeni += n.kontakt.tlumeni;
    }
    const buzeni = rada.model.buzeni;
    const sily = buzeni ? silySlozek(buzeni.amplitudy) : ([0, 0, 0] as [number, number, number]);
    // Řada, která se v součtu od země odlepí (první složka přes váhu řady v taktu), běží.
    const vahaRady = hmota * TIHOVE_ZRYCHLENI * (rada.vTaktu ? 1 : 1 / Math.sqrt(rada.lidi));
    if (sily[0] > vahaRady) for (let k = 0; k < 3; k++) sily[k] = sily[k]! * BEH_NA_MOSTE;
    const telo: RadaOdhadu = { zaCelem: rada.zaCelem, hmota, tuhost, tlumeni, sily };
    tela.push(telo);
    if (!buzeni) continue;
    const rozptyl = rada.vTaktu ? 0 : rozptylKadence(polozka.druh);
    const klic = `${rada.vTaktu}:${buzeni.frekvence}:${rozptyl}`;
    let cast = casti.get(klic);
    if (!cast) {
      cast = { rytmus: buzeni.frekvence, rozptyl, vTaktu: rada.vTaktu, rady: [] };
      casti.set(klic, cast);
    }
    cast.rady.push(telo);
  }
  const delka = rady[rady.length - 1]!.zaCelem;
  const rychlost = rady[0]!.model.rychlost;
  const smer = polozka.smer;
  const skupiny: SkupinaOdhadu[] = [{ tela, casti: [...casti.values()], delka, jenUprostred: false, rychlost, smer }];
  if (polozka.druh === "skakajici-dav" && polozka.kadence !== undefined) {
    // Skákání: všichni naráz, uprostřed mostu, ve stejných rozestupech, v jakých přišli.
    const skok = skokan(polozka.kadence);
    const skacou: RadaOdhadu[] = rady.map((rada, k) => ({
      ...tela[k]!,
      sily: silySlozek(vedleSebe(skok, rada.lidi).buzeni!.amplitudy),
    }));
    skupiny.push({ tela, casti: [{ rytmus: polozka.kadence, rozptyl: 0, vTaktu: true, rady: skacou }], delka, jenUprostred: true, rychlost, smer });
  }
  return skupiny;
}

/** Místo řady na mostovce: dva sousední styčníky a podíl druhého z nich. */
interface MistoRady {
  a: number;
  b: number;
  podil: number;
}

function mistoNaMostovce(xs: readonly number[], x: number): MistoRady | null {
  const posledni = xs.length - 1;
  if (posledni < 1 || x < xs[0]! || x > xs[posledni]!) return null;
  let i = 0;
  while (i + 1 < posledni && xs[i + 1]! <= x) i++;
  const delka = xs[i + 1]! - xs[i]!;
  return { a: i, b: i + 1, podil: delka > 0 ? (x - xs[i]!) / delka : 0 };
}

interface TeloNaMoste {
  telo: RadaOdhadu;
  misto: MistoRady;
}

/**
 * Dynamická tuhost těl na frekvenci `f` (Hz) v místech mostovky: reálná část do `zr`, imaginární
 * do `zi`. Tělo je hmota m na pružině K = k + iωc; mostovku pod sebou drží silou
 * K·(−mω²) / (K − mω²) na jednotku její výchylky. Pod kmitočtem těla působí jako hmota (víc
 * než tuhá), nad ním jako pružina, a vždycky tlumí.
 */
function tuhostTel(tela: readonly TeloNaMoste[], f: number, zr: Float64Array, zi: Float64Array): void {
  const w = 2 * Math.PI * f;
  zr.fill(0);
  zi.fill(0);
  for (const { telo, misto: m } of tela) {
    const citRe = -telo.hmota * w * w * telo.tuhost;
    const citIm = -telo.hmota * w * w * w * telo.tlumeni;
    const jmRe = telo.tuhost - telo.hmota * w * w;
    const jmIm = w * telo.tlumeni;
    const jm = jmRe * jmRe + jmIm * jmIm;
    const re = (citRe * jmRe + citIm * jmIm) / jm;
    const im = (citIm * jmRe - citRe * jmIm) / jm;
    zr[m.a] = zr[m.a]! + (1 - m.podil) * re;
    zi[m.a] = zi[m.a]! + (1 - m.podil) * im;
    zr[m.b] = zr[m.b]! + m.podil * re;
    zi[m.b] = zi[m.b]! + m.podil * im;
  }
}

/** Most, na kterém stojí největší skupina lidí úrovně. */
export interface MostSLidmi {
  /**
   * Rezonanční křivka: největší svislé zrychlení mostovky v m/s² na newton svislé harmonické
   * síly, pro každou z dotázaných frekvencí. Stejná veličina jako u prázdného mostu.
   */
  krivka: Float64Array;
  /**
   * Na jaké frekvenci (Hz) s lidmi nejvíc odpovídá každý z prvních vlastních tvarů mostu.
   * Tvar, který lidé utlumí natolik, že špičku nemá, tu má frekvenci prázdného mostu.
   */
  frekvence: number[];
}

/**
 * Jak se most chová, když na něm uprostřed stojí největší skupina lidí z jízdního řádu:
 * rezonanční křivka ve frekvencích `frekvence` (Hz, vzestupně) a posunuté frekvence prvních
 * `tvaru` vlastních tvarů. Null, když v úrovni lidé nejdou nebo odezva nejde spočítat.
 */
export function mostSLidmi(
  uroven: Uroven,
  zaklad: ZakladOdezvy,
  xs: readonly number[],
  frekvence: readonly number[],
  tvaru: number,
): MostSLidmi | null {
  const p = zaklad.mista.length;
  const m = zaklad.omega.length;
  if (p < 2 || xs.length !== p || frekvence.length === 0) return null;
  const zacatek = xs[0]!;
  const rozpeti = xs[p - 1]! - zacatek;
  // Největší skupina: ta, která má středem uprostřed mostu na mostě nejvíc hmoty.
  let tela: TeloNaMoste[] = [];
  let nejvic = 0;
  for (const polozka of uroven.jizdniRad) {
    const skupina = skupinyPolozky(polozka, uroven)[0];
    if (!skupina) continue;
    const celo = zacatek + (rozpeti + skupina.delka) / 2;
    const naMoste: TeloNaMoste[] = [];
    let hmota = 0;
    for (const telo of skupina.tela) {
      const kde = mistoNaMostovce(xs, celo - telo.zaCelem);
      if (!kde) continue;
      naMoste.push({ telo, misto: kde });
      hmota += telo.hmota;
    }
    if (hmota > nejvic) {
      nejvic = hmota;
      tela = naMoste;
    }
  }
  if (tela.length === 0) return null;

  const pocetTvaru = Math.min(tvaru, m);
  const zr = new Float64Array(p);
  const zi = new Float64Array(p);
  const krivka = new Float64Array(frekvence.length);
  /** Odezva každého tvaru: síla i měření rozložené podle tvaru po mostovce. */
  const odezvaTvaru = Array.from({ length: pocetTvaru }, () => new Float64Array(frekvence.length));
  for (let k = 0; k < frekvence.length; k++) {
    const f = frekvence[k]!;
    tuhostTel(tela, f, zr, zi);
    const G = poddajnost(zaklad, f, zr, zi);
    if (!G) return null;
    const w2 = (2 * Math.PI * f) * (2 * Math.PI * f);
    let nejvetsi = 0;
    for (let j = 0; j < p; j++) nejvetsi = Math.max(nejvetsi, Math.hypot(G.re[j * p + j]!, G.im[j * p + j]!));
    krivka[k] = w2 * nejvetsi;
    for (let i = 0; i < pocetTvaru; i++) {
      let re = 0;
      let im = 0;
      for (let a = 0; a < p; a++) {
        const fa = zaklad.fi[a * m + i]!;
        if (fa === 0) continue;
        for (let b = 0; b < p; b++) {
          const fb = zaklad.fi[b * m + i]!;
          re += fa * G.re[a * p + b]! * fb;
          im += fa * G.im[a * p + b]! * fb;
        }
      }
      odezvaTvaru[i]![k] = w2 * Math.hypot(re, im);
    }
  }
  const posunute: number[] = [];
  for (let i = 0; i < pocetTvaru; i++) {
    const prazdny = zaklad.omega[i]! / (2 * Math.PI);
    const odezva = odezvaTvaru[i]!;
    // Špička se hledá kolem frekvence prázdného mostu; lidé ji posunou nejvýš o desítky procent.
    let nejlepsi = -1;
    for (let k = 1; k + 1 < frekvence.length; k++) {
      const f = frekvence[k]!;
      if (f < OKOLI_TVARU[0] * prazdny || f > OKOLI_TVARU[1] * prazdny) continue;
      if (!(odezva[k]! >= odezva[k - 1]! && odezva[k]! > odezva[k + 1]!)) continue;
      if (nejlepsi < 0 || odezva[k]! > odezva[nejlepsi]!) nejlepsi = k;
    }
    if (nejlepsi < 0) {
      posunute.push(prazdny);
      continue;
    }
    const vlevo = odezva[nejlepsi - 1]!;
    const stred = odezva[nejlepsi]!;
    const vpravo = odezva[nejlepsi + 1]!;
    const zakriveni = vlevo - 2 * stred + vpravo;
    const posun = zakriveni < 0 ? (0.5 * (vlevo - vpravo)) / zakriveni : 0;
    const krok = frekvence[nejlepsi + 1]! - frekvence[nejlepsi]!;
    posunute.push(frekvence[nejlepsi]! + krok * Math.max(-1, Math.min(1, posun)));
  }
  return { krivka, frekvence: posunute };
}

/**
 * Odhad kmitání pro lidi úrovně `uroven` na mostě se základem odezvy `zaklad`, jehož místa
 * jsou styčníky mostovky seřazené podle x (`xs` jsou jejich polohy, m). Null, když v úrovni
 * žádní lidé nejdou nebo se odezva nedá spočítat. S `jen` se počítá jediná položka jízdního
 * řádu: tak se levněji porovnávají obměny téhož mostu.
 */
export function odhadniKmitani(
  uroven: Uroven,
  zaklad: ZakladOdezvy,
  xs: readonly number[],
  jen?: number,
): OdhadKmitani | null {
  const p = zaklad.mista.length;
  if (p < 2 || xs.length !== p) return null;
  const zacatek = xs[0]!;
  const rozpeti = xs[p - 1]! - zacatek;
  if (!(rozpeti > 0)) return null;
  const skupiny: OdhadSkupiny[] = [];
  const zr = new Float64Array(p);
  const zi = new Float64Array(p);

  uroven.jizdniRad.forEach((polozka, cisloPolozky) => {
    if (jen !== undefined && jen !== cisloPolozky) return;
    let nejvic = 0;
    let slozkyNejhorsi: SlozkaOdhadu[] = [];
    let mistoNejhorsi = 0.5;
    for (const skupina of skupinyPolozky(polozka, uroven)) {
      // Jak dlouho skupina po mostě jde: od vstupu čela po odchod poslední řady.
      const doba = skupina.rychlost > 0 ? (rozpeti + skupina.delka) / skupina.rychlost : 0;
      for (const podil of skupina.jenUprostred ? [0.5] : MISTA_SKUPINY) {
        // Skákající dav stojí středem skupiny uprostřed mostu; ostatní skupiny mostem procházejí.
        const draha = skupina.jenUprostred ? (rozpeti + skupina.delka) / 2 : podil * (rozpeti + skupina.delka);
        const misto = (rada: RadaOdhadu): MistoRady | null =>
          mistoNaMostovce(xs, skupina.smer === 1 ? zacatek + draha - rada.zaCelem : zacatek + rozpeti - draha + rada.zaCelem);
        const telaNaMoste: TeloNaMoste[] = [];
        for (const telo of skupina.tela) {
          const kde = misto(telo);
          if (kde) telaNaMoste.push({ telo, misto: kde });
        }
        /** Poddajnost mostu s těly skupiny na frekvenci `f`. */
        const sTely = (f: number): { re: Float64Array; im: Float64Array } | null => {
          tuhostTel(telaNaMoste, f, zr, zi);
          return poddajnost(zaklad, f, zr, zi);
        };

        /** Čtverec zrychlení každého styčníku mostovky, sečtený přes části a složky. */
        const ctverce = new Float64Array(p);
        const slozky: SlozkaOdhadu[] = [];
        for (const cast of skupina.casti) {
          const rady = cast.rady.map((rada) => ({ rada, misto: misto(rada) })).filter((r) => r.misto !== null);
          if (rady.length === 0) continue;
          for (const nasobek of [1, 2, 3] as const) {
            if (!rady.some((r) => r.rada.sily[nasobek - 1]! > 0)) continue;
            const prispevek = new Float64Array(p);
            const vzorku = cast.vTaktu || cast.rozptyl === 0 ? 1 : VZORKU_KADENCE;
            // Pásmo kadencí složky: odchylka na každou stranu, u násobku kroku tolikrát širší.
            const spicka = cast.vTaktu ? 1 : cinitelSpicky(2 * nasobek * cast.rozptyl, doba);
            let vahy = 0;
            for (let v = 0; v < vzorku; v++) {
              const odchylka = vzorku === 1 ? 0 : -2 + (4 * v) / (vzorku - 1);
              const vaha = Math.exp(-0.5 * odchylka * odchylka);
              const f = nasobek * (cast.rytmus + cast.rozptyl * odchylka);
              if (!(f > 0)) continue;
              const G = sTely(f);
              if (!G) continue;
              vahy += vaha;
              const w2 = (2 * Math.PI * f) * (2 * Math.PI * f) * zesileniPasma(f);
              for (let j = 0; j < p; j++) {
                let re = 0;
                let im = 0;
                let vykon = 0;
                for (const { rada, misto: m } of rady) {
                  const sila = rada.sily[nasobek - 1]!;
                  const gRe = (1 - m!.podil) * G.re[j * p + m!.a]! + m!.podil * G.re[j * p + m!.b]!;
                  const gIm = (1 - m!.podil) * G.im[j * p + m!.a]! + m!.podil * G.im[j * p + m!.b]!;
                  if (cast.vTaktu) {
                    re += sila * gRe;
                    im += sila * gIm;
                  } else vykon += sila * sila * (gRe * gRe + gIm * gIm);
                }
                const ctverec = cast.vTaktu ? re * re + im * im : spicka * spicka * vykon;
                prispevek[j] = prispevek[j]! + vaha * w2 * w2 * ctverec;
              }
            }
            if (!(vahy > 0)) continue;
            let nejvetsi = 0;
            for (let j = 0; j < p; j++) {
              prispevek[j] = prispevek[j]! / vahy;
              ctverce[j] = ctverce[j]! + prispevek[j]!;
              nejvetsi = Math.max(nejvetsi, prispevek[j]!);
            }
            slozky.push({ rytmus: cast.rytmus, nasobek, frekvence: nasobek * cast.rytmus, vTaktu: cast.vTaktu, zrychleni: Math.sqrt(nejvetsi) });
          }
        }
        let celkem = 0;
        for (let j = 0; j < p; j++) celkem = Math.max(celkem, ctverce[j]!);
        celkem = Math.sqrt(celkem) * (skupina.jenUprostred ? NABEH_SKAKANI : 1);
        if (skupina.jenUprostred) for (const slozka of slozky) slozka.zrychleni *= NABEH_SKAKANI;
        if (celkem > nejvic) {
          nejvic = celkem;
          slozkyNejhorsi = slozky;
          mistoNejhorsi = podil;
        }
      }
    }
    if (slozkyNejhorsi.length > 0) {
      skupiny.push({
        polozka: cisloPolozky,
        druh: polozka.druh,
        zrychleni: nejvic,
        slozky: slozkyNejhorsi.sort((a, b) => b.zrychleni - a.zrychleni),
        misto: mistoNejhorsi,
      });
    }
  });
  if (skupiny.length === 0) return null;
  let zrychleni = 0;
  for (const s of skupiny) zrychleni = Math.max(zrychleni, s.zrychleni);
  return { zrychleni, skupiny };
}

/**
 * Styčníky mostovky trasy `trasa` seřazené podle x a jejich polohy. Odhad je potřebuje
 * v pořadí, v jakém po nich lidé jdou.
 */
export function mostovkaTrasy(stavba: StavbaMostu, trasa: number): { stycniky: number[]; xs: number[] } {
  const pruty = new Set(stavba.trasy[trasa]?.pruty ?? []);
  const uzly = new Set<number>();
  for (const prvek of stavba.popis.prvky) {
    if (prvek.prut !== undefined && pruty.has(prvek.prut)) {
      uzly.add(prvek.a);
      uzly.add(prvek.b);
    }
  }
  const stycniky = [...uzly].sort((a, b) => stavba.popis.stycniky[a]!.x - stavba.popis.stycniky[b]!.x);
  return { stycniky, xs: stycniky.map((i) => stavba.popis.stycniky[i]!.x) };
}
