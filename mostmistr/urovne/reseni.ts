// Referenční řešení úrovní kampaně: pro každou medaili most, který ji získá, a mosty,
// které spadnout mají. Podle nich se ladí rozpočty a test vyhratelnosti hlídá, že každá
// úroveň jde vyhrát a nejde vyhrát triviálně.

import { PREDPETI_LANA, type IdPrvku } from "../src/data/katalog";
import { Kreslic } from "../src/data/kreslic";
import type { NavrhMostu } from "../src/data/navrh";

export interface ReseniUrovne {
  /** Most, který projde zkouškou; nemusí být levný ani úsporný. */
  pruchod: NavrhMostu;
  /** Most, který projde a vejde se do inženýrského rozpočtu. */
  rozpocet: NavrhMostu;
  /** Most, který projde a splní bonus úrovně. */
  mistrovska: NavrhMostu;
  /** Mosty, které zkouškou projít nesmějí. */
  pady: { nazev: string; navrh: NavrhMostu }[];
}

const L: IdPrvku = "drevo-lehke";
const T: IdPrvku = "drevo-tezke";
const O: IdPrvku = "ocel-lehka";

function navrh(uroven: string, stav: (k: Kreslic) => void): NavrhMostu {
  const k = new Kreslic(uroven);
  stav(k);
  return k.navrh();
}

/** Mostovka z polí dané délky od x = 0 do x = rozpětí. */
function mostovka(k: Kreslic, rozpeti: number, pole: number): void {
  for (let x = 0; x < rozpeti; x += pole) k.prut("mostovka-drevo", [x, 0], [x + pole, 0]);
}

/**
 * Příhrada s poli 4 m nad mostovkou (kladná výška) nebo pod ní (záporná): pás ve výšce
 * `h`, krajní šikminy, svislice a diagonály klesající ke středu.
 */
function prihrada(k: Kreslic, rozpeti: number, h: number, pas: IdPrvku, vypln: IdPrvku): void {
  const pole = 4;
  k.prut(pas, [0, 0], [pole, h]);
  k.prut(pas, [rozpeti - pole, h], [rozpeti, 0]);
  for (let x = pole; x < rozpeti - pole; x += pole) k.prut(pas, [x, h], [x + pole, h]);
  for (let x = pole; x <= rozpeti - pole; x += pole) k.prut(vypln, [x, 0], [x, h]);
  for (let x = pole; x < rozpeti - pole; x += pole) {
    const kStredu = x < rozpeti / 2;
    k.prut(vypln, kStredu ? [x, h] : [x, 0], kStredu ? [x + pole, 0] : [x + pole, h]);
  }
}

/**
 * Ocelová příhrada nad mostovkou s horním pásem proměnné výšky: `vysky[i]` je výška pásu
 * nad i-tým vnitřním styčníkem mostovky. Diagonály klesají ke středu rozpětí.
 */
function prihradaSVyskami(k: Kreslic, rozpeti: number, pole: number, vysky: readonly number[]): void {
  const horni = vysky.map((h, i) => [pole * (i + 1), h] as [number, number]);
  k.prut(O, [0, 0], horni[0]!);
  k.prut(O, horni.at(-1)!, [rozpeti, 0]);
  for (let i = 0; i + 1 < horni.length; i++) k.prut(O, horni[i]!, horni[i + 1]!);
  for (const [x, h] of horni) k.prut(O, [x, 0], [x, h]);
  for (let i = 0; i + 1 < horni.length; i++) {
    const kStredu = horni[i]![0] < rozpeti / 2;
    k.prut(O, kStredu ? horni[i]! : [horni[i]![0], 0], kStredu ? [horni[i + 1]![0], 0] : horni[i + 1]!);
  }
}

/** Ocelová lávka: dřevěná mostovka a ocelová příhrada nad ní. */
function lavka(uroven: string, rozpeti: number, pole: number, vysky: readonly number[], uprava?: (k: Kreslic) => void): NavrhMostu {
  return navrh(uroven, (k) => {
    mostovka(k, rozpeti, pole);
    prihradaSVyskami(k, rozpeti, pole, vysky);
    uprava?.(k);
  });
}

/** Stejná výška horního pásu nad všemi vnitřními styčníky. */
function rovne(rozpeti: number, pole: number, vyska: number): number[] {
  return Array.from({ length: rozpeti / pole - 1 }, () => vyska);
}

/** Zavěsí závaží do styčníků mostovky na daných místech. */
function zavazi(mista: readonly number[], kg: number): (k: Kreslic) => void {
  return (k) => {
    for (const x of mista) k.bod(x, 0, { zavazi: kg });
  };
}

/** Zavěsí pod styčníky mostovky na daných místech laděné tlumiče. */
function tlumice(mista: readonly number[], hmota: number, frekvence: number): (k: Kreslic) => void {
  return (k) => {
    for (const x of mista) k.bod(x, 0, { tlumic: { hmota, frekvence } });
  };
}

/** Věšadlo: dvě krokve do vrcholu nad (nebo pod) středem a sloupek ke styčníku mostovky. */
function vesadlo(k: Kreslic, rozpeti: number, h: number): void {
  const stred = rozpeti / 2;
  k.prut(L, [0, 0], [stred, h]);
  k.prut(L, [stred, h], [rozpeti, 0]);
  k.prut(L, [stred, 0], [stred, h]);
}

/** Vzpěradla z kotev ve svazích hlubokého údolí (úroveň 1-04). */
function vzperadla(k: Kreslic, prvek: IdPrvku): void {
  for (const [kotva, vnitrni] of [
    [4, 8],
    [20, 16],
  ] as const) {
    k.prut(prvek, [kotva, -6], [kotva, 0]);
    k.prut(prvek, [kotva, -6], [vnitrni, -3]);
    k.prut(prvek, [vnitrni, -3], [vnitrni, 0]);
    k.prut(prvek, [vnitrni, -3], [12, 0]);
    k.prut(prvek, [kotva, 0], [vnitrni, -3]);
  }
}

