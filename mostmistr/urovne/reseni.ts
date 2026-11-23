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
function prihrada(k: Kreslic, rozpeti: number, h: number, pas: IdPrvku, vypln: IdPrvku, krajni: IdPrvku = pas): void {
  const pole = 4;
  k.prut(krajni, [0, 0], [pole, h]);
  k.prut(krajni, [rozpeti - pole, h], [rozpeti, 0]);
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

/** Styčníky mostovky po stejných polích: 0, pole, 2 × pole, … až rozpětí. */
function poPolich(rozpeti: number, pole: number): number[] {
  return Array.from({ length: rozpeti / pole + 1 }, (_, i) => i * pole);
}

/** Stejně vysoké vrcholy nad styčníky mostovky `mista`. */
function vrcholy(mista: readonly number[], vyska: number): [number, number][] {
  return mista.map((x) => [x, vyska]);
}

/**
 * Lehká ocelová lávka: dřevěná mostovka přes styčníky `xs` (první a poslední jsou opěry)
 * a nad ní příhrada, která má svislici jen nad některými styčníky mostovky. `horni` jsou
 * horní styčníky ([x, výška]); spojuje je horní pás a každý stojí na svislici. Styčník
 * mostovky bez svislice drží diagonály k nejbližšímu hornímu styčníku vlevo a vpravo
 * (krajní jen k jednomu) a opěru prut k nejbližšímu hornímu styčníku.
 *
 * Proti příhradě se svislicí nad každým styčníkem (`lavka`) ušetří zhruba desetinu oceli;
 * ušetřené peníze jdou na to, co úroveň učí (kratší pole mostovky, závaží, tlumiče), a most
 * pro mistrovskou medaili se tak vejde do inženýrského rozpočtu.
 */
function lehkaLavka(
  uroven: string,
  xs: readonly number[],
  horni: readonly (readonly [number, number])[],
  uprava?: (k: Kreslic) => void,
): NavrhMostu {
  return navrh(uroven, (k) => {
    for (let i = 0; i + 1 < xs.length; i++) k.prut("mostovka-drevo", [xs[i]!, 0], [xs[i + 1]!, 0]);
    for (let i = 0; i + 1 < horni.length; i++) k.prut(O, [horni[i]![0], horni[i]![1]], [horni[i + 1]![0], horni[i + 1]![1]]);
    for (const [x, h] of horni) k.prut(O, [x, 0], [x, h]);
    for (const x of xs) {
      if (horni.some(([hx]) => hx === x)) continue;
      const vlevo = horni.filter(([hx]) => hx < x).at(-1);
      const vpravo = horni.find(([hx]) => hx > x);
      if (vlevo) k.prut(O, [x, 0], [vlevo[0], vlevo[1]]);
      if (vpravo) k.prut(O, [x, 0], [vpravo[0], vpravo[1]]);
    }
    uprava?.(k);
  });
}

/** Věšadlo: dvě krokve do vrcholu nad (nebo pod) středem a sloupek ke styčníku mostovky. */
function vesadlo(k: Kreslic, rozpeti: number, h: number): void {
  const stred = rozpeti / 2;
  k.prut(L, [0, 0], [stred, h]);
  k.prut(L, [stred, h], [rozpeti, 0]);
  k.prut(L, [stred, 0], [stred, h]);
}

/**
 * Vzpěradla z kotev ve svazích hlubokého údolí (úroveň 1-04) z lehkého trámu. Uzel vzpěradla
 * leží `hloubka` metrů pod styčníkem mostovky x = 8 (a 16); sloup nad kotvou je z prvku `sloup`.
 * S `rozpera` je sloup rozdělený v půli výšky a opřený rozpěrou o uzel vzpěradla, takže se
 * vzpírá na třech metrech místo šesti.
 */
function vzperadla(k: Kreslic, hloubka: number, sloup: IdPrvku, rozpera = false): void {
  for (const [kotva, vnitrni] of [
    [4, 8],
    [20, 16],
  ] as const) {
    if (rozpera) {
      k.prut(sloup, [kotva, -6], [kotva, -3]);
      k.prut(sloup, [kotva, -3], [kotva, 0]);
      k.prut(L, [kotva, -3], [vnitrni, -hloubka]);
    } else {
      k.prut(sloup, [kotva, -6], [kotva, 0]);
    }
    k.prut(L, [kotva, -6], [vnitrni, -hloubka]);
    k.prut(L, [vnitrni, -hloubka], [vnitrni, 0]);
    k.prut(L, [vnitrni, -hloubka], [12, 0]);
    k.prut(L, [kotva, 0], [vnitrni, -hloubka]);
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

/**
 * Silniční most s lomeným horním pásem: `vysky[i]` je výška pásu nad i-tým vnitřním styčníkem
 * mostovky (pole 6 m). Svislice a diagonály z prvku `vypln`; diagonály klesají ke středu.
 * Nižší krajní styčníky zkrátí svislice a šikminy u opěr, kde je příhrada namáhaná nejmíň.
 */
function polygonalni(uroven: string, rozpeti: number, vysky: readonly number[], pas: IdPrvku, vypln: IdPrvku): NavrhMostu {
  return navrh(uroven, (k) => {
    vozovka(k, rozpeti);
    const body: [number, number][] = [[0, 0], ...vysky.map((h, i): [number, number] => [6 * (i + 1), h]), [rozpeti, 0]];
    for (let i = 0; i + 1 < body.length; i++) k.prut(pas, body[i]!, body[i + 1]!);
    for (const [x, h] of body.slice(1, -1)) k.prut(vypln, [x, 0], [x, h]);
    for (let i = 1; i + 2 < body.length; i++) {
      const [xa, ha] = body[i]!;
      const [xb, hb] = body[i + 1]!;
      if (xa < rozpeti / 2) k.prut(vypln, [xa, ha], [xb, 0]);
      else k.prut(vypln, [xa, 0], [xb, hb]);
    }
  });
}

/** Nohy pilíře ze skály uprostřed údolí (úroveň 3-04) do styčníků mostovky na daných místech. */
function nohy(prvek: IdPrvku, mista: readonly number[]): (k: Kreslic) => void {
  return (k) => {
    for (const x of mista) k.prut(prvek, [24, -10], [x, 0]);
  };
}

/**
 * Úroveň 3-04 úsporně: každé krajní pole (0–18 a 30–48) nese příhrada pod mostovkou, která se
 * k noze pilíře prohlubuje (`hloubky` pásu pod styčníky 6, 12 a 18 m od opěry). Ze spodku
 * náběhu vede vzpěra do středu mostu, takže střední pole příhradu nepotřebuje. Diagonály
 * krajních polí jsou tažené: v poli u opěry z mostovky dolů ke středu pole, v poli u pilíře
 * z pásu nahoru k noze. Nohy pilíře z těžkého profilu vedou ze skály do styčníků 18 a 30.
 */
function sNabehy(hloubky: readonly [number, number, number]): NavrhMostu {
  return navrh("3-04", (k) => {
    vozovka(k, 48);
    for (const strana of [1, -1]) {
      const X = (x: number): number => (strana === 1 ? x : 48 - x);
      const pas: [number, number][] = [
        [X(0), 0],
        [X(6), -hloubky[0]],
        [X(12), -hloubky[1]],
        [X(18), -hloubky[2]],
      ];
      for (let i = 0; i + 1 < pas.length; i++) k.prut(O, pas[i]!, pas[i + 1]!);
      for (const [x, y] of pas.slice(1)) k.prut(O, [x, 0], [x, y]);
      k.prut(O, [X(6), 0], pas[2]!);
      k.prut(O, pas[2]!, [X(18), 0]);
      k.prut(O, pas[3]!, [24, 0]);
    }
    nohy(TO, [18, 30])(k);
  });
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

/**
 * Úroveň 4-01 s rezervou: stejné šikmé vzpěry z půlky pilíře, ale každá je ve třetině délky
 * přichycená dvoumetrovou rozpěrou k pilíři. Vzpěra se tím rozdělí na kratší kusy a ve vzpěru
 * unese víc; rozpěra sama skoro nic nenese.
 */
function ztuzeneVzpery(): NavrhMostu {
  return navrh("4-01", (k) => {
    vozovka(k, 54);
    for (const x of [18, 36]) {
      pilir(k, x, -12, 0, [-6, -4]);
      for (const strana of [-1, 1]) {
        k.prut(O, [x, -6], [x + 2 * strana, -4]);
        k.prut(O, [x + 2 * strana, -4], [x + 6 * strana, 0]);
        k.prut(O, [x + 2 * strana, -4], [x, -4]);
      }
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

/** Místo pylonu v úrovni 4-03: základ leží o jedno pole vlevo od středu údolí. */
const X_PYLONU = 24;
/** Lana z hlavy pylonu do všech styčníků mostovky mimo pylon; 0 a 60 jsou kotevní lana do opěr. */
const LANA_VSE = [0, 6, 12, 18, 30, 36, 42, 48, 54, 60];
/** Totéž bez lana do pravé opěry: u nesouměrného mostu skoro nic nenese. */
const LANA_BEZ_PRAVE_OPERY = LANA_VSE.slice(0, -1);

/**
 * Zavěšený most úrovně 4-03: pylon na základu v x = 24 s hlavou ve výšce `vrchol` a z ní lana
 * do styčníků mostovky na místech `lana`. Most je nesouměrný (24 m a 36 m): delší pole táhne
 * hlavu pylonu k sobě už vlastní tíhou a drží ji jen kotevní lano do levé opěry. S `druheKotevni`
 * vede do levé opěry ještě jedno kotevní lano z pylonu dva metry pod hlavou.
 */
function zaveseny(vrchol: number, lana: readonly number[], predpeti: readonly number[] = [], druheKotevni = false): NavrhMostu {
  return navrh("4-03", (k) => {
    vozovka(k, 60);
    pilir(k, X_PYLONU, -10, vrchol, druheKotevni ? [0, vrchol - 2] : [0]);
    for (const x of lana) k.prut(LANO, [X_PYLONU, vrchol], [x, 0]);
    if (druheKotevni) k.prut(LANO, [X_PYLONU, vrchol - 2], [0, 0]);
    napni(k, predpeti);
  });
}

/** Kopie mostu, ve které mají všechna lana výchozí předpětí: hráč na napínáky nesáhl. */
function nedopnuty(most: NavrhMostu): NavrhMostu {
  return { ...most, pruty: most.pruty.map((p) => (p.prvek === LANO || p.prvek === NOSNE ? { ...p, predpeti: PREDPETI_LANA.vychozi } : p)) };
}

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
  "4-03 pruchod": [0.436, 0.158, 0.129, 0.11, 0.113, 0.134, 0.163, 0.196, 0.231, -0.168],
  "4-03 rozpocet": [0.449, 0.165, 0.133, 0.111, 0.115, 0.139, 0.171, 0.207, 0.246],
  "4-03 mistrovska": [0.299, 0.163, 0.131, 0.109, 0.117, 0.141, 0.173, 0.209, 0.247, 0.181],
  "4-03 bez kotevnich": [-0.767, -0.818, -0.586, 0.821, 1.104, 1.114, 1.049, 0.981],
  "4-03 nizky": [0.672, 0.235, 0.172, 0.121, 0.135, 0.186, 0.246, 0.311, 0.379, -0.246],
  "4-04 pruchod": [
    0.613, 0.007, -0.938, 0.292, 1.127, 1.148, 1.151, 1.126, 0.293, -0.939, 0.007, 0.613, 0.296, 5.539, 6.437, -3.937,
    -9.068, -2.557, -9.068, -3.937, 6.438, 5.539, 0.296, 0.375, 0.375,
  ],
  "4-04 rozpocet": [
    0.817, -0.773, 0.178, 0.333, 1.015, 1.177, 1.177, 1.015, 0.333, 0.177, -0.773, 0.817, 8.119, 8.226, -0.805, -0.599,
    -12.947, -7.038, -12.947, -0.599, -0.805, 8.226, 8.119, 0.402, 0.402,
  ],
  "4-04 mistrovska": [
    0.124, 0.429, 0.927, 0.839, 0.216, -0.033, -0.033, 0.216, 0.839, 0.927, 0.429, 0.124, 2.275, -4.521, -8.431, 7.123,
    -2.77, 36.759, -2.771, 7.122, -8.432, -4.521, 2.275, 0.356, 0.356,
  ],
  "4-04 slabe": [
    1.425, 0.85, -0.134, 1.082, 1.912, 1.934, 1.936, 1.911, 1.083, -0.134, 0.85, 1.425, 0.295, 5.537, 6.44, -3.925,
    -9.045, -2.529, -9.045, -3.925, 6.44, 5.537, 0.295, 1.583, 1.583,
  ],
};

const OBLOUK_16 = [11, 9, 7, 5, 4, 4, 4, 5, 7, 9, 11];
const OBLOUK_12 = [9, 7, 5, 4, 3, 3, 3, 4, 5, 7, 9];
/** Nosné lano mostu pro mistrovskou: věže 13 m a průvěs až metr nad mostovku. */
const OBLOUK_13 = [8, 5, 3, 2, 1, 1, 1, 2, 3, 5, 8];

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
export function trat(uroven: string, rozpeti: number, h: number, pas: IdPrvku, vypln: IdPrvku): NavrhMostu {
  return navrh(uroven, (k) => {
    kolej(k, 0, rozpeti);
    if (h !== 0) prihradaTrate(k, 0, rozpeti, h, pas, vypln);
  });
}

/**
 * Trojúhelníková (Warrenova) příhrada nad kolejí bez svislic: horní styčníky leží nad středy
 * šestimetrových polí koleje ve výškách `vysky`, šikminy z nich vedou do obou sousedních
 * styčníků koleje. Krajní šikminy jsou strmé a krátké, takže se nevzpírají tak snadno jako
 * dlouhá krajní šikmina příhrady se svislicemi; nižší kraje šetří ocel.
 */
function trojuhelnikova(uroven: string, rozpeti: number, vysky: readonly number[]): NavrhMostu {
  return navrh(uroven, (k) => {
    kolej(k, 0, rozpeti);
    vysky.forEach((h, i) => {
      const x = 6 * i;
      k.prut(O, [x, 0], [x + 3, h]);
      k.prut(O, [x + 3, h], [x + 6, 0]);
      if (i + 1 < vysky.length) k.prut(O, [x + 3, h], [x + 9, vysky[i + 1]!]);
    });
  });
}

/**
 * Příhrada pod kolejí úrovně 6-02 se třemi dolními styčníky: dva boční v `x1` a 36 − `x1`
 * v hloubce `d1`, střední v hloubce `d2`. Dolní pás a krajní táhla jsou tažené, takže smějí
 * být dlouhé; každý styčník koleje drží jedna vzpěra. Proti příhradě se svislicemi v každém
 * poli je v ní o třetinu méně oceli a smí proto být hlubší.
 */
function triStycniky(x1: number, d1: number, d2: number): NavrhMostu {
  return navrh("6-02", (k) => {
    kolej(k, 0, 36);
    const levy: [number, number] = [x1, -d1];
    const stred: [number, number] = [18, -d2];
    const pravy: [number, number] = [36 - x1, -d1];
    k.prut(O, [0, 0], levy);
    k.prut(O, levy, stred);
    k.prut(O, stred, pravy);
    k.prut(O, pravy, [36, 0]);
    k.prut(O, levy, [6, 0]);
    k.prut(O, levy, [12, 0]);
    k.prut(O, stred, [12, 0]);
    k.prut(O, stred, [18, 0]);
    k.prut(O, stred, [24, 0]);
    k.prut(O, pravy, [24, 0]);
    k.prut(O, pravy, [30, 0]);
  });
}

/**
 * Viadukt úrovně 6-03: tři pole po 24 m, pod každým příhrada hluboká `hloubka` (0 = žádná)
 * s pásy z prvku `pas`, a betonové pilíře na základech v údolí (když `pilire`). Pilíř má
 * styčníky ve výškách `deleni`; v půlce výšky ho editor dělí sám.
 */
function viadukt(
  hloubka: number,
  pilire = true,
  uprava?: (k: Kreslic) => void,
  pas: IdPrvku = O,
  deleni: readonly number[] = [-9],
): NavrhMostu {
  return navrh("6-03", (k) => {
    kolej(k, 0, 72);
    if (pilire) for (const x of [24, 48]) pilir(k, x, -18, 0, deleni);
    if (hloubka > 0) for (const od of [0, 24, 48]) prihradaTrate(k, od, od + 24, -hloubka, pas, O);
    uprava?.(k);
  });
}

/**
 * Lehká vzpěra z půlky každého pilíře viaduktu (výška −9) šikmo proti směru jízdy do dolního
 * styčníku příhrady sousedního pole (o šest metrů dřív, v hloubce `hloubka`). Brzdící vlak
 * tlačí most dopředu; vzpěra tu sílu svede do půlky pilíře a ohyb pilíře klesne na polovinu.
 * Do pásu příhrady je to blíž než do kolejiště, takže stačí lehký profil. S `rozperka`
 * (jen pro hloubku 3, kde půlka vzpěry leží na rastru) má vzpěra styčník v půlce délky a
 * krátká rozpěrka ho drží u pilíře: vzpěrná délka je poloviční.
 */
function vzperyDoPasu(hloubka: number, rozperka: boolean): (k: Kreslic) => void {
  return (k) => {
    for (const x of [24, 48]) {
      if (!rozperka) {
        k.prut(O, [x, -9], [x - 6, -hloubka]);
        continue;
      }
      k.prut(O, [x, -9], [x - 3, -6]);
      k.prut(O, [x - 3, -6], [x - 6, -hloubka]);
      k.prut(O, [x - 3, -6], [x, -6]);
    }
  };
}

/** Svar hlav obou pilířů viaduktu s kolejištěm. */
function svarHlav(k: Kreslic): void {
  for (const x of [24, 48]) k.bod(x, 0, { svar: true });
}

/** Vzpěry z půlky výšky pilířů viaduktu do sousedních styčníků kolejiště; `svar` svaří i hlavy pilířů. */
function vzperyPiliru(prvek: IdPrvku, svar = false): (k: Kreslic) => void {
  return (k) => {
    for (const x of [24, 48]) {
      k.prut(prvek, [x, -9], [x - 6, 0]);
      k.prut(prvek, [x, -9], [x + 6, 0]);
      if (svar) k.bod(x, 0, { svar: true });
    }
  };
}

/**
 * Dvoupatrový most úrovně 6-04: dole kolej, devět metrů nad ní silnice. Mezi patry svislice
 * a diagonály klesající ke středu; `svislice` a `diagonaly` určí prvek podle místa
 * (u diagonály levý konec). Bez nich jsou obě mostovky nespojené.
 */
function dvePatra(svislice?: (x: number) => IdPrvku, diagonaly?: (x: number) => IdPrvku): NavrhMostu {
  return navrh("6-04", (k) => {
    kolej(k, 0, 48);
    for (let x = 0; x < 48; x += 6) k.prut(BETON, [x, 9], [x + 6, 9]);
    if (svislice) for (let x = 6; x <= 42; x += 6) k.prut(svislice(x), [x, 0], [x, 9]);
    if (diagonaly) {
      for (let x = 0; x < 48; x += 6) {
        const kStredu = x < 24;
        k.prut(diagonaly(x), kStredu ? [x, 9] : [x, 0], kStredu ? [x + 6, 0] : [x + 6, 9]);
      }
    }
  });
}

// ---- Pohyblivé mosty (kapitola 7) ----

const OCELOVA: IdPrvku = "mostovka-ocel";

/** Co má sklopný most mít; výchozí je všechno. */
interface VybavaKridla {
  /** Svařit styčníky mostovky uvnitř křídla. */
  svar?: boolean;
  zamek?: boolean;
  /** Vzpěra z čepu vzhůru a táhlo ke konci křídla: výška vrcholu nad mostovkou, 0 bez nich. */
  trojuhelnik?: number;
}

/**
 * Křídlo sklopného mostu: ocelová mostovka od čepu `cep` k volnému konci `konec` po polích
 * dlouhých `pole` (poslední smí být kratší), píst z kotvy `hloubka` metrů pod čepem do
 * styčníku `kam` metrů od čepu.
 */
function kridlo(
  k: Kreslic,
  cep: number,
  konec: number,
  pole: number,
  pist: { hloubka: number; kam: number; zdvih: number } | null,
  vybava: VybavaKridla = {},
): void {
  const smer = konec > cep ? 1 : -1;
  const delka = Math.abs(konec - cep);
  for (let od = 0; od < delka; od += pole) {
    const po = Math.min(delka, od + pole);
    k.prut(OCELOVA, [cep + smer * od, 0], [cep + smer * po, 0]);
    if (od > 0 && vybava.svar !== false) k.bod(cep + smer * od, 0, { svar: true });
  }
  if (pist) k.prut("pist", [cep, -pist.hloubka], [cep + smer * pist.kam, 0], { zdvih: pist.zdvih });
  const h = vybava.trojuhelnik ?? 0;
  if (h > 0) {
    // Trojúhelník nad kořenem křídla: krátký sloup, šikmá vzpěra a táhlo, které drží konec křídla.
    const vrchol: [number, number] = [cep + smer * pole, h];
    k.prut(TO, [cep, 0], vrchol);
    k.prut(O, [cep + smer * pole, 0], vrchol);
    k.prut(TO, vrchol, [cep + smer * Math.min(delka, 3 * pole), 0]);
    k.prut(O, vrchol, [cep + smer * 2 * pole, 0]);
  }
}

/** Jednokřídlý sklopný most přes kanál široký `rozpeti`: čep vlevo, zámek na pravé opěře. */
export function sklopny(
  uroven: string,
  rozpeti: number,
  pole: number,
  pist: { hloubka: number; kam: number; zdvih: number } | null,
  vybava: VybavaKridla = {},
): NavrhMostu {
  return navrh(uroven, (k) => {
    kridlo(k, 0, rozpeti, pole, pist, vybava);
    if (vybava.zamek !== false) k.bod(rozpeti, 0, { zamek: true });
  });
}

/**
 * Dvoukřídlý most s mostovkou rozkreslenou podle `uzly` (vzdálenosti svařených styčníků od
 * čepu): píst může vést do styčníku, který nevychází na pravidelné pole.
 */
function dvoukridlySUzly(
  uroven: string,
  rozpeti: number,
  uzly: readonly number[],
  pist: { hloubka: number; kam: number; zdvih: number },
): NavrhMostu {
  const jedno = (k: Kreslic, cep: number, konec: number): void => {
    const smer = konec > cep ? 1 : -1;
    const body = [0, ...uzly, Math.abs(konec - cep)];
    for (let i = 0; i + 1 < body.length; i++) k.prut(OCELOVA, [cep + smer * body[i]!, 0], [cep + smer * body[i + 1]!, 0]);
    for (const d of uzly) k.bod(cep + smer * d, 0, { svar: true });
    k.prut("pist", [cep, -pist.hloubka], [cep + smer * pist.kam, 0], { zdvih: pist.zdvih });
  };
  return navrh(uroven, (k) => {
    jedno(k, 0, rozpeti / 2);
    jedno(k, rozpeti, rozpeti / 2);
    k.bod(rozpeti / 2, 0, { zamek: true });
  });
}

/** Jednokřídlý most, jehož křídlo je o metr kratší než kanál a nemá zámek. */
function kratkeKridlo(uroven: string, rozpeti: number, pist: { hloubka: number; kam: number; zdvih: number }): NavrhMostu {
  return navrh(uroven, (k) => kridlo(k, 0, rozpeti - 1, 6, pist));
}

/** Dvoukřídlý sklopný most: čepy v obou opěrách, křídla se potkávají uprostřed v zámku. */
export function dvoukridly(
  uroven: string,
  rozpeti: number,
  pole: number,
  pist: { hloubka: number; kam: number; zdvih: number } | null,
  vybava: VybavaKridla = {},
): NavrhMostu {
  return navrh(uroven, (k) => {
    kridlo(k, 0, rozpeti / 2, pole, pist, vybava);
    kridlo(k, rozpeti, rozpeti / 2, pole, pist, vybava);
    if (vybava.zamek !== false) k.bod(rozpeti / 2, 0, { zamek: true });
  });
}

/**
 * Mosty, které jsou jen v ukázkách úrovní (`ukazky.ts`): předvádějí princip na stejném tvaru
 * jako most, který spadne, ale do inženýrského rozpočtu se nevejdou, a tak mezi referenčními
 * mosty nejsou.
 */
export const MOSTY_UKAZEK = {
  /** Nízká lávka s tlumiči do kotev ve svazích. */
  "2-04": lavka("2-04", 32, 4, rovne(32, 4, 1), (k) => {
    k.prut("tlumic", [8, 0], [8, -4], { tlumeni: 200_000 });
    k.prut("tlumic", [24, 0], [24, -4], { tlumeni: 200_000 });
  }),
  /** Lehké příhrady pod mostovkou na pilířích. */
  "4-01": triPole(3, O, O),
  /** Nízká lávka s tlumičem naladěným na takt kapely. */
  "5-03": lavka("5-03", 36, 4, rovne(36, 4, 1), tlumice([16], 1200, 2)),
  /** Viadukt s těžkými vzpěrami z půlky pilířů do kolejiště z obou stran. */
  "6-03": viadukt(3, true, vzperyPiliru(TO)),
} as const satisfies Record<string, NavrhMostu>;

export const RESENI: Readonly<Record<string, ReseniUrovne>> = {
  // Lávka přes potok, 8 m: dvě výpravy proti sobě, 36 lidí. Lekce je kinematická (mostovka
  // s kloubem uprostřed se bez trojúhelníku složí); trámy jsou na pěší silné dost.
  "1-01": {
    // Věšadlo vysoké dva metry postaví hráč nejspíš jako první; do inženýrského rozpočtu se nevejde.
    pruchod: navrh("1-01", (k) => {
      mostovka(k, 8, 4);
      vesadlo(k, 8, 2);
    }),
    // Nízké věšadlo má nejkratší pruty, ale ploché krokve nesou větší tlak (využití 48 %).
    rozpocet: navrh("1-01", (k) => {
      mostovka(k, 8, 4);
      vesadlo(k, 8, 1);
    }),
    // Podvěšení: stejné pruty, ale tažené místo tlačených, a tažený prut se nevzpírá (25 %).
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
    // Čtyři pole po třech metrech a tři vzpěry: krajní styčníky drží krátké vzpěry z bližší
    // kotvy, prostřední jediná pětimetrová, a ta se vzpírá. Do rozpočtu se vejde, rezervu nemá.
    rozpocet: navrh("1-02", (k) => {
      mostovka(k, 12, 3);
      k.prut(L, [2, -3], [3, 0]);
      k.prut(L, [2, -3], [6, 0]);
      k.prut(L, [10, -3], [9, 0]);
    }),
    // Dvě krátké vzpěry z kotev ve svazích pod styčníky čtyřmetrových polí: levnější i únosnější.
    // Kdo kotvy využije dobře, má tu všechny tři medaile najednou; lepší most se do inženýrského
    // rozpočtu nevejde (prošlo se všech 112 mostů ze vzpěr do 47 000 Kč).
    mistrovska: navrh("1-02", (k) => {
      mostovka(k, 12, 4);
      k.prut(L, [2, -3], [4, 0]);
      k.prut(L, [10, -3], [8, 0]);
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

  // První auto, 16 m: osobní auto a po něm dodávka, tři a půl tuny. Pod mostovkou se stavět
  // nesmí (podvěšená lehká příhrada by dodávku unesla, tažený pás se nevzpírá). Příhrada se
  // čtyřmetrovými poli potřebuje těžký trám aspoň v krajních šikminách: ty se pod dodávkou
  // vzpírají první. Hustá příhrada s dvoumetrovými poli projde i z lehkého trámu, ale
  // mistrovskou medaili bez těžkého trámu nedá žádný z mostů, které se zkoušely.
  "1-03": {
    // Vysoká příhrada, těžký trám jen v krajních šikminách.
    pruchod: navrh("1-03", (k) => {
      mostovka(k, 16, 4);
      prihrada(k, 16, 3, L, L, T);
    }),
    // Totéž s lomeným horním pásem (2 m nad krajními styčníky, 3 m nad středem): kratší výplň,
    // lehký pás je na 85 %.
    rozpocet: navrh("1-03", (k) => {
      mostovka(k, 16, 4);
      k.prut(T, [0, 0], [4, 2]);
      k.prut(T, [12, 2], [16, 0]);
      k.prut(L, [4, 2], [8, 3]);
      k.prut(L, [8, 3], [12, 2]);
      k.prut(L, [4, 0], [4, 2]);
      k.prut(L, [8, 0], [8, 3]);
      k.prut(L, [12, 0], [12, 2]);
      k.prut(L, [4, 2], [8, 0]);
      k.prut(L, [8, 0], [12, 2]);
    }),
    // Nízká příhrada s těžkým horním pásem: krátká výplň, těžký trám vydrží i velké síly v pásu.
    mistrovska: navrh("1-03", (k) => {
      mostovka(k, 16, 4);
      prihrada(k, 16, 1, T, L);
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
      // Obě unesou osobní auto a zlomí se až pod dodávkou.
      {
        nazev: "vysoká příhrada jen z lehkého trámu",
        navrh: navrh("1-03", (k) => {
          mostovka(k, 16, 4);
          prihrada(k, 16, 3, L, L);
        }),
      },
      {
        nazev: "příhrada jen z lehkého trámu",
        navrh: navrh("1-03", (k) => {
          mostovka(k, 16, 4);
          prihrada(k, 16, 2, L, L);
        }),
      },
    ],
  },

  // Hluboké údolí, 24 m: dvě auta, proti nim dodávka a dva cyklisté. Vzpěradla z kotev ve
  // svazích zkrátí rozpětí na třetinu; šestimetrový lehký sloup nad kotvou je pod dodávkou na
  // hraně vzpěru (84 až 92 %), takže rozhoduje, čím se zkrátí nebo zesílí.
  "1-04": {
    // Vzpěradla z lehkého trámu, jen šestimetrové sloupy nad kotvami jsou těžké.
    pruchod: navrh("1-04", (k) => {
      mostovka(k, 24, 4);
      vzperadla(k, 3, T);
    }),
    // Lehké sloupy rozdělené v půli a opřené rozpěrou: levnější než těžký trám.
    rozpocet: navrh("1-04", (k) => {
      mostovka(k, 24, 4);
      vzperadla(k, 3, L, true);
    }),
    // Totéž s uzlem vzpěradla o metr níž: dolní vzpěra z kotvy je kratší (4,5 m místo 5 m),
    // nese menší sílu a vzpírá se později.
    mistrovska: navrh("1-04", (k) => {
      mostovka(k, 24, 4);
      vzperadla(k, 4, L, true);
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
    // Nejlevnější příhrada, která projde: pole mostovky 4 m, svislice ob jeden styčník.
    // Čtyřmetrová pole se pod kroky prohýbají (kmitání 0,70 m/s²).
    rozpocet: lehkaLavka("2-01", poPolich(24, 4), vrcholy([8, 16], 1)),
    // Stejná příhrada s poli mostovky po třech metrech: pod každým krokem tužší (0,35 m/s²).
    mistrovska: lehkaLavka("2-01", poPolich(24, 3), vrcholy([6, 12, 18], 1)),
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
    // Pole mostovky nejvýš 3 m (doskoky je neprohnou) a střed vysoký 2 m: vlastní frekvence
    // 4,6 Hz, mezi krokem běžců a jeho dvojnásobkem (kmitání 0,88 m/s²).
    mistrovska: lehkaLavka("2-02", [0, 3, 5, 8, 11, 14, 17, 20, 23, 25, 28], [
      [5, 1],
      [11, 2],
      [17, 2],
      [23, 1],
    ]),
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
    // Lehčí příhrada uvolní peníze na osm tun závaží místo pěti, a ty visí hlavně uprostřed,
    // kde most kmitá nejvíc (kmitání 1,02 m/s²).
    mistrovska: lehkaLavka("2-03", poPolich(32, 4), vrcholy([8, 16, 24], 1), (k) => {
      zavazi([12, 16, 20], 2000)(k);
      zavazi([8, 24], 1000)(k);
    }),
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
    // Lehčí příhrada na ně ušetří (kmitání 0,92 m/s²; s jedním tlumičem nejlíp 1,25).
    mistrovska: lehkaLavka("2-04", poPolich(32, 4), vrcholy([8, 16, 24], 1), (k) => {
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
    // Čtyřmetrová příhrada má největší rezervu, ale do inženýrského rozpočtu se nevejde.
    pruchod: silnicni("3-01", 24, 4, O, O),
    rozpocet: silnicni("3-01", 24, 2, O, O),
    // Třímetrová se vejde a má využití 44 %; dvoumetrová 66 %.
    mistrovska: silnicni("3-01", 24, 3, O, O),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("3-01", (k) => vozovka(k, 24)) },
      { nazev: "metr vysoká příhrada neunese ani sebe", navrh: silnicni("3-01", 24, 1, O, O) },
    ],
  },

  // Pod vedením, 36 m, výš než tři metry stavět nejde. Tlačený horní pás z lehkého profilu
  // nestačí; těžký ano. Výplň a tažená mostovka těžký profil nepotřebují.
  "3-02": {
    pruchod: silnicni("3-02", 36, 3, TO, TO),
    // Dvoumetrová příhrada s pásem z dvanáctimetrových prutů a výplní ob jedno pole.
    rozpocet: silnicni("3-02", 36, 2, TO, O, 12),
    // Tři metry uprostřed, krajní styčníky pásu ve dvou: kratší svislice a šikminy u opěr, takže
    // se vejde do rozpočtu. Rozhoduje tažená mostovka; pod 51 % se pod třímetrovým stropem nedá.
    mistrovska: polygonalni("3-02", 36, [2, 3, 3, 3, 2], TO, O),
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
    // Čtyřmetrová příhrada nad mostovkou: tuhá, ale drahá.
    pruchod: silnicni("3-03", 30, 4, O, O),
    rozpocet: podMostovkou("3-03", 30, 2, O, O),
    // Třímetrová pod mostovkou houpe 0,17 m/s²; dvoumetrová 0,26.
    mistrovska: podMostovkou("3-03", 30, 3, O, O),
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
    // Dosavadní mosty mají u pilíře tlačené diagonály. Příhrada pod krajními poli s náběhem
    // k noze pilíře má diagonály tažené a střed podpírají vzpěry z náběhů: méně oceli, víc rezervy.
    mistrovska: sNabehy([2, 2, 5]),
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
    // Tytéž vzpěry, každá ve třetině délky přichycená dvoumetrovou rozpěrou k pilíři: vzpěrná
    // délka je kratší a rozhoduje už jen mostovka (31 %).
    mistrovska: ztuzeneVzpery(),
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

  // Na lanech, 60 m s jedním základem o pole vlevo od středu (x = 24). Zavěšený most: z hlavy
  // pylonu lana do mostovky. Most je nesouměrný, delší pole táhne hlavu pylonu k sobě a drží ji
  // kotevní lano do levé opěry. Nedotažené se musí nejdřív protáhnout: pylon se mezitím ohne a
  // pod kolonou zlomí. Dopnutí lan (N) tu proto rozhoduje; se souměrným mostem nerozhodovalo
  // (vějíř lan nad kloubovou mostovkou je staticky určitý a napínák měnil jen výšku mostovky).
  "4-03": {
    pruchod: zaveseny(14, LANA_VSE, PREDPETI["4-03 pruchod"]),
    // Nižší pylon a bez lana do pravé opěry, které u nesouměrného mostu skoro nic nenese.
    rozpocet: zaveseny(13, LANA_BEZ_PRAVE_OPERY, PREDPETI["4-03 rozpocet"]),
    // Totéž a druhé kotevní lano do levé opěry: hlava pylonu se skoro nehne.
    mistrovska: zaveseny(13, LANA_BEZ_PRAVE_OPERY, PREDPETI["4-03 mistrovska"], true),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("4-03", (k) => vozovka(k, 60)) },
      { nazev: "pylon bez lan", navrh: zaveseny(14, []) },
      { nazev: "bez kotevních lan", navrh: zaveseny(14, LANA_VSE.slice(1, -1), PREDPETI["4-03 bez kotevnich"]) },
      { nazev: "příliš nízký pylon", navrh: zaveseny(8, LANA_VSE, PREDPETI["4-03 nizky"]) },
      // Most pro průchod, na jehož napínáky hráč nesáhl: mostovka visí 30 cm pod výkresem a pylon se zlomí.
      { nazev: "lana bez dopnutí", navrh: nedopnuty(zaveseny(14, LANA_VSE)) },
    ],
  },

  // Náklad století, 72 m přes rokli, 120 t na podvalníku. Visutý most: nosné lano přes pylony
  // na březích, kotvené do země, a z něj závěsy k mostovce. Nosné lano se pod tíhou vyrovná do
  // oblouku samo; závěsy se mu musí přizpůsobit délkou, jinak se mostovka prověsí o desítky
  // centimetrů (automatické dopnutí). Vyšší pylony a větší průvěs zmenší tah v laně.
  "4-04": {
    pruchod: visuty(OBLOUK_16, 16, PREDPETI["4-04 pruchod"]),
    rozpocet: visuty(OBLOUK_12, 12, PREDPETI["4-04 rozpocet"]),
    // Nižší věže a nosné lano prověšené až metr nad mostovku: větší průvěs zmenší tah v laně
    // i ohyb pylonů víc než vyšší věže a stojí míň.
    mistrovska: visuty(OBLOUK_13, 13, PREDPETI["4-04 mistrovska"]),
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
    // Pole mostovky 3 m a příhrada vysoká 3 m, uprostřed 4 m: i s davem kmitá nad pásmem kroků
    // (kmitání 0,19 m/s²).
    mistrovska: lehkaLavka("5-01", poPolich(48, 3), [
      [6, 3],
      [12, 3],
      [18, 4],
      [24, 4],
      [30, 4],
      [36, 3],
      [42, 3],
    ]),
    pady: [
      { nazev: "jen mostovka", navrh: navrh("5-01", (k) => mostovka(k, 48, 4)) },
      { nazev: "dvoumetrová příhrada: prázdná mimo pásmo, s lidmi v něm", navrh: lavka("5-01", 48, 4, rovne(48, 4, 2)) },
    ],
  },

  // Městský běh, 32 m, 40 běžců kolem 2,6 Hz. Výš než metr stavět nejde a nízká příhrada
  // kmitá s běžci na 2,5 Hz, uprostřed jejich pásma. Pomůže laděný tlumič; bez něj projde jen
  // velmi lehká příhrada těsně pod mezí, a mistrovskou medaili bez tlumiče nedá žádný most,
  // který se zkoušel.
  "5-02": {
    pruchod: lavka("5-02", 32, 4, rovne(32, 4, 1), tlumice([16], 600, 2.5)),
    rozpocet: lavka("5-02", 32, 4, rovne(32, 4, 1), tlumice([16], 300, 2.5)),
    // Lehčí příhrada s poli mostovky 3 m (krajní 4 m) a skoro největší tlumič uprostřed,
    // naladěný na rytmus běžců (kmitání 0,89 m/s²).
    mistrovska: lehkaLavka("5-02", [0, 4, 7, 10, 13, 16, 19, 22, 25, 28, 32], vrcholy([7, 13, 19, 25], 1), tlumice([16], 950, 2.6)),
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
    // Lehčí souměrná příhrada (dvě krátká pole uprostřed) a největší tlumič přesně v půli,
    // naladěný na takt kapely (kmitání 0,87 m/s²).
    mistrovska: lehkaLavka("5-03", [0, 4, 8, 12, 16, 18, 20, 24, 28, 32, 36], vrcholy([4, 12, 18, 24, 32], 1), tlumice([18], 1200, 2)),
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
    // Lehčí dvoumetrová příhrada ušetří na druhý tlumič: dva největší vedle středu, oba naladěné
    // na dvojnásobek rytmu skákání (kmitání 1,56 m/s²). Zbytek dělá skákání samo na 2,2 a 6,6 Hz.
    mistrovska: lehkaLavka("5-04", poPolich(32, 2), vrcholy([4, 8, 12, 16, 20, 24, 28], 2), tlumice([14, 18], 1000, 4.4)),
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
    // Těžký pás se do inženýrského rozpočtu nevejde. Trojúhelníková příhrada s oblým horním
    // pásem (3, 5, 6, 5, 3 m) má stejnou lehkou ocel lépe rozmístěnou.
    mistrovska: trojuhelnikova("6-01", 30, [3, 5, 6, 5, 3]),
    pady: [
      { nazev: "jen kolejiště", navrh: trat("6-01", 30, 0, O, O) },
      { nazev: "dvoumetrová příhrada z lehké oceli", navrh: trat("6-01", 30, 2, O, O) },
    ],
  },

  // Rychlík, 36 m, stovkou; nad kolejí je trolej, staví se jen pod ní. Unést vlak je snadné,
  // jde o tuhost: mělký most se pod vozem prohne a cestující to cítí. Hlubší příhrada se
  // prohne míň, ale se svislicemi v každém poli se hluboká do rozpočtu nevejde.
  "6-02": {
    pruchod: trat("6-02", 36, -3, O, O),
    rozpocet: trat("6-02", 36, -2, O, O),
    // Tři dolní styčníky v hloubce 4, 5 a 4 m místo šesti polí se svislicemi: o třetinu méně
    // oceli, a tak smí být příhrada hlubší.
    mistrovska: triStycniky(7, 4, 5),
    pady: [
      { nazev: "jen kolejiště", navrh: trat("6-02", 36, 0, O, O) },
      { nazev: "metrová příhrada", navrh: trat("6-02", 36, -1, O, O) },
    ],
  },

  // Uhelný vlak, viadukt 72 m na dvou vysokých pilířích, oba konce na posuvných ložiskách.
  // Vlak s deseti loženými vozy na mostě nouzově zabrzdí (2,5 m/s²) a tlačí ho dopředu čtvrtinou
  // tíhy vozů, které na něm jsou; tu sílu nesou jen pilíře. Samotné se ohnou a zlomí, ať je
  // příhrada jakákoli. Pomůže svar hlavy pilíře s kolejištěm (rám), nebo vzpěry z půlky pilíře
  // do kolejiště (trojúhelník); vzpěry jsou dlouhé a tlačené, proto z těžkého profilu. Levnější
  // je lehká vzpěra z půlky pilíře do dolního pásu sousední příhrady: je kratší.
  "6-03": {
    // Svar hlavy pilíře s kolejištěm stačí jen tak tak (pilíř na 97 %).
    pruchod: viadukt(4, true, svarHlav),
    // Mělčí příhrady a holá lehká vzpěra do jejich pásu: stojí skoro stejně jako svařené
    // hlavy pilířů, ale nejvíc namáhaný prut (vzpěra) má na 67 % místo 99 %.
    rozpocet: viadukt(2, true, vzperyDoPasu(2, false)),
    // Třímetrové příhrady a vzpěra s rozpěrkou v půlce délky: vzpěrná délka 4,2 m místo 8,5 m.
    mistrovska: viadukt(3, true, vzperyDoPasu(3, true), O, [-9, -6]),
    pady: [
      { nazev: "jen kolejiště", navrh: viadukt(0, false) },
      { nazev: "kolejiště na pilířích bez příhrad", navrh: viadukt(0) },
      { nazev: "příhrady bez pilířů", navrh: viadukt(4, false) },
      { nazev: "pilíře bez vzpěr a svarů", navrh: viadukt(3) },
      { nazev: "pilíře bez vzpěr a svarů, příhrady s těžkými pásy", navrh: viadukt(3, true, undefined, TO) },
      { nazev: "pilíře bez vzpěr a svarů, příhrady hluboké šest metrů", navrh: viadukt(6) },
    ],
  },

  // Dvě patra, 48 m: dole kolej s nákladním vlakem, devět metrů nad ní silnice. Dvě mostovky
  // nad sebou jsou pásy jedné vysoké příhrady; stačí je spojit svislicemi a diagonálami.
  // Svislice u podpor jsou tlačené a devět metrů dlouhé: z lehkého profilu vybočí a most spadne.
  "6-04": {
    // Všechny svislice z těžkého profilu: jistota, ale rozpočtovou medaili nedá.
    pruchod: dvePatra(() => TO, () => O),
    // Těžké stačí jen svislice u podpor, které nesou nejvíc.
    rozpocet: dvePatra((x) => (x === 6 || x === 42 ? TO : O), () => O),
    // Těžké svislice ve dvou krajních polích z každé strany, všechny diagonály lehké.
    mistrovska: dvePatra((x) => (x <= 12 || x >= 36 ? TO : O), () => O),
    pady: [
      { nazev: "jen dvě mostovky", navrh: dvePatra() },
      { nazev: "jen svislice, bez diagonál", navrh: dvePatra(() => O) },
      { nazev: "všechno z lehkého profilu: svislice u podpor vybočí", navrh: dvePatra(() => O, () => O) },
    ],
  },

  // ---- Kapitola 7: Přístav ----

  // Zvedací most, 12 m: křídlo ze svařené ocelové mostovky, píst z kotvy ve zdi a zámek na
  // protější opěře. Loď potřebuje křídlo zvednuté asi o 45°.
  "7-01": {
    pruchod: sklopny("7-01", 12, 3, { hloubka: 3, kam: 3, zdvih: 1.5 }),
    rozpocet: sklopny("7-01", 12, 6, { hloubka: 3, kam: 6, zdvih: 2 }),
    // Píst z hlubší kotvy má větší rameno: nese menší sílu a křídlo dosedá měkčeji.
    mistrovska: sklopny("7-01", 12, 6, { hloubka: 5, kam: 6, zdvih: 2.5 }),
    pady: [
      { nazev: "jen mostovka", navrh: sklopny("7-01", 12, 6, null, { zamek: false }) },
      { nazev: "bez zámku: konec křídla drží ložisko", navrh: sklopny("7-01", 12, 3, { hloubka: 3, kam: 3, zdvih: 1.5 }, { zamek: false }) },
      { nazev: "nesvařená mostovka: křídlo se při zvedání složí", navrh: sklopny("7-01", 12, 6, { hloubka: 3, kam: 6, zdvih: 2 }, { svar: false }) },
      { nazev: "malý zdvih: křídlo se nezvedne dost", navrh: sklopny("7-01", 12, 6, { hloubka: 3, kam: 6, zdvih: 1.5 }) },
      { nazev: "křídlo o metr kratší, bez zámku: na opěru nedosáhne", navrh: kratkeKridlo("7-01", 12, { hloubka: 5, kam: 6, zdvih: 2.5 }) },
    ],
  },

  // Dvě křídla, 24 m: dva sklopné mosty proti sobě se zámkem uprostřed. Zavřený most nesou
  // jen čepy a písty, takže se pod autobusem uprostřed znatelně prohne.
  // Píst do styčníku 6 m od čepu má nejkratší převislý konec křídla a nejmenší ohyb; je to
  // zároveň nejlevnější most. Trojúhelník nad kořenem ohyb srazí ještě víc, ale do inženýrského
  // rozpočtu se nevejde: bonus je tu věc umístění pístu, ne peněz.
  "7-02": {
    pruchod: dvoukridly("7-02", 24, 4, { hloubka: 5, kam: 4, zdvih: 2 }, { trojuhelnik: 3 }),
    rozpocet: dvoukridly("7-02", 24, 4, { hloubka: 5, kam: 4, zdvih: 2 }),
    mistrovska: dvoukridly("7-02", 24, 6, { hloubka: 5, kam: 6, zdvih: 2.5 }),
    pady: [
      { nazev: "jen mostovka", navrh: dvoukridly("7-02", 24, 6, null, { zamek: false }) },
      { nazev: "bez zámku uprostřed: písty tlačí proti sobě", navrh: dvoukridly("7-02", 24, 6, { hloubka: 5, kam: 6, zdvih: 2.5 }, { zamek: false }) },
      { nazev: "malý zdvih", navrh: dvoukridly("7-02", 24, 6, { hloubka: 5, kam: 6, zdvih: 1.5 }) },
      {
        nazev: "píst jen vlevo: pravé křídlo po odemknutí spadne",
        navrh: navrh("7-02", (k) => {
          kridlo(k, 0, 12, 6, { hloubka: 5, kam: 6, zdvih: 2.5 });
          kridlo(k, 24, 12, 6, null);
          k.bod(12, 0, { zamek: true });
        }),
      },
    ],
  },

  // Dlouhé křídlo, 16 m: píst blízko čepu je na hraně síly (přetlakový ventil povoluje) a
  // konec křídla udeří do opěry; z hlubší kotvy zvedá klidně, ale potřebuje větší zdvih.
  // Zdvih smí křídlo zvednout nejvýš o 70°: z mělké kotvy do styčníku 6 m je to 2 m.
  "7-03": {
    pruchod: sklopny("7-03", 16, 6, { hloubka: 3, kam: 6, zdvih: 2 }),
    // Píst z mělké kotvy blízko čepu: do rozpočtu se vejde, ale křídlo dosedá nejtvrději.
    rozpocet: sklopny("7-03", 16, 4, { hloubka: 3, kam: 4, zdvih: 1.75 }),
    mistrovska: sklopny("7-03", 16, 4, { hloubka: 6, kam: 4, zdvih: 2.5 }),
    pady: [
      { nazev: "jen mostovka", navrh: sklopny("7-03", 16, 6, null, { zamek: false }) },
      { nazev: "hluboká kotva s malým zdvihem", navrh: sklopny("7-03", 16, 4, { hloubka: 6, kam: 4, zdvih: 1.5 }) },
      { nazev: "bez zámku", navrh: sklopny("7-03", 16, 4, { hloubka: 6, kam: 4, zdvih: 2.5 }, { zamek: false }) },
    ],
  },

  // Velký přístav, 32 m: dvě šestnáctimetrová křídla s těžší vozovkou. Píst z mělké kotvy má
  // k čepu krátké rameno: křídlo zvedne, ale zvednuté ho neudrží (ventil povolí, křídlo klesne
  // a loď do něj narazí). Z hluboké kotvy má rameno delší a křídlo udrží. Trojúhelník nad
  // kořenem křídla bere mostovce ohyb.
  "7-04": {
    pruchod: dvoukridly("7-04", 32, 4, { hloubka: 6, kam: 4, zdvih: 2.25 }),
    rozpocet: dvoukridly("7-04", 32, 4, { hloubka: 6, kam: 4, zdvih: 2.5 }),
    // Píst z mělké kotvy uchycený sedm metrů od čepu: rameno má dost dlouhé, aby křídlo nahoře
    // udržel, a převislý konec křídla je o tři metry kratší. Trojúhelník nad kořenem by ohyb
    // srazil taky, ale do inženýrského rozpočtu se nevejde.
    mistrovska: dvoukridlySUzly("7-04", 32, [3, 7, 12], { hloubka: 3, kam: 7, zdvih: 1.75 }),
    pady: [
      { nazev: "jen mostovka", navrh: dvoukridly("7-04", 32, 4, null, { zamek: false }) },
      { nazev: "písty z mělkých kotev", navrh: dvoukridly("7-04", 32, 4, { hloubka: 3, kam: 4, zdvih: 1.75 }) },
      { nazev: "bez zámku uprostřed", navrh: dvoukridly("7-04", 32, 4, { hloubka: 6, kam: 4, zdvih: 2.25 }, { zamek: false }) },
      {
        nazev: "křídla, která se uprostřed nepotkají",
        navrh: navrh("7-04", (k) => {
          kridlo(k, 0, 15, 5, { hloubka: 6, kam: 5, zdvih: 2.25 });
          kridlo(k, 32, 17, 5, { hloubka: 6, kam: 5, zdvih: 2.25 });
        }),
      },
      {
        nazev: "píst sedm metrů od čepu s malým zdvihem: křídlo se nezvedne dost",
        navrh: dvoukridlySUzly("7-04", 32, [3, 7, 12], { hloubka: 3, kam: 7, zdvih: 1.5 }),
      },
    ],
  },
};
