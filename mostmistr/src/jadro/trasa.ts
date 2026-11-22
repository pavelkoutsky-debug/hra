// Trasa: pruty mostovky, po kterých jede provoz, a výška jejich povrchu.
//
// Trasa si pamatuje čísla prutů, ne prvků: prut se může skrytě dělit a porušením lámat,
// číslo prutu jeho díly dědí. Seznam prvků se po každé změně stavby sestaví znovu.

import { NOSNIK, type Soustava } from "./soustava";

export interface Trasa {
  /** Pro každé číslo prutu: 1, když po něm provoz jede. */
  jePrutTrasy: Uint8Array;
  /** Prvky trasy seřazené zleva doprava podle svého levého konce. */
  prvky: Int32Array;
  pocet: number;
  /** Okraje mostovky při sestavení; mimo ně provoz jede po pevné zemi v dané výšce. */
  xLevy: number;
  yLevy: number;
  xPravy: number;
  yPravy: number;
}

/** Okraje trasy: kde končí pevná zem před mostem a kde začíná za ním. */
export interface OkrajeTrasy {
  xLevy: number;
  yLevy: number;
  xPravy: number;
  yPravy: number;
}

/**
 * Založí trasu z čísel prutů mostovky. Okraje dává úroveň (konce předmostí); bez nich
 * se vezmou krajní styčníky mostovky. S okraji smí být trasa i bez mostovky: provoz
 * pak z předmostí spadne.
 */
export function vytvorTrasu(s: Soustava, pruty: Iterable<number>, okraje?: OkrajeTrasy): Trasa {
  let nejvyssi = 0;
  for (let e = 0; e < s.pocetPrvku; e++) nejvyssi = Math.max(nejvyssi, s.prut[e]!);
  const jePrutTrasy = new Uint8Array(nejvyssi + 1);
  for (const prut of pruty) if (prut <= nejvyssi) jePrutTrasy[prut] = 1;
  const trasa: Trasa = {
    jePrutTrasy,
    prvky: new Int32Array(0),
    pocet: 0,
    xLevy: 0,
    yLevy: 0,
    xPravy: 0,
    yPravy: 0,
  };
  prestavTrasu(s, trasa);
  if (okraje) {
    trasa.xLevy = okraje.xLevy;
    trasa.yLevy = okraje.yLevy;
    trasa.xPravy = okraje.xPravy;
    trasa.yPravy = okraje.yPravy;
    return trasa;
  }
  if (trasa.pocet === 0) throw new Error("Trasa nemá žádný prut.");

  const prvni = trasa.prvky[0]!;
  const posledni = trasa.prvky[trasa.pocet - 1]!;
  const levy = s.x[s.prvekA[prvni]!]! <= s.x[s.prvekB[prvni]!]! ? s.prvekA[prvni]! : s.prvekB[prvni]!;
  const pravy =
    s.x[s.prvekA[posledni]!]! >= s.x[s.prvekB[posledni]!]! ? s.prvekA[posledni]! : s.prvekB[posledni]!;
  trasa.xLevy = s.x[levy]!;
  trasa.yLevy = s.y[levy]!;
  trasa.xPravy = s.x[pravy]!;
  trasa.yPravy = s.y[pravy]!;
  return trasa;
}

/** Znovu sestaví seznam prvků trasy; volá se po změně stavby soustavy. */
export function prestavTrasu(s: Soustava, trasa: Trasa): void {
  const prvky: number[] = [];
  for (let e = 0; e < s.pocetPrvku; e++) {
    const prut = s.prut[e]!;
    if (prut < trasa.jePrutTrasy.length && trasa.jePrutTrasy[prut] === 1) prvky.push(e);
  }
  const levyKonec = (e: number): number => Math.min(s.x[s.prvekA[e]!]!, s.x[s.prvekB[e]!]!);
  // Při shodě rozhoduje index prvku, aby pořadí nezáviselo na řadicím algoritmu prohlížeče.
  prvky.sort((p, q) => levyKonec(p) - levyKonec(q) || p - q);
  trasa.prvky = Int32Array.from(prvky);
  trasa.pocet = prvky.length;
}

/**
 * Najde prvek trasy, nad kterým leží souřadnice `x`. Hledá od `odhad` (index v seznamu
 * trasy, obvykle výsledek z minulého kroku) nejdřív po sousedech, protože břemeno se
 * za krok posune jen o zlomek prvku. Vrací index v seznamu trasy, nebo −1.
 */
export function najdiPrvekTrasy(s: Soustava, trasa: Trasa, x: number, odhad: number): number {
  const { prvky, pocet } = trasa;
  if (pocet === 0) return -1;
  let j = odhad < 0 ? 0 : odhad >= pocet ? pocet - 1 : odhad;
  // Posun k prvku, jehož levý konec je nejblíž vlevo od x.
  while (j > 0 && levy(s, prvky[j]!) > x) j--;
  while (j < pocet - 1 && levy(s, prvky[j + 1]!) <= x) j++;
  // Po porušení se díly mohou překrývat nebo mezi nimi vznikne mezera: zkusí se i sousedé vlevo.
  for (let k = j; k >= 0 && k >= j - 2; k--) {
    const e = prvky[k]!;
    const xa = s.x[s.prvekA[e]!]!;
    const xb = s.x[s.prvekB[e]!]!;
    if ((xa <= x && x <= xb) || (xb <= x && x <= xa)) return k;
  }
  return -1;
}

