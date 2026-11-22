// Rezonanční křivka: jak silně soustava odpovídá na svislou harmonickou sílu podle toho,
// jak rychle síla kmitá (koncepce, kap. 7.8).
//
// Počítá se v ustáleném stavu, bez časové simulace. Soustava se popíše několika nejnižšími
// vlastními tvary; v jejich souřadnicích je tuhost i hmota diagonální a zbývá matice tlumení.
// Ta diagonální není: viskózní tlumiče a tlumiče laděných závaží působí v jednom místě
// a jednotlivé tvary spolu vážou. Právě proto laděný tlumič udělá z jedné špičky dvě nižší.
// Pro každou frekvenci se pak řeší malá soustava rovnic s komplexními čísly.
//
// Výsledek slouží hráči při stavbě. Do zkoušky nevstupuje, takže smí používat cokoli.

import { vlastniTvarySoustavy } from "./matice";
import type { Soustava } from "./soustava";

/** Kolik vlastních tvarů křivka bere v úvahu; vyšší leží daleko nad pásmem kroků lidí. */
const POCET_TVARU = 14;

/**
 * Matice tlumení v souřadnicích vlastních tvarů (m × m po řádcích): poměrný útlum `utlum`
 * každého tvaru a k tomu všechny prvky s tlumičem. Tlumič brzdí rychlost, kterou se od sebe
 * vzdalují jeho konce; ve tvaru i je to průmět rozdílu výchylek konců do osy prvku.
 */
function tlumeniTvaru(s: Soustava, stupne: Int32Array, omega: Float64Array, tvary: Float64Array, utlum: number): Float64Array {
  const m = omega.length;
  const n = stupne.length;
  const C = new Float64Array(m * m);
  for (let i = 0; i < m; i++) C[i * m + i] = 2 * utlum * omega[i]!;

  // Kde v seznamu volných stupňů leží posuny každého styčníku; −1 je zadržený posun.
  const poradi = new Int32Array(3 * s.pocetStycniku).fill(-1);
  for (let k = 0; k < n; k++) poradi[stupne[k]!] = k;
  const protazeni = new Float64Array(m);
  for (let e = 0; e < s.pocetPrvku; e++) {
    const c = s.tlumic[e]!;
    if (!(c > 0) || s.utrzeny[e] === 1) continue;
    const a = s.prvekA[e]!;
    const b = s.prvekB[e]!;
    const dx = s.x[b]! - s.x[a]!;
    const dy = s.y[b]! - s.y[a]!;
    const delka = Math.sqrt(dx * dx + dy * dy);
    if (!(delka > 0)) continue;
    const ex = dx / delka;
    const ey = dy / delka;
    for (let i = 0; i < m; i++) {
      const tvar = i * n;
      const vychylka = (stycnik: number, smer: number): number => {
        const k = poradi[3 * stycnik + smer]!;
        return k < 0 ? 0 : tvary[tvar + k]!;
      };
      protazeni[i] = ex * (vychylka(b, 0) - vychylka(a, 0)) + ey * (vychylka(b, 1) - vychylka(a, 1));
    }
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) C[i * m + j] = C[i * m + j]! + c * protazeni[i]! * protazeni[j]!;
    }
  }
  return C;
}