const TO: IdPrvku = "ocel-tezka";
const BETON: IdPrvku = "mostovka-ocelobeton";

/** Ocelobetonová mostovka z polí po šesti metrech od x = 0 do x = rozpětí. */
function vozovka(k: Kreslic, rozpeti: number): void {
  for (let x = 0; x < rozpeti; x += 6) k.prut(BETON, [x, 0], [x + 6, 0]);
}

/**
 * Silniční příhrada nad ocelobetonovou mostovkou s poli 6 m: krajní šikminy a horní pás
 * z prvku `pas` ve výšce `vyska`, svislice a diagonály klesající ke středu z prvku `vypln`.
 * S `krokPasu` 12 má horní pás dvanáctimetrové pruty; svislice jsou jen pod jeho styčníky
 * a mezilehlé styčníky mostovky nesou diagonály do V.
 */
function silnicni(
  uroven: string,
  rozpeti: number,
  vyska: number,
  pas: IdPrvku,
  vypln: IdPrvku,
  krokPasu: 6 | 12 = 6,
  uprava?: (k: Kreslic) => void,
): NavrhMostu {
  return navrh(uroven, (k) => {
    vozovka(k, rozpeti);
    k.prut(pas, [0, 0], [6, vyska]);
    k.prut(pas, [rozpeti - 6, vyska], [rozpeti, 0]);
    for (let x = 6; x < rozpeti - 6; x += krokPasu) k.prut(pas, [x, vyska], [Math.min(x + krokPasu, rozpeti - 6), vyska]);
    if (krokPasu === 6) {
      for (let x = 6; x <= rozpeti - 6; x += 6) k.prut(vypln, [x, 0], [x, vyska]);
      for (let x = 6; x < rozpeti - 6; x += 6) {
        const kStredu = x < rozpeti / 2;
        k.prut(vypln, kStredu ? [x, vyska] : [x, 0], kStredu ? [x + 6, 0] : [x + 6, vyska]);
      }
    } else {
      for (let x = 6; x <= rozpeti - 6; x += 12) k.prut(vypln, [x, 0], [x, vyska]);
      for (let x = 6; x < rozpeti - 6; x += 12) {
        k.prut(vypln, [x, vyska], [x + 6, 0]);
        k.prut(vypln, [x + 6, 0], [x + 12, vyska]);
      }
    }
    uprava?.(k);
  });
}

/**
 * Příhrada pod ocelobetonovou mostovkou: dolní pás v hloubce `hloubka`, krajní šikminy,
 * svislice a diagonály stoupající ke středu. Tlak tu nese mostovka, ocel dole jen táhne.
 */
function podMostovkou(uroven: string, rozpeti: number, hloubka: number, pas: IdPrvku, vypln: IdPrvku): NavrhMostu {
  return navrh(uroven, (k) => {
    vozovka(k, rozpeti);
    k.prut(pas, [0, 0], [6, -hloubka]);
    k.prut(pas, [rozpeti - 6, -hloubka], [rozpeti, 0]);
    for (let x = 6; x < rozpeti - 6; x += 6) k.prut(pas, [x, -hloubka], [x + 6, -hloubka]);
    for (let x = 6; x <= rozpeti - 6; x += 6) k.prut(vypln, [x, 0], [x, -hloubka]);
    for (let x = 6; x < rozpeti - 6; x += 6) {
      const kStredu = x < rozpeti / 2;
      k.prut(vypln, kStredu ? [x, 0] : [x, -hloubka], kStredu ? [x + 6, -hloubka] : [x + 6, 0]);
    }
  });
}

/** Změní prvek prutu, který most mezi dvěma místy už má. */
function zmenPrvek(k: Kreslic, a: [number, number], b: [number, number], prvek: IdPrvku): void {
  const ia = k.bod(a[0], a[1]);
  const ib = k.bod(b[0], b[1]);
  const prut = k.pruty.find((p) => (p.a === ia && p.b === ib) || (p.a === ib && p.b === ia));
  if (!prut) throw new Error(`Mezi ${a.join(",")} a ${b.join(",")} žádný prut není.`);
  prut.prvek = prvek;
}

/** Nohy pilíře ze skály uprostřed údolí (úroveň 3-04) do styčníků mostovky na daných místech. */
function nohy(prvek: IdPrvku, mista: readonly number[]): (k: Kreslic) => void {
  return (k) => {
    for (const x of mista) k.prut(prvek, [24, -10], [x, 0]);
  };
}

// ---- Pomůcky kapitoly 4: pilíře, svary a lana ----

const LANO: IdPrvku = "lano";
const NOSNE: IdPrvku = "lano-nosne";

/** Betonový pilíř od paty k hlavě; `deleni` jsou výšky, ve kterých má mít styčník (díl měří nejvýš 12 m). */
function pilir(k: Kreslic, x: number, pata: number, hlava: number, deleni: readonly number[] = []): void {
  const vysky = [pata, ...deleni, hlava];
  for (let i = 0; i + 1 < vysky.length; i++) {
    for (let y = vysky[i]!; y < vysky[i + 1]!; y += 12) k.prut("pilir", [x, y], [x, Math.min(vysky[i + 1]!, y + 12)]);
  }
}

/**
 * Příhrada jednoho pole mostu mezi x = `od` a x = `po`: pod mostovkou (`hloubka` kladná) nebo
 * nad ní (záporná). Krajní šikminy, pás, svislice a diagonály ke středu pole.
 */
function poleMostu(k: Kreslic, od: number, po: number, hloubka: number, pas: IdPrvku, vypln: IdPrvku): void {
  const y = -hloubka;
  k.prut(pas, [od, 0], [od + 6, y]);
  k.prut(pas, [po - 6, y], [po, 0]);
  for (let x = od + 6; x < po - 6; x += 6) k.prut(pas, [x, y], [x + 6, y]);
  for (let x = od + 6; x <= po - 6; x += 6) k.prut(vypln, [x, 0], [x, y]);
  for (let x = od + 6; x < po - 6; x += 6) {
    const kStredu = x < (od + po) / 2;
    k.prut(vypln, kStredu ? [x, 0] : [x, y], kStredu ? [x + 6, y] : [x + 6, 0]);
  }
}

