// Měření zvuku bez reproduktoru: zvuk se spočítá do paměti a změří se jeho hlasitost,
// délka a barva. Slouží stránce se zvuky a testům; hru nikdo neposlouchá, když se staví.

import type { Zvuk } from "./deje";
import { Syntezator, vytvorVystup } from "./syntezator";

export interface MereniZvuku {
  /** Největší výchylka; 1 je plný rozsah výstupu. */
  spicka: number;
  /** Efektivní hodnota po dobu, kdy zvuk zní. */
  rms: number;
  /** Jak dlouho je zvuk slyšet (nad −50 dB špičky), v sekundách. */
  delka: number;
  /** Střední kmitočet v Hz: nízký je temný zvuk, vysoký ostrý. */
  jas: number;
  /** Všechny vzorky jsou konečná čísla. */
  platne: boolean;
}

const VZORKOVANI = 44100;

/** Spočítá zvuk do paměti a změří ho. */
export async function zmerZvuk(zvuk: Zvuk, tempo = 1, trvani = 3): Promise<MereniZvuku> {
  const ctx = new OfflineAudioContext(2, Math.floor(trvani * VZORKOVANI), VZORKOVANI);
  const synt = new Syntezator(ctx, ctx.destination);
  synt.zahraj(zvuk, 0.01, 0, tempo);
  const zaznam = await ctx.startRendering();
  const vzorky = zaznam.getChannelData(0);

  let spicka = 0;
  let platne = true;
  for (const v of vzorky) {
    if (!Number.isFinite(v)) platne = false;
    else if (Math.abs(v) > spicka) spicka = Math.abs(v);
  }
  if (!platne || spicka === 0) return { spicka, rms: 0, delka: 0, jas: 0, platne };

  const prah = 0.003 * spicka;
  let prvni = 0;
  while (Math.abs(vzorky[prvni]!) <= prah) prvni++;
  let posledni = vzorky.length - 1;
  while (Math.abs(vzorky[posledni]!) <= prah) posledni--;

  let ctverce = 0;
  let zmeny = 0;
  for (let i = Math.max(1, prvni); i <= posledni; i++) {
    const v = vzorky[i]!;
    const d = v - vzorky[i - 1]!;
    ctverce += v * v;
    zmeny += d * d;
  }
  const pocet = Math.max(1, posledni - prvni + 1);
  // Střední kmitočet z poměru energie změn a energie signálu.
  const pomer = ctverce > 0 ? Math.min(1, 0.5 * Math.sqrt(zmeny / ctverce)) : 0;
  return {
    spicka,
    rms: Math.sqrt(ctverce / pocet),
    delka: pocet / VZORKOVANI,
    jas: (VZORKOVANI / Math.PI) * Math.asin(pomer),
    platne,
  };
}

export interface MereniDeje {
  /** Největší výchylka výstupu za omezovačem. */
  spicka: number;
  /** Efektivní hodnota za celý děj a v jeho nejhlasitější sekundě. */
  rms: number;
  nejhlasitejsiSekunda: number;
  /** Podíl vzorků, které omezovač znatelně zaoblil (výchylka nad 0,7). */
  omezeno: number;
  /** Kolik zvuků se zahrálo a kolik vynechalo, protože by splynuly s jinými. */
  zahrano: number;
  vynechano: number;
  platne: boolean;
}

/**
 * Spočítá do paměti celý děj tak, jak ho hraje hra: zvuky v jejich časech, rozložené zleva
 * doprava podle místa a přes stejný omezovač. `xOd` a `xDo` jsou kraje obrazu ve světě.
 */
export async function zmerDej(zvuky: readonly Zvuk[], trvani: number, xOd: number, xDo: number): Promise<MereniDeje> {
  const ctx = new OfflineAudioContext(2, Math.ceil((trvani + 2.5) * VZORKOVANI), VZORKOVANI);
  const synt = new Syntezator(ctx, vytvorVystup(ctx, 0.9).vstup);
  let zahrano = 0;
  let vynechano = 0;
  for (const zvuk of [...zvuky].sort((a, b) => a.cas - b.cas)) {
    const podil = xDo > xOd ? (2 * (zvuk.x - xOd)) / (xDo - xOd) - 1 : 0;
    if (synt.zahraj(zvuk, zvuk.cas + 0.05, 0.85 * Math.max(-1, Math.min(1, podil)))) zahrano++;
    else vynechano++;
  }
  const zaznam = await ctx.startRendering();
  const levy = zaznam.getChannelData(0);
  const pravy = zaznam.getChannelData(1);
  let spicka = 0;
  let ctverce = 0;
  let omezeno = 0;
  let platne = true;
  let nejhlasitejsi = 0;
  let sekunda = 0;
  for (let i = 0; i < levy.length; i++) {
    const l = levy[i]!;
    const p = pravy[i]!;
    if (!Number.isFinite(l) || !Number.isFinite(p)) platne = false;
    const nejvic = Math.max(Math.abs(l), Math.abs(p));
    if (nejvic > spicka) spicka = nejvic;
    if (nejvic > 0.7) omezeno++;
    const energie = (l * l + p * p) / 2;
    ctverce += energie;
    sekunda += energie;
    if ((i + 1) % VZORKOVANI === 0) {
      if (sekunda > nejhlasitejsi) nejhlasitejsi = sekunda;
      sekunda = 0;
    }
  }
  return {
    spicka,
    rms: Math.sqrt(ctverce / levy.length),
    nejhlasitejsiSekunda: Math.sqrt(nejhlasitejsi / VZORKOVANI),
    omezeno: omezeno / levy.length,
    zahrano,
    vynechano,
    platne,
  };
}
