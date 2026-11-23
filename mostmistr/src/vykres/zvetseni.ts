// Zvětšení pohybu konstrukce pro kreslení. Skutečné výchylky mostu jsou milimetry až
// centimetry a na výkresu nejsou vidět; zvětšené několikanásobně ukážou, jak se most houpe.
// Stejně se kreslí průhyby ve statických výpočtech. Zvětšuje se jen svislá výchylka proti
// výchozímu snímku; lidé a vozidla se posouvají s mostovkou pod sebou, aby na ní zůstali stát.

import { CARA_MOSTOVKA, STYCNIK_SKRYTY, STYCNIK_ZAVAZI, type Topologie } from "../zkouska/zaznam";

/** Styčníky mostovky seřazené podle výchozí polohy x; počítá se jednou na stavbu. */
const mostovky = new WeakMap<Topologie, Int32Array>();

function stycnikyMostovky(t: Topologie, vychozi: Float32Array): Int32Array {
  let serazene = mostovky.get(t);
  if (!serazene) {
    const stycniky = new Set<number>();
    for (let e = 0; e < t.prvekA.length; e++) {
      if (t.cara[e] !== CARA_MOSTOVKA) continue;
      stycniky.add(t.prvekA[e]!);
      stycniky.add(t.prvekB[e]!);
    }
    serazene = Int32Array.from([...stycniky].sort((a, b) => vychozi[2 * a]! - vychozi[2 * b]!));
    mostovky.set(t, serazene);
  }
  return serazene;
}

/**
 * Polohy styčníků se svislou výchylkou proti `vychozi` zvětšenou `nasobek`krát, zapsané do
 * `cil` (když se velikost nehodí, vrátí nové pole). `vychozi` je první snímek záznamu a musí
 * patřit ke stejné stavbě jako `polohy`.
 */
export function zvetsiPohyb(
  t: Topologie,
  vychozi: Float32Array,
  polohy: Float32Array,
  nasobek: number,
  cil: Float32Array,
): Float32Array {
  const vysledek = cil.length === polohy.length ? cil : new Float32Array(polohy.length);
  vysledek.set(polohy);
  if (nasobek === 1 || vychozi.length !== polohy.length) return vysledek;

  const mostovka = stycnikyMostovky(t, vychozi);
  /** O kolik zvětšení posune mostovku v místě x; mimo mostovku nula. */
  const posunMostovky = (x: number): number => {
    const n = mostovka.length;
    if (n === 0) return 0;
    const prvni = mostovka[0]!;
    const posledni = mostovka[n - 1]!;
    if (x <= vychozi[2 * prvni]! || x >= vychozi[2 * posledni]!) return 0;
    let dolni = 0;
    let horni = n - 1;
    while (horni - dolni > 1) {
      const stred = (dolni + horni) >> 1;
      if (vychozi[2 * mostovka[stred]!]! <= x) dolni = stred;
      else horni = stred;
    }
    const a = mostovka[dolni]!;
    const b = mostovka[horni]!;
    const xa = vychozi[2 * a]!;
    const xb = vychozi[2 * b]!;
    const podil = xb > xa ? (x - xa) / (xb - xa) : 0;
    const da = polohy[2 * a + 1]! - vychozi[2 * a + 1]!;
    const db = polohy[2 * b + 1]! - vychozi[2 * b + 1]!;
    return (nasobek - 1) * (da + (db - da) * podil);
  };

  for (let i = 0; i < t.stycniku; i++) {
    const y = polohy[2 * i + 1]!;
    if (t.znacky[i] === STYCNIK_SKRYTY) {
      // Účastník provozu: jede s mostovkou pod sebou.
      vysledek[2 * i + 1] = y + posunMostovky(polohy[2 * i]!);
    } else {
      const y0 = vychozi[2 * i + 1]!;
      vysledek[2 * i + 1] = y0 + nasobek * (y - y0);
    }
  }
  return vysledek;
}

/**
 * Největší svislá výchylka styčníků konstrukce proti výchozímu snímku, v metrech. Závaží
 * laděných tlumičů se nepočítají: kmitají víc než most, a kdyby zvětšení určovala ona, most
 * sám by skoro nebyl vidět.
 */
export function nejvetsiVychylka(t: Topologie, vychozi: Float32Array, polohy: Float32Array): number {
  if (vychozi.length !== polohy.length) return 0;
  let nejvetsi = 0;
  for (let i = 0; i < t.stycniku; i++) {
    if (t.znacky[i] === STYCNIK_SKRYTY || t.znacky[i] === STYCNIK_ZAVAZI) continue;
    const d = Math.abs(polohy[2 * i + 1]! - vychozi[2 * i + 1]!);
    if (d > nejvetsi) nejvetsi = d;
  }
  return nejvetsi;
}

/**
 * O kolik metrů se závaží laděného tlumiče nejvíc přiblížilo ke styčníku, pod kterým visí,
 * nebo se od něj vzdálilo (proti výchozímu snímku). Zvětšení pohybu nesmí být tak velké, aby
 * nakreslené závaží vjelo do mostovky.
 */
export function nejvetsiPohybZavazi(t: Topologie, vychozi: Float32Array, polohy: Float32Array): number {
  if (vychozi.length !== polohy.length) return 0;
  let nejvetsi = 0;
  for (let e = 0; e < t.prvekA.length; e++) {
    const a = t.prvekA[e]!;
    const b = t.prvekB[e]!;
    if ((t.znacky[a] === STYCNIK_ZAVAZI) === (t.znacky[b] === STYCNIK_ZAVAZI)) continue;
    const pohyb = Math.abs(polohy[2 * a + 1]! - vychozi[2 * a + 1]! - (polohy[2 * b + 1]! - vychozi[2 * b + 1]!));
    if (pohyb > nejvetsi) nejvetsi = pohyb;
  }
  return nejvetsi;
}

/** Zvětšení, při kterém výchylka `vychylka` (m) vypadá zhruba jako `cil` metrů; zaokrouhlené dolů na hezké číslo. */
export function hezkeZvetseni(vychylka: number, cil: number): number {
  if (!(vychylka > 0)) return 1;
  const presne = cil / vychylka;
  let hezke = 1;
  for (const stupen of [2, 5, 10, 20, 50, 100, 200]) {
    if (stupen <= presne) hezke = stupen;
  }
  return hezke;
}

/**
 * Průměr poloh přes snímky se stejným počtem styčníků jako první: střed, kolem kterého se
 * konstrukce v záznamu pohybovala. U mostu rozkmitaného brnknutím je to jeho klidová poloha.
 */
export function stredniPolohy(snimky: readonly Float32Array[]): Float32Array {
  const prvni = snimky[0];
  if (!prvni) return new Float32Array(0);
  const soucet = new Float64Array(prvni.length);
  let pocet = 0;
  for (const polohy of snimky) {
    if (polohy.length !== prvni.length) continue;
    for (let k = 0; k < soucet.length; k++) soucet[k] = soucet[k]! + polohy[k]!;
    pocet += 1;
  }
  return Float32Array.from(soucet, (hodnota) => hodnota / pocet);
}