function levy(s: Soustava, e: number): number {
  const xa = s.x[s.prvekA[e]!]!;
  const xb = s.x[s.prvekB[e]!]!;
  return xa < xb ? xa : xb;
}

/**
 * Největší šířka dilatační spáry, m. Konec mostovky na posuvném ložisku se pod brzdícím
 * vlakem nebo při prohnutí mostu od předmostí o milimetry až centimetry odsune; kolo takovou
 * spáru přejede, nepropadne jí. Širší mezera už spára není: tam mostovka chybí.
 */
export const NEJVETSI_SPARA = 0.5;
/** O kolik smí být kraj mostovky výš nebo níž než předmostí, aby šlo o spáru a ne o utržený díl, m. */
const NEJVETSI_SCHOD = 0.1;

/**
 * Leží `x` ve spáře mezi předmostím a krajem mostovky, který se od něj vodorovně odsunul?
 * Vrací −1 pro spáru u levého předmostí, 1 u pravého a 0, když ve spáře neleží. Kraj
 * mostovky musí zůstat ve výšce předmostí: díl, který se utrhl a klesl, spáru netvoří.
 */
export function vDilatacniSpare(s: Soustava, trasa: Trasa, x: number): -1 | 0 | 1 {
  if (trasa.pocet === 0) return 0;
  if (x - trasa.xLevy <= NEJVETSI_SPARA) {
    const e = trasa.prvky[0]!;
    const kraj = s.x[s.prvekA[e]!]! <= s.x[s.prvekB[e]!]! ? s.prvekA[e]! : s.prvekB[e]!;
    const schod = s.y[kraj]! - trasa.yLevy;
    if (x < s.x[kraj]! && schod <= NEJVETSI_SCHOD && schod >= -NEJVETSI_SCHOD) return -1;
  }
  if (trasa.xPravy - x <= NEJVETSI_SPARA) {
    const e = trasa.prvky[trasa.pocet - 1]!;
    const kraj = s.x[s.prvekA[e]!]! >= s.x[s.prvekB[e]!]! ? s.prvekA[e]! : s.prvekB[e]!;
    const schod = s.y[kraj]! - trasa.yPravy;
    if (x > s.x[kraj]! && schod <= NEJVETSI_SCHOD && schod >= -NEJVETSI_SCHOD) return 1;
  }
  return 0;
}

/** Poloha na prvku (0 na konci a, 1 na konci b), kterou naposledy určila `vyskaNaPrvku`. */
export let mistoNaPrvku = 0;
/** Výška spojnice styčníků v témže místě, bez průhybu prvku. */
export let vyskaSpojnice = 0;

/** Prvek skloněný víc než 60° od vodorovné provoz neunese: kolo by z něj sklouzlo. */
const NEJMENSI_KOSINUS_SKLONU = 0.5;

/**
 * Výška osy prvku `e` nad souřadnicí `x`. Bere se skutečná ohybová čára (tvarové funkce
 * Timošenkova nosníku), ne spojnice styčníků: lomená čára by kolu na každém styčníku
 * vnutila skok ve sklonu a chovala se jako nerovnost vozovky, která tam není.
 * Polohu na prvku uloží do `mistoNaPrvku`, výšku spojnice do `vyskaSpojnice`.
 * U příliš strmého prvku (utržený kus mostovky) vrací NaN.
 */
export function vyskaNaPrvku(s: Soustava, e: number, x: number): number {
  const a = s.prvekA[e]!;
  const b = s.prvekB[e]!;
  const dx = s.x[b]! - s.x[a]!;
  const dy = s.y[b]! - s.y[a]!;
  const delka = Math.sqrt(dx * dx + dy * dy);
  const ex = dx / delka;
  const ey = dy / delka;
  if (!(ex >= NEJMENSI_KOSINUS_SKLONU || ex <= -NEJMENSI_KOSINUS_SKLONU)) return Number.NaN;
  let xi = (x - s.x[a]!) / dx;
  if (!(xi >= 0)) xi = 0;
  else if (xi > 1) xi = 1;
  mistoNaPrvku = xi;
  const naSpojnici = s.y[a]! + xi * dy;
  vyskaSpojnice = naSpojnici;

  const kloub = s.kloub[e]!;
  if (s.druh[e] !== NOSNIK || kloub === 3) return naSpojnici;

  const cosAlfa = s.osaX0[e]! * ex + s.osaY0[e]! * ey;
  const sinAlfa = s.osaX0[e]! * ey - s.osaY0[e]! * ex;
  let psiA = s.sinN[a]! * cosAlfa - s.cosN[a]! * sinAlfa - s.plastA[e]!;
  let psiB = s.sinN[b]! * cosAlfa - s.cosN[b]! * sinAlfa - s.plastB[e]!;
  const fi = s.fi[e]!;
  // Kloubový konec se natočí tak, aby v něm byl nulový moment.
  if (kloub === 1) psiA = (-(2 - fi) / (4 + fi)) * psiB;
  else if (kloub === 2) psiB = (-(2 - fi) / (4 + fi)) * psiA;

  const eta = 1 - xi;
  const smyk = 0.5 * fi * xi * eta;
  const pruhyb = (delka / (1 + fi)) * (psiA * (xi * eta * eta + smyk) - psiB * (xi * xi * eta + smyk));
  // Průhyb je kolmo k prvku; nad stejnou souřadnicí x to dělá pruhyb/e_x na výšku.
  return naSpojnici + pruhyb / ex;
}