/**
 * Nastaví napínáky lan v pořadí, v jakém byla lana nakreslena. Hodnoty jsou výsledek
 * automatického dopnutí (`dopniLana`); test hlídá, že pro daný most pořád platí. Bez hodnot
 * zůstanou lana tak, jak je editor pokládá.
 */
function napni(k: Kreslic, predpeti: readonly number[]): void {
  const lana = k.pruty.filter((p) => p.prvek === LANO || p.prvek === NOSNE);
  if (predpeti.length > 0 && predpeti.length !== lana.length) {
    throw new Error(`Most má ${lana.length} lan, ale předpětí je zadáno pro ${predpeti.length}.`);
  }
  lana.forEach((lano, i) => {
    lano.predpeti = predpeti[i] ?? PREDPETI_LANA.vychozi;
  });
}

/** Tři pole po 18 m (úroveň 4-01): mostovka, dva pilíře a pod každým polem (nebo nad ním) příhrada. */
function triPole(hloubka: number, pas: IdPrvku, vypln: IdPrvku, pilire = true): NavrhMostu {
  return navrh("4-01", (k) => {
    vozovka(k, 54);
    if (pilire) for (const x of [18, 36]) pilir(k, x, -12, 0);
    for (const od of [0, 18, 36]) poleMostu(k, od, od + 18, hloubka, pas, vypln);
  });
}

/**
 * Úroveň 4-01 úsporně: z půlky výšky každého pilíře vedou šikmé vzpěry do sousedních styčníků
 * mostovky, takže příhradu potřebují jen krajní pole (nízké věšadlo pod mostovkou).
 */
function vzperyZPiliru(): NavrhMostu {
  return navrh("4-01", (k) => {
    vozovka(k, 54);
    for (const x of [18, 36]) {
      pilir(k, x, -12, 0, [-6]);
      k.prut(O, [x, -6], [x - 6, 0]);
      k.prut(O, [x, -6], [x + 6, 0]);
    }
    for (const od of [0, 42]) {
      k.prut(O, [od, 0], [od + 6, -2]);
      k.prut(O, [od + 6, -2], [od + 12, 0]);
      k.prut(O, [od + 6, 0], [od + 6, -2]);
    }
  });
}

/** Úroveň 4-02: mostovka na pilířích v daných místech, svařená v daných styčnících. */
function ramovy(svary: readonly number[], pilire: readonly number[] = [12, 24, 36], uprava?: (k: Kreslic) => void): NavrhMostu {
  return navrh("4-02", (k) => {
    vozovka(k, 48);
    for (const x of pilire) pilir(k, x, -8, 0);
    for (const x of svary) k.bod(x, 0, { svar: true });
    uprava?.(k);
  });
}

/** Nízké věšadlo pod každým dvanáctimetrovým polem úrovně 4-02. */
function vesadlaPodPoli(k: Kreslic): void {
  for (const od of [0, 12, 24, 36]) {
    k.prut(O, [od, 0], [od + 6, -2]);
    k.prut(O, [od + 6, -2], [od + 12, 0]);
    k.prut(O, [od + 6, 0], [od + 6, -2]);
  }
}

/**
 * Zavěšený most úrovně 4-03: pylon na základu uprostřed údolí s hlavou ve výšce `vrchol`
 * a z ní vějíř lan do styčníků mostovky na místech `lana` (0 a 60 jsou kotevní lana do opěr).
 */
function zaveseny(vrchol: number, lana: readonly number[], predpeti: readonly number[] = []): NavrhMostu {
  return navrh("4-03", (k) => {
    vozovka(k, 60);
    pilir(k, 30, -10, vrchol, [0]);
    for (const x of lana) k.prut(LANO, [30, vrchol], [x, 0]);
    napni(k, predpeti);
  });
}

const VEJIR = [0, 6, 12, 18, 24, 36, 42, 48, 54, 60];

/**
 * Visutý most úrovně 4-04: pylony na březích s hlavou ve výšce `vez`, mezi nimi nosné lano
 * přes body ve výškách `vysky` nad styčníky mostovky (po 6 m), z každého závěs dolů a za pylony
 * kotevní lana do kotev v zemi.
 */
function visuty(
  vysky: readonly number[],
  vez: number,
  predpeti: readonly number[] = [],
  volby: { nosne?: IdPrvku; kotevni?: boolean; svarit?: boolean } = {},
): NavrhMostu {
  const nosne = volby.nosne ?? NOSNE;
  return navrh("4-04", (k) => {
    vozovka(k, 72);
    for (const x of [-4, 76]) pilir(k, x, 0, vez);
    const body: [number, number][] = [[-4, vez], ...vysky.map((y, i): [number, number] => [6 * (i + 1), y]), [76, vez]];
    for (let i = 0; i + 1 < body.length; i++) k.prut(nosne, body[i]!, body[i + 1]!);
    vysky.forEach((y, i) => k.prut(LANO, [6 * (i + 1), y], [6 * (i + 1), 0]));
    if (volby.kotevni !== false) {
      k.prut(nosne, [-4, vez], [-18, 0]);
      k.prut(nosne, [76, vez], [90, 0]);
    }
    if (volby.svarit) for (let x = 6; x < 72; x += 6) k.bod(x, 0, { svar: true });
    napni(k, predpeti);
  });
}

/**
 * Napínáky referenčních mostů s lany, jak je nastavilo automatické dopnutí; v pořadí, v jakém
 * `zaveseny` a `visuty` lana kreslí.
 */