/** Vyřeší A·X = B Gaussovou eliminací s výběrem hlavního prvku; B (n × k po řádcích) přepíše řešením. */
function vyres(A: Float64Array, B: Float64Array, n: number, k: number): boolean {
  for (let sloupec = 0; sloupec < n; sloupec++) {
    let hlavni = sloupec;
    for (let r = sloupec + 1; r < n; r++) {
      if (Math.abs(A[r * n + sloupec]!) > Math.abs(A[hlavni * n + sloupec]!)) hlavni = r;
    }
    if (!(Math.abs(A[hlavni * n + sloupec]!) > 1e-300)) return false;
    if (hlavni !== sloupec) {
      for (let j = 0; j < n; j++) {
        const t = A[sloupec * n + j]!;
        A[sloupec * n + j] = A[hlavni * n + j]!;
        A[hlavni * n + j] = t;
      }
      for (let j = 0; j < k; j++) {
        const t = B[sloupec * k + j]!;
        B[sloupec * k + j] = B[hlavni * k + j]!;
        B[hlavni * k + j] = t;
      }
    }
    const delitel = A[sloupec * n + sloupec]!;
    for (let r = sloupec + 1; r < n; r++) {
      const nasobek = A[r * n + sloupec]! / delitel;
      if (nasobek === 0) continue;
      for (let j = sloupec; j < n; j++) A[r * n + j] = A[r * n + j]! - nasobek * A[sloupec * n + j]!;
      for (let j = 0; j < k; j++) B[r * k + j] = B[r * k + j]! - nasobek * B[sloupec * k + j]!;
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    for (let j = 0; j < k; j++) {
      let soucet = B[r * k + j]!;
      for (let c = r + 1; c < n; c++) soucet -= A[r * n + c]! * B[c * k + j]!;
      B[r * k + j] = soucet / A[r * n + r]!;
    }
  }
  return true;
}

/**
 * Rezonanční křivka soustavy v její aktuální (klidové) poloze.
 *
 * Do každého ze styčníků `mista` se postupně opře svislá harmonická síla o amplitudě 1 N
 * a změří se amplituda svislého zrychlení téhož styčníku. Pro každou frekvenci z `frekvence`
 * (Hz) funkce vrátí největší takové zrychlení ze všech míst, v m/s² na newton. Tak je na
 * křivce vidět každý tvar kmitání, ať má uzel kdekoli.
 *
 * `utlum` je poměrný útlum konstrukce. Vrací null, když soustava nemá klidovou polohu.
 */
export function rezonancniKrivka(
  s: Soustava,
  stupne: Int32Array,
  mista: readonly number[],
  frekvence: readonly number[],
  utlum: number,
): Float64Array | null {
  const n = stupne.length;
  if (n === 0 || mista.length === 0) return new Float64Array(frekvence.length);
  const vlastni = vlastniTvarySoustavy(s, stupne, Math.min(POCET_TVARU, n));
  if (!vlastni) return null;
  const { omega, tvary } = vlastni;
  const m = omega.length;
  const C = tlumeniTvaru(s, stupne, omega, tvary, utlum);

  // Svislá výchylka každého místa v každém tvaru; místo se zadrženým svislým posunem vypadne.
  const poradi = new Int32Array(3 * s.pocetStycniku).fill(-1);
  for (let k = 0; k < n; k++) poradi[stupne[k]!] = k;
  const volna = mista.map((i) => poradi[3 * i + 1]!).filter((k) => k >= 0);
  const pocet = volna.length;
  const krivka = new Float64Array(frekvence.length);
  if (pocet === 0) return krivka;
  const fi = new Float64Array(pocet * m);
  volna.forEach((k, j) => {
    for (let i = 0; i < m; i++) fi[j * m + i] = tvary[i * n + k]!;
  });

  // Komplexní soustava (Λ − ω²·I + i·ω·C)·q = φ zapsaná jako reálná dvojnásobné velikosti:
  // [Re −Im; Im Re]·[q_re; q_im] = [φ; 0].
  const dvoj = 2 * m;
  const A = new Float64Array(dvoj * dvoj);
  const B = new Float64Array(dvoj * pocet);
  for (let f = 0; f < frekvence.length; f++) {
    const w = 2 * Math.PI * frekvence[f]!;
    A.fill(0);
    B.fill(0);
    for (let i = 0; i < m; i++) {
      const re = omega[i]! * omega[i]! - w * w;
      A[i * dvoj + i] = re;
      A[(m + i) * dvoj + m + i] = re;
      for (let j = 0; j < m; j++) {
        const im = w * C[i * m + j]!;
        A[i * dvoj + m + j] = -im;
        A[(m + i) * dvoj + j] = im;
      }
      for (let j = 0; j < pocet; j++) B[i * pocet + j] = fi[j * m + i]!;
    }
    if (!vyres(A, B, dvoj, pocet)) return null;
    let nejvic = 0;
    for (let j = 0; j < pocet; j++) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < m; i++) {
        re += fi[j * m + i]! * B[i * pocet + j]!;
        im += fi[j * m + i]! * B[(m + i) * pocet + j]!;
      }
      const vychylka = Math.sqrt(re * re + im * im);
      if (vychylka > nejvic) nejvic = vychylka;
    }
    krivka[f] = w * w * nejvic;
  }
  return krivka;
}