const PREDPETI: Readonly<Record<string, readonly number[]>> = {
  "4-03 pruchod": [0.041, 0.174, 0.146, 0.123, 0.107, 0.109, 0.126, 0.149, 0.176, 0.045],
  "4-03 rozpocet": [0.043, 0.215, 0.174, 0.138, 0.112, 0.115, 0.142, 0.178, 0.218, 0.05],
  "4-03 mistrovska": [0.039, 0.152, 0.132, 0.116, 0.106, 0.107, 0.117, 0.134, 0.153, 0.042],
  "4-03 bez kotevnich": [0.178, 0.15, 0.127, 0.11, 0.106, 0.122, 0.145, 0.172],
  "4-03 nizky": [0.018, 0.303, 0.236, 0.174, 0.123, 0.129, 0.18, 0.241, 0.307, 0.035],
  "4-04 pruchod": [
    0.613, 0.007, -0.938, 0.292, 1.127, 1.148, 1.151, 1.126, 0.293, -0.939, 0.007, 0.613, 0.296, 5.539, 6.437, -3.937,
    -9.068, -2.557, -9.068, -3.937, 6.438, 5.539, 0.296, 0.375, 0.375,
  ],
  "4-04 rozpocet": [
    0.817, -0.773, 0.178, 0.333, 1.015, 1.177, 1.177, 1.015, 0.333, 0.177, -0.773, 0.817, 8.119, 8.226, -0.805, -0.599,
    -12.947, -7.038, -12.947, -0.599, -0.805, 8.226, 8.119, 0.402, 0.402,
  ],
  "4-04 mistrovska": [
    0.656, -0.981, -0.638, 0.143, 0.448, 2.399, 2.399, 0.448, 0.143, -0.638, -0.981, 0.656, 2.619, 5.227, 1.317, -1.978,
    -1.203, -16.086, -1.203, -1.977, 1.317, 5.227, 2.619, 0.317, 0.317,
  ],
  "4-04 slabe": [
    1.425, 0.85, -0.134, 1.082, 1.912, 1.934, 1.936, 1.911, 1.083, -0.134, 0.85, 1.425, 0.295, 5.537, 6.44, -3.925,
    -9.045, -2.529, -9.045, -3.925, 6.44, 5.537, 0.295, 1.583, 1.583,
  ],
};

const OBLOUK_16 = [11, 9, 7, 5, 4, 4, 4, 5, 7, 9, 11];
const OBLOUK_12 = [9, 7, 5, 4, 3, 3, 3, 4, 5, 7, 9];
const OBLOUK_20 = [14, 11, 8, 6, 5, 4, 5, 6, 8, 11, 14];

// ---- Pomůcky kapitoly 6: trať ----

const KOLEJ: IdPrvku = "kolejiste";

/** Kolejiště z polí po šesti metrech od x = `od` do x = `po` ve výšce `y`. */
function kolej(k: Kreslic, od: number, po: number, y = 0): void {
  for (let x = od; x < po; x += 6) k.prut(KOLEJ, [x, y], [x + 6, y]);
}

/**
 * Příhrada jednoho pole trati mezi x = `od` a x = `po` s poli 6 m: nad kolejí (`h` kladné)
 * nebo pod ní (záporné). Krajní šikminy a pás z prvku `pas`, svislice a diagonály z prvku
 * `vypln`; diagonály klesají ke středu pole.
 */
function prihradaTrate(k: Kreslic, od: number, po: number, h: number, pas: IdPrvku, vypln: IdPrvku): void {
  k.prut(pas, [od, 0], [od + 6, h]);
  k.prut(pas, [po - 6, h], [po, 0]);
  for (let x = od + 6; x < po - 6; x += 6) k.prut(pas, [x, h], [x + 6, h]);
  for (let x = od + 6; x <= po - 6; x += 6) k.prut(vypln, [x, 0], [x, h]);
  for (let x = od + 6; x < po - 6; x += 6) {
    const dolu = (x < (od + po) / 2) === h > 0;
    k.prut(vypln, dolu ? [x, h] : [x, 0], dolu ? [x + 6, 0] : [x + 6, h]);
  }
}

/** Železniční most o jednom poli: kolejiště a příhrada nad ním (`h` kladné) nebo pod ním. */
function trat(uroven: string, rozpeti: number, h: number, pas: IdPrvku, vypln: IdPrvku): NavrhMostu {
  return navrh(uroven, (k) => {
    kolej(k, 0, rozpeti);
    if (h !== 0) prihradaTrate(k, 0, rozpeti, h, pas, vypln);
  });
}

/**
 * Viadukt úrovně 6-03: tři pole po 24 m, pod každým lehká příhrada hluboká `hloubka`
 * (0 = žádná), a betonové pilíře na základech v údolí (když `pilire`).
 */
function viadukt(hloubka: number, pilire = true, uprava?: (k: Kreslic) => void): NavrhMostu {
  return navrh("6-03", (k) => {
    kolej(k, 0, 72);
    if (pilire) for (const x of [24, 48]) pilir(k, x, -18, 0, [-6]);
    if (hloubka > 0) for (const od of [0, 24, 48]) prihradaTrate(k, od, od + 24, -hloubka, O, O);
    uprava?.(k);
  });
}

/** Vzpěry z půlky výšky pilířů viaduktu do sousedních styčníků kolejiště. */
function vzperyPiliru(prvek: IdPrvku): (k: Kreslic) => void {
  return (k) => {
    for (const x of [24, 48]) {
      k.prut(prvek, [x, -6], [x - 6, 0]);
      k.prut(prvek, [x, -6], [x + 6, 0]);
    }
  };
}

/**
 * Dvoupatrový most úrovně 6-04: dole kolej, osm metrů nad ní silnice. Mezi patry svislice
 * a diagonály klesající ke středu; `svislice` a `diagonaly` určí prvek podle místa
 * (u diagonály levý konec). Bez nich jsou obě mostovky nespojené.
 */
function dvePatra(svislice?: (x: number) => IdPrvku, diagonaly?: (x: number) => IdPrvku): NavrhMostu {
  return navrh("6-04", (k) => {
    kolej(k, 0, 48);
    for (let x = 0; x < 48; x += 6) k.prut(BETON, [x, 8], [x + 6, 8]);
    if (svislice) for (let x = 6; x <= 42; x += 6) k.prut(svislice(x), [x, 0], [x, 8]);
    if (diagonaly) {
      for (let x = 0; x < 48; x += 6) {
        const kStredu = x < 24;
        k.prut(diagonaly(x), kStredu ? [x, 8] : [x, 0], kStredu ? [x + 6, 0] : [x + 6, 8]);
      }
    }
  });
}

export const RESENI: Readonly<Record<string, ReseniUrovne>> = {
  "1-01": {
    pruchod: navrh("1-01", (k) => {
      mostovka(k, 8, 4);
      vesadlo(k, 8, 2);
    }),
    // Nízké věšadlo má nejkratší pruty.
    rozpocet: navrh("1-01", (k) => {
      mostovka(k, 8, 4);
      vesadlo(k, 8, 1);
    }),
    // Podvěšení: stejné pruty, ale tažené místo tlačených.
    mistrovska: navrh("1-01", (k) => {
      mostovka(k, 8, 4);
      vesadlo(k, 8, -1);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("1-01", (k) => mostovka(k, 8, 4)) },
      {
        nazev: "krokve bez sloupku",
        navrh: navrh("1-01", (k) => {
          mostovka(k, 8, 4);
          k.prut(L, [0, 0], [4, 2]);
          k.prut(L, [4, 2], [8, 0]);
        }),
      },
    ],
  },

  "1-02": {
    pruchod: navrh("1-02", (k) => {
      mostovka(k, 12, 4);
      prihrada(k, 12, 2, L, L);
    }),
    // Dvě vzpěry z kotev ve svazích podepřou oba styčníky mostovky.
    rozpocet: navrh("1-02", (k) => {
      mostovka(k, 12, 4);
      k.prut(L, [2, -3], [4, 0]);
      k.prut(L, [10, -3], [8, 0]);
    }),
    // Kratší pole mostovky: sloupky nad kotvami a malé věšadlo uprostřed.
    mistrovska: navrh("1-02", (k) => {
      mostovka(k, 12, 2);
      k.prut(L, [2, -3], [2, 0]);
      k.prut(L, [2, -3], [4, 0]);
      k.prut(L, [10, -3], [10, 0]);
      k.prut(L, [10, -3], [8, 0]);
      k.prut(L, [4, 0], [6, 1]);
      k.prut(L, [6, 1], [8, 0]);
      k.prut(L, [6, 0], [6, 1]);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("1-02", (k) => mostovka(k, 12, 4)) },
      {
        nazev: "jediná vzpěra",
        navrh: navrh("1-02", (k) => {
          mostovka(k, 12, 4);
          k.prut(L, [2, -3], [4, 0]);
        }),
      },
    ],
  },

  "1-03": {
    pruchod: navrh("1-03", (k) => {
      mostovka(k, 16, 4);
      prihrada(k, 16, 3, L, L);
    }),
    rozpocet: navrh("1-03", (k) => {
      mostovka(k, 16, 4);
      prihrada(k, 16, 2, L, L);
    }),
    // Těžký horní pás se pod autem nevzpírá.
    mistrovska: navrh("1-03", (k) => {
      mostovka(k, 16, 4);
      prihrada(k, 16, 2, T, L);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("1-03", (k) => mostovka(k, 16, 4)) },
      {
        nazev: "příliš plochá lehká příhrada",
        navrh: navrh("1-03", (k) => {
          mostovka(k, 16, 4);
          prihrada(k, 16, 1, L, L);
        }),
      },
    ],
  },

  "1-04": {
    // Vzpěradla a k nim zbytečné věšadlo nad středem: drží, ale je to drahé.
    pruchod: navrh("1-04", (k) => {
      mostovka(k, 24, 4);
      vzperadla(k, L);
      k.prut(L, [8, 0], [12, 2]);
      k.prut(L, [12, 2], [16, 0]);
      k.prut(L, [12, 0], [12, 2]);
    }),
    // Vzpěradla z kotev ve svazích zkrátí rozpětí na třetinu a vystačí si s lehkým dřevem.
    rozpocet: navrh("1-04", (k) => {
      mostovka(k, 24, 4);
      vzperadla(k, L);
    }),
    mistrovska: navrh("1-04", (k) => {
      mostovka(k, 24, 4);
      vzperadla(k, T);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("1-04", (k) => mostovka(k, 24, 4)) },
      {
        nazev: "lehká příhrada přes celé údolí",
        navrh: navrh("1-04", (k) => {
          mostovka(k, 24, 4);
          prihrada(k, 24, 3, L, L);
        }),
      },
    ],
  },

  // Kapitola 2: ocelové lávky. Únosnost tu nerozhoduje; jde o to, na jaké frekvenci most kmitá.

  "2-01": {
    pruchod: lavka("2-01", 24, 4, rovne(24, 4, 2)),
    // Nízká příhrada má nejméně oceli a chodcům stačí.
    rozpocet: lavka("2-01", 24, 4, rovne(24, 4, 1)),
    // Dvoumetrová pole mostovky se pod kroky skoro neprohýbají.
    mistrovska: lavka("2-01", 24, 2, rovne(24, 2, 1)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("2-01", (k) => mostovka(k, 24, 4)) },
      {
        nazev: "horní pás bez diagonál",
        navrh: navrh("2-01", (k) => {
          mostovka(k, 24, 4);
          k.prut(O, [0, 0], [4, 2]);
          k.prut(O, [4, 2], [12, 2]);
          k.prut(O, [12, 2], [20, 2]);
          k.prut(O, [20, 2], [24, 0]);
          for (const x of [4, 12, 20]) k.prut(O, [x, 0], [x, 2]);
        }),
      },
    ],
  },

  "2-02": {
    // Vyšší střed posune vlastní frekvenci mezi krok běžců (3 Hz) a jeho dvojnásobek.
    pruchod: lavka("2-02", 28, 4, [1, 2, 2, 2, 2, 1]),
    rozpocet: lavka("2-02", 28, 4, [1, 1, 2, 2, 1, 1]),
    // Vysoká příhrada s krátkými poli: tuhá jako celek i pod každým doskokem.
    mistrovska: lavka("2-02", 28, 2, rovne(28, 2, 3)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("2-02", (k) => mostovka(k, 28, 4)) },
      { nazev: "nízká příhrada kmitá v rytmu běhu", navrh: lavka("2-02", 28, 4, rovne(28, 4, 1)) },
      { nazev: "dvoumetrová příhrada kmitá na dvojnásobku kroku", navrh: lavka("2-02", 28, 4, rovne(28, 4, 2)) },
    ],
  },

  "2-03": {
    // Výš ani hlouběji než metr stavět nejde; závaží stáhne vlastní frekvenci pod krok útvaru.
    pruchod: lavka("2-03", 32, 4, rovne(32, 4, 1), zavazi([12, 16, 20], 2000)),
    rozpocet: lavka("2-03", 32, 4, rovne(32, 4, 1), zavazi([8, 12, 16, 20, 24], 1000)),
    mistrovska: lavka("2-03", 32, 4, rovne(32, 4, 1), zavazi([4, 8, 12, 16, 20, 24, 28], 2000)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("2-03", (k) => mostovka(k, 32, 4)) },
      { nazev: "nízká příhrada bez závaží", navrh: lavka("2-03", 32, 4, rovne(32, 4, 1)) },
    ],
  },

  "2-04": {
    pruchod: lavka("2-04", 32, 4, rovne(32, 4, 2)),
    // Vyladěná výška: vlastní frekvence mezi kroky útvaru a jejich dvojnásobky.
    rozpocet: lavka("2-04", 32, 4, [1, 1, 2, 2, 2, 1, 1]),
    // Dva tlumiče do kotev ve svazích: most může kmitat v rytmu pochodu, tlumiče to pohltí.
    mistrovska: lavka("2-04", 32, 4, rovne(32, 4, 1), (k) => {
      k.prut("tlumic", [8, 0], [8, -4], { tlumeni: 200_000 });
      k.prut("tlumic", [24, 0], [24, -4], { tlumeni: 200_000 });
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("2-04", (k) => mostovka(k, 32, 4)) },
      { nazev: "nízká příhrada bez tlumičů", navrh: lavka("2-04", 32, 4, rovne(32, 4, 1)) },
      { nazev: "vysoká příhrada kmitá na trojnásobku kroku", navrh: lavka("2-04", 32, 4, rovne(32, 4, 3)) },
    ],
  },

  // ---- Kapitola 3: Okresní silnice ----

  // Okresní silnice, 24 m, dva pruhy. Ocelobetonová mostovka váží sto tun: most nese hlavně
  // sám sebe. Metr vysoká příhrada se zlomí dřív, než na ni kdo vjede.
  "3-01": {
    pruchod: silnicni("3-01", 24, 3, O, O),
    rozpocet: silnicni("3-01", 24, 2, O, O),
    mistrovska: silnicni("3-01", 24, 4, O, O),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("3-01", (k) => vozovka(k, 24)) },
      { nazev: "metr vysoká příhrada neunese ani sebe", navrh: silnicni("3-01", 24, 1, O, O) },
    ],
  },

  // Pod vedením, 36 m, výš než tři metry stavět nejde. Tlačený horní pás z lehkého profilu
  // nestačí; těžký ano. Výplň a tažená mostovka těžký profil nepotřebují.
  "3-02": {
    pruchod: silnicni("3-02", 36, 3, TO, TO),
    rozpocet: silnicni("3-02", 36, 2, TO, O),
    mistrovska: silnicni("3-02", 36, 3, TO, O),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("3-02", (k) => vozovka(k, 36)) },
      { nazev: "horní pás z lehkého profilu", navrh: silnicni("3-02", 36, 3, O, O) },
      { nazev: "dvanáctimetrový horní pás z lehkého profilu se vzpírá", navrh: silnicni("3-02", 36, 3, O, O, 12) },
    ],
  },

  // Linka přes rokli, 30 m, autobusy v obou směrech po nové vozovce. Pod mostem je místa dost:
  // příhrada pod mostovkou tlačí do betonu, který tlak umí, a ocel jen táhne. Stejná příhrada
  // nad mostovkou má tlačený ocelový pás a je zhruba dvakrát víc namáhaná. Cestující
  // v autobusu poznají, jak moc se most prohýbá: mistrovská medaile chce hlubokou příhradu.
  "3-03": {
    pruchod: silnicni("3-03", 30, 3, O, O),
    rozpocet: podMostovkou("3-03", 30, 2, O, O),
    mistrovska: podMostovkou("3-03", 30, 4, O, O),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("3-03", (k) => vozovka(k, 30)) },
      { nazev: "metr vysoká příhrada nad mostovkou", navrh: silnicni("3-03", 30, 1, O, O) },
    ],
  },

  // Kolona, 2 × 24 m se skálou uprostřed. Oba konce leží na posuvných ložiskách, pevný bod
  // je jen na skále: nohy pilíře nesou půlku mostu a k tomu brzdnou sílu čtyř nákladních aut.
  "3-04": {
    pruchod: silnicni("3-04", 48, 4, O, O, 6, nohy(TO, [18, 30])),
    rozpocet: silnicni("3-04", 48, 2, O, O, 6, nohy(TO, [18, 30])),
    // Nejvíc namáhané jsou tlačené diagonály u pilíře; z těžkého profilu mají rezervu.
    mistrovska: silnicni("3-04", 48, 4, O, O, 6, (k) => {
      nohy(TO, [18, 30])(k);
      zmenPrvek(k, [12, 4], [18, 0], TO);
      zmenPrvek(k, [30, 0], [36, 4], TO);
    }),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("3-04", (k) => vozovka(k, 48)) },
      { nazev: "příhrada bez pilíře", navrh: silnicni("3-04", 48, 4, O, O) },
      { nazev: "pilíř z lehkého profilu", navrh: silnicni("3-04", 48, 4, O, O, 6, nohy(O, [18, 30])) },
    ],
  },

  // ---- Kapitola 4: Údolí ----

  // Tři pole, 54 m se dvěma pilíři v řece. Pilíře rozdělí most na tři pole po 18 m; ohyb roste
  // s druhou mocninou rozpětí, takže každé pole unese lehká příhrada. Bez pilířů by 54 m
  // potřebovalo těžkou šestimetrovou příhradu, která se do rozpočtu nevejde.
  "4-01": {
    pruchod: triPole(-3, O, O),
    // Šikmé vzpěry z půlky pilíře podepřou sousední styčníky mostovky a ušetří příhradu středních polí.
    rozpocet: vzperyZPiliru(),
    // Příhrada pod mostovkou: tlak nese beton, ocel jen táhne.
    mistrovska: triPole(3, O, O),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("4-01", (k) => vozovka(k, 54)) },
      {
        nazev: "mostovka na pilířích bez příhrad",
        navrh: navrh("4-01", (k) => {
          vozovka(k, 54);
          for (const x of [18, 36]) pilir(k, x, -12, 0);
        }),
      },
      { nazev: "lehké příhrady bez pilířů", navrh: triPole(3, O, O, false) },
    ],
  },

  // Bez jediné vzpěry, 48 m se třemi pilíři; nad vozovkou se stavět nesmí. Mostovka z kloubově
  // spojených polí je mezi pilíři mechanismus. Svary z ní udělají spojitý nosník, který se
  // obejde bez příhrady; svařená i nad pilíři se o ně opře jako rám a ohyb v polích klesne.
  "4-02": {
    pruchod: ramovy([6, 18, 30, 42]),
    rozpocet: ramovy([6, 18, 30, 42]),
    mistrovska: ramovy([6, 12, 18, 24, 30, 36, 42]),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("4-02", (k) => vozovka(k, 48)) },
      { nazev: "mostovka na pilířích bez svarů", navrh: ramovy([]) },
      { nazev: "svary jen nad pilíři", navrh: ramovy([12, 24, 36]) },
      { nazev: "svařená mostovka bez středního pilíře", navrh: ramovy([6, 12, 18, 24, 30, 36, 42], [12, 36]) },
    ],
  },

  // Na lanech, 60 m s jedním základem uprostřed. Zavěšený most: z hlavy pylonu vějíř lan do
  // mostovky. Kotevní lana do opěr drží hlavu pylonu, když je zatížená jen půlka mostu; bez
  // nich se pylon ohne a zlomí. Vyšší pylon znamená strmější lana a menší síly, nižší je levnější.
  "4-03": {
    pruchod: zaveseny(16, VEJIR, PREDPETI["4-03 pruchod"]),
    rozpocet: zaveseny(12, VEJIR, PREDPETI["4-03 rozpocet"]),
    mistrovska: zaveseny(20, VEJIR, PREDPETI["4-03 mistrovska"]),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("4-03", (k) => vozovka(k, 60)) },
      { nazev: "pylon bez lan", navrh: zaveseny(16, []) },
      { nazev: "bez kotevních lan", navrh: zaveseny(16, VEJIR.slice(1, -1), PREDPETI["4-03 bez kotevnich"]) },
      { nazev: "příliš nízký pylon", navrh: zaveseny(8, VEJIR, PREDPETI["4-03 nizky"]) },
    ],
  },

  // Náklad století, 72 m přes rokli, 120 t na podvalníku. Visutý most: nosné lano přes pylony
  // na březích, kotvené do země, a z něj závěsy k mostovce. Nosné lano se pod tíhou vyrovná do
  // oblouku samo; závěsy se mu musí přizpůsobit délkou, jinak se mostovka prověsí o desítky
  // centimetrů (automatické dopnutí). Vyšší pylony a větší průvěs zmenší tah v laně.
  "4-04": {
    pruchod: visuty(OBLOUK_16, 16, PREDPETI["4-04 pruchod"]),
    rozpocet: visuty(OBLOUK_12, 12, PREDPETI["4-04 rozpocet"]),
    mistrovska: visuty(OBLOUK_20, 20, PREDPETI["4-04 mistrovska"]),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("4-04", (k) => vozovka(k, 72)) },
      { nazev: "nedopnutá lana", navrh: visuty(OBLOUK_16, 16) },
      { nazev: "závěsné lano místo nosného", navrh: visuty(OBLOUK_16, 16, PREDPETI["4-04 slabe"], { nosne: LANO }) },
      { nazev: "bez kotevních lan", navrh: visuty(OBLOUK_16, 16, [], { kotevni: false }) },
    ],
  },

  // ---- Kapitola 5: Lávka II ----

  // Nábřeží, 48 m, dav 120 lidí. Prázdná dvoumetrová příhrada kmitá na 2,3 Hz, nad pásmem
  // kroků davu; s lidmi klesne na 2,0 Hz, přímo do něj. Třímetrová je i s lidmi nad pásmem.
  "5-01": {
    pruchod: lavka("5-01", 48, 4, rovne(48, 4, 4)),
    rozpocet: lavka("5-01", 48, 4, rovne(48, 4, 3)),
    // Dvoumetrová pole mostovky nedrnčí pod jednotlivými kroky.
    mistrovska: lavka("5-01", 48, 2, rovne(48, 2, 3)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("5-01", (k) => mostovka(k, 48, 4)) },
      { nazev: "dvoumetrová příhrada: prázdná mimo pásmo, s lidmi v něm", navrh: lavka("5-01", 48, 4, rovne(48, 4, 2)) },
    ],
  },

  // Městský běh, 32 m, 40 běžců kolem 2,6 Hz. Výš než metr stavět nejde a nízká příhrada
  // kmitá s běžci na 2,5 Hz, uprostřed jejich pásma. Pomůže jen laděný tlumič.
  "5-02": {
    pruchod: lavka("5-02", 32, 4, rovne(32, 4, 1), tlumice([16], 600, 2.5)),
    rozpocet: lavka("5-02", 32, 4, rovne(32, 4, 1), tlumice([16], 300, 2.5)),
    mistrovska: lavka("5-02", 32, 2, rovne(32, 2, 1), tlumice([16], 1000, 2.5)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("5-02", (k) => mostovka(k, 32, 4)) },
      { nazev: "nízká příhrada bez tlumiče", navrh: lavka("5-02", 32, 4, rovne(32, 4, 1)) },
      { nazev: "krátká pole mostovky bez tlumiče", navrh: lavka("5-02", 32, 2, rovne(32, 2, 1)) },
    ],
  },

  // Slavnost, 36 m, průvod 48 lidí s kapelou v taktu 2,0 Hz. Prázdný most kmitá na 2,2 Hz,
  // s průvodem na 2,0 Hz: tlumič se ladí na most s lidmi.
  "5-03": {
    pruchod: lavka("5-03", 36, 4, rovne(36, 4, 1), tlumice([16], 600, 2)),
    rozpocet: lavka("5-03", 36, 4, rovne(36, 4, 1), tlumice([16], 400, 2)),
    mistrovska: lavka("5-03", 36, 4, rovne(36, 4, 1), tlumice([16], 1200, 2)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("5-03", (k) => mostovka(k, 36, 4)) },
      { nazev: "nízká příhrada bez tlumiče", navrh: lavka("5-03", 36, 4, rovne(36, 4, 1)) },
      { nazev: "tlumič naladěný daleko od mostu", navrh: lavka("5-03", 36, 4, rovne(36, 4, 1), tlumice([16], 1200, 3.2)) },
    ],
  },

  // Koncert na mostě, 32 m, 30 lidí skáče v rytmu 2,2 Hz. Skákání budí i na dvojnásobku
  // a trojnásobku rytmu; dvoumetrová příhrada s lidmi kmitá na 4,5 Hz, přímo na dvojnásobku.
  // Tlumič se ladí na 4,4 Hz a mostovka musí mít krátká pole, jinak drnčí sama.
  "5-04": {
    pruchod: lavka("5-04", 32, 2, rovne(32, 2, 2), tlumice([16], 1000, 4.4)),
    rozpocet: lavka("5-04", 32, 2, rovne(32, 2, 2), tlumice([16], 700, 4.4)),
    mistrovska: lavka("5-04", 32, 2, rovne(32, 2, 2), tlumice([14, 18], 1000, 4.4)),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("5-04", (k) => mostovka(k, 32, 4)) },
      { nazev: "dvoumetrová příhrada bez tlumiče", navrh: lavka("5-04", 32, 2, rovne(32, 2, 2)) },
      { nazev: "dlouhá pole mostovky", navrh: lavka("5-04", 32, 4, rovne(32, 4, 2), tlumice([16], 1000, 4.4)) },
    ],
  },
  // ---- Kapitola 6: Trať ----

  // První vlak, 30 m: lokomotiva (88 t) a tři ložené vozy po 90 t. Vlak je delší než most
  // a zatíží ho celý najednou, přes šest tun na metr. Pod mostem se stavět nesmí. Lehká
  // příhrada to unese od tří metrů výšky; nižší vybočí v tlačeném pásu.
  "6-01": {
    pruchod: trat("6-01", 30, 5, O, O),
    rozpocet: trat("6-01", 30, 3, O, O),
    // Tlačený horní pás a krajní šikminy z těžkého profilu mají ve vzpěru velkou rezervu.
    mistrovska: trat("6-01", 30, 3, TO, O),
    pady: [
      { nazev: "jen kolejiště", navrh: trat("6-01", 30, 0, O, O) },
      { nazev: "dvoumetrová příhrada z lehké oceli", navrh: trat("6-01", 30, 2, O, O) },
    ],
  },

  // Rychlík, 36 m, stovkou; nad kolejí je trolej, staví se jen pod ní. Unést vlak je snadné,
  // jde o tuhost: mělký most se pod vozem prohne a cestující to cítí. Šestimetrová příhrada
  // se prohne o milimetry.
  "6-02": {
    pruchod: trat("6-02", 36, -3, O, O),
    rozpocet: trat("6-02", 36, -2, O, O),
    mistrovska: trat("6-02", 36, -6, O, O),
    pady: [
      { nazev: "jen kolejiště", navrh: trat("6-02", 36, 0, O, O) },
      { nazev: "metrová příhrada", navrh: trat("6-02", 36, -1, O, O) },
    ],
  },

  // Uhelný vlak, viadukt 72 m na dvou vysokých pilířích, oba konce na posuvných ložiskách.
  // Vlak s deseti loženými vozy na mostě nouzově zabrzdí a tlačí ho dopředu pětinou své tíhy;
  // tu sílu nesou jen pilíře. Samotné se ohnou a zlomí. Pomůže svar hlavy pilíře s kolejištěm
  // (rám), nebo vzpěry z půlky pilíře do kolejiště (trojúhelník).
  "6-03": {
    pruchod: viadukt(3, true, vzperyPiliru(O)),
    rozpocet: viadukt(3, true, (k) => {
      for (const x of [24, 48]) k.bod(x, 0, { svar: true });
    }),
    mistrovska: viadukt(3, true, vzperyPiliru(TO)),
    pady: [
      { nazev: "jen kolejiště", navrh: viadukt(0, false) },
      { nazev: "kolejiště na pilířích bez příhrad", navrh: viadukt(0) },
      { nazev: "příhrady bez pilířů", navrh: viadukt(4, false) },
      { nazev: "pilíře bez vzpěr a svarů", navrh: viadukt(3) },
    ],
  },

  // Dvě patra, 48 m: dole kolej s nákladním vlakem, osm metrů nad ní silnice. Dvě mostovky
  // nad sebou jsou pásy jedné vysoké příhrady; stačí je spojit svislicemi a diagonálami.
  // Svislice u podpor jsou tlačené a osm metrů dlouhé: z lehkého profilu vybočí.
  "6-04": {
    pruchod: dvePatra((x) => (x === 6 || x === 42 ? TO : O), () => O),
    rozpocet: dvePatra((x) => (x === 6 || x === 42 ? TO : O), () => O),
    mistrovska: dvePatra((x) => (x <= 12 || x >= 36 ? TO : O), (x) => (x === 0 || x === 42 ? TO : O)),
    pady: [
      { nazev: "jen dvě mostovky", navrh: dvePatra() },
      { nazev: "jen svislice, bez diagonál", navrh: dvePatra(() => O) },
    ],
  },
};
